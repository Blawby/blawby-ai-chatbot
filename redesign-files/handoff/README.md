# Handoff: Blawby — Full Application Design

## Overview

Blawby is an AI-native legal practice management platform. This handoff contains **36 high-fidelity HTML design references** covering every screen in the application — from the main assistant chat, through matter management, billing, trust accounting, intake, client portal, settings, and onboarding.

These files are **design references created in HTML** — prototypes showing intended look, layout, content hierarchy, and interaction patterns. They are not production code. The task is to **recreate these designs in the target codebase** (currently Preact + Tailwind on Cloudflare Workers) using its established patterns, replacing ad-hoc styling with the token-driven design system documented here and in `DESIGN_SYSTEM.md`.

## Fidelity

All screens are **high-fidelity (hifi)**. Colors, typography, spacing, border radii, shadows, and component styles are final. The developer should recreate the UI pixel-perfectly using the CSS variables from `tokens.css` and the component contracts in `DESIGN_SYSTEM.md`.

---

## Screen Inventory

### Hub & Navigation

| File | Route | Purpose |
|---|---|---|
| `index.html` | — | Screen inventory hub (dev reference only, not a production page) |
| `Design System.html` | — | Live token + component showcase (dev reference only) |

### Core App Screens (rail + main layout)

These use the main app shell: 240px left rail with brand mark, conversation history, workspace links, and user chip.

| File | Route | Purpose |
|---|---|---|
| `Assistant.html` | `/` | **Home.** Chat-first interface with morning briefing cards, AI conversation, staged actions, composer, and right focus drawer showing pinned matter detail. |
| `Conversations.html` | `/conversations` | Full conversation list with filters, search, and conversation detail panel with message thread. (Original, denser layout.) |
| `Conversations v2.html` | `/conversations` | **Recommended.** Cleaner inbox, togglable context drawer, full mobile responsive (list → slide-in conversation → bottom sheet context). |
| `Matters.html` | `/matters` | Matter list with AI ask bar, filterable/sortable grid table, board view toggle, and AI summary responses. |
| `Matter.html` | `/matters/:id` | Single-matter workspace. 5-cell stat strip, tabs (activity, documents, time, billing), AI summary card, timeline, milestones, and ask card. |
| `Intakes.html` | `/intakes` | Staff triage queue. Split detail: intake list (left) with AI verdict badges + intake detail (right) with scorecard, conversation log, and pre-flight checks. |
| `Invoices.html` | `/invoices` | Split detail: invoice list (left) with status pills + invoice document (right) rendered as formatted paper with letterhead, line items, and payment summary. |
| `Trust.html` | `/trust` | IOLTA ledger. Compliance banner, stat strip (trust balance, operating, 3-month flow), per-client balances table, transaction audit trail. |
| `Reports.html` | `/reports` | AI-narrated monthly review. Executive summary, KPI strip, revenue/intake/projection sections with charts, peer benchmark card. |
| `Receivables.html` | `/reports/receivables` | Accounts receivable & aging. Outstanding totals, aging buckets (0–30/31–60/61–90/90+), collection trend vs peers, invoice-level detail table with status. |
| `TimeBilling.html` | `/reports/time-billing` | Time & billing. Hours logged, utilization, realization rate, effective rate, daily breakdown chart, per-matter time table, 6-month trend. |
| `Clients.html` | `/clients` | Client directory. Search + filters, client cards with matter count, total billed, last activity, and status indicators. |
| `Calendar.html` | `/calendar` | Week strip + 14-day deadline list. Court appearances, filing deadlines, milestones with AI-computed prep status per row. |
| `Tasks.html` | `/tasks` | Task board with status columns (to do, in progress, waiting, done), draggable cards, priority indicators, matter associations. |

### Engagement & Intake Builder

| File | Route | Purpose |
|---|---|---|
| `Engagement.html` | `/engagements/:id` | Split editor: form (left) with scope, fee structure, risk review + live letter preview (right) with letterhead, AI-resolved placeholders, signature blocks. |
| `EngagementReview.html` | `/review/:token` | Client-facing engagement review. Standalone page with formatted letter, acknowledgment checkboxes, canvas signature pad. No app chrome. |
| `EngagementTemplates.html` | `/settings/templates` | Template management. List of engagement templates by practice area and fee type, with preview and edit capabilities. |
| `IntakeBuilder.html` | `/settings/intake-builder/:id` | Visual intake form builder. Drag-and-drop question blocks, conditional logic, preview pane, AI suggestion panel. |
| `IntakeForms.html` | `/settings/intake-forms` | Intake form list. Stats row (submissions, conversion rate, avg time), form cards with status, embed code, and share link. |

### Public / Client-Facing

| File | Route | Purpose |
|---|---|---|
| `Intake.html` | `/p/:practiceSlug` | Public conversational intake widget. AI chatbot interview with dynamic questions, in-chat Stripe payment, practice branding. Standalone — no app shell. |
| `ClientPortal.html` | `/client` | Client case status portal. Sidebar with matter info, 5-step journey progress indicator, message thread, retainer balance card, document list. |
| `EngagementReview.html` | `/review/:token` | (See above — client signs engagement letter here.) |

### Settings (side + main layout)

These use the settings shell: 280px sidebar with section nav (Practice, Money, Intelligence, Account), "← back to assistant" link.

| File | Route | Section | Purpose |
|---|---|---|---|
| `Settings.html` | `/settings` | Intelligence | AI behavior controls. Model picker, temperature, persona, knowledge grounding toggles, prompt templates, danger zone. |
| `Profile.html` | `/settings/profile` | Practice | Firm name, address, practice areas, bar number, branding. |
| `Team.html` | `/settings/team` | Practice | Team member list, roles, invite flow. |
| `Services.html` | `/settings/services` | Practice | Services & pricing. Hourly rates, fixed fees, retainer amounts per service type. |
| `Subscription.html` | `/settings/subscription` | Money | Plan details ($40/mo), usage, billing history, cancel flow. |
| `StripeConnect.html` | `/settings/stripe` | Money | Stripe Connect status, payout schedule, platform fee summary. |
| `Apps.html` | `/settings/apps` | Intelligence | Apps & integrations marketplace. Google Calendar, Outlook, Dropbox, Clio, etc. with scope management and API key vault. |
| `MCP.html` | `/settings/mcp` | Intelligence | MCP & API configuration. Server endpoints, authentication, usage logs. |
| `Security.html` | `/settings/security` | Account | Password, 2FA, login history. |
| `Sessions.html` | `/settings/sessions` | Account | Active sessions list with device, IP, location, revoke capability. |
| `Appearance.html` | `/settings/appearance` | Account | Theme picker (light, dark, midnight, parchment) with live previews, density, sidebar position. |
| `Notifications.html` | `/settings/notifications` | Account | Notification preferences by category (matters, intakes, billing, system) with email/push/in-app toggles. |
| `AuditLog.html` | `/settings/audit` | Account | Filterable audit trail of all system actions with actor, timestamp, entity, and detail. |
| `ExportData.html` | `/settings/export` | Account | Data export options (matters, clients, invoices, trust ledger) in CSV/JSON with date range selection. |

### Special

| File | Route | Purpose |
|---|---|---|
| `Onboarding.html` | `/onboarding/:step` | 6-step practice setup wizard. Firm info → practice areas → services → Stripe Connect → intake form → go live. |
| `Mobile.html` | — | Mobile client screen concepts (reference only). iOS frames showing client portal, intake, and matter views at mobile scale. |

---

## Layout Patterns

### 1. Rail + Main (core app)
```
┌──────────┬──────────────────────────────────────┐
│ 240px    │                                      │
│ Rail     │  Main content                        │
│          │                                      │
│ brand    │  [crumb]                              │
│ threads  │  [h1]                                 │
│ jump-to  │  [body]                               │
│ user     │                                      │
└──────────┴──────────────────────────────────────┘
```
Used by: Assistant, Matters, Matter, Trust, Invoices, Intakes, Reports, Conversations, Clients, Calendar, Tasks.

Some screens add a **right focus drawer** (400px) for pinned entity detail (Assistant, Matter).

### 2. Settings (side + main)
```
┌──────────┬──────────────────────────────────────┐
│ 280px    │                                      │
│ Settings │  Main content                        │
│ nav      │                                      │
│          │  [crumb]                              │
│ Practice │  [h1]                                 │
│ Money    │  [sections]                           │
│ Intel    │                                      │
│ Account  │                                      │
└──────────┴──────────────────────────────────────┘
```
Used by: All `/settings/*` pages. Sidebar is sticky, scrollable (`overflow-y: auto`), collapses at 980px.

### 3. Split Detail (list + document)
```
┌──────┬──────────┬──────────────────────────────┐
│ Rail │ ~380px   │                              │
│      │ List     │  Document / Detail           │
│      │          │                              │
│      │ filters  │  header + stats              │
│      │ items    │  body                        │
│      │          │  (scrollable)                │
└──────┴──────────┴──────────────────────────────┘
```
Used by: Invoices, Intakes. Active list item has 3px gold left accent.

### 4. Standalone (no app shell)
Used by: Intake (public chatbot), EngagementReview (client signing), Onboarding (wizard), Mobile (reference).

---

## Interactions & Behavior

### Navigation
- **Rail items** navigate between core workspace pages. Clicking a matter chip in chat pins the matter to the focus drawer.
- **Settings sidebar** navigates between settings subsections. "← back to assistant" returns to the main app.
- **Split detail** lists: clicking an item loads its detail in the right pane, highlights with gold left accent.

### AI Patterns
- **Every AI assertion** must have a citation row or "grounded in N sources" label beneath it.
- **Every AI write** goes through a staged-action card (gold-tinted) that requires explicit human approval before executing. This is non-negotiable and IOLTA-relevant.
- **AI messages** animate in with the `rise` keyframe (0.4–0.5s, ease-out).
- **Tool-use lines** appear beneath AI messages showing which data tools were called.

### Hover & Click States
- **Cards/buttons:** `translateY(-1px)` on hover, shadow elevates from `--shadow-1` → `--shadow-2`. Duration: 0.14–0.18s ease.
- **Primary buttons:** ink background → gold background + dark text on hover.
- **Ghost buttons:** transparent → border darkens to ink on hover.
- **Table rows:** `background: var(--rule-soft)` on hover.
- **Nav items:** `background: var(--rule-soft)` on hover. Active: `background: var(--ink); color: var(--accent)`.

### Responsive Breakpoints
- **1100px:** `--gutter` drops from 56px to 40px.
- **980px:** Settings sidebar collapses (`display: none`). Shell goes single-column.
- **720px:** `--gutter` drops to 22px. Focus drawer stacks below. Rail collapses.

### Theme Switching
- Set via `<html data-theme="dark|midnight|parchment">`. Default is light (no attribute).
- All components use CSS variables — no per-theme component forks.
- The Appearance settings page has a theme picker with live preview cards.

---

## State Management

### Key State Variables
- `currentConversation` — active chat thread in Assistant
- `pinnedMatter` — matter shown in the focus drawer
- `activeView` — list/board toggle on Matters
- `invoiceFilter` / `intakeFilter` — active status filter in split-detail views
- `theme` — persisted user theme preference
- `stagedActions[]` — pending AI-proposed writes awaiting approval

### Data Fetching
All data comes from the PostgreSQL backend via Hono API routes. Key entities:
- `organizations`, `lawyers`, `members` (practice & team)
- `matters`, `matter_events` (cases & activity)
- `contact_forms` (intakes)
- `services` (pricing)
- `payment_history`, trust ledger tables (billing)
- `practice_assistant_actions` (staged action queue — the AI write gate)
- `files` (R2-stored documents)

---

## Design Tokens

All values live in `tokens.css`. See `DESIGN_SYSTEM.md` for the complete reference. Key values:

### Colors
| Token | Value | Role |
|---|---|---|
| `--paper` | `#f6f3ea` | Primary background (warm cream) |
| `--card` | `#ffffff` | Card surfaces |
| `--ink` | `#0f1e36` | Primary text, primary button bg |
| `--ink-2` | `#2a3b5a` | Body text |
| `--dim` | `#6b7790` | Captions, meta |
| `--rule` | `#d3d6df` | Borders, dividers |
| `--accent` | `oklch(0.72 0.13 82)` | Gold — brand accent |
| `--accent-deep` | `oklch(0.55 0.12 78)` | Emphasis text, AI deep voice |
| `--pos` | `oklch(0.55 0.10 155)` | Success/paid |
| `--warn` | `oklch(0.68 0.13 60)` | Pending/attention |
| `--neg` | `oklch(0.55 0.16 28)` | Overdue/danger |

### Typography
| Family | Variable | Role |
|---|---|---|
| Source Serif 4 | `--serif` | Display headings, stats, AI lede, letter body |
| Geist | `--sans` | UI, buttons, body, navigation |
| Geist Mono | `--mono` | Labels, timestamps, IDs, amounts, code |

### Spacing
4 / 8 / 12 / 14 / 18 / 22 / 28 / 32 / 40 / 56 rhythm. Cards: 18–22px padding. Sections: 22–36px vertical gap.

### Radii
`--r-xs: 2px` (buttons), `--r-sm: 4px` (badges), `--r-md: 8px` (cards), `--r-lg: 14px` (rare), `--r-pill: 999px` (pills/toggles).

### Shadows
`--shadow-1` (rest), `--shadow-2` (hover/popover), `--shadow-3` (focus/featured).

---

## Files

```
handoff/
├── README.md                    ← this file
├── DESIGN_SYSTEM.md             ← full component + pattern contracts
├── PRODUCT.md                   ← product overview, user journeys, feature inventory
└── screens/
    ├── tokens.css               ← CSS variables — source of truth
    ├── ios-frame.jsx            ← mobile frame component (for Mobile.html)
    ├── index.html               ← screen inventory hub
    ├── Design System.html       ← live token showcase
    │
    │  ── Core App ──
    ├── Assistant.html           ← chat home + focus drawer
    ├── Conversations.html       ← conversation list + detail (original)
    ├── Conversations v2.html    ← RECOMMENDED: cleaner inbox + mobile responsive
    ├── Matters.html             ← matter list + AI ask bar
    ├── Matter.html              ← single matter workspace
    ├── Intakes.html             ← staff triage queue
    ├── Invoices.html            ← invoice list + document
    ├── Trust.html               ← IOLTA ledger
    ├── Reports.html             ← AI-narrated monthly review
    ├── Receivables.html         ← accounts receivable & aging
    ├── TimeBilling.html         ← time & billing report
    ├── Clients.html             ← client directory
    ├── Calendar.html            ← deadlines + schedule
    ├── Tasks.html               ← task board
    │
    │  ── Engagement & Intake ──
    ├── Engagement.html          ← engagement editor (form + letter)
    ├── EngagementReview.html    ← client signing page
    ├── EngagementTemplates.html ← template management
    ├── IntakeBuilder.html       ← visual form builder
    ├── IntakeForms.html         ← intake form list + stats
    │
    │  ── Public / Client ──
    ├── Intake.html              ← public AI intake chatbot
    ├── ClientPortal.html        ← client case portal
    │
    │  ── Settings ──
    ├── Settings.html            ← AI behavior
    ├── Profile.html             ← firm profile & areas
    ├── Team.html                ← team members
    ├── Services.html            ← services & pricing
    ├── Subscription.html        ← plan & billing
    ├── StripeConnect.html       ← payment processing
    ├── Apps.html                ← integrations marketplace
    ├── MCP.html                 ← MCP & API config
    ├── Security.html            ← password & 2FA
    ├── Sessions.html            ← active sessions
    ├── Appearance.html          ← theme picker
    ├── Notifications.html       ← notification preferences
    ├── AuditLog.html            ← system audit trail
    ├── ExportData.html          ← data export
    │
    │  ── Special ──
    ├── Onboarding.html          ← practice setup wizard
    └── Mobile.html              ← mobile screen concepts
```

## Implementation Notes

### Settings Sidebar
All settings pages share an identical sidebar nav with four sections (Practice, Money, Intelligence, Account). The sidebar is:
- 280px wide, sticky, `height: 100vh`, `overflow-y: auto`
- Collapses to `display: none` at `max-width: 980px`
- Active item: `background: var(--ink); color: var(--accent)`

When implementing, extract the sidebar as a shared component. The active item gets class `on`.

### Apps.html
This is the only screen using React/Babel inline JSX (all others are plain HTML). The React layer handles filter tabs, app card grid, detail drawer with scope toggles, and API key management. In production, this should be a standard component — the JSX here is just for prototype interactivity.

### Mobile.html
Uses `ios-frame.jsx` for device bezels. These are **concept screens only** — reference for future mobile work, not currently in scope for web implementation.

### Icon Strategy
Currently uses unicode glyphs and occasional emoji as placeholder icons. The design system recommends replacing with [Lucide](https://lucide.dev/) at `stroke-width: 1.5`, sizes 14–18px, `color: currentColor`. See DESIGN_SYSTEM.md §5.
