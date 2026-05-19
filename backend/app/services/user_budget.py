"""User budget repository.

Responsibilities:

  * Per-(user_id, category) limits + running spend totals.
  * **Lazy monthly reset** — every read/write checks each row's
    ``period_start`` against the first of the current calendar month.
    Stale rows get their ``category_spent`` zeroed and ``period_start``
    bumped before being returned. No cron, no scheduler — the reset
    happens the next time we touch the row.
  * **Computed monthly_spent** — a user's total spend for the current
    month is ``SUM(category_spent)`` across their rows. We don't store
    it; the analysis path only ever reads it once.

Public API:

    get(db, user_id, category)              → Optional[UserBudget]
    get_or_default(db, user_id, category)   → UserBudget (legacy GET path)
    upsert(db, user_id, category, budget)   → row
    record_purchase(db, user_id, category, amount, ...)  → row
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import UserBudgetRow
from app.models.schemas import CategoryBudget, UserBudget, UserBudgetSummary

# Permissive defaults — only used by the GET endpoint to give the frontend
# a sane starting state when no row exists. Never injected into the
# analysis path; see `get()` for that.
DEFAULT_BUDGET = UserBudget(
    monthlyLimit=10_000.0,
    categoryLimit=5_000.0,
    categorySpent=0.0,
    monthlySpent=0.0,
    currency="TRY",
)

# Reserved category slot holding the user's GLOBAL monthly envelope.
# Stored as a normal user_budgets row so no schema migration is needed;
# external callers should use the convenience helpers (get_global /
# upsert_global) rather than passing this string in by hand.
GLOBAL_CATEGORY = "__GLOBAL__"


# ---------- Internal helpers ----------


def _month_start(today: Optional[date] = None) -> date:
    d = today or date.today()
    return date(d.year, d.month, 1)


def _reset_stale_rows(rows: Iterable[UserBudgetRow], current_period: date) -> bool:
    """Zero out category_spent on rows whose period_start is older than
    `current_period`. Returns True if anything was changed (caller must
    commit). Safe to call with already-current rows — no-op.
    """
    changed = False
    for row in rows:
        if row.period_start < current_period:
            row.category_spent = 0.0
            row.period_start = current_period
            changed = True
    return changed


def _fetch_user_rows(db: Session, user_id: str) -> list[UserBudgetRow]:
    return list(
        db.execute(
            select(UserBudgetRow).where(UserBudgetRow.user_id == user_id)
        ).scalars()
    )


def _row_for_category(rows: Iterable[UserBudgetRow], category: str) -> Optional[UserBudgetRow]:
    """Case-insensitive match — extractor categories drift in casing
    (`elektronik`, `Elektronik`, `ELEKTRONIK`) and we don't want a
    cosmetic difference to silently drop the user's budget."""
    target = category.strip().casefold()
    for r in rows:
        if r.category.strip().casefold() == target:
            return r
    return None


def _visible_rows(rows: Iterable[UserBudgetRow]) -> list[UserBudgetRow]:
    """Filter out the GLOBAL sentinel — popup/listing surfaces only
    user-named categories. The global envelope is exposed through its
    own dedicated endpoint."""
    target = GLOBAL_CATEGORY.casefold()
    return [r for r in rows if r.category.strip().casefold() != target]


def _to_budget(
    row: Optional[UserBudgetRow],
    *,
    monthly_spent_total: float,
    monthly_limit_hint: Optional[float],
    currency_hint: str,
) -> Optional[UserBudget]:
    """Build a UserBudget snapshot.

    `row` may be None when the user has set a monthly limit but never
    purchased / configured this specific category — we still want the
    agent to score against the monthly cap, so we synthesize a row.
    """
    if row is None and monthly_limit_hint is None:
        return None

    monthly_limit = row.monthly_limit if row is not None else (monthly_limit_hint or 0.0)
    category_limit = row.category_limit if row is not None else monthly_limit
    category_spent = row.category_spent if row is not None else 0.0
    currency = row.currency if row is not None else currency_hint

    return UserBudget(
        monthlyLimit=monthly_limit,
        categoryLimit=category_limit,
        categorySpent=category_spent,
        monthlySpent=monthly_spent_total,
        currency=currency,  # type: ignore[arg-type]
    )


# ---------- Public API ----------


def get(db: Session, user_id: str, category: str) -> Optional[UserBudget]:
    """Return the stored budget for (user_id, category) or ``None``.

    Resolution order:
        1. Exact (case-insensitive) match on (user_id, category).
        2. GLOBAL sentinel row — the user's overall monthly envelope.
        3. ``None`` only when the user has never configured anything.

    The GLOBAL fallback is what makes the per-category model graceful:
    when a brand-new category lands on the page (electronics product
    after the user only configured "Giyim"), the analysis still scores
    against the user's overall monthly cap rather than silently
    degrading to "no budget data".
    """
    if not user_id or not category:
        return None

    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    if not rows:
        return None

    if _reset_stale_rows(rows, period):
        db.commit()

    monthly_spent_total = sum(r.category_spent for r in rows)
    monthly_limit_hint = rows[0].monthly_limit  # denormalized across rows
    currency_hint = rows[0].currency

    row = _row_for_category(rows, category)
    if row is None:
        # Fall through to GLOBAL — explicit lookup ensures the synthesis
        # below uses the global cap, not the first arbitrary category row.
        row = _row_for_category(rows, GLOBAL_CATEGORY)

    return _to_budget(
        row,
        monthly_spent_total=monthly_spent_total,
        monthly_limit_hint=monthly_limit_hint,
        currency_hint=currency_hint,
    )


def get_strict(db: Session, user_id: str, category: str) -> Optional[UserBudget]:
    """Like :func:`get` but **does not** fall back to the GLOBAL row.

    Returns the budget only when an exact (case-insensitive) row for
    (user_id, category) exists. Used by the orchestrator when it needs
    to choose explicitly between a per-category match and the GLOBAL
    envelope.
    """
    if not user_id or not category:
        return None

    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    if not rows:
        return None

    if _reset_stale_rows(rows, period):
        db.commit()

    row = _row_for_category(rows, category)
    if row is None:
        return None

    monthly_spent_total = sum(r.category_spent for r in rows)
    monthly_limit_hint = rows[0].monthly_limit
    currency_hint = rows[0].currency

    return _to_budget(
        row,
        monthly_spent_total=monthly_spent_total,
        monthly_limit_hint=monthly_limit_hint,
        currency_hint=currency_hint,
    )


def get_global(db: Session, user_id: str) -> Optional[UserBudget]:
    """Return just the GLOBAL envelope row for this user, or ``None``."""
    return get_strict(db, user_id, GLOBAL_CATEGORY)


def get_effective_global(db: Session, user_id: str) -> Optional[UserBudget]:
    """Return the user's effective overall envelope.

    Priority:
        1. Explicit GLOBAL sentinel row (the new hybrid-model field).
        2. Synthesized envelope from any per-category row — the row's
           ``monthly_limit`` is the user's per-month cap (denormalized),
           and we treat the synthesized ``category_limit`` as equal to
           it so the agent scores purely on the monthly envelope. This
           preserves the legacy "user only added one category, but their
           ₺5000/month cap should still apply to OTHER categories"
           behavior without requiring everyone to migrate to GLOBAL.
        3. ``None`` only when the user has no rows at all.
    """
    explicit = get_global(db, user_id)
    if explicit is not None:
        return explicit

    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    if not rows:
        return None
    if _reset_stale_rows(rows, period):
        db.commit()

    visible = _visible_rows(rows)
    if not visible:
        return None

    monthly_spent_total = sum(r.category_spent for r in rows)
    base = visible[0]
    return UserBudget(
        monthlyLimit=base.monthly_limit,
        categoryLimit=base.monthly_limit,  # synthesized cap = monthly cap
        categorySpent=0.0,
        monthlySpent=monthly_spent_total,
        currency=base.currency,  # type: ignore[arg-type]
    )


def upsert_global(
    db: Session,
    *,
    user_id: str,
    monthly_limit: float,
    currency: str = "TRY",
) -> UserBudgetRow:
    """Write the user's GLOBAL monthly envelope.

    Sets the GLOBAL row's ``category_limit`` equal to its ``monthly_limit``
    so the budget agent's category-cap check degrades to the monthly cap
    when no narrower per-category row applies. Also propagates the new
    monthly_limit across the user's named-category rows so the
    denormalized value stays consistent everywhere.
    """
    budget = UserBudget(
        monthlyLimit=monthly_limit,
        categoryLimit=monthly_limit,
        categorySpent=0.0,
        monthlySpent=None,
        currency=currency,  # type: ignore[arg-type]
    )
    return upsert(db, user_id=user_id, category=GLOBAL_CATEGORY, budget=budget)


def get_or_default(db: Session, user_id: str, category: str) -> UserBudget:
    """Same as `get` but returns a permissive default instead of None.

    Used by the GET /api/user-budget endpoint so the popup form always
    has a sane starting state.
    """
    budget = get(db, user_id, category)
    return budget if budget is not None else DEFAULT_BUDGET


def upsert(
    db: Session,
    *,
    user_id: str,
    category: str,
    budget: UserBudget,
) -> UserBudgetRow:
    """Insert-or-update the (user_id, category) row.

    Setting `monthlyLimit` here updates it across ALL of this user's
    rows — it's a per-user value denormalized into every category row.
    """
    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    _reset_stale_rows(rows, period)

    row = _row_for_category(rows, category)

    # Propagate the new monthly_limit to every existing row.
    for r in rows:
        if r.monthly_limit != budget.monthlyLimit:
            r.monthly_limit = budget.monthlyLimit
        if r.currency != budget.currency:
            r.currency = budget.currency

    if row is None:
        row = UserBudgetRow(
            user_id=user_id,
            category=category,
            monthly_limit=budget.monthlyLimit,
            category_limit=budget.categoryLimit,
            category_spent=budget.categorySpent or 0.0,
            period_start=period,
            currency=budget.currency,
        )
        db.add(row)
    else:
        row.monthly_limit = budget.monthlyLimit
        row.category_limit = budget.categoryLimit
        # category_spent is only overwritten if the caller explicitly
        # supplied a non-default value — otherwise we preserve the
        # running tally.
        if budget.categorySpent is not None and budget.categorySpent != row.category_spent:
            row.category_spent = budget.categorySpent
        row.currency = budget.currency
        row.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return row


def record_purchase(
    db: Session,
    *,
    user_id: str,
    category: str,
    amount: float,
) -> UserBudgetRow:
    """Increment category_spent for (user_id, category) by `amount`.

    If no row exists yet for this category, we create one using the
    user's existing monthly_limit if they have any other categories
    configured. If the user has no budget at all, we still create the
    row using the permissive defaults — recording the purchase
    preserves the spend trail even when the user hasn't set limits yet.
    """
    if amount <= 0:
        raise ValueError("purchase amount must be positive")

    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    _reset_stale_rows(rows, period)

    row = _row_for_category(rows, category)
    if row is None:
        # Inherit limits from an existing row if the user has one;
        # otherwise fall back to the permissive defaults.
        if rows:
            monthly_limit = rows[0].monthly_limit
            currency = rows[0].currency
            category_limit = monthly_limit  # no per-cat cap configured yet
        else:
            monthly_limit = DEFAULT_BUDGET.monthlyLimit
            currency = DEFAULT_BUDGET.currency
            category_limit = DEFAULT_BUDGET.categoryLimit

        row = UserBudgetRow(
            user_id=user_id,
            category=category,
            monthly_limit=monthly_limit,
            category_limit=category_limit,
            category_spent=amount,
            period_start=period,
            currency=currency,
        )
        db.add(row)
    else:
        row.category_spent = (row.category_spent or 0.0) + amount
        row.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return row


def list_for_user(db: Session, user_id: str) -> list[UserBudgetRow]:
    """Return the user's full set of category rows (including GLOBAL),
    with stale rows reset to the current period. Callers that want
    user-visible rows only should run :func:`visible_rows` on the result.
    Empty list if the user has nothing."""
    period = _month_start()
    rows = _fetch_user_rows(db, user_id)
    if not rows:
        return []
    if _reset_stale_rows(rows, period):
        db.commit()
    return rows


def visible_rows(rows: Iterable[UserBudgetRow]) -> list[UserBudgetRow]:
    """Public-facing helper: drop the GLOBAL sentinel from a row list."""
    return _visible_rows(rows)


def summarize_for_user(db: Session, user_id: str) -> Optional[UserBudgetSummary]:
    """Build the popup-shaped summary in one go.

    Lifts the per-category aggregation that used to live inside the
    ``GET /api/user-budgets`` route. Returns ``None`` when the user has
    no rows at all — the caller surfaces an empty-state default.
    """
    rows = list_for_user(db, user_id)
    if not rows:
        return None

    monthly_spent = sum(r.category_spent for r in rows)
    visible = _visible_rows(rows)
    categories = [
        CategoryBudget(
            category=r.category,
            categoryLimit=r.category_limit,
            categorySpent=r.category_spent,
        )
        for r in visible
    ]
    return UserBudgetSummary(
        userId=user_id,
        monthlyLimit=rows[0].monthly_limit,
        monthlySpent=monthly_spent,
        currency=rows[0].currency,  # type: ignore[arg-type]
        periodStart=rows[0].period_start.isoformat(),
        categories=categories,
    )


def monthly_spent_for(db: Session, user_id: str) -> float:
    """Return SUM(category_spent) across the user's current-period rows.

    Stale rows (period_start < current month) contribute 0 — they get
    reset on the next read/write that touches them.
    """
    period = _month_start()
    total = db.execute(
        select(func.coalesce(func.sum(UserBudgetRow.category_spent), 0.0))
        .where(UserBudgetRow.user_id == user_id)
        .where(UserBudgetRow.period_start >= period)
    ).scalar_one()
    return float(total)
