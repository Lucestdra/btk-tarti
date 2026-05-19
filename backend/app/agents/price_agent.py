"""
Fiyat Agenti — indirim iddiasının gerçekliğini ölçer.

Sinyaller:
  - Güncel fiyat son 30 günün ortalamasına göre nerede?
  - İndirim öncesi fiyatta sıçrama (raise-then-discount örüntüsü).
  - "Gerçek indirim" oranı (30 günün düşük tarafına göre).
  - Mock rakip aralığı (90 günün ±%15'i) — gerçek senaryoda harici fiyat servisleriyle değişir.

Skor 0–100; yüksek = manipülasyon riski yüksek.

TODO (Gerçek veri): Fiyat geçmişini harici bir kaynak (örn. fiyat takip servisi)
veya kullanıcı taraflı geçmiş veriden topla. Mock'ta payload'da gelen geçmiş kullanılır.
TODO (Gemini): "Gerçek indirim mi?" gerekçesini doğal Türkçe ile LLM özet üretsin.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import median
from typing import List, Optional

from app.models.schemas import AgentFinding, AgentResult, AnalyzeRequest, PriceHistoryPoint

# Threshold above which a claimed original price is flagged as inflated
# relative to the lowest of our agreeing sources. 15% = a clear-cut
# inflation; smaller deltas often reflect honest day-to-day variance.
_SUSPICIOUS_DISCOUNT_RATIO = 1.15

# Two sources are "in agreement" when their values are within this
# percentage of each other. Keeps a single noisy outlier from collapsing
# our confidence ladder.
_SOURCE_AGREEMENT_TOLERANCE = 0.10


def _parse_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _window_prices(history: List[PriceHistoryPoint], days: int, ref: date) -> List[float]:
    out: List[float] = []
    for p in history:
        d = _parse_date(p.date)
        if d and (ref - d).days <= days and d <= ref:
            out.append(p.price)
    return out


def _suspicious_discount_check(
    *,
    displayed_price: float,
    claimed_original: Optional[float],
    sources: dict[str, float],
) -> Optional[AgentFinding]:
    """Multi-source cross-check on the merchant's claimed discount.

    ``sources`` maps a human-friendly source name (used in the message)
    to that source's lowest-price reading over the recent window. The
    canonical set today is ``{"yasal min", "kendi geçmişimiz", "Akakçe"}``
    — but the function works for any subset; the caller passes only the
    ones it actually has.

    Logic:
      * real_base = min of all source readings
      * if claimed_original > real_base * 1.15 → flag
      * confidence climbs with the number of sources that **agree**
        (within ±10% of each other), so a single noisy outlier doesn't
        artificially inflate the severity
    """
    if not claimed_original or claimed_original <= displayed_price:
        return None
    if not sources:
        return None

    values = list(sources.values())
    real_base = min(values)
    if claimed_original <= real_base * _SUSPICIOUS_DISCOUNT_RATIO:
        return None  # claim is in the believable band

    # Count how many sources cluster near the lowest reading — these are
    # the ones reinforcing the "the real base is much lower" verdict.
    agreeing_names = [
        name
        for name, val in sources.items()
        if val <= real_base * (1 + _SOURCE_AGREEMENT_TOLERANCE)
    ]
    agree_count = max(1, len(agreeing_names))

    if agree_count >= 3:
        severity = "risk"
    elif agree_count == 2:
        severity = "risk"
    else:
        severity = "warn"

    inflated_pct = int(round((claimed_original / real_base - 1) * 100))
    source_breakdown = ", ".join(f"{name} ₺{val:.0f}" for name, val in sources.items())
    message = (
        f"ŞÜPHELİ İNDİRİM: gösterilen orijinal fiyat ₺{claimed_original:.0f}, "
        f"gerçek taban ~₺{real_base:.0f} (%{inflated_pct} şişirilmiş). "
        f"Kaynaklar: {source_breakdown}."
    )
    return AgentFinding(severity=severity, message=message, tag="suspiciousDiscount")


def run(req: AnalyzeRequest) -> AgentResult:
    price = req.product.price
    original = req.product.originalPrice
    legal_min = req.product.legalLowestPrice30d
    findings: List[AgentFinding] = []

    # Referans tarih: geçmişteki en son nokta veya bugün.
    if req.priceHistory:
        parsed = [_parse_date(p.date) for p in req.priceHistory]
        ref = max([d for d in parsed if d is not None], default=date.today())
    else:
        ref = date.today()

    window_30 = _window_prices(req.priceHistory, 30, ref)
    window_90 = _window_prices(req.priceHistory, 90, ref)

    score = 0.0

    if not window_30:
        # No price-history series for this URL. We may still have the
        # on-page legal disclosure, which is a single but reliable
        # cross-check source.
        if legal_min is not None and original is not None:
            sus = _suspicious_discount_check(
                displayed_price=price,
                claimed_original=original,
                sources={"yasal min": legal_min},
            )
            if sus is not None:
                findings.append(sus)
                # We have at least one strong signal — let it land at a
                # meaningful manipulation score so the verdict reflects it.
                return AgentResult(score=55, label="Şüpheli İndirim", findings=findings)

        # Be honest about no-history. Returning score=45 with a generic
        # "Kısmi Manipülasyon" label (score 25-54) reads as a soft accusation
        # when the truth is we just don't have data. Return a neutral 0 so
        # this dimension contributes nothing to the weighted decision.
        #
        # Two flavors of "no data":
        #  - Brand-new product, nothing on Akakçe either → "Fiyat Geçmişi Yok"
        #  - We DO know the displayed price but have no comparison points →
        #    "Tek Veri Noktası" (less alarming, more accurate framing)
        if price > 0:
            findings.append(
                AgentFinding(
                    severity="info",
                    message=(
                        f"Bu ürün için bağımsız fiyat geçmişi yok; gösterilen "
                        f"₺{price:.0f} tek referans noktası."
                    ),
                )
            )
            return AgentResult(score=0, label="Tek Veri Noktası", findings=findings)
        findings.append(
            AgentFinding(severity="warn", message="Bu ürün için fiyat geçmişi bulunamadı; indirim doğrulanamadı.")
        )
        return AgentResult(score=0, label="Fiyat Geçmişi Yok", findings=findings)
    else:
        # Median (not mean) — resists poisoning from crowdsourced observations.
        avg_30 = median(window_30)
        avg_90 = median(window_90) if window_90 else avg_30
        min_30 = min(window_30)

        # Sinyal 1: indirim öncesi yükseliş
        recent_max = max(window_30)
        if recent_max > avg_30 * 1.15 and price < recent_max:
            jump = (recent_max - avg_30) / avg_30
            score += min(40, jump * 100)
            findings.append(
                AgentFinding(
                    severity="risk",
                    message=(
                        f"Fiyat son 30 gün ortalaması ₺{avg_30:.0f}'iken "
                        f"indirim öncesi ₺{recent_max:.0f}'a çıkarılmış."
                    ),
                )
            )

        # Sinyal 2: gerçek indirim oranı (30 günün düşük tarafına göre)
        if original and original > price:
            claimed = (original - price) / original
            real_base = min(avg_30, original)
            real = max(0.0, (real_base - price) / real_base) if real_base else 0.0
            if real < claimed * 0.5:
                score += 25
                findings.append(
                    AgentFinding(
                        severity="warn",
                        message=(
                            f"Etikette %{int(claimed * 100)} indirim görünüyor; gerçek 30 günlük "
                            f"ortalamaya göre yaklaşık %{int(real * 100)}."
                        ),
                    )
                )

        # Sinyal 3: güncel fiyat 30 günün üst tarafında mı?
        if price > avg_30:
            score += 15
            findings.append(
                AgentFinding(
                    severity="warn",
                    message=f"Güncel fiyat ₺{price:.0f}, son 30 günlük ortalamanın (₺{avg_30:.0f}) üzerinde.",
                )
            )
        elif price <= min_30:
            findings.append(
                AgentFinding(
                    severity="info",
                    message=f"₺{price:.0f} son 30 günün en düşük fiyatına eşit veya altında.",
                )
            )

        # Sinyal 4: rakip aralığı (mock — 90g ±%15)
        if window_90:
            low = avg_90 * 0.85
            high = avg_90 * 1.15
            if price > high:
                score += 10

        # Sinyal 5 — MULTI-SOURCE suspicious discount cross-check.
        # Combines the on-page "yasal 30 günün en düşük fiyatı" disclosure
        # (when scraped by the extension) with our own DB / Akakçe-sourced
        # history. Confidence rises with agreement: two sources confirming
        # an inflated "originalPrice" is a strong manipulation signal.
        if original and original > price:
            cross_sources: dict[str, float] = {}
            if legal_min is not None and legal_min > 0:
                cross_sources["yasal min"] = legal_min
            cross_sources["30 gün medyanı"] = min_30
            sus = _suspicious_discount_check(
                displayed_price=price,
                claimed_original=original,
                sources=cross_sources,
            )
            if sus is not None:
                findings.append(sus)
                # Severity-tier the score bump: two-source agreement is a
                # strong signal worth a substantial bump.
                score += 30 if sus.severity == "risk" else 15

    score = max(0, min(100, int(round(score))))

    if score < 25:
        label = "Gerçek İndirim"
    elif score < 55:
        label = "Kısmi Manipülasyon"
    elif score < 75:
        label = "Şüpheli İndirim"
    else:
        label = "Manipülasyon Riski"

    if not findings and score < 25:
        findings.append(AgentFinding(severity="info", message="İndirim oranı geçmişle tutarlı."))

    return AgentResult(score=score, label=label, findings=findings)
