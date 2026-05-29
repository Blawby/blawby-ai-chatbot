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
| 5d.5 — ConversationInspector extract | `d884f792` | ✅ in PR #649 | `src/features/chat/components/ConversationInspector.tsx` (727 lines) — last per-feature inspector. Consumes useUserDetail + useMatterDetail + usePracticeDetail. Owns 3 sub-paths (PRACTICE_ONBOARDING / isClientView / regular), 14-position editor discriminator, intake field handlers. **InspectorPanel −797 lines (1004 → 243).** All per-feature inspector logic now lives in features/*. |
| 5d.6 — Delete InspectorPanel dispatcher | — | **deferred — see note** | InspectorPanel is now a genuinely thin 243-line facade (type defs + chrome + 4-branch dispatch). Deleting it requires extracting chrome + updating 4 callers (1 of which has dynamic entityType requiring a switch). The dispatcher provides real value as a single entry point with unified prop API. **Recommended: keep as facade unless 5e shell refactor wants the inspector chrome moved closer to the shell.** Revisit when shell work makes the call site obvious. |
| 5e.2 — ClientHomePage to LeftRail | `8246f45c` | ✅ in PR #650 | First shell migrated. Establishes the pattern: build LeftRailItem[] from getXxxNavConfig().rail; LeftRail + main flex composition; drop AppShell entirely for shells that don't need its multi-column grid. |
| 5e.3 — PracticeHomePage to LeftRail | `b221d125` | ✅ in PR #650 | Same pattern + merges live sidebarCounts into items.badge; OrgSwitcherMenu in brandMark slot. |
| 5e.4 — WidgetApp to LeftRail mobile + FocusDrawer | `eda94046` | ✅ in PR #650 | NavRail → LeftRail mobile variant; MobileInspectorOverlay → FocusDrawer; hidden prop pattern → conditional render. |
| 5e.5 — WorkspacePage refactor | `df70062c` | ✅ in PR #651 | Final shell migrated. WorkspacePage net −111 lines. Drops isDesktopSidebarCollapsed + localStorage + isMobileNavOpen + WorkspaceShellHeader. Composes LeftRail outside AppShell. AssistantListPanel still feeds AppShell.listPanel; formalization as standalone ConversationListPanel deferred to a smaller follow-up. |
| 5e.1 — Drop AppShell sidebar props | `27156831` | ✅ in PR #651 | All 6 sidebar props gone from AppShell. Grid simplified. AppShell net 247L → 173L. Deleted broken app-shell.test.tsx (locked answer #6). |
| 5e.7 — Delete legacy nav + tests | `51bcea43` | ✅ in PR #651 | Deleted NavRail, PracticeSidebar, ClientSidebar, MobileInspectorOverlay, WorkspaceShellHeader (~1041 lines) + 3 remaining nav-shell test files. AppShell's mobile inspector overlay swapped from MobileInspectorOverlay → FocusDrawer. Sidebar.tsx kept alive (still hosts Sidebar.Org + Sidebar.UserRow primitives that OrgSwitcherMenu + SidebarProfileMenu consume). |
| 5e.6 — Extract ConversationListPanel | — | **deferred** | The assistant conversations already render via assistantListPanel → AppShell.listPanel. Formalizing as a standalone `ConversationListPanel` (per Conversations.html 340px column spec) is now a small focused cleanup that can ride a follow-up PR. |
| 6a — Chat-pattern CSS | `8892ce65` | ✅ in PR #652 | Added 324 lines of CSS to src/index.css @layer components for the 8 patterns. Naming follows kebab-case-only convention (`.ai-summary-label`, not BEM `__`). All classes use the token vocabulary already in tokens.css. |
| 6b — Chat-pattern React primitives | `faa0f662` | ✅ in PR #652 | `src/design-system/patterns/` — AISummary, StagedAction, Citations, Observation, ToolUseLine, MatterChip, BriefingGrid (with `.Card` sub-component), Composer (tabs + context chips + multiline input + hint). Barrel `patterns/index.ts`. |
| 6c — Refactor Message/MessageBubble/ChatMarkdown | — | **deferred** | The 8 patterns are scaffolding for net-new chat-first surfaces (Assistant briefing, Reports exec summary, Matter-detail AI summary, IOLTA staged-action banners). The legacy bubble-based chat code has no clean 1:1 swap — MessageBubble is a styled wrapper, ChatMarkdown handles `@mention` users (not matters), and StagedAction wiring depends on the backend `practice_assistant_actions` API. Refactor lands as part of the consuming screen builds. |
| 7a — Data-display CSS | `919efd2c` | ✅ in PR #653 | 329 lines added to src/index.css @layer components. `.stat-strip` (+cells, label, value w/ `<small>`, extra, extra-warn), `.journey` (+line, line-fill, steps, step, step-mark, step-name, step-when with done/now status modifiers; mobile collapses to 3-col), `.letter-paper` (+ head, firm, addr, h1/h2 with top-hairline, date, intro, placeholder + placeholder-resolved, fee + fee-head, fee dl, fee-total; uses **fixed hex values** per spec for theme independence; @media print drops shadow/border), `.seg` (+ seg-on active modifier; coexists with existing `.segmented-toggle*`). |
| 7b — Data-display React primitives | `d348ab9a` | ✅ in PR #653 | `src/design-system/patterns/` — StatStrip (typed cells), JourneyProgress (auto-computed line-fill from last filled step; JSDoc note that it's client-portal only), LetterPaper (with `.Placeholder` + `.Fee` sub-components; Fee uses Fragment + key for dt/dd pairing), Seg (chat-first segmented control; lives alongside SegmentedToggle). Barrel updated. |
| 7c — InvoicePreview ↔ LetterPaper wiring + print test | — | **deferred** | Wiring InvoicePreview into LetterPaper requires understanding the current InvoicePreview surface + line-item rendering pipeline. Best done with the consuming surface refactor (Invoice detail rebuild against `design_handoff_blawby_chat_first/screens/Invoices.html`) rather than a forced swap here. Migration doc keeps this as a Commit 7 deliverable; primitives are ready when the consumer is. |
| 7d — Seg sweep (SegmentedToggle's 13 callers) | — | **deferred — Commit 8** | The new `Seg` is intentionally simpler than the current `SegmentedToggle` (no animated thumb). Not every call site wants the simpler look — some rely on the thumb animation as visual feedback. Moves into Commit 8 feature sweep where each caller can be inspected and the right primitive chosen per surface. |
| 8 — Feature sweep | — | **audited; split into 8.1–8.6 across PRs 12–19** | See `docs/design-system-commit-8-audit.md` for measured scope (2042 violations across ~280 files, 7 DataTable targets, 13 SegmentedToggle callers, ~93 alias callers) and the recommended PR ladder. Original "one PR" plan was unrealistic given actual size. |

PR series: #644 (foundation, merged) → #645 (Commit 4 + 5a + 5b, merged) → #646 (5c.1–5c.4, merged) → #647 (5d.1–5d.3, merged) → #648 (5d.4a + 5d.4b, merged) → #649 (5d.5, merged) → #650 (5e.2/3/4, merged) → #651 (5e.5 + 5e.1 + 5e.7, merged) → #652 (6a + 6b chat-pattern scaffolding, merged) → #653 (7a + 7b data-display scaffolding, merged) → **#654 (this PR — Commit 8 audit doc; no code changes).** Next: PRs 12–19 ladder per `docs/design-system-commit-8-audit.md`. Still deferred: 6c, 7c (land with consuming-screen rebuilds).

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

## PR #649 (this PR) — landed checklist

- [x] Extract `ConversationInspector` to `src/features/chat/components/ConversationInspector.tsx` (727 lines) — `d884f792`
  - Consumes useUserDetail + useMatterDetail + usePracticeDetail
  - Owns 3 sub-paths (PRACTICE_ONBOARDING / isClientView / regular)
  - 14-position activeConversationEditor discriminator + all intake editor handlers
  - Renders own loading skeleton + error banner
- [x] InspectorPanel cleanup: −797 lines (1004 → 243). All conversation state/memos/handlers gone; just type defs + chrome + dispatch left.

**InspectorPanel trajectory:** 2005L (session start) → 1925L (post-5c.4 invoice) → 1241L (post-5d.3 client) → 1004L (post-5d.4 matter) → **243L (post-5d.5 conversation)**. Net −1762 lines moved out into 4 per-feature inspector files.

---

## On 5d.6 — InspectorPanel deletion

The original plan called for deleting `InspectorPanel.tsx` and having the 4 callers (WorkspacePage / WidgetApp / DebugDialogsPage / WorkspaceSetupSection) dispatch directly to the per-feature inspectors.

After 5d.5 landed, the dispatcher is now a 243-line file containing:
- ~80 lines of prop type definitions (the unified `InspectorPanelProps` interface that callers depend on)
- ~20 lines of chrome (`<aside>` flex layout + header bar with title + close button)
- ~150 lines of 4-way dispatch (`{entityType === '...' ? <XInspector .../> : null}` × 4) with prop pass-through

Deleting this requires:
- Extracting an `InspectorChrome` wrapper component (or inlining the chrome at each caller)
- Updating 4 callers — 3 are trivial (hardcoded `entityType="conversation"` or `"invoice"`), 1 (WorkspacePage) is dynamic and needs a switch
- Each caller needs to know which props go to which per-feature inspector (currently the dispatcher handles this routing)

**Recommendation: defer 5d.6.** The current InspectorPanel is genuinely a thin facade that provides real value — single entry point, unified prop API, shared chrome. The "delete dispatcher" goal was sized against a bloated dispatcher that no longer exists. The 4-caller churn for the deletion isn't worth the architectural cleanup at this size. **Revisit when the 5e shell refactor surfaces a natural call site for the inspector chrome** — at that point either keep the facade or fold the chrome into a layout component near the shell.

---

## PR-7 scope — `feat/ds-migration-pt7` (next session)

5e shell refactor + delete legacy nav files + 4 test files.

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

## PR-7 (this PR) — landed checklist

- [x] **5e.2** — ClientHomePage rewired to LeftRail — `8246f45c`
- [x] **5e.3** — PracticeHomePage rewired to LeftRail with sidebarCounts → badge merge + OrgSwitcherMenu brandMark — `b221d125`
- [x] **5e.4** — WidgetApp NavRail → LeftRail mobile + MobileInspectorOverlay → FocusDrawer — `eda94046`

3 of 4 shells migrated. **WorkspacePage (1666L) deferred to PR-8** because of size + risk; do it as its own focused session.

---

## PR-8 scope — `feat/ds-migration-pt8` (next session)

Final shell refactor + cleanup. After PR-8 merges, the legacy nav stack is fully removed.

### 5e.5 — Refactor WorkspacePage

**Biggest single piece in the migration.** 1666 lines. Uses PracticeSidebar + ClientSidebar + NavRail + InspectorPanel + WorkspaceShellHeader. Recipe established by 5e.2/3/4:

1. Drop `PracticeSidebar` / `ClientSidebar` / `NavRail` / `WorkspaceShellHeader` imports
2. Drop `isDesktopSidebarCollapsed` state + `'blawby:sidebar:collapsed'` localStorage key (locked decision §5)
3. Drop mobile-sidebar drawer state (`isMobileNavOpen`)
4. Drop `useCommandPalette`'s top-bar usage (search is now ⌘K only)
5. Build `railItems` useMemo from `getPracticeNavConfig` (when isPracticeWorkspace) or `getClientNavConfig` (otherwise), merging sidebarCounts into badges
6. Compose: OrgSwitcherMenu in `brandMark` slot; SidebarProfileMenu in `footer` slot
7. Replace AppShell composition with the chat-first 4-column layout per Conversations.html spec when in assistant/conversations section: `[LeftRail | ConversationListPanel | main | FocusDrawer]`; simpler `[LeftRail | main | FocusDrawer]` for other sections

The `assistantListPanel` / `conversationListPanel` / `matterListPanel` / `contactsListPanel` / `invoicesListPanel` that WorkspacePage currently passes to AppShell's `listPanel` slot continue to render — they just sit in the second column position rather than being routed through AppShell.

### 5e.6 — Extract ConversationListPanel

Per the Conversations 4-column spec (240 rail | 340 thread list | 1fr active | 400 focus drawer), the assistant/conversations section needs a standalone 340px thread-list column. Currently the conversation list lives inside PracticeSidebar when `workspaceSection === 'assistant'`. Extract as `src/features/chat/components/ConversationListPanel.tsx`:

- Props: `conversations`, `conversationPreviews`, `isLoading`, `error`, `activeConversationId`, `onSelect`, `onNew`
- 340px wide flex column
- Currently rendered by PracticeSidebar's `assistantListPanel` block; just lift to standalone

### 5e.1 — Drop AppShell sidebar props

After all 4 shells migrate, no caller passes `sidebar` / `desktopSidebarCollapsed` / `mobileSidebar` / `mobileSidebarOpen` / `onMobileSidebarClose` to AppShell. Drop them from `AppShellProps`, drop all the conditional rendering for sidebar column + mobile drawer + grid template column calculations.

What's left in AppShell becomes: header + listPanel + main + inspector + bottomBar columns. Roughly half the file goes away.

### 5e.7 — Delete legacy nav files + tests + dead CSS

- [ ] `src/shared/ui/nav/NavRail.tsx`
- [ ] `src/shared/ui/nav/Sidebar.tsx`
- [ ] `src/shared/ui/nav/PracticeSidebar.tsx`
- [ ] `src/shared/ui/nav/ClientSidebar.tsx`
- [ ] `src/shared/ui/inspector/MobileInspectorOverlay.tsx`
- [ ] `src/shared/ui/layout/WorkspaceShellHeader.tsx`
- [ ] Dead CSS: `.nav-item-active`, `.nav-item-inactive`, `.workspace-header*`, `.sidebar-scroll`
- [ ] 4 test files (locked answer #6 — delete; re-add later if equivalents emerge after the rebuild):
  - `tests/component/nav-rail.test.tsx`
  - `tests/component/widget-app.test.tsx`
  - `tests/component/app-shell.test.tsx`
  - `src/features/invoices/pages/__tests__/InvoicesPages.test.tsx` (or just remove the NavRail import)

---

## Session checklist (resume — PR-8 starts here)

```powershell
git fetch upstream
git checkout staging
git pull upstream staging --ff-only
git checkout -b feat/ds-migration-pt8
npm install
npm run build                                     # must pass
npm run lint:src                                  # baseline: 1 pre-existing OAuthConsentPage error
npm run type-check                                # baseline: 0 errors
```

Open `design_handoff_blawby_chat_first/screens/Conversations.html` for the canonical 4-column layout that drives WorkspacePage's chat/assistant section. The 240 / 340 / 1fr / 400 grid is the spec.

### Suggested PR-8 sub-commit cadence

1. `5e.5` — Refactor WorkspacePage (biggest; do in one focused commit with iterative lint cleanup pass)
2. `5e.6` — Extract ConversationListPanel
3. `5e.1` — Drop AppShell sidebar props
4. `5e.7` — Delete legacy nav files + 4 test files + dead CSS

Realistic time estimate: 2-3 hours for WorkspacePage alone, plus ~1 hour for the remaining three combined.
