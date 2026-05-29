# Design System Migration — Tracking Doc

Source plan: `redesign-files/REDESIGN.MD` (Issues 1–13) + adversarial-reviewed implementation plan that lived at `~/.claude/plans/merry-swimming-gizmo.md`. Critical content from that plan is reproduced in this doc so the migration is self-contained in-repo.

Branch: `feat/ds-full-migration` (off `staging` @ `5c42ac78`).

---

## Where We Are

Commit 4 complete on `feat/ds-migration-pt2` (off `feat/ds-full-migration`). **4 of 8 commits landed.** Build green at every commit. Split into 4 sub-commits.

| Commit | SHA | Status | What landed |
|---|---|---|---|
| 1 — Foundation | `b03558c4` | ✅ | Tokens, fonts, Tailwind config, `src/index.css` surgical rewrite, glass aliases removed |
| 2 — Theme mechanism | `e5f409b0` | ✅ | `.dark` class → `data-theme` attribute (7 sites + boot script + DebugDialogsPage) |
| 3 — accentColors removal | `6876d6ed` | ✅ | `brandColor.ts` (pure validator), 9 importers updated, AudioRecordingUI uses `--accent-rgb` |
| 4a — Primitives (additive) | `a01d5a2a` | ✅ | New `src/design-system/primitives/` (Label/Pill/Chip/Bar/Card) + matching CSS classes added to `src/index.css` |
| 4b — CSS rewrites | `95dd97c7` | ✅ | `.btn-*` rewritten to DS tokens (2px radius, ink/paper/accent palette); `.card-*` aliases collapsed to canonical DS shape; `.input-surface` + `.status-*` rewritten to use valid DS tokens; `.btn-inverted` deleted |
| 4c — Primitive refactors + sweep | `c6212140` | ✅ | Refactored Button (new `accent` variant) / Input / Textarea / Switch / Alert / Avatar (`kind` prop) / Dialog; swept 5 StatusBadge callers → `<Pill>` (3 wrappers + 2 direct) |
| 4d — Deletions | `85d708be` | ✅ | Deleted `shared/ui/badges/*`, `shared/ui/tag/*`, `shared/ui/feedback/ProgressBar.tsx` + barrel updates |
| 5a — Layout primitives | `3976faad` | ✅ | Created `src/design-system/layout/` (BrandMark, LeftRail, FocusDrawer, SplitDetail) + matching CSS shapes. Pure additive — 789 lines new. |
| 5b — PageHeader rewrite | `f5a31630` | ✅ | Rewrote `src/shared/ui/layout/PageHeader.tsx` to DS spec (mono crumb + Source Serif H1 + lede + rule). Two existing callers unchanged. |
| 5c — Shells refactor + legacy deletions | — | **deferred** | WorkspacePage (1666L) / WidgetApp (865L) / PracticeHomePage (554L) / ClientHomePage (151L) shells need rewiring to LeftRail; AppShell's sidebar/desktopSidebarCollapsed/mobileSidebar contract needs the matching update; assistant conversation panel must be extracted from PracticeSidebar; 4 test files reference NavRail. Delete NavRail/Sidebar/PracticeSidebar/ClientSidebar/MobileInspectorOverlay/WorkspaceShellHeader after refactor. **Drawer (4 callers) and InspectorPanel (2005L content) stay — no DS replacement spec yet; flag for separate planning.** |
| 6 — Chat patterns | — | pending | Create AISummary/StagedAction/Observation/Composer/ToolUseLine/Citations; delete ChatDockedAction/AIThinkingIndicator; IOLTA manual smoke |
| 7 — Data display | — | pending | Create StatStrip/JourneyProgress/LetterPaper/MatterChip/Seg; delete StatCard/NextStepsCard/ActivityTimeline×2; print test |
| 8 — Feature sweep | — | pending | ~269 TSX files swept for 8 violation patterns; DataTable audit; final zero-violation grep; AA contrast spot; `prefers-reduced-motion` check; final removal of `.status-*` / `.input-surface` / `.card-surface` aliases once their TSX callers move to DS primitives |

PR #644 was merged. PR #645 (`feat/ds-migration-pt2`) holds Commits 4 + 5a/5b. Next session resumes at **Commit 5c** — the shell refactors. The planning gaps around `Drawer` and `InspectorPanel` deletions need product-side resolution before they can be ripped out.

### Commit 4 — scope deltas worth noting

The doc-anticipated caller scope for the dead primitives was much larger than reality. Verified at branch start:

| Primitive | Doc estimate | Actual production callers |
|---|---|---|
| StatusBadge | ~40 sites | **5** (3 thin wrappers + 2 direct) |
| OnboardingStatusBadge | ~2 sites | **0** (dead code) |
| RoleBadge | ~5 sites | **0** (dead code) |
| ProgressBar | ~10 sites | **0** (dead code) |
| Tag / TagInput | ~15 sites | **0** (stories + README only) |

CSS sweep similarly trimmed:

- The doc called for deleting `.status-*` / `.segmented-toggle*` / `.card-muted` / `.card-raised` / `.side-card` / `.empty-state` / `.input-surface` in Commit 4. Each had 21–29 production caller files — too broad for this commit. They were instead **rewritten** in 4b to alias the DS canonical shapes so they render correctly during the transition. Final deletion follows in Commit 8 once callers move to `<Pill>` / `<Card>` / `.input`.
- `.btn-inverted` was deleted (verified 0 TSX callers).

---

## Resume Instructions (first thing the next session does)

```powershell
git checkout feat/ds-migration-pt2
git log --oneline staging..HEAD                  # expect 4a-4d + doc + 5a + 5b
npm install                                       # if dependencies changed since last checkout
npm run build                                     # must pass
npm run lint:src                                  # expect: 1 pre-existing error (Message.tsx:191)
npm run type-check                                # expect: 4 pre-existing errors (WorkspacePage.tsx contactName/contactEmail)
```

Open this doc, read **Commit 5c — open items** below, then start the shell refactors.

### Commit 5c — open items for the next session

Plan-level decisions to make *before* coding:

1. **InspectorPanel (2005L) replacement strategy** — currently 4 callers (WorkspacePage, WidgetApp, DebugDialogsPage, WorkspaceSetupSection). The migration doc said "delete" but provided no replacement for the 2005 lines of entity-specific rendering (conversation/matter/client/invoice). Options:
   - (a) Leave InspectorPanel content intact for Commit 5c; swap to `FocusDrawer` *container* only; refactor InspectorPanel internals in a later commit.
   - (b) Refactor InspectorPanel into per-entity components owned by their feature folders (e.g. `src/features/matters/components/MatterInspector.tsx`) as part of Commit 5c. Larger scope.
2. **Drawer (4 callers in files/chat) replacement** — used by `ChatContainer`, `FilesPageView`, `FileDetailDrawer`, `FilesCollectionPanel`. Doc says delete but FocusDrawer is right-rail-specific. Either generalize FocusDrawer to support left/bottom too, or keep Drawer.
3. **AccentHeroSurface (1 caller, 31L)** — used by `PracticeContactsPage`. Trivial to inline the gradient styling at the caller; delete after.
4. **Assistant conversation panel extraction** — currently lives inside `PracticeSidebar`. After Sidebar deletion, render the assistant conversation list as a standalone panel adjacent to LeftRail in WorkspacePage's chat shell.
5. **AppShell refactor** — its `sidebar`, `desktopSidebarCollapsed`, `mobileSidebar`, `mobileSidebarOpen`, `onMobileSidebarClose` props all assume the legacy Sidebar pattern. Either drop these props (per locked decision §5 — no sidebar collapse) and have shells own their LeftRail composition directly, or keep AppShell as a thin wrapper.
6. **Test updates** — 4 files reference deleted components: `tests/component/nav-rail.test.tsx` (likely delete entirely), `tests/component/widget-app.test.tsx`, `tests/component/app-shell.test.tsx`, `src/features/invoices/pages/__tests__/InvoicesPages.test.tsx` (NavRail import).

---

## Foundation Verification (current counts)

These were captured pre-migration and re-checked after Commit 3. Patterns that are foundation-scoped reached 0 or near-0. Patterns that are TSX-feature-scoped are unchanged (those are Commit 8's job).

| Pattern | Pre-migration | After Commit 3 | Notes |
|---|---|---|---|
| `\.dark` + `classList.*dark` | 20 | **1** | The one match is a string literal `value === 'dark'` in `GeneralPage.tsx`, not a class manipulation. Expected. |
| `--surface-*` / `--border-subtle` / `--nav-surface` / `shadow-glass` / `glass-card/panel/input` | 167 | **62** | 12 in `src/index.css` (raw CSS using deleted vars — rewritten in Commits 4–7 alongside the component classes). 50 in TSX (Tailwind classes silently losing styles — swept in Commit 8). |
| `bg-accent-[0-9]` / `text-accent-[0-9]` / `border-accent-[0-9]` / `ring-accent-[0-9]` | 203 | **186** | TSX classes still using the old numeric scale. Tailwind no longer generates them (no `accent.500` etc. in config), so the elements lose styles. Swept in Commit 8. |
| `rounded-xl` / `rounded-2xl` / `bg-amber` / `text-amber` / `bg-yellow` / `text-yellow` / `text-red-[0-9]` / `bg-red-[0-9]` (TSX) | 448 | **448** | TSX feature-files, untouched by foundation. Swept in Commit 8. |
| `font-display` / `\bInter\b` / `\bOutfit\b` | 21 | **9** | 9 left in MatterDetailsPanel/MatterDetailSkeleton/MatterSummaryCards. Trivial sweep, fixed in Commit 8 (`font-display` → `font-serif`). |
| `accentColors` / `applyAccentColor` / `initializeAccentColor` | 21 | **0** ✓ | Commit 3 done. |

**Target by end of Commit 8:** all six patterns → 0.

---

## Pre-existing Errors (NOT from this work)

These existed on `staging` at the branch point (see `dfd76d13 fix: repair pre-existing type-check and lint errors`). They reappeared after that commit. **They are not caused by Commits 1–3 — do not panic.** Verified at every foundation commit.

**Lint (1 error):**
- `src/features/chat/components/Message.tsx:191` — `'shouldShowIndicator' is assigned a value but never used`.

**Type-check (4 errors, all in `src/features/chat/pages/WorkspacePage.tsx`):**
- L1262:44 — `Property 'contactName' does not exist on type '{ kind: "practice_assistant" }'`
- L1262:89 — `Property 'contactEmail' does not exist on type '{ kind: "practice_assistant" }'`
- L1354:48 — `Property 'contactName' does not exist on type '{ kind: "practice_assistant" }'`
- L1354:93 — `Property 'contactEmail' does not exist on type '{ kind: "practice_assistant" }'`

Message.tsx is refactored in Commit 6 (chat patterns). WorkspacePage.tsx is touched in Commit 5 (layout shells). The errors may incidentally clear themselves during those commits.

---

## Strategy (locked, do not re-debate)

- **Single mega-PR not viable in one Claude session.** Foundation goes in PR #1. Remaining commits go in subsequent PRs or one mega-PR — see "PR Sequencing Decision" below.
- **No bridge tokens. No backward-compat shims.** Every commit updates source AND every consumer.
- **`src/design-system/tokens.css`** is the single source of truth for DS tokens. Hex/oklch canonical AND `*-rgb` triplets for Tailwind utility consumption. This isn't a "bridge" — it's the documented dual-consumer pattern.
- **Tailwind utility surface:** `paper/paper-2/paper-edge/card`, `ink/ink-2/ink-3/dim/dim-2`, `rule`, `accent/accent-deep/accent-ink`, `pos/warn/neg`. Plus `shadow-1/2/3` and `rounded-r-xs/sm/md/lg`. **No surface-*, input-*, text-*, line-*, primary-*, accent numeric scale, font-display.**

## Accepted Compromises (LOCKED)

1. **`prefers-color-scheme` retained.** REDESIGN.md L870 said remove; `GeneralPage.tsx` and `SidebarProfileMenu.tsx` both expose a "System" theme option that depends on it.
2. **`localStorage.theme` keeps `'dark'/'light'/'system'` strings.** Apply layer maps `'dark'` → `dataset.theme = 'midnight'`. Existing user state survives the deploy.
3. **Dark-mode toggle UI preserved** per REDESIGN.md L567. DS spec said no toggle, but product UX requires it.
4. **Per-practice brand-color picker UI preserved in settings.** Just no longer applies CSS at runtime. API contract unchanged. **Product decision to flag before merge.**
5. **Sidebar collapse toggle dropped** in Commit 5 (LeftRail is 240px fixed). Below `lg:` breakpoint, mobile bottom bar takes over.
6. **Manual smoke only for IOLTA staged-action gate** in Commit 6. Backend enforces idempotency (HTTP 409) + audit + role gate.

## What Is Intentionally Visually Broken Right Now

Do not try to "fix" any of these by adding back compat shims. They are fixed by their specific later commit.

- **Cards/panels/inputs throughout the app render with no background or border.** Tailwind classes like `bg-surface-card`, `bg-surface-app`, `text-text-primary`, `border-line-subtle` no longer generate any CSS. Fixed in Commit 8 (and individual primitives in Commit 4).
- **Buttons are pill-shaped (`rounded-full`) with practice-color background.** `.btn` class still has `rounded-full` and `bg-accent-500` references in CSS. Fixed in Commit 4 (rewrite `.btn` to 2px radius + DS tokens).
- **Status badges have no color.** `.status-success`/`.status-error` classes use Tailwind colors that no longer exist (`bg-green-500/10` is fine since green is a Tailwind builtin; the issue is `text-[rgb(var(--success-foreground))]` which references a deleted CSS var). Fixed in Commit 4 (delete `.status-*` classes, use `Pill` with semantic tone).
- **Workspace header, nav rail, sidebars all render off** (deleted CSS vars). Fixed in Commit 5.
- **Many headings use `font-display` (Outfit)** which no longer maps to anything in Tailwind config → falls back to default sans. 9 sites. Fixed in Commit 8.
- **Per-practice gold/blue/green/etc. branding is gone.** Customer practices that relied on their custom accent color now see DS gold. Documented in Commit 3 message.

---

## Detailed Handoff for Commits 4–8

### Commit 4 — Primitive components

**Goal:** Refactor all shared UI primitives to use DS classes + tokens. Create five new primitives. Delete five duplicate components. Sweep ~120 caller files.

**Refactor (read first, then edit):**
- `src/shared/ui/Button.tsx` — change className map to use `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-accent` / `.btn-sm` / `.btn-lg`.
- `src/shared/ui/input/Input.tsx` — drop `rounded-xl input-surface border-none`; apply `.input` class. Label slot uses new `Label` primitive. Error state uses `var(--neg)` color.
- `src/shared/ui/input/Textarea.tsx` — same pattern.
- `src/shared/ui/input/Switch.tsx` — replace internal markup with `.toggle` class.
- `src/shared/ui/feedback/Alert.tsx` — replace `bg-amber-500/8 dark:bg-amber-500/12 border-amber-500/20` with `background: color-mix(in oklab, var(--warn) 10%, transparent); border-color: color-mix(in oklab, var(--warn) 30%, transparent)`. Info/success/warning/error → `text-accent-deep`, `text-pos`, `text-warn`, `text-neg`.
- `src/shared/ui/profile/atoms/Avatar.tsx` — use `.avatar` class. Add `kind: 'ai' | 'user' | 'staff'` prop, default `'ai'`.
- `src/shared/ui/dialog/Dialog.tsx` — replace `.card` inheritance with `border-radius: var(--r-md); box-shadow: var(--shadow-2); border-color: var(--paper-edge)`.

**Create in `src/design-system/primitives/`:**
- `Label.tsx` — renders `<label className="label">`. Props: `htmlFor?, children`. Applied class is mono 11px uppercase 0.08em tracking, color `var(--dim)`.
- `Pill.tsx` — props: `tone: 'live' | 'warn' | 'urgent' | 'gold' | 'dim'; dot?: boolean; children`. Applies `.pill .live` / `.warn` / etc.
- `Chip.tsx` — props: `variant?: 'default' | 'primary' | 'accent' | 'warn'; onRemove?; href?; children`. Applies `.chip` with variant class.
- `Bar.tsx` — props: `value: number; tone?: 'ok' | 'warn' | 'default'`. Applies `.bar .ok` / `.warn`. Internal `<i>` sets width.
- `Card.tsx` — props: `children, className?, hd?: ReactNode`. Thin wrapper applying `.card`, optional `.card-hd` for header.

**Delete:**
- `src/shared/ui/tag/atoms/Tag.tsx`
- `src/shared/ui/badges/RoleBadge.tsx`
- `src/shared/ui/badges/StatusBadge.tsx`
- `src/shared/ui/badges/OnboardingStatusBadge.tsx`
- `src/shared/ui/feedback/ProgressBar.tsx`

**Caller sweep (~120 files):**
Tone-map at swap time:
- `StatusBadge` ~40 sites → `Pill` (`active`/`succeeded`/`paid` → `live`, `pending`/`awaiting`/`draft` → `warn`, `overdue`/`failed`/`urgent` → `urgent`, `staged`/`sent` → `gold`, `archived`/`closed` → `dim`)
- `OnboardingStatusBadge` ~2 sites → `Pill`
- `Tag` ~15 sites → `Chip`
- `RoleBadge` ~5 sites → `Chip`
- `ProgressBar` ~10 sites → `Bar`
- Form labels (`<label className="text-sm font-medium ...">`) throughout → `<Label>`

Find caller files with: `rg "from '@/shared/ui/badges/StatusBadge'" src` (etc.) and `rg "<label[^>]+font-medium" src --type tsx`.

**Rewrite CSS classes in `src/index.css`** (this is the bulk of the visual recovery):
Refer to the reference at `redesign-files/Blawby-chatbot-refactor/tokens.css` lines 146–293 for the canonical DS spec. Key rewrites:
- `.btn` — `border-radius: var(--r-xs); padding: 10px 18px; font-size: 14px;`
- `.btn-primary` — `background: var(--ink); color: var(--paper); border-color: var(--ink);` (hover swaps to `var(--accent)` + `var(--accent-ink)`)
- `.btn-ghost` — `background: transparent; color: var(--ink); border-color: var(--rule);`
- `.btn-accent` — `background: var(--accent); color: var(--accent-ink); border-color: var(--accent);`
- `.btn-danger` — `background: color-mix(in oklab, var(--neg) 12%, transparent); color: var(--neg);`
- `.btn-warning` — `color: var(--warn);` pattern
- `.input`, `.textarea`, `.select` — `border-radius: var(--r-xs); background: var(--card); border: 1px solid var(--rule); padding: 11px 12px;`
- Focus state: `border-color: var(--ink); box-shadow: 0 0 0 3px var(--accent-soft);`
- `.toggle` — `36×20`, `background: var(--rule)`, `.on` → `background: var(--accent)`
- `.card` — `border-radius: var(--r-md); background: var(--card); border: 1px solid var(--rule); padding: 18px; box-shadow: var(--shadow-1);`
- `.pill` — mono uppercase 10.5px, `border-radius: var(--r-pill);` with `.dot` pseudo-element, `.live/.warn/.urgent/.gold` set bg of dot
- `.chip` — `border-radius: var(--r-xs); padding: 5px 10px; font-size: 12.5px;`
- `.bar` — `height: 4px; background: var(--rule-soft); border-radius: var(--r-pill); overflow: hidden;` inner `<i>` is `background: var(--accent)` (or `.ok/.warn` overrides)
- `.label` — `font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim);`
- `.avatar` — `28×28; border-radius: 50%; background: var(--ink); color: var(--accent); font-family: var(--serif); font-style: italic;`
- `.field` — `display: flex; flex-direction: column; gap: 6px;`

**Delete from `src/index.css`:**
- `.status-success/warning/error/info` (~L912–930 in pre-foundation numbering; line numbers have shifted, find with `rg "\\.status-(success|warning|error|info)" src/index.css`).
- `.btn-inverted` (verify zero TSX callers first: `rg "btn-inverted" src --type tsx`).
- `.segmented-toggle*` family — replaced by `Seg` in Commit 7.
- Old `.card-surface*`, `.card-hover*`, `.card-muted`, `.card-raised`, `.side-card`, `.empty-state` — fold into single canonical `.card` + variants.
- `.input-surface` and its `.isError`/`.isSuccess`/`.isOpen` states — consumers move to `.input`.

**Verification:**
```powershell
rg "StatusBadge|OnboardingStatusBadge|RoleBadge|\bTag\b|ProgressBar" src/shared/ui src/features  # zero
npm run build && npm run lint:src && npm run type-check
# Manual: with dev server running (npm run dev:full), visit https://local.blawby.com/debug/styles
#   - Verify all button variants have 2px radius
#   - Verify input fields have 2px radius + rule border
#   - Verify status badges render as pills with semantic dot colors
#   - Verify form labels are mono uppercase
```

**Risk:** the caller sweep is mechanical but tedious. Use TaskCreate per file group (`status-badges`, `tags`, `role-badges`, `progress-bars`, `form-labels`) to track progress so partial completion is resumable.

---

### Commit 5 — Layout: LeftRail, FocusDrawer, SplitDetail, PageHeader, BrandMark

**Goal:** Replace 4 nav files + 4 layout/overlay components with the DS layout primitives. **Highest structural risk in the migration.**

**Audit data already gathered (do not repeat):**
- `NavRail.tsx` (205 lines) — desktop icon rail + mobile bottom variant. Consumed by `WorkspacePage.tsx` (as bottomNav) and `WidgetApp.tsx`.
- `Sidebar.tsx` (750 lines) — heavyweight composable primitive with 7 sub-components (Org, Section, Item, SubItem, SubGroupLabel, Footer, UserRow, PracticeAreaItem). Owns expand/collapse state in localStorage `'blawby:sidebar:collapsed'`. Used internally by PracticeSidebar/ClientSidebar.
- `PracticeSidebar.tsx` (397 lines) — wraps Sidebar with role-aware nav building + assistant conversation list + secondary filters. Used by `WorkspacePage.tsx` + `PracticeHomePage.tsx`.
- `ClientSidebar.tsx` (212 lines) — like PracticeSidebar minus assistant; optional "Upgrade to Practice" CTA. Used by `WorkspacePage.tsx` + `ClientHomePage.tsx`.

**Create:**

- **`LeftRail.tsx`** (in `src/design-system/layout/` or `src/shared/ui/layout/`) — 240px sticky text-label rail (desktop) + responsive mobile bottom bar.

  ```ts
  interface LeftRailItem {
    id: string; label: string; icon?: IconComponent; href: string;
    matchHrefs?: string[]; badge?: number | null; variant?: 'default' | 'danger';
    isAction?: boolean; isActive?: boolean; onClick?: () => void; prefetch?: () => void;
  }
  interface LeftRailProps {
    items: LeftRailItem[];
    variant: 'desktop' | 'mobile';
    activeHref?: string;
    onItemActivate?: () => void;
    maxItems?: number;        // mobile overflow threshold
    onOverflowClick?: () => void;
    sections?: LeftRailSection[];
    brandMark?: ReactNode;    // desktop top slot
    footer?: ReactNode;       // desktop bottom slot (OrgSwitcherMenu + SidebarProfileMenu live here)
  }
  ```

  Desktop variant: 240px wide, sticky, `.rail-section` blocks, ink bg on active item, accent text on active, 1px right border. Mobile variant: bottom full-width bar, icon + label, overflow → "More" button.

- **`FocusDrawer.tsx`** — 400px right rail, sticky scrollable, `box-shadow: var(--shadow-3)`, slide-in `rise` animation. Props: `title?, subtitle?, onClose, children`.
- **`SplitDetail.tsx`** — ~380px list column + flex detail column. Active list item gets 3px gold left accent border.
- **`PageHeader.tsx`** — crumb (mono small caps) + Source Serif 4 H1 + optional lede + 1px rule. **Not a topbar — within-page heading.** Props: `crumb?, title, subtitle?, actions?`.
- **`BrandMark.tsx`** — gold serif italic glyph + Geist wordmark. Props: `size?: 'sm' | 'md'`.

**Delete:**
- `src/shared/ui/nav/NavRail.tsx`
- `src/shared/ui/nav/Sidebar.tsx`
- `src/shared/ui/nav/PracticeSidebar.tsx`
- `src/shared/ui/nav/ClientSidebar.tsx`
- `src/shared/ui/overlays/Drawer.tsx`
- `src/shared/ui/inspector/InspectorPanel.tsx`
- `src/shared/ui/inspector/MobileInspectorOverlay.tsx`
- `src/shared/ui/layout/AccentHeroSurface.tsx`
- `src/shared/ui/layout/WorkspaceShellHeader.tsx` (→ PageHeader)

**Refactor shells:**
- `src/features/chat/pages/WorkspacePage.tsx` — replace PracticeSidebar/ClientSidebar/NavRail with LeftRail (desktop + mobile variants). Compose `OrgSwitcherMenu` + `SidebarProfileMenu` separately into LeftRail's `brandMark` and `footer` slots. **Drop the `isDesktopSidebarCollapsed` state + the `'blawby:sidebar:collapsed'` localStorage key.**
- `src/pages/PracticeHomePage.tsx` — replace PracticeSidebar with LeftRail.
- `src/pages/ClientHomePage.tsx` — replace ClientSidebar with LeftRail. If "Upgrade to Practice" CTA matters, render it as a footer chip.
- `src/app/WidgetApp.tsx` — replace NavRail (mobile bottom variant) with LeftRail mobile variant.

**Keep:**
- `src/shared/ui/nav/OrgSwitcherMenu.tsx` (composed outside LeftRail by shells)
- `src/shared/ui/nav/SidebarProfileMenu.tsx` (same)
- `src/shared/ui/layout/BottomBar.tsx` (thin wrapper, becomes container for LeftRail mobile variant)

**Assistant conversations** currently render inside `PracticeSidebar` when `workspaceSection === 'assistant'`. After replacement, render the assistant conversation list as its own panel adjacent to LeftRail in the chat shell (`WorkspacePage`). This is a separate Preact component — not part of LeftRail's API.

**Delete from `src/index.css`:**
- `.nav-item-active`, `.nav-item-inactive`, `.nav-item-inactive:hover` (find with `rg "\\.nav-item" src/index.css`)
- `.workspace-header` and `.workspace-header__*` family — replaced by `PageHeader`
- The `.sidebar-scroll` block (replaced by LeftRail's own scroll container)
- Any remaining references to `--nav-*`, `--sidebar-*`, `--header-*` vars (already deleted from `:root` in Commit 1; ensure no rules still use them).

**Verification:**
```powershell
rg "NavRail|PracticeSidebar|ClientSidebar|InspectorPanel|MobileInspectorOverlay|AccentHeroSurface|WorkspaceShellHeader" src/shared/ui src/features src/pages src/app  # only new layout file paths
rg "blawby:sidebar:collapsed|isDesktopSidebarCollapsed" src   # zero
npm run build && npm run lint:src && npm run type-check
# Manual:
#   - Desktop viewport (1280×): 240px LeftRail with text labels, sticky
#   - Mobile viewport (375×): bottom bar with icon + label items, "More" overflow if applicable
#   - Page headers render in Source Serif 4
#   - Inspector drawer opens/closes (FocusDrawer)
```

**Risk:** the mobile bottom bar must wire to the same `LeftRail` item source as desktop. Test mobile viewport early. Assistant conversation panel relocation is non-trivial — confirm the workspace section logic still routes correctly.

---

### Commit 6 — Chat patterns: AISummary, StagedAction, Observation, Composer, ToolUseLine, Citations

**Goal:** Build the DS AI surfaces. **IOLTA-critical** — the `practice_assistant_decision` approval gate touches trust-account writes.

**Audit data already gathered (do not repeat):**
- Only 1 of 4 action types in `ChatActionCard` has an approve gate: `practice_assistant_decision`. The other three (`auth`, `payment`, `slim-form`/`disclaimer`) are direct user flows.
- Backend endpoint: `POST /api/ai/practice-assistant/actions/{actionId}/approve|reject`. Payload: `{ practiceId: string }`. Implementation in `worker/routes/practiceAssistant.ts` L94–116.
- State machine enforced server-side: `pending` → `approved` | `rejected`. Duplicate approve returns HTTP 409 Conflict.
- Audit log entry written on every decision to `session_audit_events`. Role gate: `paralegal+` via `requirePracticeMember()`.
- **Zero existing E2E or component tests for ChatActionCard / ChatDockedAction.** User accepted manual smoke only.

**Create in `src/design-system/chat/` (or `src/features/chat/components/ds/`):**

- **`StagedAction.tsx`** — gold gradient bg, "STAGED · AWAITS YOUR APPROVAL" mono label, Source Serif 4 title, body, chip row with primary "Approve & send" + ghost "Dismiss".

  ```ts
  interface StagedActionProps {
    actionId: string;
    title: string;
    description?: string;
    sources?: Citation[];
    onApprove: (actionId: string) => Promise<void>;
    onReject: (actionId: string) => Promise<void>;
    isPending?: boolean;     // disables both buttons while in-flight
  }
  ```

  Safety guarantees the component MUST enforce:
  - Approve/Reject buttons disabled while `isPending`.
  - No auto-execute — only fires on user click.
  - Idempotency surfaced: on backend 409, render current status (don't retry).

- **`AISummary.tsx`** — gold-tinted card: gradient bg, avatar, mono label, serif lede, chip row, citations required. Props: `heading; body; sources?: Citation[]; actions?: ChipAction[]`.
- **`Observation.tsx`** — 2px gold left border, accent-soft gradient bg, serif italic 17–18px body. Props: `label?; body; actions?: ChipAction[]`.
- **`Citations.tsx`** — pill row beneath AI responses, first pill is `.live`. Props: `sources: {table: string; rows: number}[]`.
- **`ToolUseLine.tsx`** — `› used <code>tool_name</code> · 142ms`, `--dim` color, 44px indent. Replaces `AIThinkingIndicator` rendering. Pending state shows spinner; completed shows static metadata. Props: `tools: string[]; ms?: number; pending?: boolean`.
- **`Composer.tsx`** — sticky bottom card, `box-shadow: var(--shadow-2)`, contenteditable, context chips (dashed, mono), voice + send icons. Replaces `MessageComposer` internals while keeping the same outer API surface (props/events) so call sites in `WorkspacePage` don't change.

**Refactor:**
- `src/features/chat/components/Message.tsx` — `rounded-xl` bubble → `--r-md`. Render `ToolUseLine` for tool progress instead of `AIThinkingIndicator`. Render `Citations` row below assistant body when sources present.
- `src/features/chat/components/MessageBubble.tsx` — use DS tokens (`var(--card)`, `var(--rule)`, `var(--shadow-1)`).
- `src/features/chat/components/ChatMarkdown.tsx` — headings use `var(--serif)` weight 400 (not `font-semibold`), color `var(--ink)`.
- `src/features/chat/components/ChatActionCard.tsx` — keep handling `auth`/`payment`/`slim-form`/`disclaimer` types. For the `practice_assistant_decision` type (currently wrapped by `ChatDockedAction`), delegate to `StagedAction`. The Stripe Elements theme detection (already updated in Commit 2 to read `dataset.theme`) stays as-is.

**Delete:**
- `src/features/chat/components/ChatDockedAction.tsx`
- `src/features/chat/components/AIThinkingIndicator.tsx`

**Delete from `src/index.css`:** `.ai-thinking-indicator__dot`, `.human-typing-indicator__dot` (if `ToolUseLine` covers the use case visually).

**IOLTA manual smoke checklist (before deleting `ChatDockedAction`):**
1. Trigger a `practice_assistant_decision` action via the assistant.
2. Verify `StagedAction` renders with gold gradient + Approve / Dismiss buttons.
3. Click Approve → button disables → backend `POST /api/ai/practice-assistant/actions/{actionId}/approve` fires → status updates → buttons stay disabled.
4. Refresh — action shows as approved (not approvable again).
5. Trigger a second Approve click on an already-approved action → backend returns 409 → UI surfaces current status (no retry loop).
6. Test Reject path symmetrically.

**Verification:**
```powershell
rg "ChatDockedAction|AIThinkingIndicator" src   # zero
npm run build && npm run lint:src && npm run type-check
npm run test:component   # all chat-related tests pass
```

---

### Commit 7 — Data display: StatStrip, JourneyProgress, LetterPaper, MatterChip, Seg

**Goal:** Build stat, timeline, document, matter-entity, and segmented-control primitives. Wire InvoicePreview to print-safe LetterPaper shell.

**Create:**

- **`StatStrip.tsx`** — 5-cell horizontal strip with 1px dividers, mono labels + serif large tabular numbers (24–26px, `font-feature-settings: "tnum"`), optional `.bar` per cell. Props: `stats: {label: string; value: string; bar?: BarProps}[]`.
- **`JourneyProgress.tsx`** — horizontal 5-step indicator, 32px circles, gold connecting line. Client portal use. Props: `steps: Step[]; current: number`.
- **`LetterPaper.tsx`** — white bg, 60px horizontal padding, Source Serif 4 body at 14.5px, letterhead row. **Uses fixed hex values (not CSS vars)** so print fidelity is theme-independent. Add `@media print` styles inline. Props: `firm; address; date; children`.
- **`MatterChip.tsx`** — `.matter-chip` class: 5px pin dot + label, gold tint on hover, ink border + ring when active. Props: `matterId; name; status; urgent?; active?`.
- **`Seg.tsx`** — segmented control. Props: `value; onChange; children: SegOption[]`. Replaces existing `.segmented-toggle*` CSS family.

**Delete:**
- `src/shared/ui/cards/StatCard.tsx`
- `src/shared/ui/cards/NextStepsCard.tsx`
- `src/shared/ui/activity/ActivityTimeline.tsx`
- `src/features/matters/components/ActivityTimeline.tsx`

**Refactor:**
- `src/features/invoices/components/InvoicePreview.tsx` (331 lines) — wrap in `LetterPaper` shell. The component already uses inline hex colors (intentional for print fidelity, with an eslint override). Add `@media print` styles to LetterPaper to ensure white bg + correct serif body + hide nav/inspector.
- `src/features/practice-dashboard/components/DashboardSummaryCards.tsx` → `StatStrip`.
- `src/features/invoices/components/list/InvoiceListKpiRow.tsx` → `StatStrip`.
- `src/features/matters/components/billing/UnbilledSummaryCard.tsx` → `StatStrip`.
- All consumers of deleted `StatCard`/`NextStepsCard`/`ActivityTimeline` → `StatStrip`/`JourneyProgress`.
- `src/features/matters/components/MatterListItem.tsx` and other matter mentions → `MatterChip`.

**Print test:**
1. Open `/practice/{slug}/invoices/{id}` (invoice detail).
2. Browser → Print (or `Ctrl+P`).
3. Verify white bg, Source Serif 4 body, no nav/inspector.
4. Verify line item totals align with `"tnum"` tabular numbers.

**Verification:**
```powershell
rg "StatCard|NextStepsCard|ActivityTimeline" src --type tsx   # only new file paths
npm run build && npm run lint:src && npm run type-check
# Manual:
#   - Open dashboard → stat strips show tabular numbers
#   - Open invoice detail → LetterPaper shell renders
#   - Print test (above)
```

---

### Commit 8 — Feature sweep + DataTable audit + final verification

**Goal:** Sweep the **269 unique TSX files** for the 8 violation patterns. Audit DataTable. Final zero-violation greps. Accessibility pass.

**Sweep patterns (mostly mechanical):**

| Pattern | Replacement |
|---|---|
| `bg-amber-500/10`, `bg-yellow-500/10` (warning tints) | `bg-warn/10` |
| `text-amber-*`, `text-yellow-*` | `text-warn` |
| `text-red-[0-9]+` | `text-neg` |
| `bg-red-[0-9]+/N` | `bg-neg/N` |
| `text-green-*` | `text-pos` |
| `bg-green-*/N` | `bg-pos/N` |
| `rounded-xl` (216 sites) | `rounded-r-md` |
| `rounded-2xl` (90 sites) | `rounded-r-md` (DS treats both as the same radius) |
| `rounded-3xl` (50 sites) | `rounded-r-lg` |
| `rounded-full` on non-pill elements (100 sites) | `rounded-r-xs` — **audit each, pills/avatars keep `rounded-full`** |
| `font-display` (9 remaining sites) | `font-serif` |
| `shadow-lg/xl/2xl/glass` (45 sites) | `shadow-1` / `shadow-2` / `shadow-3` by visual intent |
| `bg-surface-app/sidebar/header/page/section/popover/modal` | `bg-paper` / `bg-paper-2` / `bg-card` (by semantic) |
| `bg-card` (default), `border-card-border` | `bg-card`, `border-rule` (Tailwind utility already exists from Commit 1) |
| `text-text-primary/secondary/muted/disabled` | `text-ink` / `text-ink-2` / `text-dim` / `text-dim-2` |
| `border-line-subtle/strong/utility` | `border-rule` (single DS rule color) |
| `bg-accent-N` / `text-accent-N` / `border-accent-N` / `ring-accent-N` | `bg-accent` / `text-accent` (or `-deep` for the 600+ shades) — alpha utilities work via DS Tailwind layer (`bg-accent/20` etc.) |

**Top offender files** (from explore audit, focus here first):
- `src/pages/DebugStylesPage.tsx` (36 rounded-xl) — debug-only, safe to clean for QA clarity
- `src/shared/ui/input/MarkdownUploadTextarea.tsx` (14 rounded-xl, 17 accent-N)
- `src/pages/PracticeHomePage.tsx` (8 rounded-xl, 13 rounded-3xl)
- `src/pages/DebugDialogsPage.tsx` (8 rounded-xl)
- `src/features/intake/pages/IntakeTemplatesPage.tsx` (24 shadow-*, 6 accent-N)
- `src/features/engagements/pages/EngagementDetailPage.tsx` (12 shadow-*, 7 accent-N)
- `src/features/reports/pages/reports/DeliveryDetailView.tsx` (10 rounded-xl, accent-N)
- `src/features/matters/components/MatterDetailsPanel.tsx` (5 rounded-xl, 5 accent-N)
- `src/shared/ui/nav/Sidebar.tsx` — deleted in Commit 5; sweep is moot
- `src/shared/ui/nav/NavRail.tsx` — deleted in Commit 5; sweep is moot

**DataTable audit** (60 call sites in `src/shared/ui/table/DataTable.tsx` consumers):
- DS spec uses CSS grid except for invoice line items where `<table>` is semantic.
- Per call site, decide: keep `<table>` (invoice line items, anything with rowspan/colspan) or convert to grid (most data displays).
- DataTable.tsx itself currently uses `<table>` — keep its API stable, restyle if needed.

**Final verification (must reach 0):**
```powershell
rg "\.dark\b|classList\.(add|remove|toggle|contains)\(['""]dark['""]" src index.html
rg "--surface-|--border-subtle|--nav-surface|shadow-glass|glass-card|glass-panel|glass-input" src
rg "bg-accent-[0-9]|text-accent-[0-9]|border-accent-[0-9]|ring-accent-[0-9]" src
rg "rounded-xl|rounded-2xl|bg-amber|text-amber|bg-yellow|text-yellow|text-red-[0-9]|bg-red-[0-9]" src --type tsx
rg "font-display|\bInter\b|\bOutfit\b" src index.html tailwind.config.js
rg "accentColors|applyAccentColor|initializeAccentColor" src tests
```

All six must return zero matches.

**Accessibility pass:**
- `prefers-reduced-motion` test — open with motion-reduce enabled in DevTools, confirm `rise`/`pulse` keyframes are disabled.
- AA contrast spot check on key surfaces: AI summary cards, staged actions, page headers.
- Focus rings: every focusable element shows `box-shadow: 0 0 0 3px var(--accent-soft)` ring.

**Update this doc** with final post-sweep counts.

**Risk callouts:**
- `lint:bundle-baseline` may fail with the cumulative CSS reduction. Recalibrate the baseline.
- `font-display` deletion → fall back to default sans. Ensure `font-serif` swap happens for headings (otherwise serif headings render as sans).

---

## Useful Audit Data (already gathered, do not re-run)

### Nav structure (Commit 5)
- 4 files / 1564 lines total to delete.
- Mobile bottom bar shares the same item list as desktop nav via `NavRail variant="bottom"`. LeftRail mobile variant must mirror this.
- `OrgSwitcherMenu` + `SidebarProfileMenu` live outside the rail (in shells' `brandMark` + `footer` slots).
- `localStorage['blawby:sidebar:collapsed']` — dropped per DS spec (240px fixed width). Mobile bottom bar handles narrow viewports.

### Chat / IOLTA (Commit 6)
- Backend approval contract is stable and idempotent (state machine + 409). Frontend safety bar is "disable button while pending + no auto-execute".
- No existing chat-approval tests. Manual smoke is the bar.
- `ChatActionCard` already migrated to `data-theme` (Commit 2). The Stripe Elements integration works through theme switches.

### Feature sweep (Commit 8)
- 269 unique TSX files across 8 violation patterns.
- 488 semantic token references (`bg-surface-*`, `text-text-*`, `border-line-*`) — the hardest lift. Requires understanding the semantic intent of each site to pick `paper` vs `paper-2` vs `card` vs `ink` etc.
- 306 `rounded-xl/2xl` instances — mostly mechanical `→ rounded-r-md`.
- 184 `bg-accent-N` / `text-accent-N` etc. — mechanical, but `bg-accent-500/20` (alpha) → `bg-accent/20` (works via DS Tailwind layer).

### Plan agent stress-test findings already integrated
- Tailwind 3.4.18 verified for `darkMode: ['selector', ...]`.
- Google Fonts Geist verified live (served from `fonts.gstatic.com`).
- `prefers-color-scheme` retained (decision locked, see Compromises §1).
- Sidebar collapse dropped (decision locked, see Compromises §5).
- `localStorage.theme` contract preserved (decision locked, see Compromises §2).

---

## Gotchas the Next Session Should Know

1. **Edit tool requires Read first.** `Grep` output does NOT count as a "Read". When you see `File has not been read yet`, call `Read` on the file (even just a range) before retrying the `Edit`.
2. **Use `replace_all: true` for mass renames** (e.g., `text-input-text` → `text-ink`). Single-occurrence Edits need unique `old_string` context.
3. **`sed -i` works via Bash on Windows (Git Bash GNU sed).** Useful for deleting line ranges in large files. Don't use PowerShell `Set-Content` — it adds a BOM that confuses Vite/PostCSS in some setups.
4. **HEREDOC for git commit messages** — see CLAUDE.md. Multi-paragraph commit messages MUST use `git commit -m "$(cat <<'EOF' ... EOF)"`.
5. **`npm run lint:src` config:** `--max-warnings 0`. So a single warning fails the gate. Be careful with unused vars after deleting useEffects.
6. **`vitest` needs the project config** — `npx vitest run tests/component/foo.test.tsx` alone fails with `document is not defined`. Use `npx vitest run -c config/vitest/vitest.config.ts --project component tests/...`.
7. **Branch + PR workflow:** push to `origin` (the fork at `TheDarkSkyXD/blawby-ai-chatbot`), open PR against `upstream/staging` (the canonical `Blawby/blawby-ai-chatbot`). `gh pr create` defaults to upstream/staging when on a fork.
8. **PowerShell + curl JSON gotcha** — per memory: never use `curl.exe --data-raw $var` for JSON on Windows PS 5.1. Use `--data-binary "@file"` or `Invoke-RestMethod`.
9. **Local dev:** per memory, `npm run dev:full` (vite + worker:8787 + tunnel). Staging backend only; no local backend mode. `/api/*` 500 with empty body usually means the worker is down, not a code bug.
10. **Don't sweep `.dark` Tailwind utilities in TSX.** They keep working via the `darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])']` config. Removing them is a separate concern (not in this migration's scope).
11. **PR sequencing decision is deferred to the next session.** Options:
    - One mega-PR — append commits 4–8 to this branch, request review of all 8 at once.
    - 1-per-commit PRs — each commit ships independently. Slower but more reviewable.
    - 2 PRs total — this one (foundation, 1–3), then a second PR for primitives+layout+chat+data+sweep (4–8).
    Default to **2-PR split** unless reviewer prefers otherwise. Each layer of work is roughly the same size as the foundation; merging them as one mega-PR makes review painful.

---

## File Locations Reference

- DS canonical tokens: `src/design-system/tokens.css`
- DS Tailwind utility surface: `tailwind.config.js`
- Brand color validator: `src/shared/utils/brandColor.ts`
- Tracking doc (this file): `docs/design-system-migration.md`
- Original audit: `redesign-files/REDESIGN.MD`
- Canonical DS component CSS reference: `redesign-files/Blawby-chatbot-refactor/tokens.css` (lines 146–310 cover `.btn`, `.chip`, `.pill`, `.card`, `.input`, `.toggle`, `.bar`, `.avatar`, `.brand-mark`, `.grain`)
- DS Design System spec: `redesign-files/Blawby-chatbot-refactor/DESIGN_SYSTEM.md`
