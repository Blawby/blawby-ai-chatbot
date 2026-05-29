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
| 5c — Shell refactor + cleanup | — | in progress on `feat/ds-migration-pt3` (this PR) | See "Next PR scope" below |
| 6 — Chat patterns | — | pending | AISummary, StagedAction, Citations, Observation, Composer, ToolUseLine, BriefingGrid, MatterChip; IOLTA manual smoke |
| 7 — Data display | — | pending | StatStrip, JourneyProgress, LetterPaper, Seg; print test |
| 8 — Feature sweep | — | pending | TSX feature-files swept for the 8 violation patterns; DataTable audit; AA contrast spot; `prefers-reduced-motion` check; final delete of `.status-*` / `.input-surface` / `.card-surface` aliases |

PR series: #644 (foundation, merged) → #645 (Commit 4 + 5a + 5b, merged) → **this PR** (5c).

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

## Next PR scope — `feat/ds-migration-pt3`

The user bundled PR-A (planning sync) and PR-B (shell refactor + cleanup) into one PR. Plan checklist:

### Doc + reference sync
- [x] Add `design_handoff_blawby_chat_first/` (21 screens + DESIGN_SYSTEM.md + PRODUCT.md + tokens.css) as the new source of truth
- [x] Refresh this doc (you're reading it) with the chat-first thesis, 6 locked answers, 21-screen inventory, refreshed roadmap
- [ ] Audit older `redesign-files/Blawby-chatbot-refactor/` for staleness — superseded by `design_handoff_blawby_chat_first/`, deletion candidate

### Layout/primitive work
- [ ] Generalize `FocusDrawer` to support `position: 'left' | 'right' | 'bottom'` (covers the Drawer + MobileInspectorOverlay use cases)
- [ ] Migrate `Drawer`'s 4 callers (ChatContainer, FilesPageView, FileDetailDrawer, FilesCollectionPanel) to the generalized FocusDrawer
- [ ] Inline `AccentHeroSurface`'s gradient at PracticeContactsPage, delete the primitive

### InspectorPanel split
- [ ] Extract `MatterInspector` to `src/features/matters/components/MatterInspector.tsx`
- [ ] Extract `ClientInspector` to `src/features/clients/components/ClientInspector.tsx`
- [ ] Extract `InvoiceInspector` to `src/features/invoices/components/InvoiceInspector.tsx`
- [ ] Extract `ConversationInspector` to `src/features/chat/components/ConversationInspector.tsx`
- [ ] Update the 4 callers (WorkspacePage, WidgetApp, DebugDialogsPage, WorkspaceSetupSection) to use the per-feature inspectors

### Shell rewiring
- [ ] Drop AppShell's `sidebar` / `desktopSidebarCollapsed` / `mobileSidebar` / `mobileSidebarOpen` / `onMobileSidebarClose` props
- [ ] Refactor `WorkspacePage` (1666L) to compose LeftRail directly
- [ ] Refactor `PracticeHomePage` (554L) to compose LeftRail directly
- [ ] Refactor `ClientHomePage` (151L) to compose LeftRail directly
- [ ] Refactor `WidgetApp` (865L) to use LeftRail mobile variant
- [ ] Extract `ConversationListPanel` as a 340px column for the Conversations 4-column layout
- [ ] Drop `isDesktopSidebarCollapsed` state + the `'blawby:sidebar:collapsed'` localStorage key

### Deletions
- [ ] `src/shared/ui/nav/NavRail.tsx`
- [ ] `src/shared/ui/nav/Sidebar.tsx`
- [ ] `src/shared/ui/nav/PracticeSidebar.tsx`
- [ ] `src/shared/ui/nav/ClientSidebar.tsx`
- [ ] `src/shared/ui/inspector/InspectorPanel.tsx` (after per-feature split)
- [ ] `src/shared/ui/inspector/MobileInspectorOverlay.tsx`
- [ ] `src/shared/ui/layout/WorkspaceShellHeader.tsx`
- [ ] `src/shared/ui/layout/AccentHeroSurface.tsx`
- [ ] `src/shared/ui/overlays/Drawer.tsx` (after callers migrate)
- [ ] `tests/component/nav-rail.test.tsx`
- [ ] `tests/component/widget-app.test.tsx`
- [ ] `tests/component/app-shell.test.tsx`
- [ ] `src/features/invoices/pages/__tests__/InvoicesPages.test.tsx` (or just remove the NavRail import)
- [ ] Dead CSS: `.nav-item-active`, `.nav-item-inactive`, `.workspace-header*`, `.sidebar-scroll`

### Verification gates
- [ ] Build green at every sub-commit
- [ ] Baseline lint: 1 pre-existing error (`Message.tsx:191`)
- [ ] Baseline type-check: 4 pre-existing errors (`WorkspacePage.tsx:1262/1354`) — may incidentally clear during the WorkspacePage refactor
- [ ] `rg "NavRail|PracticeSidebar|ClientSidebar|InspectorPanel|MobileInspectorOverlay|WorkspaceShellHeader|AccentHeroSurface" src` → zero matches
- [ ] Manual smoke: desktop (1280×) + mobile (375×) viewports for each refactored shell

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

These existed on `staging` at the foundation branch point. They reappeared after foundation merge and continue to exist at HEAD.

**Lint (1 error):**
- `src/features/chat/components/Message.tsx:191` — `'shouldShowIndicator' is assigned a value but never used`. Cleared in Commit 6 (chat patterns).

**Type-check (4 errors, all in `src/features/chat/pages/WorkspacePage.tsx`):**
- L1262:44, L1262:89, L1354:48, L1354:93 — `Property 'contactName'/'contactEmail' does not exist on type '{ kind: "practice_assistant" }'`. May incidentally clear during the 5c WorkspacePage refactor.

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
- Older 12-screen DS reference: `redesign-files/Blawby-chatbot-refactor/` — **superseded; candidate for deletion in this PR**

---

## Session checklist (resume)

```powershell
git checkout feat/ds-migration-pt3
git log --oneline staging..HEAD                  # current sub-commit progress
npm install                                       # if dependencies changed
npm run build                                     # must pass
npm run lint:src                                  # baseline: 1 pre-existing error
npm run type-check                                # baseline: 4 pre-existing errors
```

Then open `design_handoff_blawby_chat_first/screens/index.html` in a browser to see the 21-screen hub, and `design_handoff_blawby_chat_first/screens/Design System.html` for the visual component showcase before writing code.
