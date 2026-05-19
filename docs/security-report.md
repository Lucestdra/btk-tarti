# Security Report — Section 5 Pass

_Date: 2026-05-18 (Thundrly hackathon stabilization sprint)_

This report enumerates the findings from the Section 5 security pass and
records which were fixed in-place vs. tolerated with justification. Scope:
the Chrome extension, the FastAPI backend, and the build artifacts.

---

## 1. Message-passing (extension) — **FIXED**

| Finding | Risk | Action |
|---|---|---|
| `chrome.runtime.onMessage` accepted any sender; a malicious page on an allowed-host domain could fire `{type: "analyze", ...}` with a forged payload. | Medium (bounded by manifest host_permissions but no defense in depth) | Added `isAllowedSender()` validator that checks (a) `sender.id === chrome.runtime.id` and (b) `sender.url` matches the allow-list of TR e-commerce hosts OR the popup's `chrome-extension://` origin OR the demo page. Reject + log when the sender fails the check. |
| `analyze-stream` port had no sender validation. | Same as above | Same validator applied on `chrome.runtime.onConnect`. Disconnect immediately if rejected. |

Files: [extension/src/background.ts](../extension/src/background.ts) (lines 14–63 for validator, applied at the two listeners below).

## 2. Manifest hygiene — **PASS**

`permissions: ["storage"]` only. No `tabs`, `cookies`, `webRequest`, no
`<all_urls>` content-script (the one `<all_urls>` entry is for the demo
page and is properly guarded by `include_globs`). `host_permissions` are
narrowed to the 21 supported TR e-commerce hosts plus the backend. No
`externally_connectable`, so other extensions cannot reach us.

`web_accessible_resources` exposes only `public/demo-product.html` to
`<all_urls>` — the page is static HTML with no exfiltration vector.

## 3. Backend hardening — **PARTIALLY FIXED**

### Fixed

| Item | Detail |
|---|---|
| `Cache-Control: no-store` on `/api/analyze-purchase` | Verdict reflects per-user, per-product state; caching anywhere (proxy/CDN/browser) would mask budget edits and new price observations. Streaming endpoint already had `no-cache`. |
| `slowapi` rate limits on write endpoints | `PUT /api/user-budget` and `PUT /api/user-budget/global` now `30/minute/IP`. `POST /api/cache/purge` capped at `10/minute/IP`. Previously only `/api/price-observation` and `/api/purchases` had limits. |
| Input validation tightening (Section 4) | `Field(min_length=1, max_length=64)` on userId/category query params; `Field(gt=0, lt=10M)` on `UserBudget` numeric fields. Re-checked in this pass — consistent across all endpoints. |
| Payload-bomb DoS hardening | `Product.title` ≤512, `Product.category` ≤128, `Product.url` ≤2048, `Product.imageUrl` ≤2048, `Review.text` ≤2048, `Review.author` ≤128, `Review.date` ≤32. A 100-review payload now caps under ~250 KB. |

### Tolerated (documented)

| Finding | Tool | Why tolerated |
|---|---|---|
| **langgraph 0.2.60** — CVE-2026-28277 (fix in 1.0.10) | pip-audit | Major-version jump. We use a narrow `StateGraph` subset; upgrade requires retesting the full graph layer and probably the LangChain shim. Hackathon-scope risk too high; revisit at next platform-level sweep. |
| **langgraph-checkpoint 2.1.2** — CVE-2025-64439 + CVE-2026-27794 | pip-audit | Transitive of langgraph. Tied to the same upgrade decision. |
| **starlette 0.41.3** — CVE-2025-54121 (SSRF on mounted apps), CVE-2025-62727 (SecureCookies decoding) | pip-audit | Pinned via FastAPI 0.115.5. Force-bump would conflict with FastAPI's version pin. SSRF advisory affects mounted apps that follow user-supplied URLs — we don't. SecureCookies advisory affects code using SecureCookies — we don't (no sessions). Verified not exploitable in our config. |
| **pytest 8.3.3** — CVE-2025-71176 (fix in 9.0.3) | pip-audit | Dev-only dependency; doesn't ship to production. |
| **pip 26.0.1** — CVE-2026-3219, CVE-2026-6357 | pip-audit | Tooling, not runtime. Will pick up on next deploy image rebuild. |
| **rollup / vite / @crxjs/vite-plugin** (extension dev deps) | npm audit | All 7 vulns are in dev dependencies. `npm audit --omit=dev` returns **0**. Force-fix would downgrade @crxjs/vite-plugin from 2.x to 1.0.14 (breaking change) — risk vs. benefit poor for a build-time vuln. |

### Fixed minor

- **python-dotenv 1.0.1 → 1.2.2** — CVE-2026-28684 patched. Safe minor bump; tests green.

## 4. Secret management — **PASS**

Targeted scan over `extension/dist/` for high-confidence key prefixes
(`AIza...`, `sk-...`, `AKIA...`, `ghp_...`, `GEMINI_API_KEY`,
`THUNDRLY_ADMIN_TOKEN`) returned **0 matches**.

Backend secrets are loaded from environment variables at runtime
(`GEMINI_API_KEY`, `THUNDRLY_ADMIN_TOKEN`, `DATABASE_URL`); none are
committed to the repo. The Vite build does not inline any `.env`
variables that aren't `NEXT_PUBLIC_*` / `VITE_*` prefixed, and no such
secret-bearing var is referenced in the source.

`chrome.storage.local` holds `thundrly:installId` (random UUID — not a
credential) and `thundrly:purchases:YYYY-MM-DD` (a daily counter for the
impulse signal). No sensitive data at rest in the extension.

## 5. Shadow-DOM + CORS — **PASS**

The panel mounts inside a Shadow DOM (`attachShadow({ mode: "open" })`),
so host-page scripts cannot read or modify the verdict tree. The Tailwind
styles inject into the shadow root, not the host document.

Backend CORS allows only `localhost:3000` (landing dev), `127.0.0.1:3000`,
and `chrome-extension://*` via the explicit regex
`r"^chrome-extension://.*$"`. No `Access-Control-Allow-Credentials`.
`allow_methods` is scoped to `["GET", "POST", "OPTIONS"]`.

---

## Risk-Level Summary

| Severity | Count | Resolution |
|---|---|---|
| **Critical** | 0 | — |
| **High** | 1 (extension sender validation) | Fixed |
| **Medium** | 5 (rate limits, payload caps, no-store header, dotenv CVE, message-port sender) | All fixed |
| **Low / Tolerated** | 7 (dev-dep CVEs, framework-pinned starlette CVEs not exploitable in our config, langgraph major-bump CVE) | Documented, planned for next sweep |

No known exploitable production-path vulnerabilities remain.

## Follow-Up (next sweep)

1. **Bump FastAPI + Starlette** as a coordinated pair (target FastAPI ≥ 0.118 once the upstream pins move). Re-run pip-audit.
2. **Evaluate langgraph 1.x** — write a parallel `graph.py` against 1.0.10, swap behind a feature flag, run the full backend suite, then cut over.
3. **CI integration** — add `pip-audit --strict` and `npm audit --omit=dev --audit-level=high` as non-blocking warnings on every PR; promote to blocking after one clean cycle.
4. **CSP audit** — Manifest V3 enforces a strict CSP for service workers by default, but the panel renders inside the host page's shadow DOM and inherits the host's CSP for image/font/font-src directives. Worth an explicit pass when we add icons / external fonts.
