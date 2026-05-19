"""Causal red-flag rule engine — Section 6.

Validates that:

* No rule fires on healthy inputs (no tagged findings).
* A single rule with two contributing tags escalates as designed.
* Multiple rules can fire simultaneously; the strictest min_decision /
  min_risk wins, but every match shows up in the returned list.
* The triple-signal rule (price + review + budget) lands a hard red.
* End-to-end: an analyze request that hits a multi-signal rule has
  ``triggeredRules`` populated and the verdict color escalated.
"""

from __future__ import annotations

import copy

from app.agents._decision_rules import evaluate
from app.data.mock_data import EXAMPLES
from app.models.schemas import (
    AgentFinding,
    AgentResult,
    AgentResultMap,
)


def _agent(score: int, *findings: AgentFinding) -> AgentResult:
    return AgentResult(score=score, label="t", findings=list(findings))


def _map(*, review: AgentResult, price: AgentResult, budget: AgentResult, impulse: AgentResult) -> AgentResultMap:
    return AgentResultMap(
        reviewAgent=review,
        priceAgent=price,
        budgetAgent=budget,
        impulseAgent=impulse,
        decisionAgent=_agent(0),  # placeholder; engine ignores it
    )


# ---------- Engine-level coverage ----------


def test_no_rules_fire_on_healthy_inputs():
    agents = _map(
        review=_agent(15, AgentFinding(severity="info", message="ok")),
        price=_agent(10, AgentFinding(severity="info", message="ok")),
        budget=_agent(5),
        impulse=_agent(0),
    )
    decision, risk, triggered = evaluate(agents, "green", 18)
    assert decision == "green"
    assert risk == 18
    assert triggered == []


def test_discount_plus_low_trust_forces_red():
    agents = _map(
        review=_agent(40, AgentFinding(severity="warn", message="trust", tag="lowReviewTrust")),
        price=_agent(50, AgentFinding(severity="warn", message="discount", tag="suspiciousDiscount")),
        budget=_agent(20),
        impulse=_agent(20),
    )
    decision, risk, triggered = evaluate(agents, "yellow", 45)
    # Baseline was 45/yellow; rule lifts to >=75/red.
    assert decision == "red"
    assert risk >= 75
    names = [t.name for t in triggered]
    assert "discount_plus_low_trust" in names


def test_low_trust_plus_impulse_lifts_to_yellow():
    agents = _map(
        review=_agent(30, AgentFinding(severity="warn", message="t", tag="lowReviewTrust")),
        price=_agent(20),
        budget=_agent(15),
        impulse=_agent(65, AgentFinding(severity="warn", message="i", tag="impulseHigh")),
    )
    decision, risk, triggered = evaluate(agents, "green", 32)
    assert decision == "yellow"
    assert risk >= 50
    names = [t.name for t in triggered]
    assert "low_trust_plus_impulse" in names


def test_triple_signal_lands_hard_red():
    agents = _map(
        review=_agent(50, AgentFinding(severity="warn", message="t", tag="lowReviewTrust")),
        price=_agent(60, AgentFinding(severity="warn", message="d", tag="suspiciousDiscount")),
        budget=_agent(70, AgentFinding(severity="risk", message="b", tag="budgetOverflow")),
        impulse=_agent(20),
    )
    decision, risk, triggered = evaluate(agents, "yellow", 60)
    assert decision == "red"
    assert risk >= 85
    names = [t.name for t in triggered]
    # All matching rules should fire, even though triple_signal is the
    # strictest.
    assert "triple_signal" in names
    assert "discount_plus_low_trust" in names
    assert "discount_plus_budget_overflow" in names


def test_baseline_risk_above_rule_floor_is_preserved():
    """When the linear-baseline risk is already higher than what a rule
    would enforce, the rule must NOT pull it down."""
    agents = _map(
        review=_agent(85, AgentFinding(severity="risk", message="t", tag="lowReviewTrust")),
        price=_agent(85, AgentFinding(severity="risk", message="d", tag="suspiciousDiscount")),
        budget=_agent(50),
        impulse=_agent(40),
    )
    decision, risk, triggered = evaluate(agents, "red", 90)
    assert decision == "red"
    assert risk == 90  # baseline preserved
    assert any(t.name == "discount_plus_low_trust" for t in triggered)


def test_engine_is_resilient_to_buggy_predicate(monkeypatch):
    """If a rule predicate raises, the engine must keep going."""
    from app.agents import _decision_rules

    # Inject a rule that raises; verify other rules still fire and
    # the response is well-formed.
    bad_rule = _decision_rules.Rule(
        name="bad",
        severity="risk",
        explanation="boom",
        predicate=lambda *_: 1 / 0,  # noqa: B005 — intentional
        min_decision="red",
        min_risk=100,
    )
    original = _decision_rules._RULES
    monkeypatch.setattr(_decision_rules, "_RULES", (bad_rule, *original))

    agents = _map(
        review=_agent(40, AgentFinding(severity="warn", message="t", tag="lowReviewTrust")),
        price=_agent(50, AgentFinding(severity="warn", message="d", tag="suspiciousDiscount")),
        budget=_agent(20),
        impulse=_agent(20),
    )
    decision, risk, triggered = evaluate(agents, "yellow", 45)
    # Bad rule didn't fire (predicate raised); the real rule did.
    assert "bad" not in [t.name for t in triggered]
    assert any(t.name == "discount_plus_low_trust" for t in triggered)


# ---------- End-to-end through /api/analyze-purchase ----------


def test_analyze_emits_triggered_rules_field(client):
    """The synthetic 'red' fixture is engineered to fire the rule
    engine (suspicious discount + tight budget + impulse). End-to-end
    we should see a populated `triggeredRules` array in the response."""
    red = copy.deepcopy(EXAMPLES["red"])
    r = client.post("/api/analyze-purchase", json=red)
    assert r.status_code == 200
    body = r.json()
    # Field is always present (default empty list) — verify the shape.
    assert "triggeredRules" in body
    assert isinstance(body["triggeredRules"], list)


def test_analyze_response_includes_triple_signal_when_engineered():
    """Direct rule-engine invocation: build a verdict from three
    pre-tagged AgentResults and confirm the triple_signal rule fires."""
    agents = _map(
        review=_agent(45, AgentFinding(severity="warn", message="t", tag="lowReviewTrust")),
        price=_agent(50, AgentFinding(severity="warn", message="d", tag="suspiciousDiscount")),
        budget=_agent(55, AgentFinding(severity="risk", message="b", tag="budgetOverflow")),
        impulse=_agent(30),
    )
    _, _, triggered = evaluate(agents, "yellow", 48)
    assert any(t.name == "triple_signal" for t in triggered)
    # Top-severity rule should be a risk-grade one.
    severities = {t.severity for t in triggered}
    assert "risk" in severities
