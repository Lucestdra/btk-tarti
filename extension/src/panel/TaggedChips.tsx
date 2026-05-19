/**
 * Renders the small per-finding chips that live above the agent grid.
 *
 * Today the only tag is "suspiciousDiscount" (Section 1.4); future tags
 * (e.g. "lowReviewTrust", "outOfPolicy") slot in by adding a row to
 * `TAG_CONFIG` below. Keeps the App.tsx body free of inline JSX walls
 * and gives the redesign in Section 3 a single place to evolve chip
 * presentation without touching the verdict / agents code.
 */

import type { AnalyzeResponse } from "@shared/types/analysis";

type Tone = "warn" | "risk";

interface TagConfig {
  label: string;
  tone: Tone;
  /** Optional aria-label override; falls back to label when omitted. */
  ariaLabel?: string;
}

// Single source of truth for known tags → their visual presentation.
// Order here matters: the chip row renders in this declaration order
// when multiple tags fire (so the most-severe shows first visually).
const TAG_CONFIG: Record<string, TagConfig> = {
  suspiciousDiscount: { label: "Şüpheli İndirim", tone: "warn" },
  lowReviewTrust:     { label: "Düşük Yorum Güveni", tone: "warn" },
  budgetOverflow:     { label: "Bütçe Aşımı", tone: "risk" },
  impulseHigh:        { label: "Yüksek Dürtü", tone: "warn" },
};

interface ChipData {
  tag: string;
  config: TagConfig;
  message: string;
}

function collectChips(agents: AnalyzeResponse["agents"]): ChipData[] {
  const out: ChipData[] = [];
  const seen = new Set<string>();
  for (const agent of Object.values(agents)) {
    for (const f of agent?.findings ?? []) {
      if (!f.tag || seen.has(f.tag)) continue;
      const config = TAG_CONFIG[f.tag];
      if (!config) continue;
      seen.add(f.tag);
      out.push({ tag: f.tag, config, message: f.message });
    }
  }
  return out;
}

export interface TaggedChipsProps {
  agents: AnalyzeResponse["agents"];
}

export function TaggedChips({ agents }: TaggedChipsProps) {
  const chips = collectChips(agents);
  if (chips.length === 0) return null;
  return (
    <div className="kg-chips" role="list">
      {chips.map(({ tag, config, message }) => (
        <span
          key={tag}
          role="listitem"
          tabIndex={0}
          className={`kg-chip kg-chip-${config.tone}`}
          title={message}
          aria-label={`${config.ariaLabel ?? config.label} — ${message}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {config.label.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
