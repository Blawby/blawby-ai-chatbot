# Blawby AI Chatbot — Design System Migration Audit

**Source of truth for the redesign.** Every claim references a concrete file, class name, or token value found in the repository or design archive.

---

## 1. Design System Summary

Source: [redesign-files/Blawby-chatbot-refactor/DESIGN_SYSTEM.md](redesign-files/Blawby-chatbot-refactor/DESIGN_SYSTEM.md) and [redesign-files/Blawby-chatbot-refactor/tokens.css](redesign-files/Blawby-chatbot-refactor/tokens.css).

### 1.1 Color Tokens

Full token list from `tokens.css` (light default):

| Token | Value | Role |
|---|---|---|
| `--paper` | `#f6f3ea` | Primary background — warm cream |
| `--paper-2` | `#ece6d3` | Subtle elevation: section bg, sticky toolbars, hover rows |
| `--paper-edge` | `#d3d6df` | Borders on raised surfaces (modals, popovers) |
| `--card` | `#ffffff` | Card and input field backgrounds — paper raised above body |
| `--ink` | `#0f1e36` | Primary text, primary button bg |
| `--ink-2` | `#2a3b5a` | Body text, secondary labels |
| `--ink-3` | `#4a5a78` | Tertiary text, meta |
| `--dim` | `#6b7790` | Captions, helper text, mono labels |
| `--dim-2` | `#9aa1b3` | Placeholders, disabled states |
| `--rule` | `#d3d6df` | 1px hairline borders and dividers |
| `--rule-soft` | `rgba(15,30,54,0.08)` | Subtle bg tints, table hover |
| `--accent` | `oklch(0.72 0.13 82)` | Gold — the one brand accent |
| `--accent-soft` | `oklch(0.72 0.13 82 / 0.14)` | Tinted backgrounds (AI cards, focus rings) |
| `--accent-deep` | `oklch(0.55 0.12 78)` | Em italic text, secondary accent text on light bg |
| `--accent-ink` | `#2a2200` | Readable text placed on gold backgrounds |
| `--pos` | `oklch(0.55 0.10 155)` | Success, paid, healthy, compliant |
| `--warn` | `oklch(0.68 0.13 60)` | Pending, attention, soon |
| `--neg` | `oklch(0.55 0.16 28)` | Error, overdue, at-risk |

**Dark theme variants** — switched via `html[data-theme="dark|midnight|parchment"]` attribute. The DS spec defines four themes; the default (no attribute) is light.

| Theme | `--paper` | `--ink` | `--accent` |
|---|---|---|---|
| `dark` | `#0c1830` | `#f1ecdc` | `oklch(0.78 0.13 82)` |
| `midnight` | `#050c1c` | `#ede7d3` | `oklch(0.80 0.14 84)` |
| `parchment` | `#f0eadb` | `#0a1a30` | `oklch(0.66 0.13 82)` |

**Critical rule:** Gold is the only accent. Never use it for danger or success. Never add a second brand color. Status uses `--pos / --warn / --neg` only.

**Semantic status mapping:**
- paid / healthy / signed / clear → `--pos`
- staged / awaiting / sent → `--accent` / `--accent-deep`
- draft / soon / pending → `--warn`
- overdue / at-risk / urgent / declined → `--neg`
- archived / closed / n/a → `--dim`

### 1.2 Typography

```html
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Variable | Family | Role |
|---|---|---|
| `--serif` | Source Serif 4 | Display, headings, letter body, italic emphasis, stats numbers |
| `--sans` | Geist | UI, buttons, body text in cards, navigation |
| `--mono` | Geist Mono | Labels (small caps), timestamps, IDs, amounts, code |

**Type scale** (no formal size tokens — role determines size):

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| `display-xl` | serif | 72px | 400 | -0.025em |
| `display-lg` | serif | 56–60px | 400 | -0.02em |
| `display-md` | serif | 44–48px | 400 | -0.02em |
| `display-sm` | serif | 28–34px | 400 | -0.012em |
| `serif-lg` | serif | 22–24px | 400 | -0.005em |
| `serif-md` | serif | 17–19px | 400 | -0.005em |
| `body` | sans | 14–15px | 400 | 0 |
| `body-sm` | sans | 12.5–13px | 400 | 0 |
| `label` | mono | 10–11px | 400 | 0.08–0.14em + UPPERCASE |
| `mono-tabular` | mono | 11–14px | 400 | -0.01em + `"tnum"` |

**Type rules (non-negotiable):**
- Headings are always Source Serif 4 at weight 400. Never bold a serif heading.
- `<em>` is reserved for `var(--accent-deep)` italic. Do not use for ordinary emphasis.
- Labels are mono + uppercase + tracked. Always.
- Tabular numbers: `font-family: var(--mono); font-feature-settings: "tnum"; letter-spacing: -.01em`.
- `text-wrap: balance` on display headings. `text-wrap: pretty` on lede paragraphs.
- `font-feature-settings: "ss01", "cv11"` on body globally (Geist stylistic alternates).

### 1.3 Space and Layout

```
--container: 1280px;
--gutter: 56px;  (40px @ 1100px, 22px @ 720px)
```

Spacing rhythm: 4 / 8 / 12 / 14 / 18 / 22 / 28 / 32 / 40 / 56. Card internal padding: 18–22px. Section gaps: 22–36px vertical.

### 1.4 Radii

```css
--r-xs: 2px;     /* buttons, chips, inputs — intentionally sharp */
--r-sm: 4px;     /* small badges */
--r-md: 8px;     /* cards, panels, drawers */
--r-lg: 14px;    /* large hero containers only */
--r-pill: 999px; /* pills, toggles, avatars */
```

The 2px on buttons is intentional. Do not round it up.

### 1.5 Elevation

```css
--shadow-1: 0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(15,30,54,0.04);   /* cards at rest */
--shadow-2: 0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -16px rgba(15,30,54,0.22);  /* hover, sticky */
--shadow-3: 0 1px 0 rgba(255,255,255,0.6) inset, 0 18px 48px -28px rgba(15,30,54,0.4);  /* focus drawer */
```

Never use Tailwind `shadow-*` utilities. Never invent new shadows.

### 1.6 Motion

```css
@keyframes rise {
  from { opacity: 0; transform: translateY(8px) }
  to   { opacity: 1; transform: none }
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--neg) 50%, transparent) }
  70%  { box-shadow: 0 0 0 8px transparent }
  100% { box-shadow: 0 0 0 0 transparent }
}
```

- `rise` — every new chat message, newly-opened panel. Duration 0.4–0.5s, `cubic-bezier(.2,.7,.2,1)`.
- `pulse` — only on the priority indicator for at-risk matters.
- Hover transitions: 0.14–0.18s ease. Translate -1px on hover. Never bounce, never > 0.5s.
- Respect `prefers-reduced-motion: reduce` — disable both keyframes.

### 1.7 Component Primitives

From `tokens.css`, these are the CSS classes that form the DS primitive layer:

| Class | Purpose |
|---|---|
| `.btn` | Base button (2px radius, Geist, 10px/18px padding, 14px) |
| `.btn-primary` | Ink bg → gold on hover |
| `.btn-ghost` | Transparent → ink border on hover |
| `.btn-accent` | Gold bg, `--accent-ink` text |
| `.btn-lg` / `.btn-sm` | Size variants |
| `.chip` | Compact secondary action (12.5px, 5px/10px padding, `--r-xs`) |
| `.chip.primary` | Ink bg chip |
| `.chip.accent` | Gold chip |
| `.chip.warn` | Neg-colored chip |
| `.pill` | Status badge (mono, uppercase, `--r-pill`, dot variant via `.dot`) |
| `.pill.live` | Green dot |
| `.pill.warn` | Warn dot |
| `.pill.urgent` | Neg dot |
| `.pill.gold` | Accent dot |
| `.card` | White card, `--rule` border, `--r-md`, `--shadow-1`, 18px padding |
| `.card-hd` | Card header (flex, space-between) |
| `.hair-list` | Hairline-separated list |
| `.field` | Form field wrapper (flex-col, 6px gap) |
| `.input` / `.textarea` / `.select` | Input elements (`--r-xs`, `--card` bg, `--rule` border) |
| `.help` | Helper text (12px, `--dim`) |
| `.toggle` | 36×20px gold toggle |
| `.bar` | Progress bar (4px, `--r-pill`) |
| `.bar.warn` | Red bar |
| `.bar.ok` | Green bar |
| `.avatar` | 28px circle (serif italic "B" on ink) |
| `.avatar.lg` | 40px variant |
| `.avatar.user` | Navy gradient, Geist initials |
| `.brand-mark` | Logo + wordmark |
| `.label` | Mono 11px uppercase 0.08em tracking |
| `.grain` | Radial dot texture for large surfaces |
| `.container` | Max-width 1280px, padded |
| `.display` | Serif 400, tight leading |
| `.mono` | Mono 11px 0.04em tracking, `--dim` |
| `.small-caps` | uppercase + 0.08em tracking |
| `.lede` | 18px, 1.5 line-height, `--ink-2` |

### 1.8 Higher-Level Patterns

| Pattern | DS Section | Description |
|---|---|---|
| `AISummary` | 3.1 | Gold-tinted card: gradient bg, avatar, mono label, serif lede, chip row. Citation required. |
| `StagedAction` | 3.2 | Gold-tinted approval card: gradient, "Staged · awaits your approval" label, serif title, chip row with primary "Approve & send". Never auto-executes. |
| `Citations` | 3.3 | Pill row beneath AI responses: `<table_name> · <row_count>`, first pill is `.live` |
| `MatterChip` | 3.4 | `matter-chip` class: 5px pin dot + label. Hover = gold tint. Active = ink border + ring. |
| `ToolUseLine` | 3.5 | `tooluse` div: `› used <code>tool_name</code> · 142ms`, color `--dim`, 44px indent |
| `Observation` | 3.6 | `observe` div: 2px `--accent` left border, `--accent-soft` gradient bg, serif italic 17–18px body |
| `Composer` | 3.7 | Sticky bottom card: `--shadow-2`, contenteditable, context chips (dashed, mono), voice + send icons |
| `StatusPills` | 3.8 | `.pill.draft/sent/paid/overdue/staged` with colored dot |
| `LetterPaper` | 3.9 | White bg, 60px horizontal padding, Source Serif 4 body at 14.5px, letterhead row. Uses fixed hexes — print-safe by design. |
| `LeftRail` | 3.10 | **240px** wide, sticky 100vh, 1px right border, brand mark, mono meta, `.new-btn`, `.rail-section` blocks, 6px dot items, selected = ink bg + accent text. Max 2 levels of nav. |
| `FocusDrawer` | 3.11 | 400px right rail, sticky, scrollable. Title + priority pulse + optional staged action + 2×2 stat grid + field list + timeline + quick actions. |
| `SplitDetail` | 3.12 | ~380px list column + flex detail column. Active item: 3px gold left accent. |
| `StatStrip` | 3.13 | 5-cell horizontal strip, 1px dividers. Each: mono label + serif large number (24–26px, `"tnum"`) + optional bar. |
| `BriefingGrid` | 3.14 | 2-col card grid. First card spans both columns, uses `.feature` variant (gold gradient). |
| `JourneyProgress` | 3.15 | Horizontal 5-step indicator, 32px circles, gold connecting line. Client portal only. |
| `SketchChart` | 3.16 | Single `--accent` color, no axis lines except 1 baseline, mono 10px labels. No pie charts. |

### 1.9 Layout Primitives

| Primitive | Description |
|---|---|
| `PageHeader` | Crumb + mono meta / H1 serif / optional lede / 1px rule |
| `PageBody` | Full-width content within `--gutter` padding, 22–32px vertical rhythm |
| `SectionHeader` | H3 serif 24–28px + optional `<em>` / 1px rule / 18px gap |
| `CardSection` | `--paper-2` strip header (H3 + label + optional buttons) / 1px rule / body at 18–22px padding |

### 1.10 Dark Mode Approach

The DS spec uses `html[data-theme="dark|midnight|parchment"]` attribute switching — not `prefers-color-scheme` media queries. The spec explicitly says: "Don't add a 'dark mode toggle' UI — themes are a data attribute, not a user preference yet."

The current app uses `.dark` class on `<html>` (class-based, toggled by JS). This must be replaced with `data-theme` attribute. For initial migration, implement `data-theme="midnight"` as the dark variant to align with the marketing site's palette.

**`parchment` is a light theme.** `data-theme="parchment"` uses a warm off-white background (`#f0eadb`) — it is NOT a dark theme and does NOT trigger `dark:` Tailwind utilities. The Tailwind selector `':is([data-theme="dark"],[data-theme="midnight"])'` deliberately excludes `parchment`. Any component using `dark:` utilities will render its light variant under `parchment`.

### 1.11 Accessibility Requirements

- Contrast: `--ink` on `--paper` passes AAA at 14px+. `--dim` on `--paper` is AA only at 14px+ — never use `--dim` for primary content.
- Focus rings: `box-shadow: 0 0 0 3px var(--accent-soft)` on all focusable elements. Never `outline: none` without replacing.
- Hit targets: 36×36px minimum. Chips are 28px+ — secondary only.
- Semantic HTML: `<button>` for actions, `<a>` for navigation. Chat stream: `<ul role="log" aria-live="polite">`. Status changes: `role="status"` regions.
- Decorative elements (pill dots, journey circles): `aria-hidden="true"`.
- `prefers-reduced-motion: reduce`: disable `rise` and `pulse`.

### 1.12 Interaction States

- **Hover**: 0.14–0.18s ease, `-1px` translateY on clickable surfaces.
- **Focus**: `box-shadow: 0 0 0 3px var(--accent-soft)` — never omit.
- **Disabled**: `opacity: 0.5`, `cursor: not-allowed`.
- **Active/selected**: `--ink` background, `--accent` text (rail items, tabs).
- **Error**: `border-color: var(--neg)`, `box-shadow: 0 0 0 3px color-mix(in oklab, var(--neg) 30%, transparent)`.

---

## 2. Repository Inventory

### 2.1 Styling Entry Points

| File | Purpose |
|---|---|
| [src/index.css](src/index.css) | Primary CSS file. `@tailwind base/components/utilities`. Defines all CSS custom properties, component classes, animation keyframes. 1,931 lines. |
| [tailwind.config.js](tailwind.config.js) | Tailwind v3 config. Maps CSS vars to Tailwind color utilities. Font families: Inter + Outfit. |
| [index.html](index.html) | Preloads `inter-latin.woff2` and `outfit-latin.woff2`. No Source Serif 4 or Geist. |

### 2.2 Theme / Token Files

| File | Purpose |
|---|---|
| [src/shared/utils/accentColors.ts](src/shared/utils/accentColors.ts) | **Runtime accent color generator.** Takes a practice's `brandColor` hex, generates `--accent-50` through `--accent-950` RGB color scales, injects via `document.documentElement.style.setProperty`. This is the mechanism that makes `bg-accent-500` render at all. |
| [src/shared/hooks/usePracticeConfig.ts](src/shared/hooks/usePracticeConfig.ts) | Loads practice config including `brandColor`, default `'#000000'`. |

**Resolved conflict:** `--accent-500` through `--accent-950` were never statically defined in CSS — they were injected at runtime per-practice by `accentColors.ts`. The design system uses a fixed gold token (`--accent: oklch(0.72 0.13 82)`). **Decision: per-practice accent is dropped.** `accentColors.ts` is deleted in Issue 1C. Existing `bg-accent-500` usages continue working temporarily via the `--accent-ch` RGB triplet bridge added in Issue 1A. The bridge is explicitly temporary and must be removed during the feature migration phase (Issues 11–12, verified in Phase 7).

### 2.3 Font Loading

- [index.html](index.html) L9–10: `<link rel="preload" href="/fonts/inter-latin.woff2" ...>` and `outfit-latin.woff2`
- [src/index.css](src/index.css) L1–36: `@font-face` declarations for Inter (2 subsets) and Outfit (2 subsets)
- No Geist, Source Serif 4, or Geist Mono anywhere in the repository.

### 2.4 App Shell / Layout

| File | Role |
|---|---|
| [src/shared/ui/layout/AppShell.tsx](src/shared/ui/layout/AppShell.tsx) | Top-level authenticated app wrapper |
| [src/shared/ui/layout/DirectShell.tsx](src/shared/ui/layout/DirectShell.tsx) | Direct-access (non-widget) shell |
| [src/shared/ui/layout/EditorShell.tsx](src/shared/ui/layout/EditorShell.tsx) | Editor layout shell |
| [src/shared/ui/layout/EmbedShell.tsx](src/shared/ui/layout/EmbedShell.tsx) | Widget embed shell |
| [src/shared/ui/layout/MarketingShell.tsx](src/shared/ui/layout/MarketingShell.tsx) | Marketing page shell |
| [src/shared/ui/layout/SetupShell.tsx](src/shared/ui/layout/SetupShell.tsx) | Onboarding setup shell |
| [src/shared/ui/layout/SplitView.tsx](src/shared/ui/layout/SplitView.tsx) | Two-column split layout |
| [src/shared/ui/layout/WorkspaceMainPane.tsx](src/shared/ui/layout/WorkspaceMainPane.tsx) | Main content pane |
| [src/shared/ui/layout/WorkspaceShellHeader.tsx](src/shared/ui/layout/WorkspaceShellHeader.tsx) | Workspace top bar (`.workspace-header` class) |
| [src/shared/ui/layout/AccentHeroSurface.tsx](src/shared/ui/layout/AccentHeroSurface.tsx) | Glass gradient surface — not in DS, delete |
| [src/shared/ui/layout/BottomBar.tsx](src/shared/ui/layout/BottomBar.tsx) | Mobile bottom bar |

### 2.5 Navigation Components

| File | Role |
|---|---|
| [src/shared/ui/nav/NavRail.tsx](src/shared/ui/nav/NavRail.tsx) | Icon nav rail + bottom bar. Uses `--nav-surface`, `rounded-2xl`, `rounded-xl`, `nav-item-active/inactive` CSS classes. |
| [src/shared/ui/nav/Sidebar.tsx](src/shared/ui/nav/Sidebar.tsx) | Full sidebar |
| [src/shared/ui/nav/PracticeSidebar.tsx](src/shared/ui/nav/PracticeSidebar.tsx) | Practice-context sidebar |
| [src/shared/ui/nav/ClientSidebar.tsx](src/shared/ui/nav/ClientSidebar.tsx) | Client-context sidebar |
| [src/shared/ui/nav/OrgSwitcherMenu.tsx](src/shared/ui/nav/OrgSwitcherMenu.tsx) | Organization switcher |
| [src/shared/ui/nav/SidebarProfileMenu.tsx](src/shared/ui/nav/SidebarProfileMenu.tsx) | Profile menu in sidebar |

### 2.6 Shared UI Primitives

| File | DS Target | Status |
|---|---|---|
| [src/shared/ui/Button.tsx](src/shared/ui/Button.tsx) | `.btn` | Exists, partially aligned — base uses `rounded-full` |
| [src/shared/ui/input/Input.tsx](src/shared/ui/input/Input.tsx) | `.input` | Exists, `rounded-xl` wrong, tokens wrong |
| [src/shared/ui/input/Textarea.tsx](src/shared/ui/input/Textarea.tsx) | `.textarea` | Same as Input |
| [src/shared/ui/input/Switch.tsx](src/shared/ui/input/Switch.tsx) | `.toggle` | Exists |
| [src/shared/ui/feedback/ProgressBar.tsx](src/shared/ui/feedback/ProgressBar.tsx) | `.bar` | Exists, uses `bg-amber-500` not `--warn` |
| [src/shared/ui/feedback/Alert.tsx](src/shared/ui/feedback/Alert.tsx) | `.card` + semantic | Exists, uses `bg-amber-500/8` not `--warn` |
| [src/shared/ui/badges/StatusBadge.tsx](src/shared/ui/badges/StatusBadge.tsx) | `.pill` | Exists, uses `status-*` classes + Tailwind utilities |
| [src/shared/ui/badges/RoleBadge.tsx](src/shared/ui/badges/RoleBadge.tsx) | `.chip` | Exists, uses Tailwind utilities |
| [src/shared/ui/badges/OnboardingStatusBadge.tsx](src/shared/ui/badges/OnboardingStatusBadge.tsx) | `.pill` | Exists, uses `bg-amber-500/10` |
| [src/shared/ui/tag/atoms/Tag.tsx](src/shared/ui/tag/atoms/Tag.tsx) | `.chip` | Exists, duplicates chip concept, uses `bg-yellow-100` |
| [src/shared/ui/profile/atoms/Avatar.tsx](src/shared/ui/profile/atoms/Avatar.tsx) | `.avatar` | Exists |
| [src/shared/ui/dialog/Dialog.tsx](src/shared/ui/dialog/Dialog.tsx) | `.card` + `--shadow-2` | Exists, wrong radius/tokens |
| [src/shared/ui/overlays/Drawer.tsx](src/shared/ui/overlays/Drawer.tsx) | DS `FocusDrawer` | Exists, wrong pattern |
| [src/shared/ui/inspector/InspectorPanel.tsx](src/shared/ui/inspector/InspectorPanel.tsx) | DS `FocusDrawer` | Exists, uses gradient with `--accent-500` |
| [src/shared/ui/table/DataTable.tsx](src/shared/ui/table/DataTable.tsx) | DS Table | Exists, uses `<table>` element (DS uses grid except for invoice line items) |
| [src/shared/ui/cards/StatCard.tsx](src/shared/ui/cards/StatCard.tsx) | `StatStrip` | Exists, replace |
| [src/shared/ui/cards/InfoCard.tsx](src/shared/ui/cards/InfoCard.tsx) | `.card` | Exists |
| [src/shared/ui/cards/NextStepsCard.tsx](src/shared/ui/cards/NextStepsCard.tsx) | `JourneyProgress` | Exists, replace |
| [src/shared/ui/activity/ActivityTimeline.tsx](src/shared/ui/activity/ActivityTimeline.tsx) | `JourneyProgress` | Exists |

### 2.7 Shared Layout Components

| File | Role |
|---|---|
| [src/shared/ui/layout/SplitView.tsx](src/shared/ui/layout/SplitView.tsx) | Candidate for DS `SplitDetail` |
| [src/shared/ui/inspector/InspectorPanel.tsx](src/shared/ui/inspector/InspectorPanel.tsx) | Candidate for DS `FocusDrawer` |
| [src/shared/ui/inspector/InspectorPrimitives.tsx](src/shared/ui/inspector/InspectorPrimitives.tsx) | Uses `--accent-500` gradient (L220, L250, L262) |
| [src/shared/ui/layout/ContentWithPreview.tsx](src/shared/ui/layout/ContentWithPreview.tsx) | Candidate for `SplitDetail` |

### 2.8 Chat-Specific Components

| File | DS Target |
|---|---|
| [src/features/chat/components/MessageComposer.tsx](src/features/chat/components/MessageComposer.tsx) | DS `Composer` |
| [src/features/chat/components/MessageBubble.tsx](src/features/chat/components/MessageBubble.tsx) | Refactor with DS tokens |
| [src/features/chat/components/Message.tsx](src/features/chat/components/Message.tsx) | Refactor with DS tokens |
| [src/features/chat/components/ChatActionCard.tsx](src/features/chat/components/ChatActionCard.tsx) | DS `StagedAction` (currently wraps ChatDockedAction) |
| [src/features/chat/components/ChatDockedAction.tsx](src/features/chat/components/ChatDockedAction.tsx) | Delete — merge into `StagedAction` |
| [src/features/chat/components/AIThinkingIndicator.tsx](src/features/chat/components/AIThinkingIndicator.tsx) | DS `ToolUseLine` (pending state) |
| [src/features/chat/components/ConversationContextPanel.tsx](src/features/chat/components/ConversationContextPanel.tsx) | DS `FocusDrawer` |
| [src/features/chat/components/ChatMarkdown.tsx](src/features/chat/components/ChatMarkdown.tsx) | Update typography to DS |
| [src/features/chat/components/MessageAttachments.tsx](src/features/chat/components/MessageAttachments.tsx) | Update tokens |
| [src/features/chat/views/WorkspaceHomeView.tsx](src/features/chat/views/WorkspaceHomeView.tsx) | DS `BriefingGrid` |
| [src/features/chat/views/ConversationListView.tsx](src/features/chat/views/ConversationListView.tsx) | Uses `bg-amber-500/20` at L133 |

### 2.9 Dashboard Components

| File | DS Target |
|---|---|
| [src/features/practice-dashboard/components/DashboardSummaryCards.tsx](src/features/practice-dashboard/components/DashboardSummaryCards.tsx) | `StatStrip` |
| [src/features/practice-dashboard/components/OutstandingPaymentsWidget.tsx](src/features/practice-dashboard/components/OutstandingPaymentsWidget.tsx) | Update with DS tokens |
| [src/features/client-dashboard/components/ClientDashboardHero.tsx](src/features/client-dashboard/components/ClientDashboardHero.tsx) | `AISummary` or `BriefingGrid` |
| [src/features/client-dashboard/components/ClientMattersGrid.tsx](src/features/client-dashboard/components/ClientMattersGrid.tsx) | `MatterChip` |

### 2.10 Matter / Invoice / Client / Intake / Engagement Components

| File | Key Issues |
|---|---|
| [src/features/matters/components/MatterSummaryCards.tsx](src/features/matters/components/MatterSummaryCards.tsx) | Uses `font-display` (Outfit), `--accent-500/0.035` gradient |
| [src/features/matters/components/MatterListItem.tsx](src/features/matters/components/MatterListItem.tsx) | `MatterChip` candidate |
| [src/features/matters/components/ActivityTimeline.tsx](src/features/matters/components/ActivityTimeline.tsx) | `JourneyProgress` target |
| [src/features/matters/components/billing/UnbilledSummaryCard.tsx](src/features/matters/components/billing/UnbilledSummaryCard.tsx) | `StatStrip` candidate |
| [src/features/invoices/components/InvoicePreview.tsx](src/features/invoices/components/InvoicePreview.tsx) | `LetterPaper` target — print-safe required |
| [src/features/invoices/components/list/InvoiceListKpiRow.tsx](src/features/invoices/components/list/InvoiceListKpiRow.tsx) | `StatStrip` target |
| [src/features/invoices/components/InvoiceStatusBadge.tsx](src/features/invoices/components/InvoiceStatusBadge.tsx) | `.pill` target |
| [src/features/engagements/pages/EngagementDetailPage.tsx](src/features/engagements/pages/EngagementDetailPage.tsx) | Uses `bg-amber-500/10 text-amber-700` at L50, L67 for status |
| [src/features/engagements/pages/EngagementsPage.tsx](src/features/engagements/pages/EngagementsPage.tsx) | Uses `bg-amber-500/10 text-amber-700` at L55 |
| [src/features/engagements/pages/ClientEngagementReviewPage.tsx](src/features/engagements/pages/ClientEngagementReviewPage.tsx) | Uses `bg-amber-500/10` at L237, L489 |
| [src/features/intake/components/IntakePaymentForm.tsx](src/features/intake/components/IntakePaymentForm.tsx) | `rounded-xl border border-amber-500/30 bg-amber-500/10` at L335 |
| [src/features/intake/pages/IntakeTemplatesPage.tsx](src/features/intake/pages/IntakeTemplatesPage.tsx) | `border-amber-500/25 bg-amber-500/10` at L1075, L1871 |

### 2.11 Dead or Likely-Dead Code

| File | Reason |
|---|---|
| [src/shared/ui/layout/AccentHeroSurface.tsx](src/shared/ui/layout/AccentHeroSurface.tsx) | Glass gradient pattern not in DS. Check importers before deleting. |
| `.glass-card`, `.glass-panel`, `.glass-input` in [src/index.css](src/index.css) L486–493 | Documented as deprecated. 9 usages in TSX files. |
| `--surface-app-frame`, `--surface-navigation`, `--surface-workspace`, `--surface-collection`, `--surface-utility`, `--surface-elevated`, `--surface-panel`, `--surface-base`, `--surface-overlay`, `--surface-nav-rail`, `--surface-nav-secondary`, `--surface-list-panel`, `--surface-inspector`, `--surface-glass`, `--line-glass` in [src/index.css](src/index.css) L85–99 | Labeled "Legacy aliases" in a comment. Should have been deleted. |
| `btn-inverted` variant in [src/index.css](src/index.css) L729 | Comment says "none at the time of this edit" — likely zero call sites. Verify before deleting. |

### 2.12 Duplicated Abstractions

| Duplicate | Files |
|---|---|
| Chip/badge concept | `StatusBadge.tsx`, `RoleBadge.tsx`, `OnboardingStatusBadge.tsx`, `Tag.tsx` — four different implementations of small status/label indicators |
| Card concept | `.card`, `.card-surface`, `.glass-card`, `.panel`, `.glass-panel` in `index.css` — five variant names with identical or near-identical output |
| Activity timeline | `src/shared/ui/activity/ActivityTimeline.tsx` AND `src/features/matters/components/ActivityTimeline.tsx` — two files, same concept |
| Drawer/panel | `Drawer.tsx`, `InspectorPanel.tsx`, `ConversationContextPanel.tsx` — three implementations of side panel |

### 2.13 Hardcoded Styling Patterns (Evidence-Backed)

**Tailwind amber/yellow (should be `--warn`):**
- `bg-amber-500/10 text-amber-700` — [EngagementDetailPage.tsx:50,67](src/features/engagements/pages/EngagementDetailPage.tsx), [EngagementsPage.tsx:55](src/features/engagements/pages/EngagementsPage.tsx), [ClientEngagementReviewPage.tsx:237,489](src/features/engagements/pages/ClientEngagementReviewPage.tsx)
- `bg-amber-500/10` — [IntakePaymentForm.tsx:335](src/features/intake/components/IntakePaymentForm.tsx), [DocumentChecklist.tsx:146](src/features/intake/components/DocumentChecklist.tsx)
- `bg-yellow-100 text-yellow-800` — [Tag.tsx:35](src/shared/ui/tag/atoms/Tag.tsx)
- `bg-amber-50 dark:bg-amber-900/20` — [SettingsNotice.tsx:24](src/features/settings/components/SettingsNotice.tsx)
- `bg-amber-500 text-amber-800 ring-amber-600/20` — [MatterTasksPanel.tsx:46](src/features/matters/components/tasks/MatterTasksPanel.tsx)

**Tailwind red (should be `--neg`):**
- 104 instances of `text-red-*`, `bg-red-*` across component files. Most common: `text-red-600 dark:text-red-400` in error states.

**Radius violations (should be `--r-*`):**
- 498 instances of `rounded-*` in TSX files.
- `.btn` base class: `rounded-full` ([src/index.css:637](src/index.css)) — DS requires `--r-xs` (2px).
- `.card`, `.card-surface`, `.glass-card`: `rounded-2xl` ([src/index.css:429](src/index.css)) — DS requires `--r-md` (8px).
- `Input.tsx:108`: `rounded-xl` — DS requires `--r-xs` (2px).
- `NavRail.tsx:101`: `rounded-xl` — depends on item, chips use `--r-xs`.
- `ChatDockedAction.tsx:34`: uses `.card` which has `rounded-2xl`.
- `.panel`, `.glass-panel`: `rounded-2xl` ([src/index.css:463](src/index.css)).

**Glass material (not in DS):**
- `--glass-rim-strong/medium/subtle`, `--glass-bg-top/mid/bottom`, `--glass-inset-rim`, `--glass-shadow` in [src/index.css:129–153](src/index.css) — 40+ lines of glass variables.
- `shadow-glass` Tailwind extension in [tailwind.config.js:139](tailwind.config.js).
- `ChatDockedAction.tsx:34`: `shadow-glass card`.

**Tailwind `shadow-*` (should be `var(--shadow-*)`):** Multiple instances using `shadow-xl`, `shadow-lg`, `shadow-sm` instead of `--shadow-1/2/3`.

**Font violations (should be Geist / Source Serif 4 / Geist Mono):**
- `fontFamily.sans: ['Inter', ...]` — [tailwind.config.js:39](tailwind.config.js)
- `fontFamily.display: ['Outfit', ...]` — [tailwind.config.js:40](tailwind.config.js)
- 32 instances of `font-display` or `font-sans` used in components for Outfit/Inter.

**`.dark` class dark mode (should be `data-theme` attribute):**
- `darkMode: 'class'` — [tailwind.config.js:33](tailwind.config.js)
- `.dark { ... }` block — [src/index.css:157–266](src/index.css)
- Used throughout: `dark:text-red-400`, `dark:bg-amber-900/20`, etc.

---

## 3. Evidence-Backed Audit Matrix

| Area | File | Current Implementation | DS Target | Gap | Action | Shared Component? | Delete in Same Phase? | Risk | Priority | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| CSS token system | [src/index.css:43–155](src/index.css) | `--surface-app: 248 250 252`, RGB triplets, `.dark` class, `--nav-surface/active-*`, glass vars, legacy aliases | `--paper`, `--ink`, `--accent` oklch vars, `html[data-theme]` | Complete vocabulary mismatch | **Replace** | — | Legacy alias block (L85–99) | High — breaks all visuals | P0 | Exact vars: `--surface-app`, `--surface-card`, `--border-subtle`, `--nav-surface`, `--glass-rim-strong` |
| Font loading | [index.html:9–10](index.html), [src/index.css:1–36](src/index.css) | `inter-latin.woff2`, `outfit-latin.woff2` preloaded; `@font-face` for Inter + Outfit | Geist + Source Serif 4 + Geist Mono | Wrong fonts, no DS fonts present | **Replace** | — | Old `@font-face` blocks | Low | P0 | `<link rel="preload" href="/fonts/inter-latin.woff2">` in `index.html` |
| Tailwind config | [tailwind.config.js:33–148](tailwind.config.js) | `darkMode: 'class'`, `fontFamily.sans: ['Inter']`, `fontFamily.display: ['Outfit']`, `colors.accent.*` pointing to undefined `--accent-500` | `darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])']`, Geist/SrcSerif4/GeistMono fonts, `colors.accent.*` numeric remapped to `--accent-ch` bridge (temporary) | Font + dark mode + color strategy wrong | **Replace** | — | `colors.surface`, `colors.primary`, `colors.accent` (numeric — temporary bridge, not permanent), `colors.input`, `colors.line`, `colors.text`, `boxShadow.glass` | High | P0 | `fontFamily.sans: ['Inter', ...]`, `'500': 'rgb(var(--accent-500) / <alpha-value>)'` |
| Per-practice accent color system | [src/shared/utils/accentColors.ts](src/shared/utils/accentColors.ts) | Runtime injects `--accent-50` through `--accent-950` per `brandColor` setting. Supports grey/gold/blue/green/yellow/pink/orange/purple. | DS: single fixed gold, no per-practice accent | Architectural conflict — **RESOLVED: Drop per-practice accent (Option A)** | **Delete** — `applyAccentColor`, `initializeAccentColor`, CSS var injection removed. `normalizeAccentColor` (pure hex validator used in API payloads) extracted to new `src/shared/utils/brandColor.ts`. Numeric `--accent-500` Tailwind scale replaced with static DS gold value via `--accent-ch` RGB triplet. | — | Delete `accentColors.ts`; update 9 importers in same PR | High | P0 | `root.style.setProperty('--accent-500', rgb)` at line 249 |
| Dark mode mechanism | [src/index.css:157](src/index.css), [tailwind.config.js:33](tailwind.config.js) | `.dark { ... }` class on `<html>`, toggled by JS, Tailwind `darkMode: 'class'` | `html[data-theme="dark\|midnight\|parchment"]` attribute — **RESOLVED: maintain all four themes from marketing site tokens** | Class vs attribute, naming different | **Replace** — `darkMode: 'class'` → `['selector', ':is([data-theme="dark"],[data-theme="midnight"])']`; `.dark` CSS block deleted; JS toggles switch to `document.documentElement.dataset.theme`; `useTheme.ts`, `SidebarProfileMenu.tsx`, `GeneralPage.tsx`, `WidgetApp.tsx`, `index.tsx`, `ChatActionCard.tsx` all updated | — | `.dark` block in index.css; all `.dark` class toggle sites | Medium | P0 | `.dark { --surface-app: 8 12 17; ... }` at index.css:157 |
| `.btn` base | [src/index.css:637](src/index.css) | `rounded-full` — pill-shaped buttons | `border-radius: var(--r-xs)` = 2px | Radius completely wrong | **Replace** | Button | — | Low | P1 | `.btn { @apply ... rounded-full ... }` at index.css:637 |
| `.btn-primary` | [src/index.css:677](src/index.css) | `background-color: rgb(var(--accent-500))` — dynamic per-practice color | `background: var(--ink)`, hover to `--accent` | Wrong bg color, wrong hover behavior | **Replace** | Button | — | Medium | P1 | `.btn-primary { background-color: rgb(var(--accent-500)); }` |
| `.btn-danger` | [src/index.css:748](src/index.css) | `bg-red-500/10 text-red-400` | `background: color-mix(in oklab, var(--neg) 14%, transparent); color: var(--neg)` | Tailwind red → DS `--neg` | **Refactor** | Button | — | Low | P1 | `.btn-danger { @apply bg-red-500/10 text-red-400; }` |
| `.btn-warning` | [src/index.css:762](src/index.css) | `bg-orange-500/10 text-orange-400` | `color: var(--warn)` pattern | Tailwind orange → DS `--warn` | **Refactor** | Button | — | Low | P1 | `.btn-warning { @apply bg-orange-500/10 text-orange-400; }` |
| `.card` class | [src/index.css:427–433](src/index.css) | `rounded-2xl border bg-surface-card border-border-subtle` | `background: var(--card); border: 1px solid var(--rule); border-radius: var(--r-md); box-shadow: var(--shadow-1)` | Radius 16px → 8px; token names wrong | **Replace** | Card | `glass-card` alias | Medium | P1 | `.card { @apply rounded-2xl border; background-color: rgb(var(--surface-card)); }` |
| `.panel` class | [src/index.css:462–469](src/index.css) | `rounded-2xl border bg-surface-section border-border-subtle` | Merges into `.card` with `--paper-2` bg | Wrong radius; separate concept → DS uses `--paper-2` bg | **Replace** | — | `glass-panel` alias | Low | P1 | `.panel { @apply rounded-2xl border; background-color: rgb(var(--surface-section)); }` |
| `.input-surface` | [src/index.css:471–477](src/index.css) | `rounded-xl border text-input-text placeholder:text-input-placeholder; bg-surface-input` | `.input { border-radius: var(--r-xs); background: var(--card); border: 1px solid var(--rule); }` | Radius 12px → 2px; token names wrong | **Replace** | — | `glass-input` alias | Low | P1 | `.input-surface { @apply rounded-xl border text-input-text; }` |
| Input.tsx component | [src/shared/ui/input/Input.tsx:108](src/shared/ui/input/Input.tsx) | `rounded-xl`, `input-surface border-none`, `text-red-600 dark:text-red-400` error | `.input` class, `border: 1px solid var(--rule)`, `color: var(--neg)` error | 3 gaps: radius, class name, error color | **Replace** | Input | — | Low | P1 | `'w-full rounded-xl text-input-text ... input-surface border-none'` at line 108; `text-red-600 dark:text-red-400` at line 175 |
| Input label | [src/shared/ui/input/Input.tsx:136](src/shared/ui/input/Input.tsx) | `text-sm font-medium text-input-text` — Geist, mixed case, 14px | `.field > label`: mono 10.5px uppercase 0.08em tracking `--dim` | Wrong font, case, size, color | **Replace** | Label | — | Low | P1 | `<label ... className="block text-sm font-medium text-input-text mb-1">` |
| Required asterisk | [src/shared/ui/input/Input.tsx:139](src/shared/ui/input/Input.tsx) | `text-red-500 ml-1` | `color: var(--neg)` | Hardcoded red | **Refactor** | Input | — | Low | P1 | `<span className="text-red-500 ml-1">*</span>` |
| StatusBadge | [src/shared/ui/badges/StatusBadge.tsx](src/shared/ui/badges/StatusBadge.tsx) | `status-success/warning/error/info` CSS classes, `rounded-full px-2.5 py-0.5 text-xs font-medium` | `.pill.live/.warn/.urgent` etc. with `--pos/--warn/--neg` | Class system completely different; radius correct (pill) but class names wrong | **Replace** | Pill | Yes (same phase) | Low | P1 | `STATUS_CLASSES: { active: 'status-success', pending: 'status-warning', ... }` |
| `.status-*` CSS classes | [src/index.css:912–930](src/index.css) | `bg-green-500/10 border-green-500/20` etc. | `--pos`, `--warn`, `--neg` via `.pill` dot | Tailwind color utilities, not DS tokens | **Delete** (replace with `.pill`) | — | Yes | Low | P1 | `.status-success { @apply border border-green-500/20 bg-green-500/10 text-[rgb(var(--success-foreground))]; }` |
| Tag.tsx | [src/shared/ui/tag/atoms/Tag.tsx:35](src/shared/ui/tag/atoms/Tag.tsx) | `bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200` for warning | `.chip.warn { color: var(--neg); }` | Tailwind yellow, wrong DS class | **Delete** → replace callers with `Chip` | — | Yes | Low | P2 | `warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'` |
| RoleBadge.tsx | [src/shared/ui/badges/RoleBadge.tsx](src/shared/ui/badges/RoleBadge.tsx) | Custom Tailwind badge | `.chip` | Duplicate chip pattern | **Delete** → replace callers with `Chip` | — | Yes | Low | P2 | Inspect to confirm pattern |
| NavRail.tsx | [src/shared/ui/nav/NavRail.tsx:101](src/shared/ui/nav/NavRail.tsx) | `rounded-xl`, `bg-[rgb(var(--nav-surface))]`, `nav-item-active/inactive` CSS, `focus-visible:ring-accent-500/50`, `rounded-2xl` on bottom variant sliding indicator | DS LeftRail: 240px, text labels, `.rail-section`, ink bg active | Completely different visual pattern — icon-only vs text, narrow vs 240px | **Replace** | LeftRail | Yes (all 4 nav files) | High | P1 | `containerClass = '... bg-[rgb(var(--nav-surface))] ...'`; `rounded-2xl` at line 104; `nav-item-active` at line 148 |
| `.nav-item-active/inactive` | [src/index.css:886–910](src/index.css) | Custom nav state classes using `--nav-*` tokens | DS LeftRail inline styles | Stale CSS classes | **Delete** with NavRail | — | Yes | Low | P1 | `.nav-item-active { color: rgb(var(--nav-active-text)); background-color: rgb(var(--nav-active-bg)); box-shadow: inset 2px 0 0 ... }` |
| ChatDockedAction.tsx | [src/features/chat/components/ChatDockedAction.tsx:34](src/features/chat/components/ChatDockedAction.tsx) | `shadow-glass card p-6`, `font-bold` heading | DS `StagedAction` gold gradient, serif heading | Glass shadow, wrong heading font, no gold treatment | **Delete** → merge into StagedAction | StagedAction | Yes | High (IOLTA) | P1 | `'ui-surface-enter mx-2 mb-4 overflow-hidden shadow-glass card p-6 text-input-text border-none'`; `className="... text-lg font-bold"` for h3 |
| ChatActionCard.tsx | [src/features/chat/components/ChatActionCard.tsx:57–73](src/features/chat/components/ChatActionCard.tsx) | Wraps ChatDockedAction for auth/payment/form/disclaimer. Has `.dark` class listener at L63. | DS `StagedAction` (for disclaimer/form) or dedicated auth/payment flows | Reads `.dark` class — must switch to `data-theme`. Card framing needs gold treatment. | **Refactor** → wire to `StagedAction` | StagedAction | ChatDockedAction | Medium | P1 | `const hasDarkClass = document.documentElement.classList.contains('dark')` at line 63 |
| InspectorPanel.tsx | [src/shared/ui/inspector/InspectorPanel.tsx](src/shared/ui/inspector/InspectorPanel.tsx) | Custom panel | DS `FocusDrawer` | Pattern mismatch | **Replace** | FocusDrawer | MobileInspectorOverlay | Medium | P2 | Verify before deleting |
| InspectorPrimitives.tsx | [src/shared/ui/inspector/InspectorPrimitives.tsx:220,250,262](src/shared/ui/inspector/InspectorPrimitives.tsx) | `bg-gradient-to-b from-[rgb(var(--accent-500))]/15`, `bg-[rgb(var(--accent-500))]/10` | `--accent-soft` gradient via DS pattern | Uses `--accent-500` which is runtime-injected per practice | **Refactor** | — | — | Medium | P2 | `from-[rgb(var(--accent-500))]/15` at line 220 |
| Alert.tsx | [src/shared/ui/feedback/Alert.tsx:31](src/shared/ui/feedback/Alert.tsx) | `bg-amber-500/8 dark:bg-amber-500/12 border-amber-500/20` for warning | `background: color-mix(in oklab, var(--warn) 10%, transparent); border: 1px solid color-mix(in oklab, var(--warn) 30%, transparent)` | Tailwind amber → DS `--warn` | **Refactor** | Alert | — | Low | P1 | `container: 'bg-amber-500/8 dark:bg-amber-500/12 border-amber-500/20'` |
| ProgressBar.tsx | [src/shared/ui/feedback/ProgressBar.tsx:23](src/shared/ui/feedback/ProgressBar.tsx) | `bg-amber-500` for warning tone | DS `.bar.warn { background: var(--neg) }` | Wrong color token | **Replace** with DS `.bar` | Bar | Yes | Low | P2 | `warning: 'bg-amber-500'` at line 23 |
| Dialog.tsx | [src/shared/ui/dialog/Dialog.tsx](src/shared/ui/dialog/Dialog.tsx) | Uses `.card` class (wrong radius) | `--r-md`, `--shadow-2`, `--paper-edge` border | Inherits `rounded-2xl` from `.card` | **Refactor** | Dialog | — | Medium | P1 | Inherits `.card { @apply rounded-2xl }` |
| `.workspace-header` | [src/index.css:534](src/index.css) | `border-b border-card-border bg-header-bg`, loading bar uses `rgb(var(--accent-500))` gradient | DS `PageHeader`: serif H1, crumb, lede, 1px rule | Different semantic entirely (topbar vs page heading) | **Refactor** | PageHeader | — | Medium | P1 | `background: rgb(var(--header-bg))` at line 537; accent-500 loading bar at line 572 |
| Markdown headings | [src/index.css:1039](src/index.css) | `@apply font-semibold leading-snug text-input-text` | Source Serif 4 weight 400, `color: var(--ink)` | Wrong font (Geist bold, not Source Serif 4), semibold not 400 | **Refactor** | — | — | Low | P2 | `.chat-markdown h1,h2,h3,h4 { @apply font-semibold leading-snug text-input-text; }` |
| EngagementDetailPage status | [src/features/engagements/pages/EngagementDetailPage.tsx:50,67](src/features/engagements/pages/EngagementDetailPage.tsx) | `bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300` inline status map | `.pill.warn` or `.pill.gold` | Inline Tailwind amber, no DS token | **Refactor** | Pill | — | Low | P2 | `draft: { className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' }` |
| ConversationListView "pending" | [src/features/chat/views/ConversationListView.tsx:133](src/features/chat/views/ConversationListView.tsx) | `rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700` | `.pill.warn` | Inline Tailwind, hand-rolled pill | **Refactor** | Pill | — | Low | P2 | Exact class string at line 133 |
| MatterSummaryCards | [src/features/matters/components/MatterSummaryCards.tsx:50](src/features/matters/components/MatterSummaryCards.tsx) | `font-display` class (Outfit), `rgb(var(--accent-500)/0.035)` gradient | Source Serif 4, `--accent-soft` | Wrong font; uses dynamic accent | **Refactor** | StatStrip | — | Low | P2 | `font-display` at line (verify); `--accent-500/0.035` at line 50 |
| Glass deprecated aliases | [src/index.css:484–493](src/index.css) | `.glass-card { @apply card }`, `.glass-panel { @apply panel }`, `.glass-input { @apply input-surface }` | Delete | Dead shims — comment says they exist "for backwards-compat during migration" | **Delete** | — | Yes (Phase 1) | Low | P0 | Comment: "These shims exist only for backwards-compat during migration and will be removed once all call sites are updated." |
| Legacy alias CSS vars | [src/index.css:85–99](src/index.css) | `--surface-app-frame`, `--surface-navigation`, `--surface-workspace`, etc. 13 aliases | Delete | Comment says "New code should prefer the role tokens above" | **Delete** | — | Yes (Phase 1) | Low | P0 | Comment: "Legacy aliases. New code should prefer the role tokens above." |
| AccentHeroSurface.tsx | [src/shared/ui/layout/AccentHeroSurface.tsx](src/shared/ui/layout/AccentHeroSurface.tsx) | Glass gradient surface | Not in DS | No DS equivalent | **Delete** after checking importers | — | Yes | Low | P1 | File exists; check importers first |
| StatCard.tsx | [src/shared/ui/cards/StatCard.tsx](src/shared/ui/cards/StatCard.tsx) | Custom stat card | DS `StatStrip` | Replace with shared pattern | **Delete** → replace with StatStrip | StatStrip | Yes | Low | P2 | File exists |
| NextStepsCard.tsx | [src/shared/ui/cards/NextStepsCard.tsx](src/shared/ui/cards/NextStepsCard.tsx) | Card with step list | DS `JourneyProgress` | Replace | **Delete** → replace with JourneyProgress | JourneyProgress | Yes | Low | P3 | File exists |
| Shared ActivityTimeline | [src/shared/ui/activity/ActivityTimeline.tsx](src/shared/ui/activity/ActivityTimeline.tsx) | Custom timeline | DS `JourneyProgress` | Replace | **Delete** → replace with JourneyProgress | JourneyProgress | Yes | Low | P2 | Duplicate exists at features/matters/components/ |
| InvoicePreview.tsx | [src/features/invoices/components/InvoicePreview.tsx](src/features/invoices/components/InvoicePreview.tsx) | Custom preview | DS `LetterPaper` | Apply LetterPaper shell | **Refactor** | LetterPaper | — | Medium (print) | P3 | Verify print styles before touching |
| DataTable.tsx | [src/shared/ui/table/DataTable.tsx](src/shared/ui/table/DataTable.tsx) | `<table>` element for data tables | DS uses CSS grid (`display: grid`) except for invoice line items where `<table>` is semantic | DS spec: use `<table>` only for invoice line items | **Refactor** (evaluate per callsite — invoice tables stay as `<table>`) | Table | — | Medium | P2 | DS spec section 2.10 |

---

## 4. Shared Component Decision Matrix

| Proposed Component | DS Pattern | Replaces | Call Sites | Proposed API | Shared? | Reason | Files to Delete | Dependencies |
|---|---|---|---|---|---|---|---|---|
| `Button` | §2.1 `.btn` | `shared/ui/Button.tsx` (refactor, not replace) | ~200 | Keep existing API, fix variant→class map | **Yes** | Already shared, already correct API shape — just fix the CSS | — | tokens.css |
| `Input` | §2.5 `.input` | `shared/ui/input/Input.tsx` (refactor) | ~80 | Keep existing API, fix className | **Yes** | Already shared | — | tokens.css |
| `Textarea` | §2.5 `.textarea` | `shared/ui/input/Textarea.tsx` (refactor) | ~25 | Keep existing API | **Yes** | Already shared | — | tokens.css |
| `Label` | §2.12 `.label` | Inline `<label>` with Tailwind text utilities | All field labels | `<Label htmlFor?>children</Label>` → `<label class="label">` | **Yes** | Repeated everywhere, always same style | — | tokens.css |
| `Chip` | §2.2 `.chip` | `Tag.tsx`, `RoleBadge.tsx` | ~30 | `variant?: 'default'\|'primary'\|'accent'\|'warn'; onRemove?; href?` | **Yes** | Repeated pattern, 2 stale duplicates | `Tag.tsx`, `RoleBadge.tsx` | tokens.css |
| `Pill` | §2.3 `.pill` | `StatusBadge.tsx`, `OnboardingStatusBadge.tsx`, inline status badges | ~40 | `tone: 'live'\|'warn'\|'urgent'\|'gold'\|'dim'; dot?: boolean` | **Yes** | Repeated pattern, 2 stale duplicates | `StatusBadge.tsx`, `OnboardingStatusBadge.tsx` | tokens.css |
| `Avatar` | §2.8 `.avatar` | `shared/ui/profile/atoms/Avatar.tsx` (refactor) | ~30 | Keep existing; add `kind: 'ai'\|'user'\|'staff'` | **Yes** | Already shared | — | tokens.css |
| `Alert` | §1.1 semantic colors | `shared/ui/feedback/Alert.tsx` (refactor) | ~15 | Keep existing; fix color tokens | **Yes** | Already shared | — | tokens.css |
| `Bar` | §2.7 `.bar` | `shared/ui/feedback/ProgressBar.tsx` | ~10 | `value: number; tone?: 'ok'\|'warn'\|'default'` | **Yes** | Already shared, small refactor | `ProgressBar.tsx` | tokens.css |
| `Card` | §2.4 `.card` | Multiple `.card`/`.panel`/`.glass-card` variants | ~60 | `<Card>children</Card>` — just the class | **Yes** | Repeated; merges stale variants | `glass-card`, `glass-panel` aliases | tokens.css |
| `Toggle` | §2.6 `.toggle` | `shared/ui/input/Switch.tsx` (refactor) | ~20 | Keep existing API | **Yes** | Already shared | — | tokens.css |
| `LeftRail` | §3.10 | `NavRail.tsx`, `Sidebar.tsx`, `PracticeSidebar.tsx`, `ClientSidebar.tsx` | 4 shell files | `items: NavItem[]; bottom?: NavItem[]; brandMark: ReactNode` | **Yes** | Core nav repeated 4 ways, all different | All 4 nav files | tokens.css |
| `FocusDrawer` | §3.11 | `Drawer.tsx`, `InspectorPanel.tsx`, `ConversationContextPanel.tsx` | ~6 | `title; subtitle; onClose; children` | **Yes** | Repeated right-panel pattern | `Drawer.tsx`, `InspectorPanel.tsx` | tokens.css |
| `SplitDetail` | §3.12 | `SplitView.tsx`, `ContentWithPreview.tsx` | ~5 | `list: ReactNode; detail: ReactNode` | **Yes** | Repeated list+detail layout | Evaluate `SplitView.tsx` | LeftRail, FocusDrawer |
| `PageHeader` | §4.1 | `WorkspaceShellHeader.tsx`, `PageHeader.tsx` (existing) | ~20 | `crumb?; title; subtitle?; actions?` | **Yes** | Repeated page header pattern | `WorkspaceShellHeader.tsx` | tokens.css |
| `AISummary` | §3.1 | None (create) | Target: ~8 screens | `heading; body; sources?: Citation[]; actions?: ChipAction[]` | **Yes** | Core AI display pattern, repeated across 8 screens | — | Chip, Label, tokens.css |
| `StagedAction` | §3.2 | `ChatDockedAction.tsx` (delete), `ChatActionCard.tsx` (refactor) | ~4 | `title; description; actionId; onApprove; onDismiss; isPending?` | **Yes** | IOLTA-critical, repeated AI write pattern | `ChatDockedAction.tsx` | tokens.css, Chip |
| `Observation` | §3.6 | None (create) | Target: ~5 | `label?; body; actions?: ChipAction[]` | **Yes** | Repeated "I noticed" pattern | — | tokens.css |
| `Citations` | §3.3 | None (create) | Target: ~8 | `sources: {table: string; rows: number}[]` | **Yes** | Required below every AI assertion | — | Pill, tokens.css |
| `MatterChip` | §3.4 | `MatterListItem.tsx` (partial) | ~6 | `matterId; name; status; urgent?; active?` | **Yes** | Appears in chat + matter list + search | — | tokens.css |
| `ToolUseLine` | §3.5 | `AIThinkingIndicator.tsx` (delete) | ~3 | `tools: string[]; ms?: number; pending?: boolean` | **Yes** | Below every AI reply | `AIThinkingIndicator.tsx` | tokens.css |
| `Composer` | §3.7 | `MessageComposer.tsx` | 1 | Keep existing API surface, rewrite internals | **Yes** | Core product surface | `MessageComposer.tsx` internals | tokens.css |
| `StatStrip` | §3.13 | `StatCard.tsx`, `InvoiceListKpiRow.tsx`, `DashboardSummaryCards.tsx` | ~6 | `stats: {label: string; value: string; bar?: BarProps}[]` | **Yes** | Repeated stat display across 6+ screens | `StatCard.tsx` | tokens.css |
| `BriefingGrid` | §3.14 | `WorkspaceHomeView.tsx` layout | 1 (home screen) | `items: ReactNode[]; featured?: ReactNode` | **No** | Only appears once — home screen. Inline the grid. | — | AISummary |
| `JourneyProgress` | §3.15 | `ActivityTimeline.tsx` (×2), `NextStepsCard.tsx` | ~4 | `steps: Step[]; current: number` | **Yes** | Repeated step display pattern | Both `ActivityTimeline.tsx` files, `NextStepsCard.tsx` | tokens.css |
| `LetterPaper` | §3.9 | `InvoicePreview.tsx` shell | 2 (invoice + engagement letter) | `firm; address; date; children` | **Yes** | Formal document shell, print-safe, used in 2 contexts | — | tokens.css (uses fixed hexes intentionally) |
| `BrandMark` | §2.9 | Inline in nav | ~4 | `size?: 'sm'\|'md'` | **Yes** | Repeated brand display | — | tokens.css |
| `Seg` | §2.11 | `segmented-toggle` CSS classes | ~8 | `value; onChange; children: SegOption[]` | **Yes** | Repeated segmented control | — | tokens.css |
| `Table` | §2.10 | `DataTable.tsx` | ~15 | Keep existing API; fix CSS to grid (non-invoice) | **Yes** | Already shared | — | tokens.css |
| Chat-specific layouts (BriefingGrid) | §3.14 | Home screen grid | 1 | — | **No — inline** | One-off layout. Don't abstract a grid used once. | — | — |
| `BottomBar.tsx` | N/A | Mobile nav | 1 shell | — | **Keep** | Mobile-only fallback, already isolated | — | LeftRail |

---

## 5. Destructive Migration Strategy

### Phase 1A — DS Tokens, Fonts, and Tailwind Config

**Goal:** Install the DS token vocabulary, swap fonts, and update Tailwind config. Pure CSS/config — no TSX files touched.

**Files touched:** `src/index.css`, `tailwind.config.js`, `index.html` (font preload swap only — boot script belongs in Phase 1B), new `src/design-system/tokens.css`, new `docs/design-system-migration.md`.

**Components created/refactored/deleted:** None.

**Stale CSS/tokens removed:**
- Glass CSS var block in `index.css` (L129–154)
- Legacy alias CSS vars block in `:root` (L85–99)
- `--surface-*` entire vocabulary (L45–155 in `:root`)
- `--border-subtle`, `--border-default`, `--border-strong`
- `--accent-utility`, `--accent-muted`, `--accent-border`, `--accent-ring`
- `--input-text`, `--input-foreground`, `--input-placeholder`
- `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`
- `--info-foreground`, `--success-foreground`, `--warning-foreground`, `--error-foreground`
- `--info`, `--success`, `--warning`, `--danger`
- `--nav-surface`, `--nav-active-text`, `--nav-active-bg`, `--sidebar-*`, `--header-*` vars
- `--glass-rim-*`, `--glass-bg-*`, `--glass-inset-rim`, `--glass-shadow` vars
- `--panel-bg-*`, `--panel-shadow`, `--input-bg-*`, `--input-shadow` vars
- Inter and Outfit `@font-face` blocks from `index.css`
- `boxShadow.glass`, `colors.surface.*`, `colors.card.*`, `colors.line.*`, `colors.input.*`, `colors.text.*`, `colors.primary.*`, `colors.accent.*` (numeric) from `tailwind.config.js`

**Acceptance criteria:**
- `https://local.blawby.com` loads with warm cream (`#f6f3ea`) background, navy text
- DevTools `:root` shows `--paper`, `--ink`, `--accent` resolving correctly
- `html[data-theme="midnight"]` switches to dark palette
- No Inter or Outfit requests in Network tab; Geist renders on page
- `npm run build` passes, zero TypeScript errors
- Zero `--surface-*`, `--border-subtle`, `--nav-surface`, `shadow-glass` in `src/index.css`
- `docs/design-system-migration.md` exists with Phase 1A entry and starting violation counts

**Risks:**
- App will look wrong until Phase 2 — expected and intentional. Do not add backwards-compat shims to soften the visual break.
- **MIGRATION COMPROMISE — `--accent-ch` bridge:** The numeric `accent.*` Tailwind utilities (`bg-accent-500`, `text-accent-500`, etc.) resolve to DS gold via `--accent-ch: 212 175 55` in `:root`. This is a temporary bridge only — not a permanent DS token. It must be removed after all `bg-accent-[number]` / `text-accent-[number]` / `border-accent-[number]` / `ring-accent-[number]` usages in TSX files are replaced with DS classes or CSS vars (Issues 11–12). Phase 7 acceptance includes zero matches for those patterns.

**Dependencies:** None. Must be first.

---

### Phase 1B — Replace `.dark` Class with `data-theme` Attribute

**Goal:** Update all JS toggle sites to use `data-theme` attribute instead of the `.dark` class.

**Files touched:** `src/shared/hooks/useTheme.ts`, `src/shared/ui/nav/SidebarProfileMenu.tsx`, `src/features/settings/pages/GeneralPage.tsx`, `src/app/WidgetApp.tsx`, `src/index.tsx`, `src/features/chat/components/ChatActionCard.tsx`, `index.html`.

**Components created/refactored/deleted:** None.

**Stale removed:** `.dark { ... }` override block from `index.css` (L157–266).

**Acceptance criteria:**
- Toggling dark mode sets `html[data-theme="midnight"]`, not `html.dark`
- `dark:` Tailwind utilities apply correctly (selector change in Phase 1A covers this)
- Theme persists across reloads; no flash of wrong theme on hard reload
- Zero `classList.add('dark')` / `classList.toggle('dark')` / `classList.contains('dark')` in codebase

**MIGRATION COMPROMISE — dark mode toggle UI preserved:** The DS spec says no toggle UI exists ("themes are a data attribute, not a user preference yet"). The existing toggle is kept to avoid a product regression. This is intentional for the migration period — the mechanism changes, the UX does not.

**Dependencies:** Phase 1A (selector must be in `tailwind.config.js` before `data-theme` switching is meaningful).

---

### Phase 1C — Delete `accentColors.ts`, Create `brandColor.ts`

**Goal:** Remove runtime CSS var injection for per-practice accent. Extract the pure hex validator for API payload use.

**Files touched:** `src/shared/utils/brandColor.ts` (create), `src/shared/utils/accentColors.ts` (delete), 9 importer TSX/TS files.

**Components created/refactored/deleted:** None.

**Acceptance criteria:**
- `npm run build` passes, zero TypeScript errors
- Zero imports of `accentColors.ts` in codebase
- `bg-accent-500` still renders DS gold (via `--accent-ch` bridge from Phase 1A)
- `normalizeAccentColor` importable from `brandColor.ts`
- Zero `root.style.setProperty` calls for `--accent-*` anywhere in codebase

**Dependencies:** Phase 1A (`--accent-ch` must be in `:root` before injection is removed).

---

### Phase 1D — Remove Glass CSS Aliases

**Goal:** Audit and remove the deprecated `.glass-card`, `.glass-panel`, `.glass-input` shims.

**Files touched:** Up to 9 TSX files, `src/index.css`.

**Components created/refactored/deleted:** None.

**Acceptance criteria:** Zero `glass-card`, `glass-panel`, `glass-input` in codebase. `npm run build` passes.

**Note:** Phase 1D can be done in parallel with 1B and 1C — it only requires 1A to have merged.

**Dependencies:** Phase 1A (`.card` / `.input` must resolve correctly before swapping glass aliases).

---

### Phase 2 — Primitive Components

**Goal:** Fix all shared primitive components to use DS tokens and classes.

**Files touched:** `Button.tsx`, `Input.tsx`, `Textarea.tsx`, `Switch.tsx`, `Alert.tsx`, `Avatar.tsx`, `Dialog.tsx`

**Components created:** `Label` (new), `Chip` (new), `Pill` (new), `Bar` (new, replaces ProgressBar)

**Components refactored:** `Button`, `Input`, `Textarea`, `Switch`, `Alert`, `Avatar`, `Dialog`

**Components deleted:** `Tag.tsx`, `RoleBadge.tsx`, `OnboardingStatusBadge.tsx`, `StatusBadge.tsx`, `ProgressBar.tsx`

**Stale CSS removed:**
- `.status-success`, `.status-warning`, `.status-error`, `.status-info` classes from `index.css`
- `.btn-inverted` (verify zero call sites first)
- `.segmented-toggle*` classes — replace with `Seg` component
- `rounded-full` on `.btn` → `border-radius: var(--r-xs)`
- `rounded-2xl` on `.card` → `border-radius: var(--r-md)`
- `rounded-xl` on `.input-surface` → `border-radius: var(--r-xs)`

**Key changes:**
- `.btn` base: `rounded-full` → `border-radius: var(--r-xs)`
- `.btn-primary`: `rgb(var(--accent-500))` → `var(--ink)` bg, `var(--accent)` hover
- `.btn-danger`: `bg-red-500/10 text-red-400` → `color: var(--neg)`
- `.btn-warning`: `bg-orange-500/10 text-orange-400` → `color: var(--warn)`
- `Input.tsx`: remove `rounded-xl`, `input-surface border-none`; apply `.input` class; fix error state
- `Input.tsx` label: `text-sm font-medium text-input-text` → `.label` class (mono uppercase)
- `Alert.tsx`: `bg-amber-500/8` → `color-mix(in oklab, var(--warn) 10%, transparent)`

**Acceptance criteria:**
- Buttons are 2px radius
- Inputs are 2px radius with `--rule` border
- Error states use `var(--neg)` color, not Tailwind red
- Status badges render as pills with `--r-pill`, semantic dot colors
- Labels in all forms render as mono uppercase in `--dim`
- Zero `rounded-full` on non-pill elements

**Tests/checks:** Visual diff on form pages. Run `npm run test`.

**Risks:** Button radius change is visual — screenshot all Button variants before. StatusBadge has ~40 call sites — use IDE find-references before deleting.

**Dependencies:** Phase 1 (tokens must resolve).

---

### Phase 3 — Layout Primitives

**Goal:** Replace nav, drawer, and page header with DS layout components.

**Components created:** `LeftRail`, `FocusDrawer`, `SplitDetail`, `PageHeader`, `BrandMark`

**Components refactored:** Shells that use nav/drawer, `WorkspaceShellHeader.tsx`

**Components deleted:** `NavRail.tsx`, `Sidebar.tsx`, `PracticeSidebar.tsx`, `ClientSidebar.tsx`, `Drawer.tsx`, `InspectorPanel.tsx`, `MobileInspectorOverlay.tsx`, `AccentHeroSurface.tsx`

**Stale CSS removed:** `.nav-item-active`, `.nav-item-inactive`, `.workspace-header*`, `--nav-*` vars, `--sidebar-*` vars, `--header-*` vars

**Key changes:**
- `LeftRail`: 240px, text labels, `.rail-section`, ink bg active item. This replaces the current icon-only `NavRail` pattern.
- `FocusDrawer`: 400px, `--shadow-3`, slide-in `rise` animation.
- `PageHeader`: serif H1, crumb, lede, 1px rule. Not a topbar — it's within-page content.

**Acceptance criteria:**
- Navigation renders as 240px text rail on desktop
- Mobile bottom nav still works
- Drawer opens/closes correctly
- Page headers render in serif

**Risks:** Nav is the highest-risk structural change. Map all nav items before deleting. Wire mobile BottomBar to LeftRail item data source. Test mobile viewport.

**Dependencies:** Phase 1, Phase 2.

---

### Phase 4 — High-Reuse Chat Patterns

**Goal:** Implement the core AI interaction patterns.

**Components created:** `AISummary`, `StagedAction`, `Observation`, `Composer`, `ToolUseLine`, `Citations`

**Components refactored:** `Message.tsx`, `MessageBubble.tsx`, `ChatMarkdown.tsx`, `ChatActionCard.tsx`

**Components deleted:** `ChatDockedAction.tsx`, `AIThinkingIndicator.tsx`

**Stale CSS removed:** `.ai-thinking-indicator__dot`, `.human-typing-indicator__dot` (if ToolUseLine covers this)

**Key changes:**
- `StagedAction`: gold gradient, "Staged · awaits your approval" label, serif title, never auto-executes. Replaces `ChatDockedAction` framing.
- `ChatActionCard` wires disclaimer/auth/payment flows into `StagedAction` where appropriate.
- `ChatMarkdown` headings: `font-semibold text-input-text` → Source Serif 4 weight 400.
- `Message.tsx`: `rounded-xl` bubbles → `--r-md`.
- Remove `.dark` class listener from `ChatActionCard.tsx:63` — replace with `data-theme` check.

**Critical:** `StagedAction` must never auto-execute. Confirm button must be disabled while `isPending`. Add idempotency guard. Do not delete `ChatDockedAction` until `StagedAction` handles all 4 action types (disclaimer, auth, payment, slim-form).

**Acceptance criteria:**
- AI approval cards render with gold gradient border
- Approve button disabled during pending
- No double-submit possible
- Tool use lines appear below AI messages in `--dim` mono
- Citations appear as pill row below AI assertions
- Composer renders with `--shadow-2`, context chips, send icon

**Tests/checks:** E2E test for approve/dismiss flow before deleting `ChatDockedAction`. Run `npm run test:e2e`.

**Risks:** IOLTA — staged action change touches the approval gate. Keep backend call (`actionId`) identical.

**Dependencies:** Phase 1, Phase 2, Phase 3.

---

### Phase 5 — Data and Display Patterns

**Goal:** Implement stat display, matter entity, and document patterns.

**Components created:** `StatStrip`, `JourneyProgress`, `LetterPaper`, `MatterChip`, `Seg`

**Components deleted:** `StatCard.tsx`, `NextStepsCard.tsx`, `shared/ui/activity/ActivityTimeline.tsx`, `features/matters/components/ActivityTimeline.tsx`

**Key changes:**
- `StatStrip`: Geist Mono tabular numbers, 1px dividers, optional `.bar`
- `LetterPaper`: Source Serif 4 body, fixed hexes (print-safe, does not respond to themes)
- `InvoicePreview.tsx`: wrap in `LetterPaper` shell, add `@media print` styles
- `MatterChip`: `matter-chip` class, 5px dot pin

**Acceptance criteria:**
- Invoice preview renders Source Serif 4 body
- `@media print` renders correctly (white bg, correct serif body)
- Stat strips show tabular numbers aligned in columns
- Activity timeline renders as step list with icons

**Risks:** `InvoicePreview` may be used for PDF generation — test print output. `LetterPaper` intentionally uses fixed hex values (not CSS vars) so it looks the same regardless of theme.

**Dependencies:** Phase 1–4.

---

### Phase 6 — Feature Migrations

**Goal:** Apply DS components across all feature pages.

**Sequence:** Chat feature → Matter pages → Invoice pages → Engagement pages → Intake pages → Dashboard pages → Settings pages

**Per-feature scope:**
- Replace inline `bg-amber-*` and `bg-yellow-*` with `.pill.warn` or `--warn` token
- Replace inline `text-red-*` with `color: var(--neg)`
- Replace `rounded-xl` instances with `--r-md` or `--r-xs` as appropriate
- Apply `StatStrip`, `JourneyProgress`, `MatterChip`, `LeftRail`, `FocusDrawer` where identified in audit

**Acceptance criteria:**
- Zero `bg-amber-*`, `bg-yellow-*`, `text-red-*` in feature files
- Zero `rounded-xl` or `rounded-2xl` in feature files
- All status labels use `.pill` with semantic tone

**Dependencies:** Phase 1–5.

---

### Phase 7 — Final Verification

No new cleanup — cleanup happens in every prior phase. Phase 7 verifies only:
- Zero `--surface-*` references remain
- Zero `--accent-500` references remain (unless per-practice color decision preserved it intentionally)
- Zero `bg-accent-[0-9]`, `text-accent-[0-9]`, `border-accent-[0-9]`, `ring-accent-[0-9]` in TSX/TS files — when this grep returns zero, delete `--accent-ch` from all four theme blocks in `src/design-system/tokens.css` and remove the `colors.accent.*` numeric entries from `tailwind.config.js`. This is the only named deletion in Phase 7; no separate issue is required.
- Zero `.dark` class references remain
- Zero Tailwind `shadow-*` utilities on DS-owned surfaces
- `prefers-reduced-motion` tested
- Contrast audit at AA level
- Print test for `InvoicePreview`

---

## 6. GitHub Issue Backlog

Run these commands before starting any issue to baseline current violation counts. Record the numbers in `docs/design-system-migration.md`.

```bash
# Theme mechanism violations
rg "\.dark\b|classList\.(add|remove|toggle|contains)\('dark'" src index.html

# Surface / legacy token references
rg "--surface-|--border-subtle|--nav-surface|shadow-glass|glass-card|glass-panel|glass-input" src

# --accent-ch bridge check (must reach zero before bridge can be deleted)
rg "bg-accent-[0-9]|text-accent-[0-9]|border-accent-[0-9]|ring-accent-[0-9]" src

# Tailwind color violations
rg "rounded-xl|rounded-2xl|bg-amber|text-amber|bg-yellow|text-yellow|text-red|bg-red" src --include="*.tsx"

# Font violations
rg "font-display|Inter|Outfit" src index.html tailwind.config.js
```

---

### Issue 1A — Foundation: DS Tokens, Fonts, and Tailwind Config

**Priority:** Blocker — must ship first  
**Labels:** `design-system`, `foundation`, `P0`

**Objective:** Install the DS token vocabulary and update fonts and Tailwind config. Pure CSS/config change — no TSX files touched.

**Prerequisites (resolve before writing a line of code):**
1. **Verify Tailwind version supports selector dark mode.** Run `npm list tailwindcss`. The `['selector', ...]` form requires Tailwind ≥ 3.3. If the installed version is older, upgrade Tailwind first as a separate commit.
2. **Font hosting: use Google Fonts.** The DS specifies Source Serif 4, Geist, and Geist Mono via Google Fonts (URL in Section 1.2). Replace the existing `<link rel="preload">` font tags in `index.html` with the DS Google Fonts `<link>` tag. Remove the local `@font-face` blocks from `index.css`. Do not mix local and remote — remove all local font files from `public/fonts/` for DS fonts.

**Scope:**
- Create `src/design-system/tokens.css`. Copy the canonical token values from the design archive and commit them to the repo — do not reference `/tmp` paths anywhere in code or issues. All four theme blocks:
  - `:root` (light default): `--paper: #f6f3ea`, `--ink: #0f1e36`, `--accent: oklch(0.72 0.13 82)`, full DS token set. Add `--accent-ch: 212 175 55` (8-bit RGB approximation of DS gold — temporary bridge, see notes).
  - `html[data-theme="dark"]`: `--paper: #0c1830`, `--ink: #f1ecdc`, `--accent: oklch(0.78 0.13 82)`. Add `--accent-ch: 200 184 80`.
  - `html[data-theme="midnight"]`: `--paper: #050c1c`, `--ink: #ede7d3`, `--accent: oklch(0.80 0.14 84)`. Add `--accent-ch: 204 188 78`.
  - `html[data-theme="parchment"]`: `--paper: #f0eadb`, `--ink: #0a1a30`, `--accent: oklch(0.66 0.13 82)`. Add `--accent-ch: 186 162 48`.
  - No `@font-face` blocks — fonts load via Google Fonts `<link>` in `index.html`.
- `src/index.css`:
  - Add at top: `@import './design-system/tokens.css'`
  - Remove: glass CSS vars (L129–154), legacy alias block in `:root` (L85–99), `--nav-*` vars, `--sidebar-*` vars, `--header-*` vars, `--surface-*` vars (L45–155), Inter+Outfit `@font-face` blocks (L1–36)
  - Remove: `--accent-utility`, `--accent-muted`, `--accent-border`, `--accent-ring`, `--border-subtle`, `--border-default`, `--border-strong`, `--input-text`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--info-foreground`, `--success-foreground`, `--warning-foreground`, `--error-foreground`
- `tailwind.config.js`:
  - `darkMode: 'class'` → `['selector', ':is([data-theme="dark"],[data-theme="midnight"])']`
  - `fontFamily.sans: ['Inter']` → `['Geist', 'ui-sans-serif']`; remove `fontFamily.display: ['Outfit']`
  - Add `fontFamily.serif: ['Source Serif 4', 'Georgia']`; add `fontFamily.mono: ['Geist Mono', 'ui-monospace']`
  - Replace all `colors.accent.*` numeric entries (`50`–`950`) with `rgb(var(--accent-ch) / <alpha-value>)` — **temporary bridge, not a permanent mapping**
  - Remove `colors.surface`, `colors.primary`, `colors.line`, `colors.input`, `colors.text`, `colors.card.border`, `boxShadow.glass`
  - Add `src/design-system/**/*.{css,tsx}` to the `content` array
- `index.html`: Remove `<link rel="preload">` for `inter-latin.woff2` and `outfit-latin.woff2`. Add the DS Google Fonts `<link>` tag from Section 1.2. Do not add the localStorage boot script here — that is Issue 1B.
- Create `docs/design-system-migration.md`: initial tracking doc with Phase 1A entry, issue links for 1A–1D, accepted compromises (`--accent-ch` bridge, dark mode toggle UI), and starting violation counts from the Section 6 baseline commands.

**Files touched:** `src/index.css`, `tailwind.config.js`, `index.html` (font preload swap only — boot script belongs in Issue 1B), new `src/design-system/tokens.css`, new `docs/design-system-migration.md`. No TSX files.

**Implementation notes:**
- `--accent-ch` is a **temporary compatibility bridge** — it lets `bg-accent-500` render DS gold without touching 100+ component files now. It must be removed after Issue 1C completes and all `bg-accent-*` usages are migrated in Issues 11–12. Do not treat it as a permanent token.
- After this issue, all existing `dark:` Tailwind utilities in TSX continue to fire (selector change, no component edits needed).

**Acceptance criteria:**
- `https://local.blawby.com` loads; background is `#f6f3ea` (warm cream)
- DevTools `:root` shows `--paper`, `--ink`, `--accent` resolving correctly
- `html[data-theme="midnight"]` in DevTools switches to dark palette
- No Inter or Outfit requests in Network tab; Geist renders on page
- `npm run build` passes, zero TypeScript errors
- Zero `--surface-*`, `--border-subtle`, `--nav-surface`, `shadow-glass` in `src/index.css`

**Verification commands:**
```bash
rg "--surface-|--border-subtle|--nav-surface|--glass-rim|shadow-glass" src/index.css
rg "Inter|Outfit|font-display" src/index.css index.html tailwind.config.js
npm run build
```

**Dependencies:** None.

**Non-goals:** Do not touch any TSX files. Do not touch `accentColors.ts`. Do not touch dark-mode JS toggle sites. Do not touch glass alias callers. Do not delete the `.dark { ... }` CSS override block — that belongs in Issue 1B.

---

### Issue 1B — Foundation: Replace `.dark` Class with `data-theme` Attribute

**Priority:** Blocker  
**Labels:** `design-system`, `foundation`, `P0`

**Objective:** Replace all JS toggle sites that set `.dark` class with `data-theme` attribute switches.

**Scope:**
- `src/shared/hooks/useTheme.ts`: remove `classList.toggle('dark', ...)`. Set `document.documentElement.dataset.theme = 'midnight'` for dark; `delete document.documentElement.dataset.theme` (or `removeAttribute('data-theme')`) for light. Remove any `prefers-color-scheme` media query fallback — the DS spec does not use it.
- `src/shared/ui/nav/SidebarProfileMenu.tsx`: update `applyTheme()` (L22–32) — replace `classList.toggle('dark', ...)` with `dataset.theme` set/delete.
- `src/features/settings/pages/GeneralPage.tsx` L124–136: replace `.dark` class mutation with `dataset.theme`.
- `src/app/WidgetApp.tsx` L614–621: replace hardcoded `classList.add('dark')` with `document.documentElement.dataset.theme = 'midnight'`.
- `src/index.tsx` L1154–1158: replace initial `.dark` class set with `data-theme` init from `localStorage`.
- `src/features/chat/components/ChatActionCard.tsx` L62–68: replace `classList.contains('dark')` and class mutation observer with a check of `document.documentElement.dataset.theme` (`=== 'dark' || === 'midnight'`).
- `index.html`: add an inline `<script>` in `<head>` that reads the `theme` key from `localStorage` and sets `html[data-theme]` before first paint — prevents flash of wrong theme.

**Theme persistence:** `localStorage` key `theme` stores the string value (`'dark'`, `'midnight'`, `'parchment'`) or is absent for light. This matches the current `.dark` preference-persistence behavior, just renamed. Do not change the UX of the dark mode toggle — only the mechanism.

**Files touched:** `src/shared/hooks/useTheme.ts`, `src/shared/ui/nav/SidebarProfileMenu.tsx`, `src/features/settings/pages/GeneralPage.tsx`, `src/app/WidgetApp.tsx`, `src/index.tsx`, `src/features/chat/components/ChatActionCard.tsx`, `index.html`.

**Acceptance criteria:**
- Toggling dark mode sets `html[data-theme="midnight"]`, not `html.dark`
- `dark:` Tailwind utilities apply when `data-theme="dark"` or `data-theme="midnight"`
- Theme preference persists across page reloads
- No flash of wrong theme on hard reload
- Zero `classList.add('dark')` / `classList.toggle('dark')` / `classList.contains('dark')` in codebase

**Verification commands:**
```bash
rg "classList\.(add|remove|toggle|contains)\(['\"]dark['\"]" src
rg "\.dark\b" src --include="*.tsx" --include="*.ts"
```

**Dependencies:** Issue 1A (selector must be in `tailwind.config.js` before toggling `data-theme` is meaningful).

**Non-goals:** Do not add new theme choices to existing UIs. The four-theme system exists in CSS — expose only what was previously exposed (light/dark binary).

---

### Issue 1C — Foundation: Delete `accentColors.ts`, Create `brandColor.ts`

**Priority:** Blocker  
**Labels:** `design-system`, `foundation`, `P0`

**Objective:** Remove runtime CSS var injection for per-practice accent. Extract the pure hex validator for API payload use.

**Scope:**
- Create `src/shared/utils/brandColor.ts` containing only `normalizeAccentColor(value?: string): string | undefined`. Pure hex validator — accepts color names (`'gold'`, `'blue'`, etc.) or raw hex strings. Returns normalized hex. No DOM side effects, no `style.setProperty` calls.
- Update all 9 importer files — in the same PR, in the same commit:
  - Remove all `applyAccentColor(...)` call sites
  - Remove all `initializeAccentColor(...)` call sites
  - Update import path from `'../utils/accentColors'` → `'../utils/brandColor'` (adjust relative path per file)
  - Retain `normalizeAccentColor` usage where it validates API payloads
  - Files: `src/index.tsx`, `src/app/MainApp.tsx`, `src/app/WidgetApp.tsx`, `src/features/settings/pages/PracticePage.tsx`, `src/features/chat/components/WorkspaceSetupSection.tsx`, `src/shared/hooks/useWorkspaceSetup.ts`, `src/shared/ui/overlays/OnboardingDialogs.tsx`, `src/features/practice-onboarding/pages/PracticeOnboardingPage.tsx`, `src/features/practice-onboarding/pages/PracticeHomePage.tsx`
- Delete `src/shared/utils/accentColors.ts` after all importers are updated.

**API / backend constraint:** Do **not** remove `brandColor` from API request payloads, response shapes, or database columns. `normalizeAccentColor` is retained precisely because the API still accepts and validates this field. The settings UI field that lets practice admins set a brand color may remain — it just no longer affects the app's visual theme. Removing the field from the product is a separate decision outside this migration.

**Files touched:** `src/shared/utils/brandColor.ts` (create), `src/shared/utils/accentColors.ts` (delete), 9 importer TSX/TS files.

**Acceptance criteria:**
- `npm run build` passes, zero TypeScript errors
- Zero imports of `accentColors.ts` in codebase
- `bg-accent-500` still renders DS gold (via `--accent-ch` bridge from Issue 1A)
- `normalizeAccentColor` importable from `brandColor.ts`, returns correct hex
- Zero `root.style.setProperty` calls for `--accent-*` anywhere in codebase

**Verification commands:**
```bash
rg "accentColors" src
rg "applyAccentColor|initializeAccentColor" src
rg "setProperty.*--accent" src
npm run build
```

**Dependencies:** Issue 1A (`--accent-ch` must be in `:root` so `bg-accent-500` resolves before injection is removed).

**Non-goals:** Do not change any API payload shape. Do not remove brand color from the settings UI.

---

### Issue 1D — Foundation: Remove Glass CSS Aliases

**Priority:** High  
**Labels:** `design-system`, `foundation`, `P0`

**Objective:** Audit and remove the deprecated `.glass-card`, `.glass-panel`, `.glass-input` CSS shims and their call sites.

**Scope:**
- Audit all TSX call sites:
  ```bash
  rg "glass-card|glass-panel|glass-input" src --include="*.tsx"
  ```
- For each call site: replace `.glass-card` → `.card`, `.glass-panel` → `.card` (with `--paper-2` bg as needed), `.glass-input` → `.input`.
- After all call sites are updated in the same PR: delete the three alias declarations from `src/index.css` (L484–493).
- Verify zero matches remain: `rg "glass-card|glass-panel|glass-input" src`

**Files touched:** Up to 9 TSX files, `src/index.css`.

**Acceptance criteria:** Zero `glass-card`, `glass-panel`, `glass-input` in codebase. `npm run build` passes.

**Dependencies:** Issue 1A (`.card` / `.input` must resolve correctly before swapping glass aliases).

---

### Issue 2 — Primitive: Button

**Priority:** High  
**Labels:** `design-system`, `primitives`, `P1`

**Objective:** Fix `.btn` CSS to use DS radius, and fix variant colors to use DS tokens.

**Scope:**
- `src/index.css` `.btn`: `rounded-full` → `border-radius: var(--r-xs)`
- `.btn-primary`: `rgb(var(--accent-500))` → `var(--ink)` bg; hover → `var(--accent)` bg, `var(--accent-ink)` text
- `.btn-ghost`: update border to `var(--rule)`, hover to `var(--ink)` border
- `.btn-danger`: `@apply bg-red-500/10 text-red-400` → `background: color-mix(in oklab, var(--neg) 12%, transparent); color: var(--neg)`
- `.btn-warning`: `@apply bg-orange-500/10 text-orange-400` → `color: var(--warn)` pattern
- `.btn-danger-ghost`, `.btn-accent-ghost`: update to DS tokens
- Focus rings: `ring-accent-500/50` → `box-shadow: 0 0 0 3px var(--accent-soft)` on all variants
- `Button.tsx`: no TSX changes needed if CSS is correct

**Files likely touched:** `src/index.css` only.

**Components deleted:** None (yet — `btn-inverted` removal in later cleanup).

**Stale CSS removed:** `ring-accent-500/50` focus rings.

**Acceptance criteria:** All button variants render correct radius (2px). Primary button is navy, hovers gold. Danger button uses `--neg` color. Focus ring is gold soft ring.

**Tests/checks:** Open `/debug/styles` to verify all button variants visually.

**Dependencies:** Issue 1A.

**Non-goals:** Do not change `Button.tsx` API.

---

### Issue 3 — Primitive: Input, Textarea, Label

**Priority:** High  
**Labels:** `design-system`, `primitives`, `P1`

**Objective:** Fix Input and Textarea to DS radius and tokens. Create `Label` primitive.

**Scope:**
- `src/index.css` `.input-surface`: `rounded-xl` → `border-radius: var(--r-xs)`; `bg-surface-input` → `var(--card)`; `border-border-subtle` → `var(--rule)`. Focus state: `border-color: var(--ink); box-shadow: 0 0 0 3px var(--accent-soft)`.
- `Input.tsx:108`: Remove `rounded-xl`, `input-surface border-none`. Add `.input` class.
- `Input.tsx:136`: Label: `text-sm font-medium text-input-text` → `font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim)` (or use new `Label` component).
- `Input.tsx:139`: `text-red-500` → `color: var(--neg)`.
- `Input.tsx:175`: `text-red-600 dark:text-red-400` → `color: var(--neg)`.
- `Textarea.tsx`: same changes as Input.
- Create `src/design-system/primitives/Label.tsx` — renders `<label className="label">` or `<span className="label">`.

**Files touched:** `Input.tsx`, `Textarea.tsx`, `src/index.css`, new `Label.tsx`.

**Components created:** `Label`.

**Components refactored:** `Input`, `Textarea`.

**Stale CSS removed:** `input-surface` class if no remaining callers. (`glass-input` alias removal is handled in Issue 1D.)

**Acceptance criteria:** Inputs have 2px radius. Focus ring is `--accent-soft`. Error state is `--neg`. Field labels are mono uppercase.

**Tests/checks:** Visual diff on login/form pages. Automated: verify `npm run test` exists in `package.json` before running.

**Dependencies:** Issue 1A.

---

### Issue 4a — Primitive: Pill; delete StatusBadge, OnboardingStatusBadge

**Priority:** High  
**Labels:** `design-system`, `primitives`, `P1`

**Objective:** Create the DS `Pill` component and replace all status badge usages.

**Scope:**
- Create `src/design-system/primitives/Pill.tsx` — applies `.pill` CSS class, props: `tone: 'live'|'warn'|'urgent'|'gold'|'dim'`, `dot?: boolean`, text as children.
- Use IDE find-references on `StatusBadge` and `OnboardingStatusBadge` before touching anything — count call sites exactly. Replace all importers with `Pill` using the correct tone mapping.
- Delete `StatusBadge.tsx`, `OnboardingStatusBadge.tsx` in the same PR after all callers are updated.
- Delete `.status-success`, `.status-warning`, `.status-error`, `.status-info` CSS classes from `src/index.css` in the same PR.

**Files likely touched:** ~42 TSX files (StatusBadge ~40, OnboardingStatusBadge ~2), `src/index.css`.

**Stale CSS removed:** `.status-*` classes.

**Acceptance criteria:** Zero imports of `StatusBadge` or `OnboardingStatusBadge`. `npm run build` passes. Status badges in files touched by this issue use `--pos/--warn/--neg` via dot colors. Pill uses `--r-pill`.

**Tests/checks:** `npm run build`. Visual diff on matters/invoice/engagements pages.

**Dependencies:** Issues 1A, 2.

---

### Issue 4b — Primitive: Chip; delete Tag, RoleBadge

**Priority:** High  
**Labels:** `design-system`, `primitives`, `P1`

**Objective:** Create the DS `Chip` component and replace all tag/role-badge usages.

**Scope:**
- Create `src/design-system/primitives/Chip.tsx` — applies `.chip` CSS class, props: `variant?: 'default'|'primary'|'accent'|'warn'`, optional `onRemove`, optional `href`.
- Use IDE find-references on `Tag` and `RoleBadge` before touching anything. Replace all importers with `Chip`.
- Delete `Tag.tsx`, `RoleBadge.tsx` in the same PR after all callers are updated.

**Files likely touched:** ~15 TSX files.

**Acceptance criteria:** Zero imports of `Tag` or `RoleBadge`. `npm run build` passes. Chip uses `--r-xs`. No `bg-yellow-*` in the former callers of `Tag`.

**Tests/checks:** `npm run build`. Visual diff on settings/onboarding pages.

**Dependencies:** Issues 1A, 2, 4a.

---

### Issue 5 — Layout: LeftRail; delete NavRail, Sidebar, PracticeSidebar, ClientSidebar

**Priority:** High  
**Labels:** `design-system`, `layout`, `P1`

**Objective:** Replace the icon-only nav rail and sidebar variants with DS 240px text rail.

**Scope:**
- Create `src/design-system/layout/LeftRail.tsx` — 240px, `--ink` bg active item, `--accent` active text, `.rail-section` groups with mono labels, 6px dot items, `.new-btn` full-width primary, user chip at bottom
- Create `src/design-system/layout/BrandMark.tsx` — serif italic "B" gold + Geist wordmark
- Extract nav item data from `PracticeSidebar.tsx` and `ClientSidebar.tsx` — wire into `LeftRail`
- Replace all uses of `NavRail`, `Sidebar`, `PracticeSidebar`, `ClientSidebar` with `LeftRail` in shells
- Delete `NavRail.tsx`, `Sidebar.tsx`, `PracticeSidebar.tsx`, `ClientSidebar.tsx`
- `BottomBar.tsx`: keep as mobile fallback, update to use `--nav-*` → `--paper-2` / `--ink` / `--accent`
- Remove `.nav-item-active`, `.nav-item-inactive` from `index.css`
- Remove `--nav-*`, `--sidebar-*`, `--header-*` CSS vars if not already removed in Issue 1A

**Stale CSS removed:** `.nav-item-active`, `.nav-item-inactive`, remaining nav/sidebar CSS vars.

**Acceptance criteria:** Navigation renders as 240px text rail on desktop. Mobile bottom bar still works. Active item: ink bg, gold text. Brand mark visible at top. User chip at bottom. No `NavRail`, `Sidebar` imports remain.

**Tests/checks:** Visual test on desktop and mobile. Navigation between routes works.

**Note:** This is the highest-risk layout change. Do not merge without testing all route transitions and mobile viewport.

**Dependencies:** Issues 1A, 2.

---

### Issue 6 — Chat: StagedAction, Observation, ToolUseLine, Citations; delete ChatDockedAction, AIThinkingIndicator

**Priority:** High — IOLTA-critical  
**Labels:** `design-system`, `chat`, `iolta`, `P1`

**Objective:** Implement DS AI interaction patterns. Replace the glass approval card with the DS gold-gradient staged action.

**Scope:**
- Create `src/design-system/patterns/StagedAction.tsx`
  - Gold gradient: `linear-gradient(135deg, color-mix(in oklab, var(--accent) 22%, var(--card)), var(--card))`
  - Gold border: `1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))`
  - Mono label: "Staged · awaits your approval"
  - Serif title
  - Chip row: primary "Approve & send ↗", secondary edit/preview, optional `warn` discard
  - `isPending`: disable approve button + show `pulse` animation
  - Never auto-execute. Idempotency guard required.
- Refactor `ChatActionCard.tsx`: remove `.dark` class listener (L63), wire auth/payment/disclaimer types into `StagedAction` framing or dedicated flows
- Delete `ChatDockedAction.tsx` (after ChatActionCard no longer imports it)
- Create `src/design-system/patterns/Observation.tsx` — 2px `--accent` left border, `--accent-soft` gradient bg, serif italic body
- Create `src/design-system/patterns/ToolUseLine.tsx` — `div.tooluse`: `› used <code>tool</code> · Nms`, `--dim` color, 44px indent
- Create `src/design-system/patterns/Citations.tsx` — `.pill` row, first pill `.live`
- Delete `AIThinkingIndicator.tsx` — ToolUseLine with `pending` covers its function
- Update `Message.tsx` and `MessageBubble.tsx` to use `--r-md` radius, DS tokens

**Implementation notes:** `StagedAction.onApprove` must call the same backend endpoint as `ChatDockedAction`. The `actionId` prop passes through unchanged — only the UI frame changes. Test the approve/dismiss E2E before merging.

**Stale CSS removed:** `.ai-thinking-indicator__dot`, `.human-typing-indicator__dot`.

**Acceptance criteria:** Gold gradient card visible for AI-proposed actions. Approve button disabled when pending. Cannot double-submit. Tool use lines visible below AI messages. Citations appear below AI assertions. No ChatDockedAction or AIThinkingIndicator imports.

**Tests/checks:** Verify `npm run test:e2e` exists in `package.json` before running. Visual diff on chat page.

**Dependencies:** Issues 1A–4b.

**Non-goals:** Do not change backend approval endpoint.

---

### Issue 7 — Chat: AISummary, Composer

**Priority:** High  
**Labels:** `design-system`, `chat`, `P1`

**Objective:** Implement the AI summary card and replace the composer with DS pattern.

**Scope:**
- Create `src/design-system/patterns/AISummary.tsx`
  - Gradient: `linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--card)), var(--card))`
  - Border: `1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))`
  - AI avatar (`.avatar`), mono label ("Assistant summary"), serif lede, chip row
  - Required: always paired with `Citations` or "grounded in N sources" label
- Rewrite `MessageComposer.tsx` internals to match DS `Composer` pattern: `--shadow-2` card, contenteditable or textarea with `data-ph` placeholder, context chips (dashed, mono), voice + send icons, mono trust line
- Update `ChatMarkdown.tsx` headings: `font-semibold` → `font-family: var(--serif); font-weight: 400`
- Update `chat-markdown em` style: currently `@apply italic` — must also add `color: var(--accent-deep)`

**Acceptance criteria:** AI summary cards have gold gradient. Chat headings render in Source Serif 4. Composer uses `--shadow-2`. `<em>` in chat renders gold italic.

**Dependencies:** Issues 1A–6.

---

### Issue 8 — Layout: FocusDrawer, SplitDetail, PageHeader; delete Drawer, InspectorPanel

**Priority:** Medium  
**Labels:** `design-system`, `layout`, `P2`

**Objective:** Implement DS right panel and split layout.

**Scope:**
- Create `src/design-system/layouts/FocusDrawer.tsx` — 400px, `--shadow-3`, `rise` animation, close button, scrollable
- Create `src/design-system/layouts/SplitDetail.tsx` — list column (~380px) + detail column (flex), active list item has 3px `--accent` left accent
- Refactor `PageHeader.tsx` (already exists) — ensure H1 is serif, crumb is mono, lede paragraph uses `.lede` class
- Replace `Drawer.tsx` importers → `FocusDrawer`. Delete `Drawer.tsx`.
- Replace `InspectorPanel.tsx` importers → `FocusDrawer`. Delete `InspectorPanel.tsx`, `MobileInspectorOverlay.tsx`.
- Replace `SplitView.tsx` / `ContentWithPreview.tsx` with `SplitDetail` where appropriate.
- Update `InspectorPrimitives.tsx` gradient: `--accent-500` → `--accent-soft`

**Stale CSS removed:** Any remaining `.workspace-header*` CSS.

**Acceptance criteria:** Drawers use `--shadow-3`. Panel slides in with `rise` animation. SplitDetail active item has gold left accent. `@media (prefers-reduced-motion)` disables animation.

**Dependencies:** Issues 1A–5.

---

### Issue 9 — Data Display: StatStrip, JourneyProgress; delete StatCard, ActivityTimeline, NextStepsCard

**Priority:** Medium  
**Labels:** `design-system`, `data-display`, `P2`

**Objective:** Implement DS stat and progress patterns.

**Scope:**
- Create `src/design-system/patterns/StatStrip.tsx` — 5-cell row, 1px dividers, mono label, serif large number with `"tnum"`, optional `Bar`
- Create `src/design-system/patterns/JourneyProgress.tsx` — vertical step list (staff app) or horizontal 5-step (client portal only), Lucide status icons, mono timestamps
- Replace `StatCard.tsx` callers → `StatStrip`. Delete `StatCard.tsx`.
- Replace `InvoiceListKpiRow.tsx` → `StatStrip`.
- Replace both `ActivityTimeline.tsx` files → `JourneyProgress`. Delete both.
- Replace `NextStepsCard.tsx` → `JourneyProgress`. Delete `NextStepsCard.tsx`.

**Acceptance criteria:** Stats use tabular Geist Mono. Step lists show Lucide icons. No `StatCard`, `ActivityTimeline`, `NextStepsCard` imports.

**Dependencies:** Issues 1A–4b.

---

### Issue 10 — Patterns: LetterPaper, MatterChip, Seg

**Priority:** Medium  
**Labels:** `design-system`, `patterns`, `P2`

**Objective:** Implement document and entity reference patterns.

**Scope:**
- Create `src/design-system/patterns/LetterPaper.tsx` — white bg, 60px horizontal padding, Source Serif 4 body 14.5px 1.6 line-height, letterhead row, `@media print` styles. Uses fixed hexes (not CSS vars) intentionally.
- Wrap `InvoicePreview.tsx` in `LetterPaper`. Test print output.
- Create `src/design-system/patterns/MatterChip.tsx` — `.matter-chip` class, 5px dot pin, hover gold tint, active ink border + ring, `urgent` state
- Create `src/design-system/primitives/Seg.tsx` — segmented control (1px outer border, 1px dividers, selected = ink bg accent text). Delete `.segmented-toggle*` CSS from `index.css`.
- Replace inline amber status maps in `EngagementDetailPage.tsx`, `EngagementsPage.tsx`, `ClientEngagementReviewPage.tsx` with `Pill` component

**Acceptance criteria:** Invoice prints correctly. LetterPaper ignores theme (always white/cream regardless of `data-theme`). MatterChip shows gold on hover. Segmented controls styled correctly.

**Tests/checks:** `@media print` in browser DevTools. Visual diff on invoice detail page.

**Dependencies:** Issues 1A–4b.

---

### Issue 11 — Feature: Chat, Matters, Invoices pages

**Priority:** Medium  
**Labels:** `design-system`, `feature-migration`, `P2`

**Objective:** Apply DS components across chat, matter, and invoice feature pages.

**Scope:**
- Replace all `bg-amber-*`, `text-amber-*` in `ConversationListView.tsx`, `WidgetConversationListView.tsx` with `Pill.warn`
- Replace `bg-amber-*` in `IntakePaymentForm.tsx`, `DocumentChecklist.tsx`, `IntakeTemplatesPage.tsx` with `--warn` tokens or `Pill`
- Replace `MatterSummaryCards.tsx` `font-display` → `font-serif`; replace `--accent-500` gradient with `--accent-soft`
- Replace `UnbilledSummaryCard.tsx` → `StatStrip`
- `DashboardSummaryCards.tsx` → `StatStrip`
- All remaining `rounded-xl`/`rounded-2xl` in feature files → `--r-md`/`--r-xs`

**Acceptance criteria (scoped to files touched by this issue):** Zero `bg-amber-*` or `bg-yellow-*` in files modified by this issue. Zero `rounded-xl` or `rounded-2xl` in files modified by this issue. Zero `text-red-*` for semantic error states in files modified by this issue. Phase 7 enforces repo-wide zero — not this issue.

**Dependencies:** Issues 4a, 9, 10.

---

### Issue 12 — Feature: Engagement, Intake, Dashboard, Settings pages

**Priority:** Low  
**Labels:** `design-system`, `feature-migration`, `P3`

**Objective:** Apply DS components across remaining feature pages.

**Scope:** Same token/radius cleanup as Issue 11, applied to Engagements, Intake, Client Dashboard, Practice Dashboard, Settings.

**Acceptance criteria (scoped to files touched):** Zero `bg-amber-*`, `bg-yellow-*`, `text-red-*`, `rounded-xl`, `rounded-2xl` in files modified by this issue. Phase 7 enforces repo-wide zero.

**Dependencies:** Issues 4a–11.

---

### Issue 13 — DataTable Semantics Audit

**Priority:** Low  
**Labels:** `design-system`, `audit`, `P3`

**Objective:** Determine per-callsite whether `DataTable` uses should remain `<table>` (semantic) or be converted to CSS grid (DS default).

**Scope:**
- Find all `DataTable` importers: `rg "DataTable" src --include="*.tsx" -l`
- For each callsite: determine if the table is tabular data (invoices, payments, amounts) or a display list (matters, clients, conversations).
  - Tabular financial data → keep `<table>` (DS spec explicitly allows this)
  - Display lists → convert to CSS grid per DS spec
- Document the decision per callsite in a comment on this issue. Implement changes in a follow-on PR.

**Acceptance criteria:** Every `DataTable` callsite has a documented decision. No changes made without the audit complete.

**Dependencies:** Issues 1A, 2.

---

## 7. Cleanup Policy

The following rules apply to every PR in this migration. No exceptions, no deferred cleanup:

1. **Delete replaced files in the same PR.** When `StatusBadge.tsx` is replaced by `Pill.tsx`, `StatusBadge.tsx` is deleted in the same commit. No `export { Pill as StatusBadge }` shims.

2. **Update all imports in the same PR.** Do not leave dead imports pointing to deleted files. `npm run build` must pass.

3. **No backwards-compat token aliases.** Do not add `--surface-app: var(--paper)` bridge vars. Delete `--surface-*` and update every callsite.

4. **No old/new component variants in parallel.** Do not add a `variant="legacy"` prop. If a caller needs updating, update the caller in the same PR.

5. **Delete unused CSS in the same PR.** When `.nav-item-active` is replaced by `LeftRail`, delete the CSS class in the same PR.

6. **No Tailwind color utilities for semantic meaning.** `text-red-600` → `color: var(--neg)`. `bg-amber-500/10` → `background: color-mix(in oklab, var(--warn) 12%, transparent)`. `text-green-*` → `color: var(--pos)`.

7. **No non-DS radius values.** Any `rounded-xl` (12px) or `rounded-2xl` (16px) anywhere (TSX or CSS) is a violation. Use `--r-xs/sm/md/lg/pill` or the `.card`/`.btn`/`.chip`/`.pill` classes.

8. **No stale font families.** `font-display` (Outfit) and `font-sans: Inter` are deleted in Issue 1A. Any component using `font-display` after Issue 1A merges is a violation.

9. **No Tailwind `shadow-*` on DS-owned surfaces.** Use `var(--shadow-1/2/3)`. `shadow-glass` is deleted.

10. **No per-practice accent in shared DS patterns.** The DS gold (`--accent`) is fixed. Shared DS patterns (`StagedAction`, `AISummary`, etc.) use `--accent` directly, not `--accent-500`. Per-practice theming, if preserved, is scoped to specific surfaces only.

11. **No `.dark` class references in new code.** All dark mode checks must use `html[data-theme]` attribute.

12. **No one-off versions of shared DS patterns.** If a page needs what looks like `AISummary` or `StagedAction`, use the shared component. Don't hand-roll a local version.

13. **New DS components live in `src/design-system/`.** Existing shared components may remain in `src/shared/ui/` during migration — each issue must state whether it moves files or only changes styling. Do not create components in both directories for the same concept. Import from `src/design-system/` in new call sites; update old call sites to the new path when the component moves.

14. **Verify test scripts exist before writing checks.** Before writing `npm run test` or `npm run test:e2e` in an issue, confirm those scripts exist in `package.json`. Use only scripts that are present. Check with: `cat package.json | jq '.scripts'`

15. **Create and maintain a migration tracking doc.** Create `docs/design-system-migration.md` in Phase 1A (Issue 1A) — do not defer to later phases. Include: phase checklist (done/in-progress/todo), issue links, components deleted per phase, known exceptions (e.g. `LetterPaper` intentionally uses fixed hexes), accepted temporary compromises (`--accent-ch` bridge, dark mode toggle UI preservation), and remaining violation counts from grep. Update it when each issue merges. This is the canonical state-of-migration reference — not this audit doc.

16. **Do not remove `brandColor` from API payloads or database fields.** This migration removes the runtime CSS side effects of `brandColor` (per-practice accent injection via `accentColors.ts`). It does not remove `brandColor` from API request/response shapes, database columns, onboarding forms, or practice config. `normalizeAccentColor` is retained in `brandColor.ts` for API payload validation. Product-level removal of the `brandColor` field is a separate decision outside this migration.

### Repeatable Verification Commands

Run these at any point to measure migration progress. Phase 7 acceptance requires all return zero (with documented exceptions).

```bash
# Dark mode mechanism violations
rg "classList\.(add|remove|toggle|contains)\(['\"]dark['\"]" src
rg "\.dark\b" src --include="*.tsx" --include="*.ts" | grep -v "node_modules"

# Surface / legacy token references
rg "--surface-|--border-subtle|--nav-surface|--glass-rim|shadow-glass|--accent-utility" src/index.css

# Dynamic accent injection
rg "accentColors|applyAccentColor|initializeAccentColor|setProperty.*--accent" src

# --accent-ch bridge removal check — delete bridge when this returns zero
rg "bg-accent-[0-9]|text-accent-[0-9]|border-accent-[0-9]|ring-accent-[0-9]" src --include="*.tsx" --include="*.ts"

# Tailwind amber/yellow/red semantic color violations
rg "bg-amber-|text-amber-|bg-yellow-|text-yellow-|text-red-|bg-red-" src --include="*.tsx"

# Radius violations
rg "rounded-xl|rounded-2xl|rounded-full" src --include="*.tsx" src --include="*.css" | grep -v "r-pill\|toggle\|avatar"

# Font violations
rg "font-display|font-sans|Inter|Outfit" src --include="*.tsx" src/index.css index.html tailwind.config.js

# Tailwind shadow violations on DS-owned surfaces
rg "shadow-xl|shadow-lg|shadow-sm|shadow-md|shadow-glass" src --include="*.tsx"

# Remaining glass aliases
rg "glass-card|glass-panel|glass-input" src
```

---

## 8. Risk and Dependency Analysis

### Highest-Risk Files

| File | Risk | Why | Mitigation |
|---|---|---|---|
| [src/shared/utils/accentColors.ts](src/shared/utils/accentColors.ts) | ~~Critical~~ **RESOLVED** | Entire accent color system (`bg-accent-500` everywhere) depends on runtime injection from this file. DS uses fixed gold. Incompatible architecturally. | **Decision: Drop per-practice accent (Option A).** Delete `accentColors.ts`. Extract `normalizeAccentColor` (pure hex validator for API payloads) to `src/shared/utils/brandColor.ts`. In `tailwind.config.js`, replace `colors.accent.*` numeric scale with static DS gold via `--accent-ch: 212 175 55` RGB triplet in `:root`, so all existing `bg-accent-500` usages resolve to fixed gold without touching 100+ component files. |
| [src/features/chat/components/ChatDockedAction.tsx](src/features/chat/components/ChatDockedAction.tsx) + [ChatActionCard.tsx](src/features/chat/components/ChatActionCard.tsx) | **High** | IOLTA gate. Auth, payment, disclaimer, and slim-form are all routed through these two files. | Build `StagedAction` and wire all 4 types before deleting. Add E2E test covering approve/dismiss. Keep backend call signature identical. |
| [src/shared/ui/nav/NavRail.tsx](src/shared/ui/nav/NavRail.tsx) and all Sidebar variants | **High** | Core navigation — every authenticated page depends on it. | Map all nav items from all 4 sidebars before writing `LeftRail`. Wire mobile `BottomBar` before deleting `NavRail`. Test all routes in desktop + mobile viewport. |
| [src/features/invoices/components/InvoicePreview.tsx](src/features/invoices/components/InvoicePreview.tsx) | **Medium** | Likely used for PDF/print generation. `LetterPaper` intentionally uses fixed hexes — verify print CSS preserved. | Add `@media print` test before merging. Check if any Puppeteer or Playwright snapshot captures this. |
| [src/shared/ui/table/DataTable.tsx](src/shared/ui/table/DataTable.tsx) | **Medium** | DS spec says use CSS grid for tables (not `<table>`), except invoice line items. DataTable uses `<table>`. | Invoice line items: keep `<table>` (semantically correct per DS spec). Other uses of DataTable: evaluate individually. Do not blindly convert all tables to grid. |

### Highest-Risk Flows

| Flow | Risk | Mitigation |
|---|---|---|
| IOLTA staged-action approval | Any regression here is IOLTA-relevant. | E2E test before and after `StagedAction`. Keep `actionId` passthrough unchanged. Double-submit guard required. |
| Auth flow (login/signup via `ChatActionCard`) | Auth failure = user locked out | Wire auth flow into `StagedAction` framing carefully. Test signup + login on staging before merging. |
| Payment flow (Stripe Elements inside `ChatDockedAction`) | Payment UI broken = lost revenue | Stripe `Elements` component lives inside `ChatActionCard` → `ChatDockedAction`. When `ChatDockedAction` is deleted, ensure `Elements` is still rendered inside appropriate card frame. |

### Components That Should Not Be Migrated Early

| Component | Reason |
|---|---|
| `MessageComposer.tsx` | High complexity (file attachments, audio, mentions, reply-to). Migrate in Issue 7 after simpler patterns are stable. |
| `DataTable.tsx` | Table semantics decision (grid vs `<table>`) varies by use case. Requires a dedicated callsite audit before touching — add as a separate issue (see Issue 13). |
| `InvoicePreview.tsx` | Print risk. Migrate in Issue 10, last of the display patterns. |

### Hidden Coupling Risks

| Risk | Detail |
|---|---|
| `chatMarkdown em` color | Currently `@apply italic` in `index.css:1159`. DS says `<em>` should be `color: var(--accent-deep)`. Adding this will change the look of all italicized text in chat — not just headings. Intentional per DS, but review with product. |
| `data-theme` attribute vs `prefers-color-scheme` | The DS spec does NOT use `prefers-color-scheme`. It uses `html[data-theme]`. Any component reading `prefers-color-scheme` (like `ChatActionCard.tsx:60–63`) must be updated. Search for `prefers-color-scheme` in TSX files before Phase 1. |
| `accentColors.ts` call sites | Every component using `bg-accent-500`, `text-accent-500`, `border-accent-500` is implicitly dependent on the runtime injection. There are hundreds of these. They work today because `accentColors.ts` sets `--accent-500`. If `--accent-500` is removed from Tailwind config, all these classes produce no output. |
| `dark:` Tailwind prefix | ~~When removing `.dark` class mechanism, all `dark:` Tailwind utilities stop working.~~ **RESOLVED** — `darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])']` in `tailwind.config.js` means all existing `dark:` utilities (198 usages in TSX) continue to fire when `html[data-theme="dark"]` or `html[data-theme="midnight"]` is set. No per-component changes required. The `data-theme` attribute replaces the `.dark` class as the trigger, but the `dark:` prefix keeps working without touching component files. |

### Build / Test Risks

| Risk | Mitigation |
|---|---|
| TypeScript: deleting `StatusBadge` breaks imports | Use IDE find-references before deleting any file |
| Tailwind purge: new DS classes (`.card`, `.label`, `.btn`) not in TSX files | Add `src/design-system/**/*.tsx` to Tailwind content array |
| Preact SSR / hydration mismatch if `data-theme` is set server-side | Set `data-theme` from localStorage in `<head>` script to avoid flash, same as current `.dark` toggle |

### Accessibility Risks

| Risk | Mitigation |
|---|---|
| `--dim` on `--paper` is AA only, not AAA | Do not use `--dim` for body text. Use `--ink-2` or `--ink-3` for secondary body. `--dim` is labels and captions only. |
| `rise` animation: `translateY(8px)` may trigger vestibular disorder symptoms | Implement `prefers-reduced-motion` in Phase 1 as part of the keyframe setup. |
| New `Pill` component: status dot is decorative | Add `aria-hidden="true"` to the `::before` dot. Text content carries the meaning. |

### Visual Regression Risks

| Risk | Mitigation |
|---|---|
| Phase 1 makes the app look wrong (tokens changed, components not updated) | Communicate clearly. This is expected and short-lived. Do not add "backwards compat" to avoid it. |
| Button radius change: 2px instead of `rounded-full` is a significant visual change | Screenshot all button variants in `/debug/styles` before Issue 2. |
| LeftRail: switching from icon-only narrow nav to 240px text nav narrows available content width significantly | Test all pages at 1280px and 1440px. May require adjusting `--container` max-width or page body padding. |

---

## 9. First Issue Recommendation

**Issues 1A through 1D — Foundation: Tokens, Dark Mode, Accent System, Glass Aliases.**

Start here. The foundation issues must ship before any other work can be verified. 1A → 1B → 1C → 1D in order (each builds on the prior), but 1B and 1C and 1D can be done in parallel once 1A is merged. 1D has the lowest risk and can be done any time after 1A.

This is the correct first sequence because:

1. **Unblocks everything.** No other issue can be verified without correct token resolution. Every DS-compliant component reference must see `--paper`, `--ink`, `--accent` resolving. That's 1A.

2. **Contained blast radius per sub-issue.** 1A touches only CSS/config. 1B touches only JS toggle sites. 1C touches only `accentColors.ts` and its 9 importers. 1D touches only glass alias call sites. Each is independently revertable.

3. **Deletes real stale code immediately.** The legacy alias block, glass material vars, and `.dark` override block have been sitting in `index.css` marked as deprecated. Remove them.

4. **No data migration. No API changes.** `normalizeAccentColor` is retained in `brandColor.ts`; API payloads are untouched.

5. **Establishes the baseline.** After 1A merges, open DevTools, confirm `--paper` and `--accent` resolve correctly, and know that every subsequent component refactor is working against the right foundation.

**Both pre-work decisions are resolved — Issue 1A is ready to start:**
- Per-practice accent: **Drop.** Delete `accentColors.ts` (Issue 1C). Use `--accent-ch` RGB triplet bridge (Issue 1A). Bridge is temporary.
- Dark mode mechanism: **Four-theme `data-theme` attribute.** `darkMode: ['selector', ':is([data-theme="dark"],[data-theme="midnight"])']` preserves all existing `dark:` Tailwind utilities — no per-component audit required. JS toggle sites listed in Issue 1B.

**Before starting Issue 1A:** Resolve the two prerequisites — Tailwind version check and font hosting decision. Both are blocking.

### Visual Review Checklist

After each phase, manually verify these routes at `https://local.blawby.com` in both light and dark (`html[data-theme="midnight"]`) modes:

| Route | Phase 1 check | Phase 2 check | Phase 3 check | Phase 4 check |
|---|---|---|---|---|
| Login / auth flow | Background color, font | Input radius, label style | — | — |
| Chat (conversation view) | Background, no glass | Badges, buttons | Nav rail | Staged action, tool lines |
| Chat (composer) | — | — | — | Composer shadow, chips |
| Practice dashboard | Background color | Stat badges | Nav rail | — |
| Client dashboard | Background color | Status pills | Nav rail | AISummary |
| Matter detail | Background color | Status badges | Drawer | — |
| Invoice preview | Background color | — | — | — |
| Engagement detail | Background color | Amber → warn | — | — |
| Settings / General | Background, font | Input, label | — | — |
| Intake payment form | Background color | Input radius | — | — |
| Mobile (375px viewport) | Background | — | BottomBar | — |
| Print (`@media print`) | — | — | — | — (Issue 10) |

**Phase 7 final sweep (repo-wide zero):**
- Run all grep commands from Section 7 cleanup policy. Document any intentional exceptions (e.g. `LetterPaper` fixed hexes) in `docs/design-system-migration.md`.
- Contrast audit: check `--dim` on `--paper` at AA. Check `--accent-ink` on `--accent` bg for accessibility.
- `prefers-reduced-motion`: verify `rise` and `pulse` keyframes are disabled.
