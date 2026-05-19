"""Small thread-safe TTL + LRU cache.

Purpose: skip Gemini calls when the same input was just answered.
Keeps a tiny surface — no async, no decorators — but does carry a few
operational features the agent layer needs:

* **Hit/miss counters** per namespace, exposed by ``stats()``. Surfaced
  via the admin endpoint ``GET /api/cache/stats`` so we can prove the
  cache is doing useful work without grepping logs.
* **Per-call TTL override** — agents that produce data with different
  freshness characteristics (e.g. review verdicts vs decision narration)
  can pass a custom TTL into ``set()`` without needing separate caches.
* **Prefix and predicate invalidation** — used when a write upstream
  (a budget edit, a new price observation) should drop any cached
  Gemini response that depended on it.
* **Structured log events** — every get/set emits a `cache.*` event when
  `LOG_LEVEL=DEBUG`, so we can correlate hit/miss with X-Request-ID.

For multi-instance prod, swap the underlying store for Redis behind the
same get/set/invalidate_* interface; callers don't need to change.

Defaults come from env vars so ops can tune without code changes:

    GEMINI_CACHE_MAX_SIZE    (default 256)
    GEMINI_CACHE_TTL_SECONDS (default 900 = 15 min)
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections import OrderedDict
from threading import Lock
from time import monotonic
from typing import Any, Callable, Hashable, Optional

logger = logging.getLogger("thundrly.cache")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _key_hash(key: Hashable) -> str:
    """Short, stable hash used only in log lines so keys (which can be
    large) don't bloat the log volume. Not used for storage."""
    return hashlib.sha1(repr(key).encode("utf-8")).hexdigest()[:12]


class TTLCache:
    """Bounded LRU with per-entry TTL, hit/miss counters, and bulk invalidation.

    Order semantics: most-recently-used at the right end of the OrderedDict;
    evictions pop from the left. Reads bump the entry to the right edge.

    The cache is in-memory per uvicorn worker. With one worker (dev /
    single-instance prod) all callers share it; with multiple workers each
    gets its own — which is fine since hit-rate matters more than perfect
    coordination.
    """

    def __init__(
        self,
        max_size: int = 256,
        ttl_seconds: float = 900.0,
        *,
        namespace: str = "default",
    ) -> None:
        self._max = max_size
        self._ttl = ttl_seconds
        self._namespace = namespace
        self._data: "OrderedDict[Hashable, tuple[float, float, Any]]" = OrderedDict()
        self._lock = Lock()
        # Counters guarded by the same lock to keep snapshots consistent.
        self._hits = 0
        self._misses = 0
        self._sets = 0
        self._evictions = 0
        self._invalidations = 0

    # ----- core operations -----

    def get(self, key: Hashable) -> Optional[Any]:
        now = monotonic()
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                self._misses += 1
                logger.debug(
                    "cache.miss",
                    extra={"event": "cache.miss", "namespace": self._namespace, "key_hash": _key_hash(key)},
                )
                return None
            expires_at, stored_at, value = entry
            if now >= expires_at:
                self._data.pop(key, None)
                self._misses += 1
                logger.debug(
                    "cache.miss",
                    extra={
                        "event": "cache.miss",
                        "namespace": self._namespace,
                        "key_hash": _key_hash(key),
                        "reason": "expired",
                    },
                )
                return None
            self._data.move_to_end(key)
            self._hits += 1
            age_ms = int((now - stored_at) * 1000)
            logger.debug(
                "cache.hit",
                extra={
                    "event": "cache.hit",
                    "namespace": self._namespace,
                    "key_hash": _key_hash(key),
                    "age_ms": age_ms,
                },
            )
            return value

    def set(self, key: Hashable, value: Any, *, ttl: Optional[float] = None) -> None:
        """Store ``value`` under ``key``. ``ttl`` overrides the cache default
        for this entry only — useful when one cache holds data with
        different freshness expectations (e.g. review verdicts at 300 s and
        decision narration at 900 s)."""
        now = monotonic()
        effective_ttl = ttl if ttl is not None else self._ttl
        with self._lock:
            self._data[key] = (now + effective_ttl, now, value)
            self._data.move_to_end(key)
            self._sets += 1
            while len(self._data) > self._max:
                self._data.popitem(last=False)
                self._evictions += 1
            logger.debug(
                "cache.set",
                extra={
                    "event": "cache.set",
                    "namespace": self._namespace,
                    "key_hash": _key_hash(key),
                    "ttl_s": int(effective_ttl),
                },
            )

    # ----- invalidation -----

    def invalidate(self, key: Hashable) -> bool:
        """Drop a single entry. Returns True if it existed."""
        with self._lock:
            if key in self._data:
                del self._data[key]
                self._invalidations += 1
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Drop every entry whose key (cast to str) starts with ``prefix``.
        Returns the number of entries removed."""
        return self.invalidate_predicate(lambda k: isinstance(k, str) and k.startswith(prefix))

    def invalidate_predicate(self, predicate: Callable[[Hashable], bool]) -> int:
        """Drop every entry for which ``predicate(key)`` is truthy.
        Returns the number of entries removed."""
        removed = 0
        with self._lock:
            to_remove = [k for k in self._data if predicate(k)]
            for k in to_remove:
                del self._data[k]
                removed += 1
            self._invalidations += removed
        if removed:
            logger.info(
                "cache.invalidate",
                extra={
                    "event": "cache.invalidate",
                    "namespace": self._namespace,
                    "removed": removed,
                },
            )
        return removed

    # ----- introspection / housekeeping -----

    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            return {
                "namespace": self._namespace,
                "size": len(self._data),
                "max_size": self._max,
                "ttl_seconds": self._ttl,
                "hits": self._hits,
                "misses": self._misses,
                "sets": self._sets,
                "evictions": self._evictions,
                "invalidations": self._invalidations,
                "hit_rate": (self._hits / total) if total else 0.0,
            }

    def reset_counters(self) -> None:
        with self._lock:
            self._hits = 0
            self._misses = 0
            self._sets = 0
            self._evictions = 0
            self._invalidations = 0

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


# Shared instance used by Gemini callers (review_agent, decision_agent).
# TTL here is the default; review_agent and decision_agent pass explicit
# per-set TTLs to tier freshness (review: 300 s, decision: 900 s).
gemini_cache = TTLCache(
    max_size=_int_env("GEMINI_CACHE_MAX_SIZE", 256),
    ttl_seconds=_float_env("GEMINI_CACHE_TTL_SECONDS", 900.0),
    namespace="gemini",
)


# Tiered TTLs — overridable via env for ops tuning.
REVIEW_CACHE_TTL = _float_env("GEMINI_REVIEW_CACHE_TTL_SECONDS", 300.0)
DECISION_CACHE_TTL = _float_env("GEMINI_DECISION_CACHE_TTL_SECONDS", 900.0)


def invalidate_for_user(user_id: str) -> int:
    """Drop every cached entry whose key targets ``user_id``.

    Called when the user's budget or purchase totals change — the next
    analysis must reconsider, not replay a stale narration.
    """
    if not user_id:
        return 0
    return gemini_cache.invalidate_predicate(
        lambda k: isinstance(k, str) and f":u={user_id}:" in k
    )


def invalidate_for_url(url_hash: str) -> int:
    """Drop every cached entry whose key targets ``url_hash``.

    Called when a new price observation lands for the URL — any cached
    decision keyed on the prior price-history snapshot is now stale.
    """
    if not url_hash:
        return 0
    return gemini_cache.invalidate_predicate(
        lambda k: isinstance(k, str) and f":p={url_hash}:" in k
    )
