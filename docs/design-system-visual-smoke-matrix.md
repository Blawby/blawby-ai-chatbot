# Design System Visual-Smoke Gap Matrix

> Comprehensive element-by-element comparison between the 21 canonical chat-first designs in `design_handoff_blawby_chat_first/screens/` and the shipped surfaces, as of `staging` post-PR #667.
>
> Produced by 7 parallel audit agents (each comparing 1-5 design files against their shipped surfaces). Read-only research; no code changes. Severity classifications: `BLOCKER` = users would notice a fundamentally different surface; `MAJOR` = important element missing or visually off; `MINOR` = small spacing/copy/typography mismatch; `NIT` = pixel-level polish. Fix-effort: `S` (<50 LOC), `M` (50-200), `L` (>200).

## Executive Summary

**Total surfaces audited:** 21 (15 desktop + 5 mobile + 1 client portal variant)
**Total gap rows:** ~360
**Distribution:** **14 BLOCKER · 79 MAJOR · 102 MINOR · 40 NIT** (plus ~125 MATCHES)

**Most surfaces are structurally correct but visually thinner than the canonical designs.** The migration successfully shipped the DS primitives (`AIAskBar`, `AIAnswerCard`, `LetterPaper`, `StagedAction`, `NumberedSection`, etc.) and the right composition shapes — what's missing is element-by-element detail (specific copy, dense layouts, type-specific affordances, AI-narrative content that depends on backend endpoints not yet shipped).

### The 14 BLOCKERs (in priority order)

| # | Surface | Element | Why it blocks |
|---|---|---|---|
| 1 | **WidgetApp** | `data-theme="midnight"` forced on mount | Public intake renders dark; canon is light/paper. Single-line fix at WidgetApp.tsx:665. **S** |
| 2 | **Intake.html (public)** | 2-column shell (intake + embed explainer) | Right column entirely absent on `/p/:slug` URL. Marketing surface gone. **L** |
| 3 | **Intake.html (public)** | Card-shell wrapper around chat | Chat fills viewport edge-to-edge; canon wraps in `max-w-[620px]` card. **M** |
| 4 | **IntakeBuilder** | Triage rules tab | Entirely absent — design's most-distinguishing feature. **L** + backend model |
| 5 | **IntakeBuilder** | Branching tab | Entirely absent. Conditional logic model needed. **L** + backend |
| 6 | **IntakeBuilder** | Audit tab | Entirely absent. Version-history surface. **M** + backend |
| 7 | **Intakes-list** | List-head (serif h1 + crumb + sub copy) | Pane has no identity; goes straight from Seg to rows. **S** |
| 8 | **Intakes-list** | Row description preview (2-line clamp) | Rows lack the content preview that makes them recognizable. **S** |
| 9 | **Intakes-list** | Urgent-row tinted background | `color-mix(neg 5%, card)` — currently no urgent state distinction. **S** |
| 10 | **Intakes-list** | Selected-row 3px accent left bar | Selection state invisible. **S** |
| 11 | **Intakes-list** | "Awaiting client" sub-header divider | Pending vs decided grouping flattened to one list. **S** |
| 12 | **Intakes-detail** | "Facts collected" structured card (7 keyed rows) | Currently a single description card; most data-dense card in design is missing. **M** |
| 13 | **Conversations** | Conversation-pane header (`conv-head`) | No breadcrumb/serif headline/sub-line/autopilot pill on active thread. Active pane lacks identity. **M** |
| 14 | **Trust** | Compliance banner (IOLTA-compliant + 3-way recon) | Trust-credibility hero element missing. **M** |

### Critical cross-cutting patterns

1. **Settings sidebar nav rail (260-280px) is missing app-wide** — affects EngagementTemplates, IntelligencePage, and presumably every settings sub-page. Fix at `EditorShell`/`SettingsContent` level once.
2. **`Pill` primitive lacks a `staged` tone** — blocks "N staged changes" indicators on EngagementTemplates cards and elsewhere. ~30 LOC primitive extension.
3. **Autopilot is unbuilt end-to-end** — rail badge, inbox meta, conv-head pill, thread tags, focus-drawer footer all depend on a `practice_assistant_autopilot` concept that doesn't exist. Major missing feature.
4. **DS primitive *consumption depth* is the weakness, not primitive quality** — `BriefingGrid`, `Observation`, `Citations`, `JourneyProgress` ship but are mostly absent from chat / matter / report surfaces that should use them.
5. **Backend gaps cascade across surfaces** — `staged_by_assistant` flag, AI narrative endpoints, per-matter aggregates, per-contact sentiment, willing_retainer field, journey templates — all tracked in GitHub issue #662.

### Recommended fix sequence

| Wave | Theme | Surfaces | LOC budget |
|---|---|---|---|
| 1 | **Theme + shell BLOCKERs** | WidgetApp midnight-force + Intake card-shell + ClientPortal retainer semantics bug | ~200 |
| 2 | **Intakes-list visual polish** (5 BLOCKERs, all S) | IntakesPage list-head + row description + urgent tint + selection bar + sub-header | ~200 |
| 3 | **Intakes-detail Facts card + IntakeBuilder triage tab** | IntakeDetailPage + IntakeTemplatesPage | ~400 |
| 4 | **Settings shell sidebar nav** (fixes 2 surfaces at once) | EditorShell + SettingsContent | ~200 |
| 5 | **Conv-head + Autopilot scaffold** | WorkspacePage + new components | ~600 |
| 6 | **Trust compliance banner + bank-framed stats** | PracticeTrustPage | ~200 |
| 7 | **Per-surface MAJOR polish** | All other surfaces | ~2000 |
| 8 | **Backend wishlist drives the rest** (#662) | — | n/a |

---

## Per-surface matrices

### 1. Assistant — `Assistant.html` → `src/pages/PracticeHomePage.tsx` + `WorkspacePage.tsx` (assistant section)

**Verdict:** 3-col shell and briefing-grid grammar honored. Conversational AI moment (user-turn → grounded reply → tool-use line) absent. Money card lacks sparkline. "This week" briefing missing. Focus-drawer numerics all em-dashes pending matter-summary endpoint.

**Gaps:** 17 (1 BLOCKER · 5 MAJOR · 9 MINOR · 2 NIT)

**Top BLOCKERs / MAJORs:**
- ❌ **BLOCKER** Conversational AI exchange (user bubble → grounded reply with inline matter chips → tool-use line) — design's hero pattern. **L**
- ⚠️ **MAJOR** Left-rail thread history ("Today" / "Past 7 days") absent. **M**
- ⚠️ **MAJOR** Hero `.lede` AI opening line ("Here's your day. Three things actually need you...") absent. **M**
- ⚠️ **MAJOR** Money card sparkline + "you'll hit zero around Dec 8" projection. **M**
- ⚠️ **MAJOR** "This week" briefing card (Johnson court Friday + week roster). **M**
- ⚠️ **MAJOR** Composer context chip + "+ add context" + keyboard-hint row. **M**
- ⚠️ **MAJOR** Staged-action banner ("Staged · awaits your approval — Invoice draft $1,245"). **M**
- ⚠️ **MAJOR** Focus-drawer 2×2 stat grid all em-dashes (TODO backend). **M**
- ⚠️ **MAJOR** Focus-drawer recent activity timeline placeholder. **M**

**Top 3 fixes:** (1) Implement user-turn → grounded-answer → tool-use trio; (2) Add AI lede paragraph + "This week" briefing card; (3) Wire matter-summary endpoint to fill focus-drawer em-dashes.

**Note:** `WorkspaceHomeSection` (older assistant section) appears to be a parallel implementation of the same screen. Pick one canonical home before further work.

---

### 2. ClientPortal — `ClientPortal.html` → `src/pages/ClientHomePage.tsx`

**Verdict:** Shape, typography, layout grid, trust footer all on-spec — but page reads as ~70% empty-state because messages, upcoming events, documents, payments, journey dates all gated on backend wiring. **Critical content bug:** retainer card surfaces *outstanding balance* (debt owed) where design surfaces *trust balance* (credit held).

**Gaps:** 18 (1 BLOCKER · 4 MAJOR · 11 MINOR · 2 NIT)

**Top BLOCKERs / MAJORs:**
- ❌ **BLOCKER** Messages-with-attorney card (4 conversation turns) shows only empty state. **L**
- ❌ **BLOCKER** Retainer card materially incorrect: renders `outstandingBalance` (debt) under "Your retainer" heading with IOLTA copy. Confusing/alarming. **M**
- ⚠️ **MAJOR** Greeting lede paragraph generic ("Your matter is moving forward") vs canonical case-specific narrative. **M**
- ⚠️ **MAJOR** 5-step journey lacks per-step dates + case-type templates ("Records collected" / "Demand sent"). **L**
- ⚠️ **MAJOR** "What's next" banner generic — no actual next-deadline date. **M**
- ⚠️ **MAJOR** Reply composer (pill input + paperclip + send + encryption hint) absent on desktop; mobile has it. **M**
- ⚠️ **MAJOR** Upcoming-events card empty state — no date-tile rendering. **M**
- ⚠️ **MAJOR** Documents card empty — no doc-row pattern. **M**
- ⚠️ **MAJOR** Payment-history card empty — same gap. **M**

**Top 3 fixes:** (1) Fix retainer semantics — rename heading or wire real trust balance; (2) Wire messages thread + reply composer (backend exists); (3) Expose case-type journey templates + per-step dates.

---

### 3. Onboarding — `Onboarding.html` → `src/features/onboarding/components/OnboardingFlow.tsx` + steps

**Verdict:** Cleanest of all surfaces audited. 6-step expansion from canonical's single step-3 snapshot is consistent with sidebar's listed steps. Typography, layout grid, stage-header pattern, assistant-turn bubble, progress sidebar all match exactly.

**Gaps:** 14 (0 BLOCKER · 2 MAJOR · 10 MINOR · 2 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** AI moment in step 3 generic ("I see {practiceName} based in {jurisdiction}") vs canonical location-grounded ("I see you signed up from Charlotte, NC..."). Needs IP→city geocoding. **M**
- ⚠️ **MAJOR** Preview stat strip ("14 fields / 5 drafts / $2k–$5k") missing from step 3 — design's reward moment that input is producing tuned output. `StatStrip` primitive already in use on step 6; just reuse. **M**

**Top 3 fixes:** (1) Add preview stat strip to step 3; (2) Add dashed "+ custom" practice-area chip; (3) Use real Stripe purple `#635BFF` for payments-step badge.

**Note:** This surface is most ready for screenshot-diff regression testing. Persistence layer (localStorage draft + idempotent org creation) exceeds design's implied scope.

---

### 4. Matters (list) — `Matters.html` → `src/features/matters/pages/PracticeMattersPage.tsx` (LIST mode)

**Verdict:** All major canonical shapes ship (page header w/ stats, AIAskBar, AIAnswerCard on-ask, filter chips, Seg view toggle, table, board). Stats block content drifted from `retainer/unbilled/weekly events/court date` to generic `Open/At risk/Total`. Timeline view is stub. Retainer% renders `—` (TODO).

**Gaps:** 17 (0 BLOCKER · 4 MAJOR · 9 MINOR · 4 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Mono stats block content drift (designed: retainer/unbilled/events/court date; ship: Open/At-risk/Total). **M**
- ⚠️ **MAJOR** AI answer card gated on submit — canonical pre-loads it narrating at-risk state. **S**
- ⚠️ **MAJOR** Timeline view stub ("Coming soon"). **M**
- ⚠️ **MAJOR** Retainer bar with % always renders `—` — needs trust-ledger fan-out. **L**

**Top 3 fixes:** (1) Replace 3-cell "Open/At risk/Total" with canonical 4-line content; (2) Surface AI answer card eagerly on first load; (3) Add per-row `⋯` overflow menu.

---

### 5. Matter (detail) — `Matter.html` → `MatterDetailPanel.tsx` + DetailHeader + OverviewTab + Inspector + AskCard

**Verdict:** Header and AI-summary surface are closest match in repo — breadcrumb, serif H1 w/ accent client, mono sub-strip, 5-cell StatStrip, AISummaryCard, MatterAskCard ink ribbon all ship. **Biggest drift is structural:** canonical body is 2-col with side-cards (Facts/People/Linked); shipped is vertical InfoCard stack. Overview tab has only 1.5 of design's 5 sections inline.

**Gaps:** 19 (0 BLOCKER · 5 MAJOR · 11 MINOR · 3 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** 5-cell StatStrip values all `—` (Retainer/Unbilled/Events/SoL/Est. value). **M**
- ⚠️ **MAJOR** 9-tab nav collapsed to 7 (acknowledged; Tasks+Milestones nested under Work; Time+Expenses+Invoices nested under Billing). **L**
- ⚠️ **MAJOR** Staged-invoice action ribbon lacks "drops retainer to $X" narration. **S**
- ⚠️ **MAJOR** Unbilled-time table missing from Overview tab (lives only under Billing). **M**
- ⚠️ **MAJOR** Facts side-card (12 rows) not on Overview — lives in MatterInspector only. **M**
- ⚠️ **MAJOR** People side-card (client / attorney / opposing / witness with role chips) absent. **M**

**Top 3 fixes:** (1) Add inline Facts side-card on Overview (data already in `selectedMatterDetail`); (2) Add inline Unbilled-time table (data already loaded for StagedInvoiceAction); (3) Add People card with role pills.

---

### 6. Engagement (workbench) — `Engagement.html` → `EngagementWorkbench.tsx` (+ CreateEngagementPage + EngagementDetailPage edit mode)

**Verdict:** Most complete migration of all surfaces audited — workbench faithfully implements topbar, AI ribbon, 440px form, letter preview, placeholder index, seg view toggle. Drift: added 6th "Signing" section, paper-2 bg instead of canonical diagonal-repeating gradient, topbar action positions.

**Gaps:** 18 (0 BLOCKER · 3 MAJOR · 11 MINOR · 4 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Topbar actions ("Preview as client" / "Download PDF" / "Send to client") live in bottom action row, not top. **S**
- ⚠️ **MAJOR** 5-cell stat strip retainer % `—`; Bar visuals absent. **M**
- ⚠️ **MAJOR** Body 2-col grid 1fr+360px — shipped uses `@4xl:` container query (close but not sticky-on-scroll). **M**

**Top 3 fixes:** (1) Move Preview as client + Download PDF up into topbar; (2) Reorder sections to Client → Scope → Fees (templates merged into strip above); (3) Apply diagonal repeating-linear-gradient texture to preview panel.

---

### 7. EngagementReview — `EngagementReview.html` → `ClientEngagementReviewPage.tsx` + 6 client-engagement components

**Verdict:** Excellent structural fidelity — every major section present in correct order with correct primitives. Drift in supporting copy/iconography polish.

**Gaps:** 23 elements (0 BLOCKER · 3 MAJOR · 6 MINOR · 2 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Questions ribbon uses `AIRibbon variant='observation'` (left-stripe) instead of canonical `.questions` distinct treatment (4-side border + accent gradient + avatar grid). **S**
- ⚠️ **MAJOR** StatStrip Fee cell string-replace logic strips `/hr` suffix on hourly fees. Brittle. **S**
- ⚠️ **MAJOR** Acknowledgment row 2 lacks accent em on `$3,000` and `$215` fee numbers. **S**

**Top 3 fixes:** (1) Replace `.questions` ribbon with bespoke `<section>` matching canonical 4-side border + avatar grid; (2) Fix StatStrip Fee cell with structured `value: ReactNode`; (3) Add `Total · fixed-fee scope` row to `LetterPaper.Fee`.

---

### 8. EngagementTemplates — `EngagementTemplates.html` → `src/features/settings/pages/EngagementTemplatesPage.tsx`

**Verdict:** Most faithful list view of the settings audits — area-grouped layout, filter chips, AI authoring strip, fee/arrow column, "I noticed" observation all present. **Major shell gap: 260px settings sidebar nav missing** (cross-cutting with Intelligence).

**Gaps:** 22 elements (0 BLOCKER · 3 MAJOR · 7 MINOR · 1 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Settings sidebar nav (Practice/Money/Intelligence/Account) missing. **M** *(cross-cutting fix at EditorShell)*
- ⚠️ **MAJOR** Back-to-assistant link + "Settings" h2 + org line absent (same shell issue). **M**
- ⚠️ **MAJOR** `staged` Pill tone missing from primitive — "N staged changes" indicator can't render. **S** *(primitive extension)*

**Top 3 fixes:** (1) Add settings sidebar at shell level; (2) Add `staged`/`accent` tone to `Pill` primitive; (3) Pass `crumb="Settings · Intelligence · Engagement templates"` to EditorShell.

---

### 9. Settings/Intelligence — `Settings.html` → `IntelligencePage.tsx`

**Verdict:** Structurally complete + adds thoughtful productized behavior (PauseDialog, sources table with row counts, Reset-to-default for system prompt). Same shell-level gap as Templates.

**Gaps:** 25 elements (0 BLOCKER · 3 MAJOR · 5 MINOR · 3 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Settings sidebar nav rail (280px) missing. **M** *(same cross-cutting)*
- ⚠️ **MAJOR** "Connected services" section (Stripe Connect + Google Calendar) missing inline. Either render inline or link to Apps page. **M**
- ⚠️ **MAJOR** "Close practice & export data" danger-zone button missing. **S**

**Top 3 fixes:** (1) Settings shell sidebar (fixes Intelligence + Templates simultaneously); (2) Render/link Connected Services inline; (3) Add `{{placeholder}}` syntax highlighting to system-prompt editor.

**Note:** Hero-prop pattern inconsistent across settings pages (PracticePage/Team/Intelligence self-wrap with hero props; AccountPage relies on injected `SETTINGS_VIEW_HERO['account']`; EngagementTemplatesPage passes none). Pick one pattern.

---

### 10. Invoices — `Invoices.html` → `PracticeInvoicesPage.tsx` + row/detail/preview/sidebar/activity

**Verdict:** List shell, status tabs, rows, LetterPaper composition, staged-by-AI banner all ship and match closely. Detail right-rail is fragmented across surfaces.

**Gaps:** 12 (0 BLOCKER · 4 MAJOR · 6 MINOR · 2 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** "Download PDF" action missing as first-class CTA (only available via Stripe-hosted URL). **S**
- ⚠️ **MAJOR** Staged banner missing "Send replenish too" action chip — needs cross-feature replenishment-staging endpoint. **M**
- ⚠️ **MAJOR** Tri-column "Billed to / Matter / **Period**" header — Period column with "Nov 14-22 + entry count + IOLTA draws from" subtitle absent. **M**
- ⚠️ **MAJOR** Line items collapsed: `LetterPaper.Fee` shows description+amount only; design has discrete hours/rate columns. **M**
- ⚠️ **MAJOR** Payment-Status box (IOLTA balance before/after + Stripe enabled + platform-fee note) absent. **M**

**Top 3 fixes:** (1) Add hours/rate columns to `LetterPaper.Fee`; (2) Add Payment-Status box (uses existing `useTrustLedger`); (3) Add Period column to `LetterPaper.Billto`.

---

### 11. Trust — `Trust.html` → `PracticeTrustPage.tsx` + 4 trust components

**Verdict:** Layout structure (2-col body) matches. Compliance banner missing. Stat strip semantically drifted from "Total / Operating / Bank statement / Last reconciled" to "Balance / Credits / Debits / Last refreshed".

**Gaps:** 15 (**1 BLOCKER** · 5 MAJOR · 7 MINOR · 2 NIT)

**Top BLOCKER / MAJORs:**
- ❌ **BLOCKER** Compliance banner ("IOLTA-compliant · last verified 2h ago" + seal + 3-way recon + Audit-trail button) missing — trust-credibility hero element. **M**
- ⚠️ **MAJOR** AI quick-take action chips drifted (designed: "Approve replenishment $2,500 / Preview email / Adjust threshold"; ship: "Email statement / Email to CPA / Pause new draws"). **M**
- ⚠️ **MAJOR** Summary tile #2 "Operating account" replaced with "Total credits". Needs operating-balance endpoint. **L**
- ⚠️ **MAJOR** Summary tile #3 "Bank statement (Mercury) variance" replaced with "Total debits". Needs Mercury integration. **L**
- ⚠️ **MAJOR** Per-client rows missing replenishment progress bar + warn-row tinting. **M**
- ⚠️ **MAJOR** Compliance rules card rule labels drift (canonical NC-Bar framing vs shipped AI-thresholds framing). **M**

**Top 3 fixes:** (1) Add compliance banner; (2) Realign compliance rules to NC Bar semantics; (3) Realign stat tiles to bank-framed model (interim: rename "Last refreshed" → "Last reconciled").

---

### 12. Tasks — `Tasks.html` → `PracticeTasksPage.tsx` + 4 task components

**Verdict:** **Most divergent of any surface.** Design is chat-first "if you do one thing today" hero with right-rail focus drawer; shipped is conventional cross-matter task queue with header stats + filter bar + flat list.

**Gaps:** 16 (0 BLOCKER · 8 MAJOR · 5 MINOR · 3 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** 3-column app grid (240 / 1fr / 400px focus rail) — shipped is single-column. **L**
- ⚠️ **MAJOR** Page H1 "If you do **one thing** today." chat-first hook missing — generic "Tasks" title. **S**
- ⚠️ **MAJOR** Inline AI ask bar ("What can wait until next week?") missing — `AIAskBar` primitive available. **M**
- ⚠️ **MAJOR** "THE PICK" card (gradient hero with countdown) — shipped is plain `AISummary` line. **L**
- ⚠️ **MAJOR** Today / This-week grouping missing. *(Note: `TaskGroupSection.tsx` exists per PR #667 but audit-agent flagged it as missing — verify on staging.)* **M**
- ⚠️ **MAJOR** AI-note inline per row ("I'd accept this one...") missing. **M**
- ⚠️ **MAJOR** Semantic tag taxonomy (intake/staged/client/money/court) missing — needs backend `task.category`. **S**
- ⚠️ **MAJOR** AI handles row ("I'm handling these without you") missing — needs `task.auto_handled_by_assistant`. **M**
- ⚠️ **MAJOR** Right focus drawer (task detail + staged action + "Why this is the pick" field list) missing. **L**

**Top 3 fixes:** (1) Wrap existing `aiPick` in prominent `.pick`-styled gradient card with countdown + action chips; (2) Add Today/This-week grouping; (3) Surface AI-handles row.

---

### 13. Conversations — `Conversations.html` → `WorkspacePage.tsx` + ConversationListPanel + Inspector + MessagesListPanel + chat components

**Verdict:** 4-col shell wired correctly (`listPanelLgWidth=340px`, `inspectorXlWidth=400px`). Active conversation pane missing its signature scaffolding entirely — no conv-head, no day dividers, no Citations under AI turns, no autopilot.

**Gaps:** 27+ (**1 BLOCKER** · 9 MAJOR · 11 MINOR · 6 NIT)

**Top BLOCKER / MAJORs:**
- ❌ **BLOCKER** Conv-head (breadcrumb + serif h2 with em accent + sub line + autopilot pill + ⋯). Active pane lacks identity. **M**
- ⚠️ **MAJOR** Inbox header "Conversations" serif h1 with em accent — drifted to `text-base font-semibold` "Messages". **S**
- ⚠️ **MAJOR** Inbox meta strip "3 need you · 5 on autopilot · 6 waiting on client" missing. **S**
- ⚠️ **MAJOR** Filter chip row (7 chips: All/Needs you/Autopilot/Awaiting client/Intake/Matter/Closed) — shipped has 3-way practice Seg only. **M**
- ⚠️ **MAJOR** Thread items lack matter sub-line, speaker pre-tag ("B.M.", "You"), tags cluster (urgent/staged/autopilot/signed/pay). **M**
- ⚠️ **MAJOR** Autopilot toggle entirely absent across app. **M** *(feature work)*
- ⚠️ **MAJOR** Day dividers (mono uppercase between days) absent. **S**
- ⚠️ **MAJOR** Citations pill row below AI bubbles missing — `Citations` component exists; never wired. **S** *(audit found `metadata.sources` not consumed)*
- ⚠️ **MAJOR** StagedAction in MessageActions uses generic title; richer draft-card (lab pulse + serif h3 + .why explanation + .draft body em accent) collapsed. **M**
- ⚠️ **MAJOR** Quick-reply chips beneath staff turn ("Add to calendar" / "Attach: demand response" / "Sent · seen") missing as staff-message trailing action. **M**
- ⚠️ **MAJOR** Composer tabs (Reply / Internal note / Ask the assistant) + scope-as label missing. **M**
- ⚠️ **MAJOR** Inspector ships edit-first "Combobox stack"; design wants read-first stat tiles + field list + activity timeline + prose footer. **L**

**Top 3 fixes:** (1) Wire Citations under AI turns (existing component, ~30 LOC); (2) Add ConversationThreadHeader (breadcrumb + serif h2 + sub + actions slot); (3) Upgrade inbox header to serif h1 with 3-stat meta strip.

---

### 14. Clients — `Clients.html` → `PracticeContactsPage.tsx` + ClientDirectoryRow + clientSignals

**Verdict:** **Substantially the closest-shipped surface in the entire audit.** Chat-first scaffold (page h1 + AIAskBar + AIAnswerCard + filter/sort + ClientDirectoryRow with SignalPill + MatterChip + Bar + focus drawer with Observation + StatStrip + matters + activity timeline) all wired end-to-end. Remaining gaps are content placeholders + small visual polish.

**Gaps:** 22 (0 BLOCKER · 4 MAJOR · 10 MINOR · 2 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Header StatStrip cells drift (designed: Active / On retainer / Awaiting docs / Avg last contact; ship: Active / Awaiting reply / At risk). **S**
- ⚠️ **MAJOR** At-a-glance focus-drawer stat tiles (Lifetime value / Trust held / Unbilled) all `—` with TODO. **M** *(backend)*
- ⚠️ **MAJOR** Inline `MatterChip` references in AIAnswerCard `body` — body accepts JSX but renders plain prose. **S**
- ⚠️ **MAJOR** Active row left bar — shipped uses full-height `border-left`, design uses inset 8px top/bottom 3px wide strip. Visually 95% equivalent. **S**

**Top 3 fixes:** (1) Expose `lifetime_value/trust_held/unbilled_total` on user-details payload; (2) Render `MatterChip` inline in `AIAnswerCard.body`; (3) Swap header StatStrip cells to canonical 4-cell composition.

**Note:** This page is the **gold standard** — pattern other surfaces should adopt. When conversation surface gets its conv-head/autopilot/stat-tile inspector, it should follow `ClientDetailPanel` template.

---

### 15. Calendar — `Calendar.html` → `PracticeCalendarPage.tsx` + 7 calendar components

**Verdict:** Skeleton is in place (header, AI ask/answer, week/agenda/month, filter chips, focus drawer) but visual texture thinner than canon — no in-card "I noticed" observation, no prep-status chip on agenda rows, focus drawer prep-checklist uses `NumberedSection` instead of canonical strikethrough-on-done check-rows.

**Gaps:** 17 (0 BLOCKER · 5 MAJOR · 9 MINOR · 3 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Page H1 chat-first hook "What this week wants from you." — shipped is generic "Calendar & deadlines.". **S**
- ⚠️ **MAJOR** "This week." H2 + week-nav above week strip never renders (shipped defaults to agenda view). **S**
- ⚠️ **MAJOR** Upcoming list grid lost dense scannability — collapsed from 6-col canonical to 4-col. **M**
- ⚠️ **MAJOR** Prep status pill ("ready / draft prepared / 3 of 5 ready / 2 gaps") concept missing. **M**
- ⚠️ **MAJOR** Focus-drawer prep checklist uses `NumberedSection` (numbered circles + "next" state) instead of check-box+strikethrough rows. **M**

**Top 3 fixes:** (1) Restore chat-first H1 hook ("What this week wants from you."); (2) Surface week-strip H2 + week-nav even when view=agenda; (3) Wire real prep-status pill from `listMatterTasks` data.

---

### 16. Reports — `Reports.html` → `AllReportsHub.tsx` + useReportsHubAggregations + InlineCharts

**Verdict:** Hub has right composition + live data — admirable. Two pillars weak: exec summary is small `AIAnswerCard` instead of canonical large gold "executive summary" hero; assistant activity is openly placeholder-only. Page truncates canon's narrative arc after section 3 (missing matter projection + peer benchmark).

**Gaps:** 16 (0 BLOCKER · 4 MAJOR · 8 MINOR · 4 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Executive summary hero (40px avatar + gold meta + 28px serif headline + body + chip row) — shipped uses standard `AIAnswerCard` with 19px serif lede. Loses "headline first" reading order. **M**
- ⚠️ **MAJOR** "Open matters · 30-day projection" section (3 projection cards) entirely absent. **L** *(but no backend dep — projects from existing data)*
- ⚠️ **MAJOR** Assistant activity log openly placeholder (1 hard-coded row + "Awaiting activity feed"). **M**
- ⚠️ **MAJOR** Peer-benchmark dark callout (ink bg + "18% less per case · 22% faster" + action chips) entirely absent. **M**

**Top 3 fixes:** (1) Build peer-benchmark dark callout (single ink-bg card); (2) Wire 30-day projection cards from existing `aggregations.matters.total_fixed_price`; (3) Promote exec summary to real hero (larger avatar + 28px serif + gold gradient).

---

### 17. Intake (public) — `Intake.html` → `WidgetApp.tsx` + `PublicWorkspaceRoute.tsx` + IntakeFirmBar + IntakePaymentCard + QuickReplyChip + MessageComposer

**Verdict:** Chat surface (firm-bar, AI bubble, quick-reply chips, in-chat payment card) well-built and component-level matches tight. **Page-level shell is the deficit** — 2-column layout with embed explainer absent, theme forced to midnight.

**Gaps:** 18 (**3 BLOCKER** · 4 MAJOR · 8 MINOR · 3 NIT)

**Top BLOCKERs / MAJORs:**
- ❌ **BLOCKER** `WidgetApp` forces `data-theme="midnight"` at mount (line 665). Public intake renders dark; canon is light/paper. **S**
- ❌ **BLOCKER** 2-column page layout missing — entire right column (embed snippet + widget mockup + mode toggle + GDPR footer) doesn't exist on `/p/:slug`. Marketing surface gone. **L**
- ❌ **BLOCKER** Card-shell wrapper around intake chat (max-w-[620px] + shadow-3) absent — chat fills viewport edge-to-edge. **M**
- ⚠️ **MAJOR** Header chrome row (BrandMark + "blawby.com/p/:slug" crumb + Copy embed + Open as client) missing. **M**
- ⚠️ **MAJOR** File-drop inline strip ("Drop a file here, or browse") missing — `features.enableFileAttachments` disabled for widget. **M**
- ⚠️ **MAJOR** Embed widget mockup (macOS-window chrome + floating widget) absent. **L** *(marketing piece)*
- ⚠️ **MAJOR** `EmbedCodeBlock` exists in `features/intake/components/` but never consumed on public URL — only IntakeTemplatesPage uses it. **M**

**Top 3 fixes:** (1) Stop forcing `data-theme="midnight"` at WidgetApp:665; (2) Build right-column embed explainer reusing existing `EmbedCodeBlock`; (3) Add card-shell wrapper around intake chat.

---

### 18. Intakes (list) — `Intakes.html` (left pane) → `IntakesPage.tsx`

**Verdict:** Functionally complete but **visually generic**. Most BLOCKERs of any surface.

**Gaps:** 15 (**6 BLOCKER** · 5 MAJOR · 3 MINOR · 1 NIT)

**Top BLOCKERs:**
- ❌ **BLOCKER** List head (crumb "Workspace · 3 new · 18 this month" + serif h1 "Intakes" with em accent + 38-char sub copy) — pane has no identity. **S**
- ❌ **BLOCKER** Row description preview (13px ink-2 mid-line, 2-line clamp) — rows lack content preview. **S**
- ❌ **BLOCKER** Row urgent state — full-row tinted bg (`color-mix(neg 5%, card)`) missing. **S**
- ❌ **BLOCKER** Row selected state — 3px accent left bar + card bg. **S**
- ❌ **BLOCKER** "Awaiting client" sub-header divider — pending vs decided grouping flattened. **S**
- ❌ **BLOCKER** Serif 17px row name typography — ship uses sans 14px. **S**

**Top MAJORs:**
- ⚠️ **MAJOR** Filter taxonomy drift (canonical: New/Awaiting client/Accepted/Declined; ship: All/Pending/Accepted/Declined). **S**
- ⚠️ **MAJOR** Practice-area + jurisdiction pill on row (e.g. "family · NC") — only practice area renders, jurisdiction omitted. **S**
- ⚠️ **MAJOR** "declined · out of scope" + referred-to badge example absent. **M**
- ⚠️ **MAJOR** "consult booked" accent-tinted pill on accepted rows absent. **S**

**Note:** Shipped surface picked generic `EntityList` over a custom intake-row component. The design's intake row is intentionally distinct from the matter row (serif name + description preview + score pill + tinted bg). All 6 BLOCKERs are **S effort** — single PR can close.

---

### 19. Intakes (detail) — `Intakes.html` (right pane) → `IntakeDetailPage.tsx` + 6 intake components

**Verdict:** Closer to spec than list pane — chat-first ordering (verdict → scorecard → preflight → preview → conversation → docs) is implemented. Main gaps: scorecard cell 4 (willing retainer) is `—` placeholder; structured "Facts collected" card missing.

**Gaps:** 17 (**2 BLOCKER** · 7 MAJOR · 6 MINOR · 2 NIT)

**Top BLOCKERs:**
- ❌ **BLOCKER** "Facts collected" structured card (7 keyed rows: Contact/Issue/Court order/Opposing/Desired outcome/Budget/Heard about you) — currently a single description card. **M**
- ❌ **BLOCKER** Scorecard cell 4 "Willing retainer" hard-coded `—` because `IntakeEnrichedData` has no `willing_retainer` field. **M** *(needs backend)*

**Top MAJORs:**
- ⚠️ **MAJOR** AI verdict grounding label generic ("grounded in N sources") vs canonical "grounded in intake + your 217 closed matters". **S**
- ⚠️ **MAJOR** AI verdict action chips horizontal (canon: vertical stack right of lede). **S**
- ⚠️ **MAJOR** Pre-flight Capacity row always renders "manual review" — needs capacity endpoint. **S** *(backend gap)*
- ⚠️ **MAJOR** Pre-flight KYC row always "manual review" — needs Stripe identity surfacing. **S** *(backend gap)*
- ⚠️ **MAJOR** Attachments card lacks "scanned by AI · key facts extracted" sub-stamp + "view" affordance. **M**
- ⚠️ **MAJOR** Acceptance preview step copy drifts from canon's "Better Auth invite → workspace → engagement drafted → review → matter BLB-0246" framing. **M**

**Top 3 fixes:** (1) Build "Facts collected" card (5-7 keyed rows from `intake.metadata`); (2) Customize verdict grounding label to mention closed-matter count; (3) Refresh acceptance preview step copy to canon framing.

---

### 20. IntakeBuilder — `IntakeBuilder.html` → `IntakeTemplatesPage.tsx` + 5 intake components

**Verdict:** **Most-drifted of all surfaces.** Shipped is 3-panel master-detail builder (sidebar accordion + center preview + right inspector); design is 2-panel tabbed editor with sidecar preview. All 5 chat-first sub-components ship but are plumbed into different parent layout. **3 entire tabs absent (Triage rules, Branching, Audit) — 7 BLOCKERs.**

**Gaps:** 22 (**7 BLOCKER** · 8 MAJOR · 5 MINOR · 2 NIT)

**Top BLOCKERs:**
- ❌ **BLOCKER** Tabs row (6 tabs: Questions/Branching/Payment/Branding/Triage rules/Audit) — shipped has zero tab navigation. **L**
- ❌ **BLOCKER** Triage rules tab (4 rule rows + "+ Add rule" + "Test against last 50 intakes") — design's most-distinguishing feature. **L** + backend
- ❌ **BLOCKER** Branching tab (3 conditional rules) — entirely absent. **L** + backend
- ❌ **BLOCKER** Audit tab — entirely absent. **M** + backend
- ❌ **BLOCKER** Question row numbered circle (01-09 mono index) — no index column in shipped. **S**
- ❌ **BLOCKER** Page H1 serif 46px `Custody modification intake` with em accent — shipped uses small editable text input via `EditorShell`. **S**
- ❌ **BLOCKER** DV check / safety-check row (red border + "waives consult fee + escalates") — no safety-check rendering. **M** + backend type

**Top MAJORs:**
- ⚠️ **MAJOR** Page head desc "Public widget at blawby.com/p/sarah-chen/custody · used 142× in last 30 days, 31% converted" — shipped renders only "Used —× in last 30 days · — converted". **S**
- ⚠️ **MAJOR** Section head ("Questions · 9 visible · 2 AI-only" + Reorder + Import chips). **M**
- ⚠️ **MAJOR** Question row 5-col grid (grip + index + body + type pill + actions) — shipped is simpler (lock/grip + label + preview + badge). **M**
- ⚠️ **MAJOR** Type pill on row (required / AI extracts / safety check / payment / jurisdiction / urgency) condensed away. **M**
- ⚠️ **MAJOR** Question row meta line (input type · branch behavior · cond label) — single-line preview only. **S**
- ⚠️ **MAJOR** Payment & branding section structure (2 opt-cards) differs from accordion. **M**

**Top 3 fixes:** (1) Add Triage rules section as primary card list on editor canvas (largest missing feature); (2) Restore numbered question rows with type pills; (3) Add tabs row (Questions/Branching/Payment/Branding/Triage/Audit) as primary nav.

---

### 21a. Mobile-intake — `Mobile.html` (intake variant) → WidgetApp + IntakeFirmBar + IntakePaymentCard at mobile breakpoints

**Verdict:** **Closest-to-canon of all mobile audits.** Touch targets, safe-area, sticky composer, hide-uploads correctly handled. Drift concentrated in pay-card visual structure.

**Gaps:** 11 (0 BLOCKER · 1 MAJOR · 6 MINOR · 4 NIT)

**Top MAJOR:**
- ⚠️ **MAJOR** Mobile pay-card uses stacked header (title+amount on top row + full-width CTA below). Canon mobile uses 2-col `[title/slot | amount]` grid with NO inline CTA (presumably card opens via tap). **M**

**Top 3 fixes:** (1) Restructure mobile pay-card to 2-col `[title/slot | amount]` per canon + add `consultSlot` prop; (2) Wire em-accent firm name rendering; (3) Personalize composer placeholder to "Reply to {firmName}'s assistant…".

---

### 21b. Mobile-portal — `Mobile.html` (portal variant) → `ClientHomePage.tsx` at mobile breakpoints

**Verdict:** Unusually thoughtful about mobile — explicit `cp-*` scoped styles, mobile-first breakpoints, considered safe-area handling. Nails the composition order. Deficit is **content-readiness** — messages, retainer, next-up date all gracefully fall back to empty/zero states because backend doesn't expose the fields.

**Gaps:** 16 (0 BLOCKER · 5 MAJOR · 7 MINOR · 4 NIT)

**Top MAJORs:**
- ⚠️ **MAJOR** Journey row uses per-step name labels under each dot; canon mobile is bare dots only. More vertical space than canon. **M**
- ⚠️ **MAJOR** Messages section card+head ship but list is empty state — section structurally correct, content not wired. **M** *(backend hook exists, not consumed)*
- ⚠️ **MAJOR** Message-row avatar distinction (attorney = ink+accent italic serif; client = ink-2 gradient + initials) absent because messages don't render. **M**
- ⚠️ **MAJOR** Retainer card renders `outstandingBalance` (different concept) + Bar at `value={0}`. **M** *(same as ClientPortal #2 — debt-vs-credit bug)*
- ⚠️ **MAJOR** Retainer note italic ("Healthy — next draw expected at hearing date") + summary cells (Used/Hours billed) missing. **M**

**Top 3 fixes:** (1) Wire messages section to actual conversation data for active matter (backend exists, hook integration missing); (2) Build retainer-vs-cap visualization with trust balance separately from outstanding balance; (3) Trim section-head visual weight (drop `bg-paper-2`).

---

## Notes for follow-up

- **`TaskGroupSection.tsx`**: SmokeD agent flagged this file as missing from repo, but PR #665/#667 explicitly created it. Likely agent's working-tree view was stale during audit. Verify via `git ls-files src/features/tasks/components/` before acting on Tasks #5 finding.
- **Theme/font cascade**: Most audits noted token discipline is strong but the actual rendered font (Source Serif 4 + Geist + Geist Mono via Google Fonts) was not verified at runtime. Visual smoke against running app would confirm token→face resolution.
- **Backend wishlist (#662)**: ~30 gaps in this matrix have inline `TODO(backend):` markers and won't resolve until backend ships. Categories: `staged_by_assistant`, AI narrative endpoints, matter aggregates, clients.sentiment, journey templates, etc.
- **Settings shell sidebar**: Cross-cutting fix that closes 2 BLOCKERs simultaneously (EngagementTemplates + Intelligence). Should be PR-priority once theme/intake BLOCKERs are addressed.
- **Autopilot feature**: Touches rail, inbox, conv-head, thread tags, focus footer. Major missing feature, not just visual gap. Track separately from this matrix.
