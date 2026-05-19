/**
 * Renders the Section 6 causal-rule explanations.
 *
 * The decision agent's rule engine evaluates AND/OR combinations of
 * tagged findings (e.g. ``suspiciousDiscount + lowReviewTrust``) on
 * top of the weighted-sum baseline. When a rule fires, the response's
 * ``triggeredRules`` list carries a human-readable Turkish explanation.
 *
 * This component surfaces them under the reasons so the user can see
 * *which combinations* drove the verdict — not just the bare risk
 * score.
 */

import type { AnalyzeResponse } from "@shared/types/analysis";

export interface TriggeredRulesListProps {
  rules: AnalyzeResponse["triggeredRules"];
}

export function TriggeredRulesList({ rules }: TriggeredRulesListProps) {
  if (!rules || rules.length === 0) return null;
  return (
    <details className="kg-rules" open>
      <summary className="kg-rules-summary">
        Tetiklenen kurallar
        <span className="kg-rules-count">{rules.length}</span>
      </summary>
      <ul className="kg-rules-list">
        {rules.map((r) => (
          <li key={r.name} className={`kg-rule kg-rule-${r.severity}`}>
            <span className="kg-rule-dot" aria-hidden="true" />
            <span className="kg-rule-text">{r.explanation}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
