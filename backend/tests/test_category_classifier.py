"""Category classifier — Turkish rules + extractor aliases.

The classifier collapses extractor strings + product titles to a small
fixed taxonomy. These tests cover the three confidence tiers (alias
hit, multi-keyword title, single-keyword fallback) and the
"diğer"/ambiguous escape hatch.
"""

from __future__ import annotations

from app.services.category_classifier import (
    TAXONOMY,
    Classification,
    classify,
    is_known,
)


# ---------- Extractor alias hits (confidence 0.9) ----------


def test_extractor_alias_exact_hit_high_confidence():
    res = classify(extractor_category="Telefon ve Aksesuarları", title="iPhone 15 Pro")
    assert res.category == "elektronik"
    assert res.confidence == 0.9


def test_extractor_alias_case_insensitive():
    res = classify(extractor_category="GIYIM", title="Kazak")
    assert res.category == "giyim"


def test_market_alias_maps_to_gida():
    res = classify(extractor_category="Market", title="Süt 1L")
    assert res.category == "gıda"


# ---------- Title-keyword hits ----------


def test_title_with_multiple_electronics_keywords():
    res = classify(title="Apple AirPods Pro 2 Kulaklık şarj kutusu", extractor_category=None)
    # "kulaklık" + "şarj" — two distinct electronics keywords
    assert res.category == "elektronik"
    assert res.confidence == 0.8


def test_title_single_keyword_hit_lower_confidence():
    res = classify(title="Tişört siyah pamuklu", extractor_category=None)
    assert res.category == "giyim"
    assert res.confidence == 0.7


def test_title_clothing_with_breadcrumb_reinforcement():
    res = classify(
        title="Pantolon kot mavi",
        extractor_category=None,
        breadcrumbs=["Anasayfa", "Kadın", "Pantolon"],
    )
    assert res.category == "giyim"
    assert res.confidence >= 0.7


# ---------- Ambiguous / no-signal paths ----------


def test_no_signal_at_all_returns_diger_zero_confidence():
    res = classify(title="", extractor_category="")
    assert res.category == "diğer"
    assert res.confidence == 0.0


def test_truly_ambiguous_title_routes_to_diger():
    # A title that hits multiple buckets with the same keyword count.
    res = classify(title="kitap mutfak masası rafı")
    # "kitap" (kitap) + "mutfak" (ev) — tied at 1 each → diğer with 0.4.
    assert res.category == "diğer"
    assert 0.3 <= res.confidence <= 0.5


def test_taxonomy_order_tiebreaker_picks_electronics_over_clothing():
    # "telefon kılıfı" — telefon (elektronik) clearly intended; "kılıf"
    # is not in our giyim list so this should land electronics cleanly.
    res = classify(title="telefon kılıfı silikon")
    assert res.category == "elektronik"


# ---------- Helper coverage ----------


def test_is_known_only_accepts_taxonomy_buckets():
    assert is_known("elektronik")
    assert is_known("ELEKTRONIK")  # case-insensitive
    assert is_known("diğer")
    assert not is_known("sweatshirt")
    assert not is_known("")


def test_taxonomy_exposed_as_immutable_tuple():
    assert isinstance(TAXONOMY, tuple)
    assert "diğer" in TAXONOMY
    assert "elektronik" in TAXONOMY


def test_classification_is_dataclass_frozen():
    res = Classification(category="elektronik", confidence=0.9)
    # frozen=True → assignment raises
    try:
        res.category = "giyim"  # type: ignore[misc]
        raised = False
    except Exception:
        raised = True
    assert raised
