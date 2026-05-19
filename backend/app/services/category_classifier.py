"""Turkish-aware product-category normalizer.

Why: the extension extracts whatever the breadcrumb / og:type / JSON-LD
exposes — values like ``"Elektronik"``, ``"Telefon ve Aksesuarları"``,
``"Sweatshirt"`` or even empty strings. Per-category budget lookups
((user_id, category) row in ``user_budgets``) are exact (case-insensitive)
matches, so any drift between the user's configured label ("Elektronik")
and the extractor's label ("Telefon Aksesuarları") silently drops the
budget and the agent reports "Bütçe Verisi Yok".

This module collapses the universe of extractor strings + product titles
down to a small fixed taxonomy. The output is consumed by the
orchestrator: if confidence is high enough, the normalized category is
used for the budget lookup; otherwise we fall back to the user's global
monthly budget (the safer default).

No LLM call. Pure regex rules keep classification on the hot path; the
trade-off is occasional misses for genuinely ambiguous titles ("kablo"
could be electronics or auto), which we accept because the global-budget
fallback catches those cases.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence

# Fixed Turkish taxonomy. Add a new bucket here AND add keywords below.
# The "diğer" bucket is the explicit "we don't know" sink; treat it as
# low-confidence by definition.
TAXONOMY = (
    "elektronik",
    "giyim",
    "ev",
    "kitap",
    "gıda",
    "kozmetik",
    "spor",
    "oyuncak",
    "otomotiv",
    "diğer",
)


@dataclass(frozen=True)
class Classification:
    category: str
    confidence: float  # 0.0 – 1.0


# Keyword groups. Each tuple is a Turkish lowercase fragment matched as a
# substring against title + breadcrumb + extractor category. Order matters:
# rules higher up the list win on ambiguous overlap (e.g. "telefon kılıfı"
# scores Elektronik over Giyim despite "kılıf" sounding garment-y).
_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "elektronik",
        (
            "telefon", "akıllı saat", "kulaklık", "kulaklik", "laptop", "notebook",
            "bilgisayar", "tablet", "kamera", "tv ", "televizyon", "monitör", "monitor",
            "konsol", "playstation", "xbox", "şarj", "sarj", "powerbank", "hoparlör",
            "hoparlor", "ses sistemi", "klavye", "fare", "mouse", "router", "modem",
            "ssd", "hdd", "ram", "ekran kartı", "elektrikli", "elektronik",
        ),
    ),
    (
        "giyim",
        (
            "tişört", "tisort", "t-shirt", "gömlek", "gomlek", "pantolon", "jean",
            "etek", "elbise", "şort", "sort", "mont", "kaban", "ceket", "sweatshirt",
            "hırka", "hirka", "kazak", "ayakkabı", "ayakkabi", "bot", "sneaker",
            "terlik", "sandalet", "çanta", "canta", "cüzdan", "cuzdan", "kemer",
            "şapka", "sapka", "atkı", "atki", "eldiven", "iç giyim", "ic giyim",
            "çamaşır", "camasir", "giyim",
        ),
    ),
    (
        "ev",
        (
            "mobilya", "koltuk", "kanepe", "yatak", "yorgan", "nevresim", "yastık",
            "yastik", "perde", "halı", "hali", "kilim", "lamba", "avize", "mutfak",
            "tencere", "tava", "bardak", "tabak", "fincan", "havlu", "banyo",
            "deterjan", "temizlik", "ev tekstili",
        ),
    ),
    (
        "kitap",
        (
            "kitap", "roman", "öykü", "oyku", "şiir", "siir", "ders kitabı",
            "ders kitabi", "kırtasiye", "kirtasiye", "defter", "kalem",
        ),
    ),
    (
        "gıda",
        (
            "gıda", "gida", "yiyecek", "içecek", "icecek", "süt", "sut", "yoğurt",
            "yogurt", "peynir", "et ", "tavuk", "balık", "balik", "meyve", "sebze",
            "çay", "cay", "kahve", "şeker", "seker", "tuz", "un ", "yağ", "yag",
            "ekmek", "makarna", "pirinç", "pirinc", "atıştırmalık", "atistirmalik",
            "çikolata", "cikolata", "bisküvi", "biskuvi",
        ),
    ),
    (
        "kozmetik",
        (
            "kozmetik", "makyaj", "ruj", "rimel", "fondöten", "fondoten",
            "parfüm", "parfum", "deodorant", "şampuan", "sampuan", "saç bakım",
            "sac bakim", "yüz bakım", "yuz bakim", "krem", "losyon", "maske",
            "oje", "bakım", "bakim",
        ),
    ),
    (
        "spor",
        (
            "spor", "fitness", "dambıl", "dambil", "yoga", "kondisyon", "bisiklet",
            "koşu", "kosu", "futbol", "basketbol", "voleybol", "tenis ", "kayak",
            "outdoor", "kamp", "çadır", "cadir", "uyku tulumu",
        ),
    ),
    (
        "oyuncak",
        (
            "oyuncak", "lego", "puzzle", "yapboz", "bebek arabası", "bebek arabasi",
            "biberon", "emzik", "çıngırak", "cingirak", "peluş", "pelus",
        ),
    ),
    (
        "otomotiv",
        (
            "otomotiv", "araç", "arac", "araba", "lastik", "jant", "motor yağı",
            "motor yagi", "akü", "aku", "silecek", "yakıt", "yakit",
        ),
    ),
)

# Aliases from extractor / breadcrumb strings → taxonomy. Lower-cased.
# If the extractor handed us one of these tokens verbatim, take it as a
# strong signal — confidence 0.9 — without even consulting the keyword
# pass. We're trusting the platform's own categorization.
_EXTRACTOR_ALIASES: dict[str, str] = {
    "elektronik": "elektronik",
    "elektronik ürünler": "elektronik",
    "elektronik urunler": "elektronik",
    "bilgisayar": "elektronik",
    "telefon": "elektronik",
    "telefon ve aksesuarları": "elektronik",
    "telefon ve aksesuarlari": "elektronik",
    "tv, ses ve görüntü": "elektronik",
    "giyim": "giyim",
    "kadın giyim": "giyim",
    "kadin giyim": "giyim",
    "erkek giyim": "giyim",
    "çocuk giyim": "giyim",
    "cocuk giyim": "giyim",
    "ayakkabı": "giyim",
    "ayakkabi": "giyim",
    "çanta": "giyim",
    "canta": "giyim",
    "aksesuar": "giyim",
    "ev": "ev",
    "ev & yaşam": "ev",
    "ev & yasam": "ev",
    "ev tekstili": "ev",
    "mobilya": "ev",
    "mutfak": "ev",
    "kitap": "kitap",
    "kitap, müzik, film": "kitap",
    "kırtasiye": "kitap",
    "kirtasiye": "kitap",
    "gıda": "gıda",
    "gida": "gıda",
    "market": "gıda",
    "süpermarket": "gıda",
    "supermarket": "gıda",
    "kozmetik": "kozmetik",
    "kişisel bakım": "kozmetik",
    "kisisel bakim": "kozmetik",
    "parfüm": "kozmetik",
    "parfum": "kozmetik",
    "spor": "spor",
    "spor & outdoor": "spor",
    "fitness": "spor",
    "outdoor": "spor",
    "oyuncak": "oyuncak",
    "bebek": "oyuncak",
    "çocuk": "oyuncak",
    "cocuk": "oyuncak",
    "otomotiv": "otomotiv",
    "araç & motosiklet": "otomotiv",
    "arac & motosiklet": "otomotiv",
}


def _normalize_text(text: str) -> str:
    """Lowercase + collapse whitespace, keep Turkish characters intact."""
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def classify(
    *,
    title: Optional[str] = None,
    extractor_category: Optional[str] = None,
    breadcrumbs: Optional[Sequence[str]] = None,
) -> Classification:
    """Normalize a product to one of ``TAXONOMY``.

    Confidence tiers:
        * **0.9** — extractor's category matched an alias exactly
        * **0.8** — keyword hit in title (≥2 distinct keywords from one bucket)
        * **0.7** — single keyword hit in title or breadcrumb
        * **0.4** — title hits multiple buckets equally (ambiguous)
        * **0.0** — no signal, fell through to "diğer"

    Callers should only apply the per-category budget when confidence
    ≥ 0.7; otherwise route to the global budget envelope.
    """
    # 1) Extractor handed us a known label verbatim.
    ext = _normalize_text(extractor_category or "")
    if ext and ext in _EXTRACTOR_ALIASES:
        return Classification(category=_EXTRACTOR_ALIASES[ext], confidence=0.9)

    # 2) Keyword pass over title + breadcrumbs + extractor string.
    haystacks: list[str] = []
    if title:
        haystacks.append(_normalize_text(title))
    if breadcrumbs:
        haystacks.extend(_normalize_text(b) for b in breadcrumbs if b)
    if extractor_category:
        haystacks.append(ext)

    blob = " | ".join(haystacks)
    if not blob:
        return Classification(category="diğer", confidence=0.0)

    hits: dict[str, set[str]] = {}
    for cat, keywords in _KEYWORDS:
        matched: set[str] = set()
        for kw in keywords:
            if kw in blob:
                matched.add(kw)
        if matched:
            hits[cat] = matched

    if not hits:
        return Classification(category="diğer", confidence=0.0)

    # Rank by (distinct-keyword count, taxonomy order). Distinct count
    # captures "many giyim words = giyim". Taxonomy order is the stable
    # tiebreaker so e.g. "telefon kılıfı" picks elektronik (listed first).
    taxonomy_order = {c: i for i, (c, _) in enumerate(_KEYWORDS)}
    best = max(hits.items(), key=lambda kv: (len(kv[1]), -taxonomy_order[kv[0]]))
    top_count = len(best[1])
    # Tied-top: at least one other category matched the same number of
    # distinct keywords. Surface as ambiguous so the orchestrator routes
    # to the global envelope.
    tied = [c for c, m in hits.items() if len(m) == top_count]
    if len(tied) > 1:
        return Classification(category="diğer", confidence=0.4)

    if top_count >= 2:
        return Classification(category=best[0], confidence=0.8)
    return Classification(category=best[0], confidence=0.7)


def is_known(category: str) -> bool:
    """True when the input is already a taxonomy bucket (case-insensitive)."""
    return _normalize_text(category) in TAXONOMY
