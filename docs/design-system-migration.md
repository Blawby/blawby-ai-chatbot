# Design System Migration — Tracking Doc

Living tracking document for the chat-first redesign of the Blawby frontend. Foundation + primitives + layout primitives have landed; what remains is shell rewiring and feature-screen rebuilds against the new 21-screen chat-first vision.

**Source of truth:**
- `design_handoff_blawby_chat_first/` — 21 hi-fi HTML screens + DESIGN_SYSTEM.md + PRODUCT.md + tokens.css
- `src/design-system/tokens.css` — runtime tokens (identical to the handoff's `tokens.css`)
- This doc — what we've shipped, what's next, what's locked

---

## North star (LOCKED)

From `design_handoff_blawby_chat_first/DESIGN_SYSTEM.md §0`:

1. **Chat is the home, not a feature.** Default entry point is a conversation with the assistant. Lists, tables, and forms are surfaces the assistant opens — not destinations users navigate to.
2. **Every AI write is staged.** Assistant proposes; human approves. Writes go through a `staged-action` UI before they hit the database. IOLTA-relevant; non-negotiable.
3. **One accent. Used sparingly.** Gold is punctuation — the urgent feature card, the primary action, the "I noticed" left-border. If three things on a screen are gold, two are wrong.

---

## Where We Are

| Commit | SHA | Status | What landed |
|---|---|---|---|
| 1 — Foundation | `b03558c4` | ✅ merged | Tokens, fonts, Tailwind config, `src/index.css` surgical rewrite, glass aliases removed |
| 2 — Theme mechanism | `e5f409b0` | ✅ merged | `.dark` class → `data-theme` attribute (7 sites + boot script + DebugDialogsPage) |
| 3 — accentColors removal | `6876d6ed` | ✅ merged | `brandColor.ts` (pure validator), 9 importers updated, AudioRecordingUI uses `--accent-rgb` |
| 4a — DS primitives (additive) | `a01d5a2a` | ✅ merged | `src/design-system/primitives/` — Label, Pill, Chip, Bar, Card + matching CSS |
| 4b — DS CSS rewrites | `95dd97c7` | ✅ merged | `.btn-*` to 2px DS spec; `.card-*` / `.input-surface` / `.status-*` rewritten to valid DS tokens; deleted `.btn-inverted` |
| 4c — Primitive refactors + sweep | `c6212140` | ✅ merged | Button (new `accent` variant) / Input / Textarea / Switch / Alert / Avatar (`kind` prop) / Dialog; swept 5 StatusBadge callers → `<Pill>` |
| 4d — Dead primitive deletions | `85d708be` | ✅ merged | Deleted Tag/TagInput, RoleBadge, StatusBadge, OnboardingStatusBadge, ProgressBar (1366 lines net delete) |
| 5a — Layout primitives (additive) | `3976faad` | ✅ merged | `src/design-system/layout/` — BrandMark, LeftRail, FocusDrawer, SplitDetail + matching CSS (789 lines added) |
| 5b — PageHeader rewrite | `f5a31630` | ✅ merged | DS within-page heading: mono crumb + Source Serif H1 + lede + rule |
| 5c.1 — Design handoff sync + locked answers | `d71e1a23` | ✅ in PR #646 | Added `design_handoff_blawby_chat_first/` (21 screens, DESIGN_SYSTEM.md, PRODUCT.md, tokens.css); removed superseded older folder; refreshed this migration doc |
| 5c.2 — FocusDrawer generalize + Drawer delete | `af88f4de` | ✅ in PR #646 | FocusDrawer `position: left/right/bottom`; matching slide-in keyframes; deleted unused Drawer.tsx (zero callers) |
| 5c.3 — AccentHeroSurface inline + delete | `4a4008b4` | ✅ in PR #646 | Inlined DS-tokenized gradient at PracticeContactsPage 2 sites; deleted primitive + barrel exports |
| 5c.4 — InvoiceInspector extract | `83598c73` | ✅ in PR #646 | First of the per-feature inspector splits; pure data display; pattern proven |
| 5d.1 — Inspector data hooks | `ddbf98b1` | ✅ in PR #647 | `useUserDetail` / `useMatterDetail` / `usePracticeDetail` extracted to `src/shared/hooks/`. Exported `UpdateUserDetailPayload` from apiClient. |
| 5d.2 — InspectorPanel hook refactor | `fe6d88d3` | ✅ in PR #647 | Replaced 115-line inline fetch useEffect + 3 cache refs with hook calls. Net −109 lines. Module-level cache namespaced by `practiceId:userId`. |
| 5d.3 — ClientInspector extract | `e02cf663` | ✅ in PR #647 | `src/features/clients/components/ClientInspector.tsx` (283 lines) consumes useUserDetail, owns its editor state + archive dialog. InspectorPanel −232 lines. |
| 5d.4a — identityHelpers extract | `5a396373` | ✅ in PR #648 | Shared `inspector/identityHelpers.tsx` (102 lines): InspectorIdentity type + resolveAttorneyLabel + resolveAttorneyIdentity + renderCompactIdentity + renderIdentityStack. InspectorPanel −65 lines. |
| 5d.4b — MatterInspector extract | `0d4eefab` | ✅ in PR #648 | `src/features/matters/components/MatterInspector.tsx` (717 lines) consumes useMatterDetail + identityHelpers. Owns full matter editor state, ~14 resolvedMatter fields, status/patch handlers, matterStatusOptions/urgencyOptions/matterTeamIdentities memos. InspectorPanel −628 lines. |
| 5d.5 — ConversationInspector extract | — | **pending — PR-6 scope** | ~500-line block (largest, most coupling); consumes useUserDetail + useMatterDetail + usePracticeDetail; intake editor state; reuses identity helpers from 5d.4a |
| 5d.6 — Delete InspectorPanel dispatcher | — | **pending — PR-6 scope** | After 5d.5, 4 callers dispatch directly |
| 5e — Shell refactor | — | **pending — PR-6+ scope** | Drop AppShell sidebar props; refactor WorkspacePage/PracticeHomePage/ClientHomePage/WidgetApp to LeftRail; extract ConversationListPanel (340px column per Conversations spec); delete legacy nav + 4 test files |
| 6 — Chat patterns | — | pending | AISummary, StagedAction, Citations, Observation, Composer, ToolUseLine, BriefingGrid, MatterChip; IOLTA manual smoke |
| 7 — Data display | — | pending | StatStrip, JourneyProgress, LetterPaper, Seg; print test |
| 8 — Feature sweep | — | pending | TSX feature-files swept for the 8 violation patterns; DataTable audit; AA contrast spot; `prefers-reduced-motion` check; final delete of `.status-*` / `.input-surface` / `.card-surface` aliases |

PR series: #644 (foundation, merged) → #645 (Commit 4 + 5a + 5b, merged) → #646 (5c.1–5c.4, merged) → #647 (5d.1–5d.3, merged) → **#648 (this PR — 5d.4a + 5d.4b)** → PR-6 (5d.5 + 5d.6 + 5e).

---

## Locked decisions (do not re-debate)

### From the foundation phase

- **Single mega-PR not viable in one session.** Ship in coherent layers; each PR keeps the build green.
- **No bridge tokens. No backward-compat shims.** Every commit updates source AND every consumer.
- **`src/design-system/tokens.css`** is the single runtime source of truth. Hex/oklch canonical AND `*-rgb` triplets for Tailwind utility consumption. Identical to `design_handoff_blawby_chat_first/tokens.css`.
- **Tailwind utility surface:** `paper/paper-2/paper-edge/card`, `ink/ink-2/ink-3/dim/dim-2`, `rule`, `accent/accent-deep/accent-ink`, `pos/warn/neg`. Plus `shadow-1/2/3` and `rounded-r-xs/sm/md/lg`. **No surface-*, input-*, text-*, line-*, primary-*, accent numeric scale, font-display.**

### Accepted compromises

1. **`prefers-color-scheme` retained.** REDESIGN.md L870 said remove; `GeneralPage.tsx` and `SidebarProfileMenu.tsx` both expose a "System" theme option that depends on it.
2. **`localStorage.theme` keeps `'dark'/'light'/'system'` strings.** Apply layer maps `'dark'` → `dataset.theme = 'midnight'`. Existing user state survives the deploy.
3. **Dark-mode toggle UI preserved** per REDESIGN.md L567. DS spec said no toggle, but product UX requires it.
4. **Per-practice brand-color picker UI preserved in settings.** Just no longer applies CSS at runtime. API contract unchanged. (Product decision flagged.)
5. **Sidebar collapse toggle dropped** in 5c (LeftRail is 240px fixed). Below `lg:` breakpoint, mobile bottom bar takes over.
6. **Manual smoke only for IOLTA staged-action gate** in Commit 6. Backend enforces idempotency (HTTP 409) + audit + role gate.

### 5c open-item decisions (resolved 2026-05-28)

These were the six questions flagged at the end of the previous session. User answers locked:

1. **InspectorPanel (2005L, 4 callers):** split into per-feature inspectors. `MatterInspector`, `ClientInspector`, `InvoiceInspector`, `ConversationInspector` move into their respective feature folders. The 2005L surface gets distributed by domain owner.
2. **Drawer (4 callers in files/chat):** generalize `FocusDrawer` to support `position: 'left' | 'right' | 'bottom'`. After generalization, Drawer's 4 callers migrate, then Drawer is deleted.
3. **AccentHeroSurface (1 caller):** inline at PracticeContactsPage, delete the primitive.
4. **AppShell sidebar contract:** drop the `sidebar`/`desktopSidebarCollapsed`/`mobileSidebar`/`mobileSidebarOpen`/`onMobileSidebarClose` props. Shells own LeftRail composition directly. AppShell becomes a thin layout wrapper or disappears.
5. **Assistant conversation panel relocation:** follow the design system. Per `Conversations.html`, this is its own 340px column in a 4-column layout (`240px rail | 340px thread list | 1fr active | 400px focus`). Extract from PracticeSidebar into a standalone `ConversationListPanel` rendered between LeftRail and the main view.
6. **Test files referencing deleted components:** delete. `tests/component/nav-rail.test.tsx`, `tests/component/widget-app.test.tsx`, `tests/component/app-shell.test.tsx`, `src/features/invoices/pages/__tests__/InvoicesPages.test.tsx` (NavRail import) — remove and re-add later if equivalents emerge after the rebuild.

### Authoring guidance

- **Don't auto-execute AI actions. Ever.** Staged actions are the law.
- **Don't introduce gradients beyond the four already in the system** (status card top band, AI summary card, staged action card, peer benchmark dark card).
- **No gradient text, colored shadows, glassmorphism.**
- **No icons in headings.** Typography carries weight alone.
- **No `<table>` for layout** — CSS grid for tabular data (except invoice line items, which is semantically a table).

---

## Screen inventory (21)

Cross-reference between the design handoff and the existing app. "Status" tracks how close the existing route is to the new design.

| # | Screen | Existing route(s) | Status |
|---|---|---|---|
| 1 | `Assistant.html` | `/` (Workspace assistant section) | Heavy rework needed — chat-first home with greeting, briefing grid, focus drawer |
| 2 | `Onboarding.html` | `/onboarding/*` | Existing route; 6-step conversational redesign needed |
| 3 | `Settings.html` | `/settings/*` | Existing route; visual refresh + AI preamble + system prompt editor |
| 4 | `Matters.html` | `/practice/:slug/matters` | List exists; needs ask-bar + AI answer card + kanban toggle |
| 5 | `Matter.html` | `/practice/:slug/matters/:id` | Detail exists; needs stat strip + tabs + AI summary + staged invoice action |
| 6 | `Trust.html` | New | Doesn't exist yet — needs build |
| 7 | `Engagement.html` | `/practice/:slug/engagements/:id` | Exists; needs split form/letter preview + AI placeholder rendering |
| 8 | `Invoices.html` | `/practice/:slug/invoices` | Exists; needs split list+detail layout per `SplitDetail` |
| 9 | `Intakes.html` | `/practice/:slug/intakes` | Exists; needs AI verdict card + scorecard + pre-flight checks |
| 10 | `ClientPortal.html` | `/client/:slug/*` | Partial exists; needs journey progress + status card + retainer balance |
| 11 | `Reports.html` | New | Doesn't exist yet — needs build |
| 12 | `Intake.html` | `/p/:practiceSlug` (public) | Exists; needs visual refresh to chat-first pill composer + in-chat pay card |
| 13 | `Conversations.html` | New (4-column shell) | Doesn't exist; this is the central chat-first surface, drives the assistant panel relocation in 5c |
| 14 | `Clients.html` | `/practice/:slug/clients` | Exists (PracticeContactsPage); needs ask-bar + sentiment chips + directory table |
| 15 | `Calendar.html` | New | Doesn't exist — needs build |
| 16 | `Tasks.html` | New | Doesn't exist — needs build |
| 17 | `EngagementReview.html` | Client-facing engagement accept | Partial; needs centered branded layout + signature canvas refinement |
| 18 | `IntakeBuilder.html` | `/practice/:slug/settings/intake-templates/*` | Exists (Question Builder); needs settings shell + AI authoring strip |
| 19 | `EngagementTemplates.html` | `/practice/:slug/settings/engagement-templates` | Exists; needs library grid + AI strip + template cards |
| 20 | `Mobile.html` (intake) | Public intake on mobile | Exists; visual refresh |
| 21 | `Mobile.html` (portal) | Client portal on mobile | Exists; visual refresh |

**Implication:** the 8-commit roadmap that lived in earlier versions of this doc was sized against 12 screens. With 21 screens, Commits 6–8 will themselves span multiple PRs.

---

## PR #646 (this PR) — landed checklist

- [x] Add `design_handoff_blawby_chat_first/` (21 screens + DESIGN_SYSTEM.md + PRODUCT.md + tokens.css) as the new source of truth — `d71e1a23`
- [x] Refresh this doc with the chat-first thesis, 6 locked answers, 21-screen inventory, refreshed roadmap — `d71e1a23`
- [x] Audit + remove superseded `redesign-files/Blawby-chatbot-refactor/` — `d71e1a23`
- [x] Generalize `FocusDrawer` to support `position: 'left' | 'right' | 'bottom'` — `af88f4de`
- [x] Delete `Drawer.tsx` + overlays barrel export (verified zero callers; previous "4 callers" grep was false positives — local vars + `FileDetailDrawer` is a separate feature component) — `af88f4de`
- [x] Inline `AccentHeroSurface`'s gradient at PracticeContactsPage (2 sites) + delete primitive — `4a4008b4`
- [x] Extract `InvoiceInspector` to `src/features/invoices/components/InvoiceInspector.tsx` (first per-feature inspector split; pattern proven) — `83598c73`

### Baseline (preserved at every sub-commit)
- ✅ `npm run build` — passes
- ⚠️ `npm run lint:src` — 1 pre-existing error (`OAuthConsentPage.tsx:187` visible loading text; arrived in staging from a separate PR, not from this work)
- ✅ `npm run type-check` — 0 errors (the 4 WorkspacePage TS errors that lived in earlier sessions were cleared in staging upstream)

---

## PR #647 (this PR) — landed checklist

- [x] Extract `useUserDetail(practiceId, userId, { enabled })` hook — `ddbf98b1`
- [x] Extract `useMatterDetail(practiceId, matterId, { enabled })` hook — `ddbf98b1`
- [x] Extract `usePracticeDetail(practiceId, { enabled, fallback })` hook — `ddbf98b1`
- [x] Refactor InspectorPanel's data-fetching useEffect to use the three hooks (−109 lines) — `fe6d88d3`
- [x] Extract `ClientInspector` to `src/features/clients/components/ClientInspector.tsx` (consumes useUserDetail; owns address editor state + archive flow) — `e02cf663`

---

## PR #648 (this PR) — landed checklist

- [x] Extract shared `inspector/identityHelpers.tsx` — `5a396373`
- [x] Extract `MatterInspector` to `src/features/matters/components/MatterInspector.tsx` — `0d4eefab`

InspectorPanel is now ~1000 lines (down from ~1925 at start of session). All matter-specific state/memos/helpers are gone from the dispatcher.

---

## PR-6 scope — `feat/ds-migration-pt6` (next session)

The remaining inspector split (5d.5 + 5d.6) + the shell refactor (5e).

### 5d.5 — Extract ConversationInspector (biggest single block in the migration)

Genuinely substantial. The conversation render is ~500 lines (L448-957 in current InspectorPanel) and entangles with:

- **3 data hooks**: `useUserDetail` + `useMatterDetail` + `usePracticeDetail` (conversation shows client info + linked matter + practice context, often simultaneously)
- **3 sub-paths**: PRACTICE_ONBOARDING (renders `<SetupInspectorContent>`), `isClientView` (read-only branded hero + intake status + consultation details), regular (full editor with assignment / priority / tags / matter / intake fields)
- **State**: `activeConversationEditor` (14-position discriminator including intake sub-editors), `isSavingAssignment` / `isSavingPriority` / `isSavingTags` / `isSavingMatter`, `localIntakeDraft`, `skipBlurRef`
- **Memos**: `priorityOptions`, `assignedToOptions`, `currentTags`, `tagOptions`, `matterOptions`, `intakeServiceOptions`, `assignedMemberLabel`, `assignedConversationMember`, `currentMatterLabel`, `currentPriorityLabel`, `currentTagsLabel`, `conversationPeople`
- **Handlers**: `handleConversationAssignmentChange`, `handleConversationPriorityChange`, `handleConversationTagsChange`, `handleConversationMatterChange`, `handleIntakeFieldChange`
- **Imports it pulls in**: `SetupInspectorContent`, `InspectorHeaderHero` + the existing primitives, intake strength resolvers (`resolveStrengthTier` etc.), `STATE_OPTIONS` for the state combobox, `updateConversationMatter` from apiClient

**Recommended approach for 5d.5**: do it as a single focused PR-6 session. The pattern from 5d.4b (MatterInspector) applies — extract the JSX + state + handlers wholesale, then iteratively clean up the lint-flagged unused vars in the InspectorPanel dispatcher. Allocate ~90 min for the initial extract + ~30 min for the cleanup pass.

### 5d.6 — Delete InspectorPanel dispatcher

After 5d.5 lands, the dispatcher is just a thin switch. Better to delete it and have the 4 callers dispatch directly:

- [ ] Update `WorkspacePage.tsx` — switch on `inspectorTarget.entityType` to render the right per-feature inspector
- [ ] Update `WidgetApp.tsx`
- [ ] Update `DebugDialogsPage.tsx`
- [ ] Update `WorkspaceSetupSection.tsx`
- [ ] Delete `src/shared/ui/inspector/InspectorPanel.tsx`

### 5e — Shell refactor

Per locked answer #4 (drop AppShell sidebar props) and #5 (assistant conversation panel follows Conversations 4-column spec).

- [ ] Drop AppShell's `sidebar` / `desktopSidebarCollapsed` / `mobileSidebar` / `mobileSidebarOpen` / `onMobileSidebarClose` props
- [ ] Refactor `WorkspacePage.tsx` (1666L) to compose LeftRail directly + render assistant `ConversationListPanel` as adjacent 340px column when in chat/assistant section
- [ ] Refactor `PracticeHomePage.tsx` (554L) to compose LeftRail directly
- [ ] Refactor `ClientHomePage.tsx` (151L) to compose LeftRail directly
- [ ] Refactor `WidgetApp.tsx` (865L) to use LeftRail mobile variant
- [ ] Extract `ConversationListPanel` as the 340px thread-list column per `Conversations.html` 4-column layout
- [ ] Drop `isDesktopSidebarCollapsed` state + `'blawby:sidebar:collapsed'` localStorage key
- [ ] Delete:
  - `src/shared/ui/nav/NavRail.tsx`
  - `src/shared/ui/nav/Sidebar.tsx`
  - `src/shared/ui/nav/PracticeSidebar.tsx`
  - `src/shared/ui/nav/ClientSidebar.tsx`
  - `src/shared/ui/inspector/MobileInspectorOverlay.tsx`
  - `src/shared/ui/layout/WorkspaceShellHeader.tsx`
  - Dead CSS: `.nav-item-active`, `.nav-item-inactive`, `.workspace-header*`, `.sidebar-scroll`
- [ ] Delete 4 test files (locked answer #6):
  - `tests/component/nav-rail.test.tsx`
  - `tests/component/widget-app.test.tsx`
  - `tests/component/app-shell.test.tsx`
  - `src/features/invoices/pages/__tests__/InvoicesPages.test.tsx` (or just remove the NavRail import; verify what else the test covers)

### PR-4 verification gates
- [ ] Build green at every sub-commit
- [ ] Baseline lint: 1 pre-existing error (`OAuthConsentPage.tsx:187`) — unrelated to this work
- [ ] Baseline type-check: 0 errors
- [ ] `rg "NavRail|PracticeSidebar|ClientSidebar|InspectorPanel|MobileInspectorOverlay|WorkspaceShellHeader" src` → zero matches
- [ ] Manual smoke: desktop (1280×) + mobile (375×) viewports for each refactored shell
- [ ] Manual smoke: assistant conversation panel renders as 340px column when active

---

## Future PRs (roadmap)

Beyond this PR, in rough order:

### Commit 6 — Chat patterns (informed by Assistant, Conversations, Tasks, Calendar, Clients, Matters)
Build the AI surfaces in `src/design-system/patterns/`:
- `AISummary` — gold-tinted hero block (matter detail, intakes detail, matters list answer, reports exec summary)
- `StagedAction` — the IOLTA-critical approval gate
- `Citations` — `<table_name · row_count>` pill row beneath AI responses
- `Observation` — "I noticed" left-border accent strip
- `Composer` — sticky bottom input with context chips + tab strip (Reply / Internal note / Ask the assistant)
- `ToolUseLine` — mono dim `> used <code>tool_name</code> · 142ms`
- `BriefingGrid` — 2-col card grid with first card spanning both as gold-gradient `.feature`
- `MatterChip` — inline entity references with colored pins

Refactor `Message.tsx` / `MessageBubble.tsx` / `ChatMarkdown.tsx` to use these. IOLTA manual smoke checklist applies.

### Commit 7 — Data display (informed by Matter, Trust, Reports, ClientPortal)
- `StatStrip` — 5-cell horizontal with tabular numbers
- `JourneyProgress` — 5-step client portal indicator
- `LetterPaper` — print-safe document shell (invoices, engagement letters)
- `Seg` — segmented control (replaces `.segmented-toggle*` CSS family)
- Wire InvoicePreview into LetterPaper; print test

### Commit 8 — Feature sweep + final cleanup
- Sweep TSX feature-files for the violation patterns (`rounded-xl`, `bg-accent-N`, `font-display`, `text-input-*`, `bg-surface-*`, etc.)
- DataTable audit (60 call sites): keep `<table>` only for invoice line items, convert rest to CSS grid
- Final zero-violation grep gates
- Delete `.status-*` / `.input-surface` / `.card-surface` aliases (after their last callers move to DS primitives)
- AA contrast spot checks on key surfaces
- `prefers-reduced-motion` verification

### Net-new screens (separate PRs)
- `Trust.html` — IOLTA ledger surface
- `Reports.html` — AI-narrated monthly review
- `Calendar.html` — deadlines + schedule
- `Tasks.html` — prioritized to-do
- `Conversations.html` — 4-column chat-first inbox (the central thesis surface)

---

## Pre-existing errors (NOT from this work)

Current baseline on `staging` HEAD.

**Lint (1 error):**
- `src/pages/OAuthConsentPage.tsx:187` — `Visible loading text is not allowed. Use LoadingSpinner, LoadingBlock, LoadingScreen, or SkeletonLoader instead` (rule: `custom/loading-consistency`). Arrived from an unrelated PR merged to staging between PR #645 and PR #646; not from the DS migration work.

**Type-check:** 0 errors. The 4 WorkspacePage.tsx contactName/contactEmail TS errors that lived in earlier sessions were cleared upstream.

---

## Gotchas the next session should know

1. **Edit tool requires Read first.** `Grep` output does NOT count as a "Read". When you see `File has not been read yet`, call `Read` on the file (even just a range) before retrying the `Edit`.
2. **Use `replace_all: true` for mass renames** (e.g., `text-input-text` → `text-ink`). Single-occurrence Edits need unique `old_string` context.
3. **`sed -i` works via Bash on Windows (Git Bash GNU sed).** Useful for deleting line ranges in large files. Don't use PowerShell `Set-Content` — it adds a BOM that confuses Vite/PostCSS.
4. **HEREDOC for git commit messages** — see CLAUDE.md. Multi-paragraph commit messages MUST use `git commit -m "$(cat <<'EOF' ... EOF)"`.
5. **`npm run lint:src` config:** `--max-warnings 0`. A single warning fails the gate. Watch unused vars after deleting useEffects.
6. **`vitest` needs the project config** — `npx vitest run tests/component/foo.test.tsx` alone fails with `document is not defined`. Use `npx vitest run -c config/vitest/vitest.config.ts --project component tests/...`.
7. **Branch + PR workflow:** push to `origin` (the fork at `TheDarkSkyXD/blawby-ai-chatbot`), open PR against `upstream/staging` (the canonical `Blawby/blawby-ai-chatbot`). `gh pr create` defaults to upstream/staging when on a fork.
8. **PowerShell + curl JSON gotcha** — never use `curl.exe --data-raw $var` for JSON on Windows PS 5.1. Use `--data-binary "@file"` or `Invoke-RestMethod`.
9. **Local dev:** `npm run dev:full` (vite + worker:8787 + tunnel). Staging backend only; no local backend mode. `/api/*` 500 with empty body usually means the worker is down, not a code bug.
10. **Don't sweep `.dark` Tailwind utilities in TSX.** They keep working via the `darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])']` config. Removing them is a separate concern.
11. **`practice_assistant_actions` is the lynchpin for IOLTA.** Every AI-proposed write — invoice, status change, reminder, replenishment, engagement draft — is a row here, in state `pending`. Approval flips it to `accepted` and runs the actual mutation in a transaction. Frontend `StagedAction` component MUST disable buttons while pending and never auto-execute.

---

## File locations reference

- DS canonical tokens (runtime): `src/design-system/tokens.css`
- DS primitives (Commit 4): `src/design-system/primitives/`
- DS layout (Commit 5a): `src/design-system/layout/`
- DS Tailwind utility surface: `tailwind.config.js`
- Brand color validator: `src/shared/utils/brandColor.ts`
- Tracking doc (this file): `docs/design-system-migration.md`
- Original audit: `redesign-files/REDESIGN.MD` (historical)
- **Current design source of truth: `design_handoff_blawby_chat_first/`** — 21 hi-fi HTML screens, `DESIGN_SYSTEM.md` (component/pattern contract), `PRODUCT.md` (product overview + user journeys + feature inventory), `tokens.css` (CSS variables, identical to `src/design-system/tokens.css`), `screens/Design System.html` (visual showcase)

---

## Session checklist (resume — PR-6 starts here)

```powershell
git fetch upstream
git checkout staging
git pull upstream staging --ff-only
git checkout -b feat/ds-migration-pt6
npm install                                       # if dependencies changed
npm run build                                     # must pass
npm run lint:src                                  # baseline: 1 pre-existing OAuthConsentPage error
npm run type-check                                # baseline: 0 errors
```

Open `design_handoff_blawby_chat_first/screens/index.html` in a browser for the 21-screen hub, and `design_handoff_blawby_chat_first/screens/Conversations.html` for the canonical 4-column chat-first surface that drives the assistant panel relocation in 5e. Then start at "PR-6 scope" above.

### Suggested PR-6 sub-commit cadence

1. `5d.5` — Extract `ConversationInspector` to `features/chat/components/`; consume identity helpers + all 3 data hooks. (~90-120 min — ~500 line block with 3 sub-paths)
2. `5d.6` — Delete `InspectorPanel.tsx` dispatcher; 4 callers dispatch directly. (~30 min)
3. `5e.1` — Drop AppShell sidebar props (assess what each shell still needs)
4. `5e.2` — Refactor `ClientHomePage` (smallest shell, lowest risk; establishes pattern)
5. `5e.3` — Refactor `PracticeHomePage`
6. `5e.4` — Refactor `WidgetApp`
7. `5e.5` — Refactor `WorkspacePage` (largest, riskiest; do last with established patterns)
8. `5e.6` — Extract `ConversationListPanel` for the 340px Conversations column
9. `5e.7` — Delete legacy nav files + dead CSS + 4 test files (final cleanup)

Each is independently green; each is a small reviewable diff. 5d.5 + 5d.6 fit in one session; 5e likely needs its own focused session given WorkspacePage's 1666 lines.
