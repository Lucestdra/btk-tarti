"""user_budgets — add period_start, drop monthly_spent (derived now)

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-17

Why this shape:

`period_start` is the first day of the calendar month this row's
`category_spent` accumulates against. On every read/write the service
layer compares it to the current month; if older, it zeroes
`category_spent` and bumps `period_start`. This makes the monthly reset
lazy and dependency-free (no cron, no scheduled job).

`monthly_spent` is dropped: it's a sum of `category_spent` across all
rows for a user and was previously denormalized into every row. Now it's
computed on read. Cheaper writes (one row per purchase) at the cost of
one cheap aggregate read.
"""

from __future__ import annotations

from datetime import date
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    today = date.today()
    period_default = date(today.year, today.month, 1).isoformat()

    with op.batch_alter_table("user_budgets") as batch_op:
        batch_op.add_column(
            sa.Column(
                "period_start",
                sa.Date(),
                nullable=False,
                server_default=period_default,
            )
        )
        batch_op.drop_column("monthly_spent")


def downgrade() -> None:
    with op.batch_alter_table("user_budgets") as batch_op:
        batch_op.add_column(
            sa.Column(
                "monthly_spent",
                sa.Float(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.drop_column("period_start")
