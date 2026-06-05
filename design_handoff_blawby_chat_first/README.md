# Handoff: Blawby Chat-First Refactor

## Overview

Blawby is an AI-native legal practice management platform ($40/mo, Stripe Connect payments, IOLTA trust accounting). This handoff covers a complete **chat-first UI refactor** — 21 screens across the entire product, from public intake through matter management, billing, and reporting.

The core thesis: **chat is the home, not a feature.** The default entry point is a conversation with the Anthropic-powered assistant. Lists, tables, forms, and documents are surfaces the assistant opens — not destinations the user navigates to. Every AI-proposed write (invoices, status changes, emails, engagement letters) goes through a **staged-action** UI — the assistant drafts, the human approves — before it touches the database. This is non-negotiable and IOLTA-relevant.

## About the Design Files

The files in `screens/` are **design references created in HTML/CSS** — high-fidelity prototypes showing intended look, content, layout, and interaction patterns. They are NOT production code to ship directly.

The task is to **recreate these designs in the existing Blawby codebase** (Preact + Cloudflare Workers + Tailwind) using its established patterns, or to use them as the north star for a progressive refactor. The existing codebase is at `github.com/Blawby/blawby-ai-chatbot`.

Reference `DESIGN_SYSTEM.md` for the full component/pattern contract. Reference `tokens.css` for the CSS variable source of truth. Reference `PRODUCT.md` for product context, user journeys, and the feature inventory.

## Fidelity

**High-fidelity.** These are pixel-level mockups with final colors, typography, spacing, content, and interaction states. The developer should recreate the UI to match using the codebase's existing libraries and patterns. Every hex value, font size, radius, shadow, and spacing value is intentional and documented in `tokens.css` and `DESIGN_SYSTEM.md`.

---

## Architecture: Chat-First Layout

The product uses a consistent **3-column layout** across most staff screens:

```
┌──────────┬──────────────────────┬────────────┐
│  Rail    │      Center          │   Focus    │
│  240px   │      flex            │   400px    │
│  sticky  │      scrollable      │   sticky   │
│          │                      │            │
│  nav     │  content / chat      │  pinned    │
│  threads │  tables / editors    │  entity    │
│  user    │  composer            │  context   │
└──────────┴──────────────────────┴────────────┘
```

- **Left rail** (240px, sticky, full-height): Brand mark, "New conversation" button (⌘N), workspace nav (Assistant, Conversations, Intakes, Matters, Clients, Calendar, Tasks, Invoices, Trust), pinned threads, recent items, user chip.
- **Center** (flex, scrollable): Page content. Chat-first pages open with a greeting + AI briefing; list pages open with an ask-bar + AI summary + filterable table. Composer sticks to bottom on chat surfaces.
- **Right focus drawer** (400px, sticky, full-height): Shows the entity the user last clicked or the AI last mentioned. Read-only by default; all writes go through staged actions. Collapses at <1280px.

Exceptions:
- **Settings sub-pages** (IntakeBuilder, EngagementTemplates, Settings): use a 260px settings nav instead of the workspace rail.
- **Client-facing pages** (EngagementReview, Intake, ClientPortal, Mobile): no rail — clean, centered, branded surfaces.

### Responsive breakpoints:
- `>1280px`: full 3-column
- `980–1280px`: rail + center (focus drawer hidden)
- `<980px`: center only (rail collapses to drawer)
- `<720px`: mobile — full-width, paddings compress

---

## Screens (21 total)

### 1. Assistant (`Assistant.html`) — The home screen
**Purpose:** Morning briefing + ongoing conversation with the practice assistant.
**Layout:** Rail | Chat thread with greeting + briefing cards | Focus drawer (pinned entity)
**Key patterns:**
- Greeting header: serif h1 "Good morning, *Sarah.*" + practice snapshot stats
- AI message with `.lede` (serif 28px), citation row (`.pill live` for primary source), action chips
- Briefing grid: 2-col cards, first card spans both columns with `.feature` gold-gradient treatment
- User messages: right-aligned, gold bg (`.bub`)
- "I noticed" observation: left-border accent strip, serif italic 18px
- Tool-use line: mono, dim, shows which tools the assistant ran
- Matter chips: inline entity references with colored pins
- Composer: sticky bottom, card with shadow-2, contenteditable input, context chips (dashed), send button
- Focus drawer: entity header + 2×2 stat tiles + field list + timeline + staged-action card

### 2. Onboarding (`Onboarding.html`) — First-run flow
**Purpose:** 6-step conversational practice setup. AI infers defaults from public records.
**Layout:** Step nav (left) | Form + AI suggestions (right)
**Key patterns:**
- Step indicator with done/current/future states
- AI observation strips suggesting values before the user types
- Selectable chip groups (practice areas, fee types)
- Form fields with mono labels

### 3. Settings (`Settings.html`) — AI behavior + configuration
**Purpose:** Auditable view of all rules the assistant uses. Every setting is also editable via chat.
**Layout:** Settings nav (260px) | Grouped settings sections
**Key patterns:**
- AI preamble: "Everything on this page can be changed from chat"
- Toggle rows for each behavior setting
- System prompt editor with syntax-highlighted variables
- Connected services row (Stripe Connect)

### 4. Matters (`Matters.html`) — List + AI ask bar
**Purpose:** Filter matters via natural language. "At risk", "retainer below 30%", "no activity 7+ days."
**Layout:** Rail | Ask bar + AI answer card + filterable table + kanban toggle
**Key patterns:**
- Ask bar: avatar + contenteditable + ⌘K
- AI answer: gold-gradient card with lede, citation row, action chips
- Table: grid-based rows (not `<table>`), header in `--paper-2`, hover `--rule-soft`, urgent rows tinted
- Segmented control for table/board view
- Kanban: column headers (lead → active → settled → closed), draggable cards

### 5. Matter Detail (`Matter.html`) — Single-matter workspace
**Purpose:** Everything about one matter — stats, timeline, AI summary, time entries, milestones.
**Layout:** Rail | Stat strip (5-cell) + tabs + content | Focus drawer (ask card)
**Key patterns:**
- Stat strip: 5 equal cells, mono labels, serif numbers with `font-feature-settings: "tnum"`, optional bar + warn
- Tabs: Activity, Time & billing, Milestones, Files, Notes
- AI summary card: gold-gradient, citation row, staged invoice action
- Timeline: chronological events with type icons (AI, call, file, money)
- Unbilled time table: grid rows with billable/non-billable, right-aligned amounts
- Milestone list: reorderable, completion states

### 6. Trust Ledger (`Trust.html`) — IOLTA compliance
**Purpose:** Per-client balances, 3-way reconciliation, full audit trail.
**Layout:** Rail | Compliance banner + stat strip + transaction table + audit trail
**Key patterns:**
- Compliance banner: green-tinted, seal icon, "IOLTA · compliant" pill
- 4-cell stat strip (trust, operating, bank, reconciled)
- Transaction table: deposit (green +), withdrawal (red −), transfer (gold →)
- Per-client balance cards with bars

### 7. Engagement Builder (`Engagement.html`) — Staff-side draft
**Purpose:** Create engagement letters from templates. AI fills 17 placeholders from intake data.
**Layout:** Top bar | Split: form panel (440px) | letter preview (flex)
**Key patterns:**
- AI preamble showing what template was used and how many placeholders are resolved
- Template selector row (horizontal scroll)
- Fee mode segmented control (hourly, retainer, fixed, contingency, pro bono)
- Risk review section (conflicts, jurisdiction, SoL)
- Live letter preview on white paper with letterhead, scope, fee box, signature grid
- Placeholder highlights: gold-tinted for unresolved, green-tinted for resolved
- Placeholder index card at bottom

### 8. Invoices (`Invoices.html`) — Split list + detail
**Purpose:** Invoice queue with status pills and document preview.
**Layout:** Rail | Split: list column (380px) + detail column (flex)
**Key patterns:**
- List items with status pills (draft, sent, paid, overdue, staged)
- Active item: 3px gold left accent
- Detail: rendered invoice on white paper with line items, fee summary
- Staged invoice banner at top

### 9. Intakes (`Intakes.html`) — Staff triage queue
**Purpose:** Review AI-enriched intake submissions. Accept, decline, or ask follow-up.
**Layout:** Rail | Split: list column + AI verdict detail
**Key patterns:**
- Intake cards with AI case-strength scores (0–5), urgency, practice area tags
- AI verdict card: gold-gradient, lede assessment, scorecard (4 cells), pre-flight checks
- Conversation log showing the intake chat transcript
- Accept/decline action buttons

### 10. Client Portal (`ClientPortal.html`) — What clients see post-engagement
**Purpose:** Case status, messages, documents, retainer balance.
**Layout:** No rail — branded header + centered content
**Key patterns:**
- Firm header with attorney avatar
- Status card with "current stage" pill
- 5-step journey progress (horizontal, gold fill line)
- Message thread with attorney
- Retainer balance card with bar
- Document list with signed/shared icons

### 11. Reports (`Reports.html`) — AI-narrated monthly review
**Purpose:** Every Monday the assistant writes a 3-minute practice review.
**Layout:** Rail | AI exec summary + KPI strip + charts + narrative sections
**Key patterns:**
- Executive summary: gold-gradient card, serif lede
- 4-cell KPI strip with delta arrows
- Revenue chart: single-color bar chart, accent for highlighted month
- Sparkline style (1.2px stroke, accent gradient fill)
- Peer benchmark: dark card comparing practice vs NC median

### 12. Public Intake (`Intake.html`) — What prospective clients see
**Purpose:** Conversational AI intake widget, embeddable or direct URL.
**Layout:** No rail — centered intake card + embed preview
**Key patterns:**
- Firm header with avatar, name, trust badge
- Chat bubbles (AI: gold-tinted opener, plain follow-ups; user: ink bg)
- Quick-reply chips (pill-shaped, `.on` state)
- In-chat payment card (gold-tinted, amount prominent)
- Pill composer at bottom

### 13. Conversations (`Conversations.html`) — Unified client chat inbox
**Purpose:** Every client thread in one place. Autopilot handles routine; money/anxiety escalates.
**Layout:** Rail | Thread list (340px) | Active conversation (flex) | Focus drawer (400px)
**Key patterns:**
- Thread list: search bar, filter chips (All, Needs you, Autopilot, Awaiting client), thread items with preview + tags
- Tags: `.tag.autopilot` (gold), `.tag.staged` (gold bg), `.tag.urgent` (red), `.tag.signed` (green)
- Conversation pane: day dividers, 3 speaker types (client, AI, staff/attorney)
- Autopilot toggle in header with pulsing indicator
- Staged reply card: gold-gradient, draft text, approve/edit/rewrite/discard
- Composer with tabs: Reply | Internal note | Ask the assistant
- Focus drawer: pinned client context, stat tiles, field list, timeline

### 14. Clients (`Clients.html`) — Client directory
**Purpose:** "Who needs a check-in?" Ask-bar + AI summary + filterable table.
**Layout:** Rail | Ask bar + AI answer + directory table | Focus drawer
**Key patterns:**
- Directory table: avatar, name (serif), primary matter, retainer bar, last contact, sentiment chip
- Sentiment chips: `.calm` (green), `.anxious` (orange), `.frustrated` (red), `silent` (dim)
- Retainer health bars with warn/ok tints
- Focus drawer: "I noticed" observation, stat tiles, contact fields, matter strip

### 15. Calendar (`Calendar.html`) — Deadlines + schedule
**Purpose:** What this week wants from you. AI knows what's missing from each prep.
**Layout:** Rail | Ask bar + AI answer + week strip + 14-day upcoming list | Focus drawer
**Key patterns:**
- Week strip: 7-col grid, today highlighted, events color-coded by type
- Event types: `.court` (red left-border), `.deadline` (orange), `.call` (gold), `.milestone` (green)
- Upcoming list: date + type glyph + title + prep status pill
- Prep status: `.ready` (green), `.draft` (gold), `.gap` (red)
- Focus drawer: prep checklist with checkboxes, "I noticed" for missing items

### 16. Tasks (`Tasks.html`) — Prioritized to-do
**Purpose:** "If you do one thing today." AI picks the highest-impact task.
**Layout:** Rail | Ask bar + feature pick card + task groups | Focus drawer
**Key patterns:**
- Feature pick: gold-gradient hero card, countdown timer, single highest-priority task
- Task rows: checkbox, serif title, due date, status tags, AI note (italic serif with avatar)
- Groups: Today (4 open, 2 done), This week (5 open)
- "I'm handling these without you" AI strip between groups
- Done tasks: checked, line-through, dim

### 17. Engagement Review (`EngagementReview.html`) — Client-facing accept page
**Purpose:** Client reviews engagement letter, checks acknowledgments, signs, accepts.
**Layout:** No rail — centered, max-width 900px
**Key patterns:**
- AI greeting: avatar + serif h1 explaining the letter in plain English
- Status strip: 4-cell (matter, sent, fee, status)
- Letter on white paper: letterhead, scope section, fee box, signature grid (attorney pre-signed, client empty)
- "Ask me a question" AI card (gold left-border accent strip)
- 3 acknowledgment checkboxes (required before signing)
- Canvas signature pad with baseline, × mark, drawn signature, clear button
- Accept/decline decision row
- Trust footer: TLS, audit-logged, powered by Blawby

### 18. Intake Builder (`IntakeBuilder.html`) — Custom intake authoring
**Purpose:** Practice builds/edits intake widgets. AI suggests questions and branching.
**Layout:** Settings nav | Editor (questions list) + live widget preview (480px sticky right)
**Key patterns:**
- AI authoring strip: "Tell me what to add, remove, or rephrase" + apply button
- Tabs: Questions, Branching, Payment, Branding, Triage rules, Audit
- Questions list: grip handle, numbered circle, serif question text, type pill, conditional logic meta
- AI-staged question: gold-tinted circle, "staged by assistant" label, approve/edit/discard
- AI suggestion banner inside list: "I'd suggest... move the fee question after jurisdiction"
- Payment + branding config cards (2-col)
- Triage rules: condition → action pairs (auto-accept, refer, escalate, flag)
- Live preview: browser chrome frame, rendered widget conversation

### 19. Engagement Templates (`EngagementTemplates.html`) — Template library
**Purpose:** The letter library the assistant drafts from. Click any template to edit in the builder.
**Layout:** Settings nav | Library grouped by practice area
**Key patterns:**
- AI strip: "Describe a template — I'll draft it"
- Filter row: All, Family, Estate, Litigation, Corporate, Drafts, Needs review
- Template cards: 2-col grid (left: name + gist + meta, right: fee amount + "Open in builder →")
- Tags: `.live` (green dot), `.draft` (orange dot), `.staged` (gold dot)
- Inline "I noticed" observation on templates with compliance gaps
- Empty area CTA: "No pro-bono template yet — want me to draft one?"

### 20. Mobile Intake (`Mobile.html` — left device)
**Purpose:** Public intake as clients see it on iPhone.
**Layout:** iOS device frame, full-screen chat
**Key patterns:**
- Firm bar: avatar + name + lock icon
- Conversational flow with quick-reply chip rows
- Selected chips: ink bg + accent text (not raw gold)
- In-chat payment card
- Reply composer with send button

### 21. Mobile Client Portal (`Mobile.html` — right device)
**Purpose:** Case status portal as clients see it on iPhone.
**Layout:** iOS device frame, scrollable portal
**Key patterns:**
- Firm nav + client avatar
- Greeting with serif h2
- Status card with matter name + stage pill
- Journey progress dots (done=ink, now=accent, future=card)
- Next-up card with CTA
- Message thread (compact)
- Retainer balance with bar
- Trust footer

---

## Design Tokens

All values live in `tokens.css`. **Never hardcode hex values in components — use the variable.**

### Colors (Light theme — default)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#f6f3ea` | Primary background — warm cream |
| `--paper-2` | `#ece6d3` | Subtle elevation, hover rows, sticky toolbars |
| `--card` | `#ffffff` | Card/input backgrounds |
| `--ink` | `#0f1e36` | Primary text, primary button bg |
| `--ink-2` | `#2a3b5a` | Body text, secondary labels |
| `--ink-3` | `#4a5a78` | Tertiary text |
| `--dim` | `#6b7790` | Captions, helper text, mono labels |
| `--dim-2` | `#9aa1b3` | Placeholders, disabled |
| `--rule` | `#d3d6df` | 1px borders, dividers |
| `--rule-soft` | `rgba(15,30,54,0.08)` | Subtle hover tints |
| `--accent` | `oklch(0.72 0.13 82)` | Gold — the brand accent |
| `--accent-soft` | `oklch(0.72 0.13 82 / 0.14)` | Tinted backgrounds |
| `--accent-deep` | `oklch(0.55 0.12 78)` | `<em>` italic, AI deep voice |
| `--accent-ink` | `#2a2200` | Readable text on gold |
| `--pos` | `oklch(0.55 0.10 155)` | Success, paid, healthy |
| `--warn` | `oklch(0.68 0.13 60)` | Pending, attention |
| `--neg` | `oklch(0.55 0.16 28)` | Overdue, at-risk, danger |

### Theme variants (set via `html[data-theme="…"]`)

| Theme | Paper | Ink | Mood |
|---|---|---|---|
| (default) | `#f6f3ea` cream | `#0f1e36` navy | Warm light |
| `dark` | `#0c1830` navy | `#f1ecdc` cream | Reduced light |
| `midnight` | `#050c1c` deep | `#ede7d3` cream | AMOLED |
| `parchment` | `#f0eadb` warm | `#0a1a30` navy | Print, conservative |

### Typography

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Display (h1) | Source Serif 4 | 42–72px | 400 | -0.025em |
| Section (h2) | Source Serif 4 | 28–56px | 400 | -0.012em |
| Card heading | Source Serif 4 | 22–24px | 400 | -0.01em |
| AI lede | Source Serif 4 | 18–28px | 400 | -0.01em |
| Body | Geist | 14–15px | 400 | 0 |
| Mono label | Geist Mono | 10–11px | 400 | 0.08–0.14em uppercase |
| Tabular numbers | Geist Mono | 11–14px | 400 | -0.01em + `"tnum"` |

**Rules:**
- Headings always Source Serif 4 at weight 400. Never bold a serif heading.
- `<em>` is reserved for accent color (italic + `--accent-deep`). Don't use for ordinary emphasis.
- Labels are mono + uppercase + tracked. This is the "small caps" feel.
- `text-wrap: balance` on display headings. `text-wrap: pretty` on lede paragraphs.
- `font-feature-settings: "ss01", "cv11"` on body (Geist stylistic alternates).

### Spacing

No formal token scale — use this rhythm: `4 / 8 / 12 / 14 / 18 / 22 / 28 / 32 / 40 / 56`.
- Cards: 18–22px internal padding
- Sections: 22–36px vertical separation
- Container: `max-width: 1280px`, gutter 56px (40px @1100, 22px @720)

### Radii

| Token | Value | Use |
|---|---|---|
| `--r-xs` | `2px` | Buttons, chips, inputs — intentionally sharp |
| `--r-sm` | `4px` | Small badges |
| `--r-md` | `8px` | Cards, panels, drawers |
| `--r-lg` | `14px` | Rare — large hero containers |
| `--r-pill` | `999px` | Pills, toggles, avatars |

### Shadows

| Token | Use |
|---|---|
| `--shadow-1` | Cards at rest |
| `--shadow-2` | Hover, popovers, sticky composers |
| `--shadow-3` | Featured/focused (status cards) |

**Flat by default.** Cards sit at rest with border and no perceptible shadow. Shadows appear only on hover (interactive cards) and overlays. No colored/accent glow shadows ever.

---

## Critical Patterns

### Staged Actions (non-negotiable)
Every AI-proposed write sits in a `staged-action` card before it touches the database. The card has:
- Gold-gradient background
- Mono label: "Staged · awaits your approval"
- Serif title with the action
- Description of what it's based on
- Chip row: primary "Approve & send", secondary edit/preview, warn "Discard"
- Maps to `practice_assistant_actions` table in the database (state: pending → accepted)

### AI Summary Card
The gold-tinted block at the top of list pages and inside matter detail:
- Background: `linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--card)), var(--card))`
- Border: `1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))`
- Avatar (italic B) on left, body on right
- Mono label with "grounded in N sources" (green dot)
- Serif lede paragraph
- Citation pill row (table_name · row_count)
- Action chip row

### Citation Row
Below every AI response:
```html
<div class="cites">
  <span class="pill live">matters · 4 rows</span>
  <span class="pill">contact_forms · 3</span>
</div>
```
The first pill is `.live` (green dot) — the primary source. Makes the AI auditable.

### "I Noticed" Observation
Left-border accent strip for unprompted AI suggestions:
- Left border: `2px solid var(--accent)`
- Background: `linear-gradient(90deg, var(--accent-soft), transparent 80%)`
- Text: serif italic ~17px

### Composer
Sticky bottom input on chat surfaces:
- Card with `--shadow-2`
- Contenteditable input
- Context chips (dashed border, mono) + voice + send icons
- Trust line: "Blawby never writes without your approval"

### Pills (status badges, read-only)
Mono, uppercase, pill-shaped with optional dot prefix:
- `.pill.live` → green dot (pos)
- `.pill.gold` → gold dot (accent)
- `.pill.warn` → orange dot
- `.pill.urgent` → red dot (neg)
- `.pill.dot` → dim dot (neutral)

### Chips (compact actions, clickable)
Same sizing as pills but clickable, with hover states:
- `.chip.primary` → ink bg, accent text, hovers to gold
- `.chip` → card bg, rule border, hovers to paper-2
- `.chip.warn` → neg text

---

## Interactions & Behavior

### Navigation
- Left rail items highlight with `--accent-soft` bg + gold dot
- "New conversation" button: ink bg → hovers to gold
- Thread items in rail show preview text + time
- All navigation should be achievable via keyboard (⌘K to search, ⌘N for new)

### Chat
- Messages animate in with `rise` keyframe (0.4–0.5s, cubic-bezier(.2,.7,.2,1))
- User messages right-aligned with ink bg
- AI messages left-aligned with avatar
- Tool-use lines show below AI messages
- Composer supports: Reply, Internal note, Ask the assistant (tab strip)
- `/` in composer summons AI draft

### Staged Actions
- Appear as gold-gradient cards
- "Approve & send" is the primary action
- "Edit before send" opens inline editor
- "Discard" is warn-colored
- On approval: card collapses, action executes, toast confirms

### Tables
- CSS grid (not `<table>`) for responsive control
- Header: `--paper-2` bg, mono labels
- Hover: `--rule-soft` bg
- Active/selected row: `--accent` 3px left border
- Tabular numbers right-aligned with `font-feature-settings: "tnum"`

### Autopilot
- Toggle in conversation header with pulsing indicator
- When on: AI handles routine replies without approval
- Money-adjacent or anxious-tone messages auto-escalate to the attorney
- Autopilot replies show "autopilot · low-risk reply" label

### Theme switching
- Set `html[data-theme="dark|midnight|parchment"]` — no JS theme engine needed
- All colors resolve through CSS variables
- Never fork components for themes

---

## State Management

Key state the frontend needs:

| State | Source | Notes |
|---|---|---|
| Current user + practice | Better Auth session | org context, role, permissions |
| Active conversation | URL route + D1 | Chat messages, tool calls |
| Staged actions queue | `practice_assistant_actions` table | Pending approvals |
| Matter list + filters | PostgreSQL via API | Supports NL query rewrite |
| Trust ledger | PostgreSQL via API | Real-time balance |
| Intake queue | D1 (conversations) + PostgreSQL (contact_forms) | AI enrichment attached |
| Theme | `data-theme` attribute | Persisted in user preferences |

---

## Files

| File | Screen | Type |
|---|---|---|
| `screens/index.html` | Hub showing all 21 screens as cards | Navigation hub |
| `screens/tokens.css` | CSS variables — source of truth | Design tokens |
| `screens/Assistant.html` | #1 Assistant home | Staff |
| `screens/Onboarding.html` | #2 Practice onboarding | Staff (first-run) |
| `screens/Settings.html` | #3 Settings | Staff |
| `screens/Matters.html` | #4 Matters list | Staff |
| `screens/Matter.html` | #5 Matter detail | Staff |
| `screens/Trust.html` | #6 Trust ledger | Staff |
| `screens/Engagement.html` | #7 Engagement builder | Staff |
| `screens/Invoices.html` | #8 Invoices | Staff |
| `screens/Intakes.html` | #9 Intake triage queue | Staff |
| `screens/ClientPortal.html` | #10 Client portal | Client-facing |
| `screens/Reports.html` | #11 Reports | Staff |
| `screens/Intake.html` | #12 Public intake widget | Public |
| `screens/Conversations.html` | #13 Conversations inbox | Staff |
| `screens/Clients.html` | #14 Clients directory | Staff |
| `screens/Calendar.html` | #15 Calendar + deadlines | Staff |
| `screens/Tasks.html` | #16 Tasks | Staff |
| `screens/EngagementReview.html` | #17 Engagement review + sign | Client-facing |
| `screens/IntakeBuilder.html` | #18 Intake builder | Staff (Settings sub-page) |
| `screens/EngagementTemplates.html` | #19 Engagement templates | Staff (Settings sub-page) |
| `screens/Mobile.html` | #20–21 Mobile intake + portal | Client-facing (iOS frames) |
| `screens/Design System.html` | Visual reference page | Documentation |
| `screens/ios-frame.jsx` | iOS device frame component | Helper |
| `DESIGN_SYSTEM.md` | Full design system contract | Documentation |
| `PRODUCT.md` | Product overview + feature inventory | Documentation |
| `tokens.css` | CSS variables (duplicate for easy reference) | Design tokens |

---

## Implementation Notes

### Suggested component structure
```
src/design-system/
  tokens.css
  components/
    Button, Chip, Pill, Card, Field, Input, Toggle, Bar, Avatar, BrandMark, Label, Seg, Table
  patterns/
    AISummary, StagedAction, Citations, MatterChip, ToolUseLine, Observation, Composer, StatusPill, LetterPaper, JourneyProgress, StatStrip, BriefingGrid
  layouts/
    AppShell (rail + main + focus), PageHeader, SplitDetail, FocusDrawer, SettingsShell
```

### Migration from existing codebase
- Replace ad-hoc Tailwind color classes with `var(--*)` tokens
- Replace `border-radius: 12px/16px` with `--r-md` (8px) or smaller
- Flatten multi-color status systems to the 5 semantic colors
- Remove gradient orbs, glass cards, accent-glow shadows (all legacy per DESIGN.md)
- Keep Tailwind for layout utilities (flex, grid, gap, p-*, m-*)

### Don'ts
- Don't auto-execute AI actions. Ever. Staged actions are the law.
- Don't use gradient text, colored shadows, or glassmorphism
- Don't put Outfit font inside the product (it's display-only, for marketing)
- Don't use `#FFFFFF` body text or `#000000` surfaces — all neutrals tinted slate
- Don't add icons to headings — typography carries weight alone
- Don't use `<table>` for layout — CSS grid for all tabular data (except invoice line items)
