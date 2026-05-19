"""Causal red-flag rule engine — Section 6.

The 4 signal agents emit numeric scores and tagged findings; the
decision agent's weighted sum captures the linear average of those
scores. This module captures the **non-linear** part: combinations of
tagged signals that, *together*, are stronger than the sum of their
parts.

Example: ``suspiciousDiscount`` + ``lowReviewTrust`` is a much stronger
manipulation signal than either alone, even when neither agent's
individual score crosses the 80-point escalation threshold.

Design notes:

* Rules are evaluated in declaration order; **all** matching rules
  emit a ``TriggeredRule`` so the panel can show the full picture,
  but only the **strictest** ``min_decision``/``min_risk`` actually
  overrides the baseline (so a high-severity rule isn't blunted by a
  later soft-bump one).
* Rules are pure functions of the agent results — no DB access, no
  LLM, no I/O. Trivial to test, trivial to add new rules to.
* Rule predicates inspect ``AgentResult.findings`` for known ``tag``
  values; the tag inventory lives in the agent files themselves so
  rules and signals can evolve independently.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional

from app.models.schemas import (
    AgentResult,
    AgentResultMap,
    Decision,
    Severity,
    TriggeredRule,
)


# ---------- Rule type ----------


@dataclass(frozen=True)
class Rule:
    name: str
    severity: Severity
    explanation: str
    # Predicate over the four signal-agent results.
    predicate: Callable[[AgentResult, AgentResult, AgentResult, AgentResult], bool]
    # Decision color this rule wants to enforce (None = no override).
    min_decision: Optional[Decision] = None
    # Risk-score floor this rule wants to enforce.
    min_risk: int = 0
    # Soft additive bump (applied even when min_risk doesn't lift the score).
    # Capped at 100 in the caller.
    bump: int = 0


# ---------- Tag-lookup helpers ----------


def _has_tag(agent: AgentResult, tag: str) -> bool:
    return any(f.tag == tag for f in agent.findings)


# ---------- Rule library ----------
#
# Order matters: every matching rule fires (collected), but the strictest
# `min_decision` + `min_risk` win. Listed strongest-first for readability.

_RULES: tuple[Rule, ...] = (
    Rule(
        name="discount_plus_low_trust",
        severity="risk",
        explanation=(
            "Hem fiyat hem yorum sinyali manipülasyon işaretliyor — "
            "şüpheli indirim ve düşük yorum güveni birlikte."
        ),
        predicate=lambda review, price, budget, impulse: (
            _has_tag(price, "suspiciousDiscount") and _has_tag(review, "lowReviewTrust")
        ),
        min_decision="red",
        min_risk=75,
    ),
    Rule(
        name="discount_plus_budget_overflow",
        severity="risk",
        explanation=(
            "Şüpheli indirim ile bütçe aşımı aynı satın almada birleşiyor; "
            "kararı en az sarıya çekiyoruz."
        ),
        predicate=lambda review, price, budget, impulse: (
            _has_tag(price, "suspiciousDiscount") and _has_tag(budget, "budgetOverflow")
        ),
        min_decision="yellow",
        min_risk=55,
    ),
    Rule(
        name="low_trust_plus_impulse",
        severity="warn",
        explanation=(
            "Düşük yorum güveni ile yüksek dürtü sinyali birlikte — "
            "kararı sakince gözden geçir."
        ),
        predicate=lambda review, price, budget, impulse: (
            _has_tag(review, "lowReviewTrust") and _has_tag(impulse, "impulseHigh")
        ),
        min_decision="yellow",
        min_risk=50,
    ),
    Rule(
        name="impulse_plus_budget_overflow",
        severity="warn",
        explanation=(
            "Geç saat / hızlı tıklama gibi dürtü sinyalleri bütçe aşımıyla "
            "birleşiyor; bu satın almayı 30 saniye düşün."
        ),
        predicate=lambda review, price, budget, impulse: (
            _has_tag(impulse, "impulseHigh") and _has_tag(budget, "budgetOverflow")
        ),
        min_decision="yellow",
        min_risk=50,
    ),
    Rule(
        name="triple_signal",
        severity="risk",
        explanation=(
            "Fiyat, yorum ve bütçe — üç bağımsız sinyal eş zamanlı uyarıyor."
        ),
        predicate=lambda review, price, budget, impulse: (
            _has_tag(price, "suspiciousDiscount")
            and _has_tag(review, "lowReviewTrust")
            and _has_tag(budget, "budgetOverflow")
        ),
        min_decision="red",
        min_risk=85,
    ),
)


# ---------- Public API ----------


_DECISION_ORDER: dict[Decision, int] = {"green": 0, "yellow": 1, "red": 2}


def _stricter(a: Optional[Decision], b: Optional[Decision]) -> Optional[Decision]:
    """Return the stricter (higher-risk) of two decision colors."""
    if a is None:
        return b
    if b is None:
        return a
    return a if _DECISION_ORDER[a] >= _DECISION_ORDER[b] else b


def evaluate(
    agents: AgentResultMap,
    base_decision: Decision,
    base_risk: int,
) -> tuple[Decision, int, list[TriggeredRule]]:
    """Apply the rule library and return the (possibly escalated) verdict.

    Returns:
        ``(decision, risk_score, triggered_rules)`` — ``triggered_rules``
        is the full list of rules that fired, in declaration order.
        Even when no rule escalates the verdict, the list still surfaces
        the matches for the panel to display.
    """
    review = agents.reviewAgent
    price = agents.priceAgent
    budget = agents.budgetAgent
    impulse = agents.impulseAgent

    triggered: list[TriggeredRule] = []
    override_decision: Optional[Decision] = None
    override_risk = 0
    total_bump = 0

    for rule in _RULES:
        try:
            if not rule.predicate(review, price, budget, impulse):
                continue
        except Exception:
            # Defensive: a buggy rule must never break the verdict.
            continue
        triggered.append(
            TriggeredRule(
                name=rule.name,
                severity=rule.severity,
                explanation=rule.explanation,
            )
        )
        override_decision = _stricter(override_decision, rule.min_decision)
        override_risk = max(override_risk, rule.min_risk)
        total_bump += rule.bump

    # Apply overrides on top of the baseline.
    final_risk = max(base_risk, override_risk) + total_bump
    final_risk = max(0, min(100, final_risk))

    final_decision = base_decision
    if override_decision is not None:
        final_decision = _stricter(final_decision, override_decision) or final_decision

    # If the override pushed risk_score into a stricter band than the
    # current color implies, harmonize. (Same band logic as
    # `_compute_decision`; keeping it inline avoids a circular import.)
    if final_risk >= 70 and final_decision != "red":
        final_decision = "red"
    elif final_risk >= 40 and final_decision == "green":
        final_decision = "yellow"

    return final_decision, final_risk, triggered
