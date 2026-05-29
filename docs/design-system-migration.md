# Design System Migration — Tracking Doc

Source plan: `redesign-files/REDESIGN.MD` (Issues 1–13) + adversarial-reviewed implementation plan at `~/.claude/plans/merry-swimming-gizmo.md`.

Branch: `feat/ds-full-migration` (off `staging` @ `5c42ac78`).

## Strategy

Single mega-PR with 8 internal commits, sequenced by layer. No bridge tokens, no backward-compat shims. Every commit updates source AND every consumer in the same diff. Build green after every commit; app visually complete only after Commit 8.

| Commit | Scope |
|---|---|
| 1 | Foundation: tokens.css, fonts, Tailwind config, `src/index.css` surgical rewrite, glass aliases, font-face deletes |
| 2 | Theme mechanism: `.dark` class → `data-theme` attribute (7 sites + boot script) |
| 3 | `accentColors.ts` → `brandColor.ts` (pure validator) + AudioRecordingUI fix |
| 4 | Primitives: Button, Input, Label, Pill, Chip, Bar, Alert, Avatar, Dialog, Switch + delete legacy + sweep ~120 callers |
| 5 | Layout: LeftRail (240px text rail), FocusDrawer, SplitDetail, PageHeader, BrandMark + delete 8 legacy components |
| 6 | Chat: AISummary, StagedAction, Observation, Composer, ToolUseLine, Citations + delete ChatDockedAction, AIThinkingIndicator |
| 7 | Data display: StatStrip, JourneyProgress, LetterPaper, MatterChip, Seg + delete StatCard, NextStepsCard, ActivityTimeline×2 |
| 8 | Feature sweep (269 unique files) + DataTable audit + final zero-violation verification |

## Accepted Compromises

These deviate from REDESIGN.md but are grounded in actual code reads:

1. **`prefers-color-scheme` retained.** REDESIGN.md L870 says remove it. `useTheme.ts`, `GeneralPage.tsx`, and `SidebarProfileMenu.tsx` all expose a "System" theme choice; removing the mechanism breaks the UI.
2. **`localStorage.theme` keeps `'dark'/'light'/'system'` strings.** Apply layer maps `'dark'` → `dataset.theme = 'midnight'`. Backward-compatible with existing user state.
3. **Dark-mode toggle UI preserved** per REDESIGN.md L567 (DS spec said no toggle, but product UX requires it during migration).
4. **Per-practice brand-color picker UI preserved in settings.** Just no longer applies CSS at runtime. API contract unchanged. Product decision to flag before merge.
5. **Sidebar collapse toggle dropped** below DS LeftRail's 240px fixed width. Below `lg:` breakpoint, mobile bottom bar takes over.
6. **Manual smoke only for IOLTA staged-action gate.** User-approved tradeoff for speed. Backend already enforces idempotency (HTTP 409) + audit + role gate, so frontend safety bar is acceptable without E2E.

## Baseline Violation Counts (captured pre-migration)

Captured against `staging @ 5c42ac78` on `feat/ds-full-migration` start.

| Pattern | Count | Files |
|---|---|---|
| `\.dark\b` + `classList.*dark` | 20 | 7 |
| `--surface-*` / `--border-subtle` / `--nav-surface` / `shadow-glass` / `glass-card/panel/input` | 167 | 36 |
| `bg-accent-[0-9]` / `text-accent-[0-9]` / `border-accent-[0-9]` / `ring-accent-[0-9]` | 203 | 98 |
| `rounded-xl` / `rounded-2xl` / `bg-amber` / `text-amber` / `bg-yellow` / `text-yellow` / `text-red-[0-9]` / `bg-red-[0-9]` (TSX only) | 448 | 182 |
| `font-display` / `\bInter\b` / `\bOutfit\b` | 21 | 4 |
| `accentColors` / `applyAccentColor` / `initializeAccentColor` | 21 | 11 |

These targets must all reach **0** by Commit 8.

## Verification Status

| Commit | Build | Lint | Type-check | Status |
|---|---|---|---|---|
| 1 | — | — | — | pending |
| 2 | — | — | — | pending |
| 3 | — | — | — | pending |
| 4 | — | — | — | pending |
| 5 | — | — | — | pending |
| 6 | — | — | — | pending |
| 7 | — | — | — | pending |
| 8 | — | — | — | pending |
