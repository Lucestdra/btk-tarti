"""Retry + circuit breaker wrapper for Gemini calls.

Two problems we're solving:

* **Transient flakes.** Gemini occasionally returns 5xx or socket errors
  even on healthy days. Without a retry, those bubble straight to the
  heuristic fallback even though one more attempt would have succeeded.
* **Sustained outages.** When Gemini is genuinely down, every analysis
  pays the full per-call timeout (~3-6 s) before giving up. Multiply by
  the four-way parallel graph and a single bad period is enough to ruin
  the panel's "5 saniyelik kontrol" promise.

This module wraps ``client.models.generate_content`` (or any callable)
with:

* Up to 3 attempts on transient errors, exponential backoff with jitter
  (0.1 s → 0.4 s → 1.6 s, plus 0-30% random spread).
* A small circuit breaker: 3 consecutive failures open the breaker for
  30 s. While open, calls raise ``GeminiBreakerOpen`` immediately —
  callers catch it the same way they already catch any other Gemini
  exception and slide into their heuristic path.
* No retry on Pydantic validation errors (the model returned a
  structurally-bad response; a second call won't fix it).

Kept dependency-free to avoid adding ``tenacity`` to requirements.txt
for ~40 lines of logic.
"""

from __future__ import annotations

import logging
import random
import time
from threading import Lock
from typing import Callable, TypeVar

from pydantic import ValidationError

logger = logging.getLogger("thundrly.gemini")

T = TypeVar("T")


class GeminiBreakerOpen(RuntimeError):
    """Raised when the circuit breaker is open; do not retry."""


class _CircuitBreaker:
    def __init__(
        self,
        *,
        failure_threshold: int = 3,
        recovery_seconds: float = 30.0,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._recovery_seconds = recovery_seconds
        self._lock = Lock()
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    def check_open(self) -> None:
        """Raise :class:`GeminiBreakerOpen` if the breaker is currently open.

        Once ``recovery_seconds`` have elapsed since opening, we move
        to a "half-open" state by clearing the timestamp — the next
        call will be allowed through and its result will determine
        whether we close fully or re-open.
        """
        with self._lock:
            if self._opened_at is None:
                return
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self._recovery_seconds:
                # Half-open: let the next call try.
                self._opened_at = None
                logger.info(
                    "gemini.breaker.half_open",
                    extra={"event": "gemini.breaker.half_open"},
                )
                return
        raise GeminiBreakerOpen(
            f"Gemini circuit breaker open; {self._recovery_seconds}s cooldown in progress"
        )

    def record_success(self) -> None:
        with self._lock:
            if self._consecutive_failures or self._opened_at is not None:
                logger.info(
                    "gemini.breaker.closed",
                    extra={"event": "gemini.breaker.closed"},
                )
            self._consecutive_failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._failure_threshold and self._opened_at is None:
                self._opened_at = time.monotonic()
                logger.warning(
                    "gemini.breaker.open",
                    extra={
                        "event": "gemini.breaker.open",
                        "failures": self._consecutive_failures,
                        "recovery_s": self._recovery_seconds,
                    },
                )

    # Test helpers — not part of the production surface but useful for
    # unit tests that want to exercise specific breaker states without
    # waiting for real clock time.
    def reset(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._opened_at = None

    @property
    def is_open(self) -> bool:
        with self._lock:
            return self._opened_at is not None


# Shared breaker — both agents drain the same Gemini quota, so when it
# fails for one it's almost certainly failing for both. One breaker
# captures the cross-agent picture and avoids redundant retries.
_breaker = _CircuitBreaker()


def reset_breaker() -> None:
    """Test helper."""
    _breaker.reset()


def gemini_call(
    fn: Callable[[], T],
    *,
    max_attempts: int = 3,
    base_backoff_seconds: float = 0.1,
    label: str = "gemini",
) -> T:
    """Run ``fn`` with retry + circuit-breaker protection.

    On a Pydantic ``ValidationError`` we do **not** retry — the model
    gave us structurally-bad output and a second attempt is unlikely
    to help. On any other exception we retry up to ``max_attempts``
    times with exponential backoff + jitter, then re-raise the last
    exception. The caller is expected to already have a heuristic
    fallback for that case.
    """
    _breaker.check_open()

    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            value = fn()
            _breaker.record_success()
            return value
        except ValidationError as exc:
            # Don't retry schema-shape problems — they're deterministic.
            _breaker.record_failure()
            logger.warning(
                "gemini.call.validation_error",
                extra={"event": "gemini.call.validation_error", "label": label},
            )
            raise exc
        except Exception as exc:  # noqa: BLE001 — broad on purpose; we then decide
            last_exc = exc
            if attempt >= max_attempts:
                _breaker.record_failure()
                logger.warning(
                    "gemini.call.exhausted",
                    extra={
                        "event": "gemini.call.exhausted",
                        "label": label,
                        "attempts": attempt,
                        "error": str(exc)[:200],
                    },
                )
                raise
            # Exponential backoff with 0-30% jitter.
            sleep_s = base_backoff_seconds * (4 ** (attempt - 1))
            sleep_s *= 1 + random.random() * 0.3
            logger.info(
                "gemini.call.retry",
                extra={
                    "event": "gemini.call.retry",
                    "label": label,
                    "attempt": attempt,
                    "sleep_s": round(sleep_s, 3),
                    "error": str(exc)[:120],
                },
            )
            time.sleep(sleep_s)

    # Defensive — loop always returns or raises before here.
    assert last_exc is not None
    raise last_exc
