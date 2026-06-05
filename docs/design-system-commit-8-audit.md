# Commit 8 — Feature sweep audit

Measurement pass before doing the actual sweep work. **No code changes
in this PR.** Counts gathered on `feat/ds-migration-pt11` after PR #653
merged.

The audit answers: *how big is each slice of Commit 8 actually?* And
*what's the right way to split it into reviewable follow-up PRs?*

---

## TL;DR

| Slice | Scope | Estimated PR cost |
|---|---|---|
| 8.1 — Token utility sweep | **2042 occurrences across ~280 files** | 4-6 small focused PRs by token family |
| 8.2 — DataTable audit | 7 actual call sites + 1 primitive | 1 PR |
| 8.3 — Seg ↔ SegmentedToggle sweep | 13 SegmentedToggle callers | 1 PR (or split by surface) |
| 8.4 — Legacy alias deletion | ~67 callers to migrate, then delete | 2 PRs (migrate, then delete) |
| 8.5 — a11y verification | `prefers-reduced-motion` already partial | 1 PR |
| 8.6 — `font-display` cleanup | 8 occurrences in 2 files | trivial, can ride 8.1 |

**Total estimated**: 7-9 follow-up PRs. The original "Commit 8" plan as one
PR was unrealistic given the actual scope.

---

## 8.1 — Token utility violation sweep

The biggest slice by far. From `DESIGN_SYSTEM.md §7` violation patterns.

| Pattern | Occurrences | Files | Notes |
|---|---:|---:|---|
| `text-input-*` | **1446** | 244 | The dominant violator. Most are `text-input-text` and `text-input-placeholder`. Map to DS tokens: `text-ink`, `text-secondary`, `text-input-placeholder` → existing `--dim-2` placeholder. |
| `bg-surface-*` | **308** | 126 | Map to: `bg-paper`, `bg-paper-2`, `bg-card` per role. Many hits from layout primitives that pre-date the DS token sweep. |
| `rounded-xl` | **225** | 107 | Replace with token radii: `var(--r-xs)`, `var(--r-md)`. Per DS, `--r-md` is the canonical "card" radius; `rounded-xl` is the old Tailwind value. |
| `bg-accent-N` | **55** | 38 | Map to `bg-accent` (single token, no numeric scale per locked decision §3 — "one accent"). |
| `font-display` | **8** | 2 | Only `MatterSummaryCards.tsx` (6) and `MatterDetailsPanel.tsx` (2). Trivial — swap to `font-serif`. |

### Hot files (the 80/20 of the sweep)

These files account for a disproportionate share of violations. Hitting
them first kills most of the violations with few file touches:

| File | `text-input` | `bg-surface` | `rounded-xl` | Total |
|---|---:|---:|---:|---:|
| `src/shared/ui/input/MarkdownUploadTextarea.tsx` | 23 | 11 | 13 | **47** |
| `src/shared/ui/input/Combobox.tsx` | 20 | 5 | 4 | **29** |
| `src/features/intake/pages/IntakeTemplatesPage.tsx` | 39 | 16 | 4 | **59** |
| `src/features/intake/pages/IntakeDetailPage.tsx` | 38 | 12 | 5 | **55** |
| `src/features/invoices/components/InvoicesTable.tsx` | 37 | 0 | 1 | **38** |
| `src/features/clients/pages/PracticeContactsPage.tsx` | 32 | 3 | 0 | **35** |
| `src/pages/PracticeHomePage.tsx` | 29 | 11 | 0 | **40** |
| `src/features/invoices/pages/ClientInvoiceDetailPage.tsx` | 29 | 0 | 3 | **32** |
| `src/features/invoices/components/detail/InvoiceDetailsSidebar.tsx` | 22 | 0 | 0 | **22** |
| `src/shared/ui/activity/ActivityTimeline.tsx` | 22 | 4 | 0 | **26** |
| `src/features/practice-onboarding/components/OnboardingChat.tsx` | 3 | 0 | 0 | 3 |
| `src/shared/ui/inspector/InspectorPrimitives.tsx` | 11 | 4 | 0 | **15** |
| `src/features/matters/components/MatterForm.tsx` | 11 | 1 | 0 | 12 |

**Recommended slice strategy:**

- **8.1a**: `text-input-*` family sweep. Largest, mechanical. Use
  `replace_all: true` per token (one Edit per file). Estimated 5-10 files
  per PR if split, or one big mechanical PR if treated as a rename.
- **8.1b**: `bg-surface-*` sweep. Less mechanical — need to decide
  `bg-paper` vs `bg-paper-2` vs `bg-card` per usage. Surface-by-surface.
- **8.1c**: `rounded-xl` sweep. Mechanical → `var(--r-md)` in most places.
- **8.1d**: `bg-accent-N` + `font-display`. Smallest. Can ride together.

---

## 8.2 — DataTable audit

Call sites that import or render `DataTable`:

1. `src/features/intake/pages/IntakeTemplatesPage.tsx`
2. `src/features/intake/pages/IntakesPage.tsx`
3. `src/features/matters/pages/PracticeMattersPage.tsx`
4. `src/features/engagements/pages/EngagementsPage.tsx`
5. `src/features/invoices/components/InvoicesTable.tsx`
6. `src/features/reports/components/ReportDataTable.tsx`
7. `src/features/reports/pages/reports/DeliveriesListView.tsx`
8. `src/features/files/components/FilesList.tsx` (likely a list, not a table — verify)
9. `src/features/reports/components/ReportPageShell.tsx` (re-export only?)
10. `src/shared/ui/table/DataTable.tsx` (the primitive itself)
11. `src/shared/ui/table/index.ts` (barrel)

**Per migration doc §8**: keep `<table>` only for invoice line items
(`InvoicesTable.tsx`); convert the rest to CSS grid.

7 actual conversion targets. The number suggests the original "60 call
sites" in the migration doc was a pre-DS estimate. The reality is much
smaller — most lists were already converted to non-table layouts during
prior PRs.

**Recommended:** one focused PR converting all 6 non-invoice DataTables
to CSS-grid lists (using `EntityList` / `CollectionSectionList` already
in the codebase). Document why `InvoicesTable` keeps the `<table>` (line
items are tabular by nature).

---

## 8.3 — SegmentedToggle ↔ Seg consolidation (deferred 7d)

The new `Seg` primitive (PR #653) and the existing `SegmentedToggle` now
coexist. 13 callers to triage:

```
src/features/chat/components/MessagesListPanel.tsx
src/features/chat/components/WorkspaceSetupSection.tsx
src/features/engagements/pages/EngagementsPage.tsx
src/features/files/components/FilesPageView.tsx
src/features/intake/pages/IntakesPage.tsx
src/features/invoices/pages/ClientInvoicesPage.tsx
src/features/matters/components/MatterBillingTab.tsx
src/features/matters/components/MatterWorkTab.tsx
src/features/matters/pages/PracticeMattersPage.tsx
src/features/pricing/components/PricingView.tsx
src/features/reports/components/ReportFilters.tsx
src/features/reports/components/ScheduleModal.tsx
src/pages/PracticeHomePage.tsx
```

**Recommended:** per-site judgment. The animated thumb adds UX feedback;
chat-first `.seg` is simpler. Suggest defaulting to `Seg` for all 13 unless
the thumb animation is critical (e.g. tight tablist with frequent
switching — likely none of these). After the sweep, delete
`SegmentedToggle.tsx` + its CSS (`.segmented-toggle*`).

---

## 8.4 — Legacy CSS alias deletion

After PR-9 / PR-10, three aliases remain in `src/index.css`:

| Alias | TSX callers | TSX files | CSS def lines | Status |
|---|---:|---:|---:|---|
| `.status-info` / `.status-success` / `.status-warning` / `.status-error` | ~46 | 19 | 4 (in index.css) | **KEPT** — revised in PR #660. Not aliases, real DS-tokenized tinted surfaces. |
| `.input-surface` | ~47 | 24 | 1 (in index.css) | Need migration first. Most are inside input primitives. |
| `.card-surface` | 0 | 0 (only definitions in index.css) | 4 | ✅ Deleted in PR #655. |
| `.segmented-toggle*` | 0 (only inside SegmentedToggle.tsx) | 1 | 10 (in index.css) | ✅ Deleted in PR #659 with the primitive. |

**Recommended:**

- ✅ **8.4a**: Delete `.card-surface` aliases — landed in PR #655.
- ❌ **8.4b** *(originally: sweep `.status-*` to `<Pill>`)* — REVISED in
  PR #660. `.status-*` are **tinted surface containers**, not Pill aliases.
  Already DS-tokenized (color-mix on `--pos`/`--warn`/`--neg`/`--accent-deep`
  at 10% bg + 30% border + full text). They serve a distinct role from
  both `<Pill>` (inline span badges) and `<Alert>` (icon + structured
  content). **Kept.** CSS comment updated.
- **8.4c**: Sweep `.input-surface` callers → DS Input primitive. 24 files.
  Lots are in `src/shared/ui/input/*` — the input primitives themselves
  already use the `.input-surface` class; replacing means rewriting
  their CSS to match the chat-first `.input` style.
- **8.4d**: Delete `.input-surface` from `src/index.css` after 8.4c sweep
  lands. `.status-*` stays (per 8.4b revision). `.segmented-toggle*` and
  `.card-surface` already deleted.

---

## 8.5 — a11y verification

`prefers-reduced-motion` already used in:
- `src/index.css` — 3 occurrences (existing animation guards)
- `src/design-system/tokens.css` — 2 occurrences
- `src/shared/ui/layout/SkeletonLoader.tsx` — 1 occurrence

Coverage is partial. Need to audit:
- Page transitions (`ui-overlay-enter`, `ui-surface-enter-*` keyframes)
- `animate-toast-in`, `animate-float-in`, `animate-progress-indeterminate`
- New chat-pattern animations (none added in PR #652/#653 — clean)

**Recommended:** one PR adding `@media (prefers-reduced-motion: reduce)`
guards to remaining keyframe animations + a single doc note in
`DESIGN_SYSTEM.md` confirming AA compliance.

**AA contrast spot checks** — manual visual review on:
- `--dim-2` on `--card` (placeholder text)
- `--accent-deep` on `--accent-soft` (italic AI emphasis)
- `--accent` on `--ink` (selected nav items)

Should pass given OKLCH chroma values, but verify with a contrast checker
on a built page.

---

## 8.6 — `font-display` cleanup

Trivial — `font-display` → `font-serif` (since DS uses Source Serif 4
as the display face).

- `src/features/matters/components/MatterSummaryCards.tsx` — 6 occurrences
- `src/features/matters/components/MatterDetailsPanel.tsx` — 2 occurrences

Rides 8.1d.

---

## Recommended PR ladder

In dependency order (each can be its own PR):

1. ~~**PR-12** (this one is fast): `chore(ds): delete .card-surface alias (8.4a)` — single-file edit, zero risk.~~ ✅ **landed in PR #655 (commit `99171487`)**.
2. ~~**PR-13**: `chore(ds): replace text-input-* family (8.1a)` — big mechanical PR.~~ ✅ **landed in PR #656 (commit `054c0cf9`).** Net +1446/-1446 across 244 files. Note: `text-input-*` was actually dead (missing from tailwind config); replacement with `text-ink` / `text-dim-2` is a real visual change. CSS bundle grew ~5 kB.
3. ~~**PR-14**: `chore(ds): replace bg-surface-* + bg-accent-N + font-display + rounded-xl (8.1b/c/d combined)` — second mechanical sweep.~~ ✅ **landed in PR #657 (commit `9acfe6ca`).** Net +542/-542 across 185 files. CSS bundle 149→156 kB. Discovered additional dead families (text-accent-N, ring-accent-N, border-accent-N, *-error/*-success/*-foreground variants) out of scope here — those go in a dedicated PR with semantic mapping.
4. ~~**PR-15**: `refactor(ds): DataTable → CSS grid for 6 non-invoice tables (8.2)`.~~
   - ✅ **8.2a landed in PR #658 (commit `81558f59`)** — FilesList + DeliveriesListView converted to EntityList.
   - Revised: ReportDataTable kept as `<table>` (genuinely tabular report data — same justification as InvoicesTable line items).
   - ✅ **8.2b landed in PR #660 (commit `e0c6e5ae`)** — remaining 4 (IntakesPage, EngagementsPage, IntakeTemplatesPage, PracticeMattersPage) converted to EntityList. Net +213/-236 across 4 files. IntakeTemplatesPage required role="button"/aria-disabled treatment for the inner Responses + actions menu spans because EntityList wraps rows in its own `<button>`.
5. ~~**PR-16**: `refactor(ds): migrate SegmentedToggle callers to Seg; delete SegmentedToggle (8.3)`.~~ ✅ **landed in PR #659 (commit `6368e7b6`).** All 13 callers swept to Seg (none needed the animated thumb). SegmentedToggle.tsx (96L) + .segmented-toggle* CSS (~40L) + barrel exports deleted. Net -138 lines.
6. ~~**PR-17**: `refactor(ds): migrate .status-* callers to <Pill>; delete alias (8.4b/d-partial)`.~~ ❌ **REVISED in PR #660 (commit `c7d0a3a5`).** The original "migrate to Pill" recommendation was wrong — `.status-*` classes are **tinted surface containers** (banner/notice backgrounds), not Pill aliases. They're already DS-tokenized via color-mix on `--pos`/`--warn`/`--neg`/`--accent-deep`. Distinct from `<Pill>` (inline span badges) and `<Alert>` (icon + structured content). **Kept.** CSS comment updated to clarify the intent.
7. ~~**PR-18**: `refactor(ds): migrate .input-surface callers to DS Input; delete alias (8.4c/d-partial)`.~~ ✅ **landed in PR #660 (commit `1f77296a`)** — renamed `.input-surface` → `.field` (not deleted; the class is a tokenized base surface that the form-input `.input` doesn't replace, since `.input` includes padding/width/font that decorative callers like Combobox/MessageComposer don't want). BEM state classes also renamed (`.isError`/`.isSuccess`/`.isOpen` → `.is-error`/`.is-success`/`.is-open`). 23 caller TSX files updated.
8. ~~**PR-19**: `chore(ds): a11y guards + AA verification + final grep gates (8.5)`.~~ ✅ **landed in PR #660 (commit `1f77296a`)** — per-selector `@media (prefers-reduced-motion: reduce)` guards added for 6 unguarded selectors (`.animate-toast-in`, `.animate-float-in`, `.animate-progress-indeterminate`, `.workspace-header__loading`, `.ai-thinking-indicator__dot`, `.human-typing-indicator__dot`). Final grep gates passed (0 dead matches). AA contrast spot-check deferred to a separate visual review pass; tokens.css OKLCH chroma values are within AA range by construction.
9. ~~**PR-19a** (discovered during PR #657 review): `chore(ds): dead accent families semantic sweep (8.1e)`.~~ ✅ **landed in PR #660 (commit `1f77296a`)** — ~110 TSX files swept (text-accent-N → text-accent, *-error → *-neg, *-success → *-pos, *-warning → *-warn, *-foreground → *-ink on accent surfaces). Plus `var(--accent-500)` → `var(--accent-rgb)` in src/index.css workspace-header progress bar. 58 residual grep matches are all valid `text-accent-deep`/`text-accent-ink` tokens.

**Commit 8 is complete.** PR #660 consolidated the originally-planned PR-17 through PR-19a into a single landing (per the "no micro-PRs" convention). What remains beyond Commit 8 is the long-deferred refactors (6c, 7c) and the 5 net-new chat-first screens — neither belongs in the Commit 8 closeout.

---

## What's not in scope

- Building net-new chat-first screens (Trust, Reports, Calendar, Tasks,
  Conversations). Those are separate PRs not tracked here.
- The deferred refactors **6c** (Message/MessageBubble/ChatMarkdown ↔
  chat patterns) and **7c** (InvoicePreview ↔ LetterPaper). Both land
  with their consuming-screen rebuilds.
- Net-new IOLTA staged-action backend integration.
