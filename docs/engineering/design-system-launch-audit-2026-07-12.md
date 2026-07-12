# Design-system launch audit — 2026-07-12

Tracks [#710](https://github.com/Blawby/blawby-ai-chatbot/issues/710) and the production launch gate [#716](https://github.com/Blawby/blawby-ai-chatbot/issues/716).

## Outcome

Launch audit score: **92 / 100**.

| Area | Score | Evidence |
|---|---:|---|
| Theme and contrast | 25 / 25 | Axe reports zero violations on `/debug/styles` in light, dark, midnight, and parchment after the page settles. |
| Responsive behavior | 23 / 25 | Public and owner routes verified at mobile, tablet, and desktop; the staging Tasks contract remains unavailable. |
| Accessibility | 23 / 25 | Axe reports zero violations on owner home and Settings > Appearance; shared toast, combobox, avatar, empty-state, and heading defects fixed. |
| Token discipline | 12 / 15 | Raw white/black/gray/slate/zinc/neutral Tailwind hits reduced to zero. Residual inline-style, transition, and specialized typography classification is tracked in #725. |
| Regression coverage | 9 / 10 | Component regressions and 18 reviewed visual baselines added. Client-auth screenshots remain outside this run because the configured client fixture is intentionally skipped. |

## Route matrix

| Surface | Themes | Viewports | Result |
|---|---|---|---|
| `/auth` | light, dark | mobile, desktop | Readable and responsive in live review. |
| `/public/paul-yahoo?v=widget` | configured public theme | mobile, tablet, desktop | Reviewed baseline; no 404/overflow. |
| `/public/paul-yahoo` | configured public theme | mobile, tablet, desktop | Reviewed viewport baseline; fixed-height DirectShell intentionally avoids full-page stitching. |
| `/public/paul-yahoo/intake/family-law` | configured public theme | mobile, tablet, desktop | Reviewed viewport baseline. |
| `/public/paul-yahoo/welcome` | configured public theme | mobile, tablet, desktop | Route slug forwarding fixed; reviewed baseline. |
| `/practice/chris-luke-1` | light, dark | mobile, tablet, desktop | Working-surface typography and flat briefing surfaces fixed; Axe clean. |
| `/practice/chris-luke-1/matters` | light | mobile, tablet, desktop | Heading and empty-state system aligned; no horizontal overflow. |
| `/practice/chris-luke-1/settings/general` | light, dark | mobile, tablet, desktop | Shared settings rows reflow at phone width; Axe clean. |
| `/practice/chris-luke-1/tasks` | light | mobile | Frontend renders, but staging returns `API endpoint not found`; backend #363 owns the source-of-truth fix. |
| `/debug/styles` | light, dark, midnight, parchment | desktop | Route repaired; all shared variants reviewed and Axe clean. |

## Shared fixes

- Made semantic status/accent tokens meet WCAG AA across all supported themes.
- Removed raw neutral Tailwind colors from production TypeScript/TSX.
- Replaced the sidebar pseudo-element stripe with the canonical inset active state.
- Gave toast dismiss controls a name, explicit button type, and 44×44 target.
- Made Combobox visible labels and explicit ARIA labels name their triggers.
- Made settings rows stack on phones and corrected settings heading hierarchy.
- Replaced product-shell serif/gold briefing and common page headings with the sans-serif working hierarchy.
- Flattened briefing and workspace empty-state surfaces; removed decorative gradient/glow/blur treatment.
- Repaired the lazy `/debug/styles` route and the dynamic `/public/:practiceSlug/welcome` route.
- Made screenshot tests reject App404, auth redirects, loading frames, and staging request bursts before accepting a baseline.

## Inventory after shared cleanup

| Scan | Remaining | Disposition |
|---|---:|---|
| Raw neutral Tailwind color hits | 0 | Complete. |
| Files containing inline styles | 54 | Classify dynamic geometry, SVG, print, and preview exceptions in #725. |
| `transition-all` hits | 42 across 34 files | Replace with exact transitioned properties in #725. |
| Files referencing serif tokens | 51 | Mixed product/public/legal-document usage; remove product-shell residuals and document intentional exceptions in #725. |

## Follow-ups and gates

- [Frontend #725](https://github.com/Blawby/blawby-ai-chatbot/issues/725): residual specialized typography, inline-style classification, and precise transitions.
- [Backend #363](https://github.com/Blawby/blawby-backend/issues/363): authenticated practice-wide Tasks endpoint. Backend PR requires human review/merge and does not block frontend staging delivery; production requires live integration after deployment.

## Verification

- `npm run lint`
- `npm run type-check`
- `npm run test:component`
- `npm run test:e2e:responsive`
- `npm run test:e2e:responsive:auth`
- `npm run test:e2e:screenshots`
- Axe 4.11: zero violations on the four-theme style reference, owner home, and owner settings.
- Live browser review through `https://dev.blawby.com` against the staging backend.
