"""Retry + circuit breaker for Gemini calls.

Covers the dependency-free :mod:`app.agents._gemini_resilience` wrapper:

* Transient exceptions are retried up to ``max_attempts``.
* ``ValidationError`` is NOT retried (deterministic schema failure).
* Consecutive failures open the breaker; further calls raise
  ``GeminiBreakerOpen`` without invoking the underlying function.
* A success closes the breaker and resets the counter.

Backoff sleeps are stubbed to 0 s so the suite stays fast.
"""

from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from app.agents import _gemini_resilience as resilience
from app.agents._gemini_resilience import GeminiBreakerOpen, gemini_call, reset_breaker


@pytest.fixture(autouse=True)
def _clean_breaker(monkeypatch):
    """Start every test with a closed breaker and zero-sleep retries."""
    reset_breaker()
    monkeypatch.setattr(resilience.time, "sleep", lambda _s: None)
    yield
    reset_breaker()


# ---------- Retry on transient errors ----------


def test_succeeds_on_first_call_no_retry():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        return "ok"

    assert gemini_call(fn) == "ok"
    assert calls["n"] == 1


def test_retries_then_succeeds_on_transient_failure():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient 503")
        return "ok"

    assert gemini_call(fn, max_attempts=3) == "ok"
    assert calls["n"] == 3


def test_re_raises_after_exhausting_attempts():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        raise RuntimeError("always fails")

    with pytest.raises(RuntimeError, match="always fails"):
        gemini_call(fn, max_attempts=2)
    assert calls["n"] == 2


# ---------- Schema-error fast-fail ----------


class _Schema(BaseModel):
    score: int


def test_validation_error_does_not_retry():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        _Schema.model_validate({"score": "not-an-int"})  # raises ValidationError
        return "unreachable"

    with pytest.raises(ValidationError):
        gemini_call(fn, max_attempts=5)
    # Fast-fail: one attempt, no retries.
    assert calls["n"] == 1


# ---------- Circuit breaker ----------


def test_breaker_opens_after_threshold_failures(monkeypatch):
    """Three consecutive failures open the breaker; the fourth call
    raises GeminiBreakerOpen without invoking ``fn``."""
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        raise RuntimeError("bang")

    # The breaker uses 3 consecutive failures by default; with
    # max_attempts=1 each call is one failure.
    for _ in range(3):
        with pytest.raises(RuntimeError):
            gemini_call(fn, max_attempts=1)

    # Fourth call short-circuits — fn is NOT called.
    n_before = calls["n"]
    with pytest.raises(GeminiBreakerOpen):
        gemini_call(fn, max_attempts=1)
    assert calls["n"] == n_before


def test_success_closes_breaker_and_resets_counter():
    fail_then_ok = iter([True, True, False])
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if next(fail_then_ok):
            raise RuntimeError("transient")
        return "ok"

    # Two failures bring us close to the breaker threshold (3 by default).
    for _ in range(2):
        with pytest.raises(RuntimeError):
            gemini_call(fn, max_attempts=1)

    # The third call succeeds → counter resets, breaker stays closed.
    assert gemini_call(fn, max_attempts=1) == "ok"

    # New string of failures must rebuild the counter from zero,
    # so a single failure here doesn't open the breaker (1 < 3).
    def boom():
        raise RuntimeError("again")

    with pytest.raises(RuntimeError):
        gemini_call(boom, max_attempts=1)
    # Still closed.
    with pytest.raises(RuntimeError):
        gemini_call(boom, max_attempts=1)
    # That's 2 fresh failures; one more should open it.
    with pytest.raises(RuntimeError):
        gemini_call(boom, max_attempts=1)
    with pytest.raises(GeminiBreakerOpen):
        gemini_call(boom, max_attempts=1)


def test_breaker_half_opens_after_recovery_window(monkeypatch):
    """Once ``recovery_seconds`` have elapsed the breaker allows the
    next call through (half-open state)."""
    # Make recovery instant.
    monkeypatch.setattr(
        resilience._breaker, "_recovery_seconds", 0.0
    )

    def fail():
        raise RuntimeError("boom")

    for _ in range(3):
        with pytest.raises(RuntimeError):
            gemini_call(fail, max_attempts=1)

    assert resilience._breaker.is_open

    # With recovery_seconds=0 the next call is allowed through and we
    # see the real exception (not BreakerOpen).
    def ok():
        return "recovered"

    assert gemini_call(ok, max_attempts=1) == "recovered"
    assert not resilience._breaker.is_open
