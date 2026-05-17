"""ORM models.

`PriceObservation` is append-only: every product-page view from any
extension install creates a row. The `price_agent` reads the recent window
(via `services.price_history.get_recent`) and computes medians; we never
mutate rows after insert so reproducing any historical decision is just a
matter of replaying the table at that timestamp.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, Index, Integer, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _month_start() -> date:
    today = date.today()
    return date(today.year, today.month, 1)


class PriceObservation(Base):
    __tablename__ = "price_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Canonical (normalized) URL — same product across sessions hashes to the same value.
    url: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    # Raw URL preserved for debugging; never used for lookups.
    raw_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="TRY")
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    __table_args__ = (
        # Composite index for the price_agent's hot path: "history for url over last N days".
        Index("ix_obs_url_observed_at", "url", "observed_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug only
        return (
            f"<PriceObservation id={self.id} url={self.url!r} "
            f"price={self.price} platform={self.platform} at={self.observed_at.isoformat()}>"
        )


class UserBudgetRow(Base):
    """Per-user, per-category spend limits.

    `monthly_limit` is denormalized across a user's category rows (every
    row carries the same value) — the analysis path looks up by
    (user_id, category) and needs both limits in one read.

    `category_spent` is the running tally for the current period only;
    it auto-resets when the service-layer reads see `period_start` <
    first-day-of-current-month and zero it before responding.

    A user's monthly spent is computed on read as the SUM of
    `category_spent` across their rows — no denormalized column.
    """

    __tablename__ = "user_budgets"

    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    monthly_limit: Mapped[float] = mapped_column(Float, nullable=False)
    category_limit: Mapped[float] = mapped_column(Float, nullable=False)
    category_spent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    period_start: Mapped[date] = mapped_column(Date, nullable=False, default=_month_start)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="TRY")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "category", name="pk_user_budgets"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<UserBudgetRow user={self.user_id!r} cat={self.category!r} "
            f"limit={self.category_limit} spent={self.category_spent} "
            f"period={self.period_start.isoformat()}>"
        )
