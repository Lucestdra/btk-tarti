"""Tests for the per-(userId, category) budget store.

Layers covered:

  1. Repository — `get` returns None for unknown users (so the
     budget_agent reports "Bütçe Verisi Yok" instead of scoring against
     a fabricated default); `upsert` round-trips correctly; the
     denormalized `monthly_limit` propagates to sibling category rows.
  2. Repository — `record_purchase` increments `category_spent`,
     creates missing rows, and respects the lazy monthly reset.
  3. HTTP — GET returns the stored budget (or default); PUT upserts;
     POST /api/purchases bumps spend and returns fresh totals.
  4. Orchestrator — analyze() respects DB-loaded budgets and leaves the
     budget agent with "Bütçe Verisi Yok" when no row exists.
"""

from __future__ import annotations

import copy
from datetime import date, timedelta

from app.data.mock_data import EXAMPLES
from app.db.models import UserBudgetRow
from app.models.schemas import UserBudget
from app.services.user_budget import (
    DEFAULT_BUDGET,
    get,
    get_or_default,
    monthly_spent_for,
    record_purchase,
    upsert,
)


# ---------- Repository: get + upsert ----------


def test_get_returns_none_for_unknown_user(db):
    assert get(db, "no-such-user", "Giyim") is None


def test_get_or_default_returns_default_when_no_row(db):
    out = get_or_default(db, "no-such-user", "Giyim")
    assert out == DEFAULT_BUDGET


def test_upsert_then_get_computes_monthly_spent_from_sum(db):
    """monthly_spent isn't stored — it's the sum of category_spent."""
    budget = UserBudget(
        monthlyLimit=3000,
        categoryLimit=1000,
        categorySpent=200,
        currency="TRY",
    )
    upsert(db, user_id="demo-user", category="Giyim", budget=budget)

    out = get(db, "demo-user", "Giyim")
    assert out is not None
    assert out.monthlyLimit == 3000
    assert out.categoryLimit == 1000
    assert out.categorySpent == 200
    # Only one category row → monthly_spent equals that category's spend.
    assert out.monthlySpent == 200


def test_monthly_spent_sums_across_categories(db):
    """A user's monthly total = SUM(category_spent across all rows)."""
    upsert(
        db,
        user_id="multi",
        category="Giyim",
        budget=UserBudget(monthlyLimit=5000, categoryLimit=2000, categorySpent=800),
    )
    upsert(
        db,
        user_id="multi",
        category="Elektronik",
        budget=UserBudget(monthlyLimit=5000, categoryLimit=3000, categorySpent=1200),
    )

    out = get(db, "multi", "Giyim")
    assert out is not None
    assert out.categorySpent == 800
    assert out.monthlySpent == 2000  # 800 + 1200


def test_upsert_propagates_monthly_limit_to_siblings(db):
    """Setting a new monthly_limit on any category updates all siblings."""
    upsert(
        db,
        user_id="u",
        category="Giyim",
        budget=UserBudget(monthlyLimit=3000, categoryLimit=1000, categorySpent=0),
    )
    upsert(
        db,
        user_id="u",
        category="Elektronik",
        budget=UserBudget(monthlyLimit=3000, categoryLimit=2000, categorySpent=0),
    )

    # Change monthly_limit via the Giyim row.
    upsert(
        db,
        user_id="u",
        category="Giyim",
        budget=UserBudget(monthlyLimit=4500, categoryLimit=1000, categorySpent=0),
    )

    elek = get(db, "u", "Elektronik")
    assert elek is not None
    assert elek.monthlyLimit == 4500  # propagated


def test_upsert_is_idempotent_for_same_key(db):
    """Two upserts on the same (user_id, category) yield one row."""
    b1 = UserBudget(monthlyLimit=1000, categoryLimit=500, categorySpent=10)
    b2 = UserBudget(monthlyLimit=2000, categoryLimit=800, categorySpent=20)

    upsert(db, user_id="u", category="Giyim", budget=b1)
    upsert(db, user_id="u", category="Giyim", budget=b2)

    out = get(db, "u", "Giyim")
    assert out is not None
    assert out.monthlyLimit == 2000
    assert out.categoryLimit == 800
    count = db.query(UserBudgetRow).filter_by(user_id="u", category="Giyim").count()
    assert count == 1


# ---------- Repository: record_purchase + monthly reset ----------


def test_record_purchase_increments_category_spent(db):
    upsert(
        db,
        user_id="u",
        category="Giyim",
        budget=UserBudget(monthlyLimit=3000, categoryLimit=1000, categorySpent=100),
    )

    record_purchase(db, user_id="u", category="Giyim", amount=250)

    out = get(db, "u", "Giyim")
    assert out is not None
    assert out.categorySpent == 350


def test_record_purchase_creates_row_when_missing(db):
    """First purchase in a category with no prior row creates one."""
    record_purchase(db, user_id="new-user", category="Kitap", amount=120)

    out = get(db, "new-user", "Kitap")
    assert out is not None
    assert out.categorySpent == 120
    # Inherits permissive defaults since the user had no other rows.
    assert out.monthlyLimit == DEFAULT_BUDGET.monthlyLimit


def test_record_purchase_inherits_limit_from_sibling(db):
    """If user already has a budget for another category, new categories
    inherit the same monthly_limit (the per-user invariant)."""
    upsert(
        db,
        user_id="u",
        category="Giyim",
        budget=UserBudget(monthlyLimit=4200, categoryLimit=1500, categorySpent=0),
    )

    record_purchase(db, user_id="u", category="Elektronik", amount=500)

    out = get(db, "u", "Elektronik")
    assert out is not None
    assert out.monthlyLimit == 4200  # inherited
    assert out.categorySpent == 500


def test_monthly_reset_zeros_stale_category_spent(db):
    """A row with period_start in a previous month gets its
    category_spent zeroed on the next read."""
    row = UserBudgetRow(
        user_id="u",
        category="Giyim",
        monthly_limit=3000,
        category_limit=1000,
        category_spent=850,
        period_start=date.today().replace(day=1) - timedelta(days=45),
        currency="TRY",
    )
    db.add(row)
    db.commit()

    out = get(db, "u", "Giyim")
    assert out is not None
    assert out.categorySpent == 0  # reset
    # And the stored row should now reflect the current period.
    fresh = db.query(UserBudgetRow).filter_by(user_id="u", category="Giyim").one()
    assert fresh.period_start == date.today().replace(day=1)


# ---------- HTTP endpoints ----------


def test_get_user_budget_endpoint_default(client):
    r = client.get("/api/user-budget", params={"userId": "unknown", "category": "Anything"})
    assert r.status_code == 200
    body = r.json()
    assert body["monthlyLimit"] == DEFAULT_BUDGET.monthlyLimit
    assert body["categoryLimit"] == DEFAULT_BUDGET.categoryLimit


def test_put_user_budget_then_get_roundtrip(client):
    payload = {
        "monthlyLimit": 4000,
        "categoryLimit": 1200,
        "categorySpent": 300,
        "currency": "TRY",
    }
    r = client.put("/api/user-budget", params={"userId": "u2", "category": "Elektronik"}, json=payload)
    assert r.status_code == 200
    assert r.json()["categoryLimit"] == 1200

    r = client.get("/api/user-budget", params={"userId": "u2", "category": "Elektronik"})
    assert r.status_code == 200
    body = r.json()
    assert body["monthlyLimit"] == 4000
    assert body["categoryLimit"] == 1200
    assert body["categorySpent"] == 300
    assert body["monthlySpent"] == 300  # computed: sum of single category


def test_post_purchase_bumps_spend_and_returns_totals(client):
    # Seed a budget.
    client.put(
        "/api/user-budget",
        params={"userId": "spender", "category": "Giyim"},
        json={"monthlyLimit": 3000, "categoryLimit": 1500, "categorySpent": 200, "currency": "TRY"},
    )

    r = client.post(
        "/api/purchases",
        json={"userId": "spender", "category": "Giyim", "amount": 450, "currency": "TRY"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["categorySpent"] == 650  # 200 + 450
    assert body["monthlySpent"] == 650
    assert body["categoryLimit"] == 1500
    assert body["monthlyLimit"] == 3000


# ---------- Orchestrator auto-load ----------


def test_analyze_loads_budget_from_db_when_body_omits_it(client, db):
    """The red fixture's verdict depends on a tight budget. Strip
    userBudget from the body but populate the DB row first — the verdict
    must remain `red` thanks to the DB-backed lookup."""
    red = copy.deepcopy(EXAMPLES["red"])
    expected_budget = red["userBudget"]

    upsert(
        db,
        user_id=red["userId"],
        category=red["product"]["category"],
        budget=UserBudget(**expected_budget),
    )

    red.pop("userBudget")

    r = client.post("/api/analyze-purchase", json=red)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "red"
    assert body["riskScore"] >= 70


def test_analyze_reports_no_budget_when_no_row_or_body(client):
    """No DB row + no body budget → budget_agent says 'Bütçe Verisi Yok'
    rather than scoring against a fabricated default."""
    red = copy.deepcopy(EXAMPLES["red"])
    red.pop("userBudget")

    r = client.post("/api/analyze-purchase", json=red)
    assert r.status_code == 200
    body = r.json()
    budget_agent = body["agents"]["budgetAgent"]
    assert budget_agent["score"] == 0
    assert budget_agent["label"] == "Bütçe Verisi Yok"


def test_monthly_spent_for_helper(db):
    upsert(
        db,
        user_id="u",
        category="A",
        budget=UserBudget(monthlyLimit=5000, categoryLimit=2000, categorySpent=300),
    )
    upsert(
        db,
        user_id="u",
        category="B",
        budget=UserBudget(monthlyLimit=5000, categoryLimit=2000, categorySpent=400),
    )
    assert monthly_spent_for(db, "u") == 700
    assert monthly_spent_for(db, "no-such") == 0
