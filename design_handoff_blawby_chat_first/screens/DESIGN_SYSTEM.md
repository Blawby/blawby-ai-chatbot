# Blawby Design System

**Version:** 1.0 — chat-first refactor
**Live in:** `tokens.css` (source of truth)
**Visual reference:** `Design System.html` (open in browser)
**Screen inventory:** `index.html` (twelve screens)

This document is the contract for refactoring the Blawby frontend. Any new component, screen, or pattern should be derivable from this file plus `tokens.css`. If a value isn't here, ask before inventing one.

---

## 0 — North star

> Editorial calm. Confident. The opposite of a dashboard.

Three rules that override everything else:

1. **Chat is the home, not a feature.** The default entry point is a conversation with the assistant. Lists, tables, and forms are surfaces the assistant opens, not destinations the user navigates to.
2. **Every AI write is staged.** The assistant proposes; the human approves. Writes go through a `staged-action` UI (see Patterns) before they hit the database. This rule is non-negotiable and IOLTA-relevant.
3. **One accent. Used sparingly.** The gold is a punctuation mark — the urgent feature card, the primary action, the "I noticed" left-border. If three things on a screen are gold, two of them are wrong.

### Voice
- **Plainspoken.** Short sentences. No legalese. No "leverage."
- **Specific over generic.** "$1,245 unbilled" not "you have outstanding work."
- **The AI uses first person.** "I drafted…", "I noticed…", "I'd accept this one."
- **No emoji in product copy.** Use typography and color for emphasis.
- **`<em>` is the AI's highlighter.** Italic + accent color. Reserve it for the one phrase per paragraph that carries the meaning.

---

## 1 — Foundations

### 1.1 Color

All colors live in `tokens.css` as CSS variables. **Never hardcode a hex value in a component.** Use the variable.

#### Light theme (default)

| Token | Hex / OKLCH | Role |
|---|---|---|
| `--paper` | `#f6f3ea` | Primary background — warm cream, never pure white |
| `--paper-2` | `#ece6d3` | Subtle elevation: section backgrounds, hover row, sticky toolbars |
| `--paper-edge` | `#d3d6df` | Borders on raised surfaces (modal edges, popovers) |
| `--card` | `#ffffff` | Card / input fields — paper raised above the body |
| `--ink` | `#0f1e36` | Primary text, primary button background — deep navy |
| `--ink-2` | `#2a3b5a` | Body text, secondary labels |
| `--ink-3` | `#4a5a78` | Tertiary text, meta |
| `--dim` | `#6b7790` | Captions, helper, mono labels |
| `--dim-2` | `#9aa1b3` | Placeholders, disabled |
| `--rule` | `#d3d6df` | 1px hairline borders, dividers |
| `--rule-soft` | `rgba(15,30,54,0.08)` | Subtle background tints, table hover |
| `--accent` | `oklch(0.72 0.13 82)` | Gold — the brand accent |
| `--accent-soft` | `oklch(0.72 0.13 82 / 0.14)` | Tinted backgrounds (AI cards, focus ring) |
| `--accent-deep` | `oklch(0.55 0.12 78)` | Em italic, AI deep voice, secondary accent text |
| `--accent-ink` | `#2a2200` | Readable text on gold |
| `--pos` | `oklch(0.55 0.10 155)` | Success, paid, healthy, compliant |
| `--warn` | `oklch(0.68 0.13 60)` | Soon, pending, attention |
| `--neg` | `oklch(0.55 0.16 28)` | Overdue, at-risk, danger |

#### Theme variants

The system supports four themes, switched via `html[data-theme="…"]`:

| Theme | Use case | Mood |
|---|---|---|
| `(default)` | Daily use | Warm light, navy ink |
| `dark` | Reduced light | Navy paper, cream ink |
| `midnight` | Late night, AMOLED | Deep navy paper |
| `parchment` | Print, conservative clients | Warmer, more sepia |

Implementation: set `<html data-theme="dark">` (or none for light). Don't fork components; use the variables.

#### Semantic color usage

- **Status pills** map 1:1 to semantic colors:
  - `paid`, `healthy`, `signed`, `clear` → `--pos`
  - `sent`, `awaiting`, `staged-by-ai` → `--accent` / `--accent-deep`
  - `draft`, `soon`, `pending` → `--warn`
  - `overdue`, `at-risk`, `urgent`, `declined` → `--neg`
  - `archived`, `closed`, `n/a` → `--dim`
- **Never** use red/green for AI states (it's gold).
- **Never** use gold for danger or success.

### 1.2 Typography

Three families, loaded from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..900;1,8..60,300..900&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

| Family | Var | Role |
|---|---|---|
| **Source Serif 4** | `--serif` | Display, headings, numbers in stats, letter body, italic emphasis |
| **Geist** | `--sans` | UI, buttons, body text in cards, navigation |
| **Geist Mono** | `--mono` | Labels (small caps), timestamps, IDs, amounts in tables, code |

#### Type scale (no formal sizes — pick by role)

| Role | Family | Size | Weight | Line | Tracking | Example |
|---|---|---|---|---|---|---|
| `display-xl` | serif | 72px | 400 | .95 | -.025em | Hub page title |
| `display-lg` | serif | 56–60px | 400 | 1.0 | -.02em | Greeting, page heading |
| `display-md` | serif | 44–48px | 400 | 1.05 | -.02em | Section title, matter title |
| `display-sm` | serif | 28–34px | 400 | 1.15 | -.012em | Card heading, brief item |
| `serif-lg` | serif | 22–24px | 400 | 1.3 | -.005em | AI summary lede, drawer title |
| `serif-md` | serif | 17–19px | 400 | 1.45 | -.005em | AI observation, "I noticed" |
| `body` | sans | 14–15px | 400 | 1.55 | 0 | Default body |
| `body-sm` | sans | 12.5–13px | 400 | 1.5 | 0 | Captions, secondary text |
| `label` | mono | 10–11px | 400 | 1.4 | .08–.14em uppercase | Section labels, meta |
| `mono-tabular` | mono | 11–14px | 400 | 1 | -.01em + `font-feature-settings: "tnum"` | Amounts, hours, percentages |

#### Type rules

- **Headings are always Source Serif 4 at weight 400.** Never bold a serif heading.
- **`<em>` is reserved for the accent.** Italic + `var(--accent-deep)`. Don't use it for ordinary emphasis.
- **Labels are mono + uppercase + tracked.** This is the "small caps" feel without using actual small caps.
- **Numbers in tables / stats:** `font-family: var(--mono); font-feature-settings: "tnum"; letter-spacing: -.01em` — tabular figures so columns line up.
- **`text-wrap: balance`** on every display heading. **`text-wrap: pretty`** on `.lede` paragraphs.
- **`font-feature-settings: "ss01", "cv11"`** on body (set globally) — turns on Geist's stylistic alternates.

### 1.3 Space & layout

```
--container: 1280px;   /* hard cap on content width */
--gutter: 56px;        /* page-edge padding (40px @1100, 22px @720) */
```

Use a 4 / 8 / 12 / 14 / 18 / 22 / 28 / 32 / 40 / 56 spacing rhythm (no formal scale token — pick the one closest to need). Cards usually have **18–22px** internal padding. Sections separate with **22–36px** vertical space.

### 1.4 Radii

```
--r-xs: 2px;     /* buttons, chips, inputs — sharp, matches marketing */
--r-sm: 4px;     /* small badges */
--r-md: 8px;     /* cards, panels, drawers */
--r-lg: 14px;    /* rare — only large hero containers */
--r-pill: 999px; /* pills, toggles, avatars */
```

The 2px on buttons is intentional and distinguishes Blawby from the typical "fully rounded" SaaS. **Don't soften it.**

### 1.5 Elevation

Three shadow tokens, each combines a 1px white inset (suggesting paper) with a downward shadow:

```
--shadow-1: subtle (cards at rest)
--shadow-2: hovered, popovers, sticky composers
--shadow-3: focused/featured (status card, intake doc)
```

Never invent new shadows. If you need more depth, layer one of these with a colored glow:
```css
box-shadow: var(--shadow-2), 0 12px 32px -18px color-mix(in oklab, var(--accent-deep) 50%, transparent);
```

### 1.6 Motion

Two keyframes are baked into the system:

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

**Usage:**
- `rise` — every new chat message, every newly-opened panel. Duration `.4–.5s`, easing `cubic-bezier(.2,.7,.2,1)`.
- `pulse` — only on the priority indicator (matter at risk). Sparingly.
- All hover transitions: `.14–.18s ease`. Translate `-1px` on hover for clickable surfaces, never more.

**Never** use bounce, elastic, or anything > .5s. The whole product should feel like turning a page.

---

## 2 — Components

Each component below has a CSS class, a description, and the React/Preact component it should become. Map your existing components to these — don't fork.

### 2.1 `.btn` — primary action button

```jsx
<Button variant="primary" size="md">Approve &amp; send ↗</Button>
```

| Variant | When to use |
|---|---|
| `primary` (default) | Hero CTA — only one per visible region. Ink → hovers to gold. |
| `ghost` | Secondary action, "Edit", "Download" |
| `accent` | Special cases — never in a list of buttons |

Sizes: `sm` (toolbars), `md` (default), `lg` (onboarding, hero forms).

**Contract:**
- `border-radius: 2px` always. Never round.
- Primary hovers to `--accent` with `--accent-ink` text.
- Always lead with the verb. "Approve & send" not "Send approval."
- Arrow `↗` on actions that leave the current view. `→` on next-step. `↑` on send.

### 2.2 `.chip` — compact secondary action

Used inside cards, drawer, AI replies. Smaller than `.btn`, denser. Can hold a row of 4–8 chips.

```jsx
<Chip variant="primary">Draft Martinez invoice ($1,245)</Chip>
<Chip>Edit lines</Chip>
<Chip variant="warn">Discard</Chip>
```

Variants: `default | primary | accent | warn`. Same color logic as `.btn` but at chip scale.

### 2.3 `.pill` — status badge (read-only)

Mono, uppercase, pill-shaped. **Always small caps with a 5–6px dot on the left if showing status.** Status colors map to semantic vars (see 1.1).

```jsx
<Pill tone="paid">paid</Pill>
<Pill tone="overdue">overdue · 18d</Pill>
<Pill tone="staged">staged by AI</Pill>
<Pill tone="live">live</Pill>      /* default-on indicator */
```

**Do not** make a pill clickable. If it should be tappable, it's a chip.

### 2.4 `.card`

```jsx
<Card>
  <CardHead>
    <h3>Title</h3>
    <Label>meta · 5 items</Label>
  </CardHead>
  <CardBody>{children}</CardBody>
</Card>
```

- Background `--card`, border `--rule`, radius `--r-md`, shadow `--shadow-1`.
- `CardHead` has its own light-gray (`--paper-2`) background and 1px hairline beneath.
- Cards never have icons in the head. The label is mono + small caps.

### 2.5 Form fields

```jsx
<Field label="Firm name" help="Used in your intake widget header.">
  <Input value={firmName} onChange={…} />
</Field>
```

| Element | Class |
|---|---|
| Wrapper | `.field` |
| Label (mono, uppercase, tracked) | `.field > label` |
| Input / textarea / select | `.input` / `.textarea` / `.select` |
| Helper | `.help` |

**Focus state:** `border-color: var(--ink); box-shadow: 0 0 0 3px var(--accent-soft)`. **Don't** change the focus ring color — it's the brand.

### 2.6 Toggle

```jsx
<Toggle checked={…} onChange={…} />
```

36×20px, gold when on. Used in Settings and inline AI rules.

### 2.7 Bars (progress)

```jsx
<Bar value={45} tone="warn" />
```

4px tall, `--r-pill`. Tones: default (gold), `ok` (green), `warn` (red). Used for retainer health, completion, capacity.

### 2.8 Avatar

```jsx
<Avatar kind="ai" />            /* B in italic serif on ink — the assistant */
<Avatar kind="user">DO</Avatar> /* initials on a navy gradient */
<Avatar kind="staff">S</Avatar> /* lawyer — accent on ink */
```

28px default, 40px `.lg`. The AI avatar is always the italic serif "B" — never replace with an icon.

### 2.9 Brand mark

```jsx
<BrandMark />   /* B + Blawby wordmark */
```

The glyph is a serif italic "B" in gold, baseline-aligned with a Geist wordmark. Don't bold the wordmark; weight 500 max. Don't substitute the B with an icon.

### 2.10 Tables

Use CSS grid for table rows (`display: grid; grid-template-columns: …`). Don't use `<table>` for layout — it ruins responsive control. Reserve `<table>` for the invoice line items, where it's semantically a table.

**Pattern:**
```html
<div class="tbl">
  <div class="row head">…</div>
  <div class="row">…</div>
</div>
```

- Header row: `--paper-2` background, mono labels.
- Hairline `--rule` between rows.
- Hover: `background: var(--rule-soft)`. No row borders on hover.
- Tabular numbers in mono with `font-feature-settings: "tnum"`.
- Right-align all numeric columns.

### 2.11 Segmented control

```jsx
<Seg value="month" onChange={…}>
  <Seg.Option value="week">Week</Seg.Option>
  <Seg.Option value="month">Month</Seg.Option>
  <Seg.Option value="quarter">Quarter</Seg.Option>
</Seg>
```

Inline-flex, 1px outer border, 1px dividers between options. Selected option: ink background, accent text.

### 2.12 Label (mono small-caps)

```jsx
<Label>5 unbilled · 1 low</Label>
```

This is everywhere. Reach for it before reaching for any other secondary-text style.

---

## 3 — Patterns

The big composites recurring across screens. These are higher than components — they're products of multiple components arranged intentionally.

### 3.1 AI summary card (the gold-tinted block)

The hero AI moment on a screen. Used in: matter detail, intakes detail, matters list answer, reports exec summary.

**Anatomy:**
- Background: `linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--card)), var(--card))`
- Border: `1px solid color-mix(in oklab, var(--accent) 30%, var(--rule))`
- Avatar (italic B) on the left, body on the right
- A mono label at top: "Assistant summary" or "I noticed" + a `<span class="v">grounded in N sources</span>` (green dot)
- A serif `font-size: 18–28px` paragraph as the lede
- A row of `.chip` actions below

**Critical:** every AI assertion must be followed by a citation (see 3.3) OR a "grounded in N sources" verifier label. Never assert without source.

### 3.2 Staged-action card

The yellow-tinted card that holds AI-proposed writes awaiting approval. Used in: matter detail, invoice detail, trust ledger.

**Anatomy:**
- Background gradient: `color-mix(in oklab, var(--accent) 22%, var(--card))` → `--card`
- Border: 1px gold
- Mono label: `Staged · awaits your approval`
- Serif title with the action ("Invoice draft · $1,245.00")
- Description with what it's based on
- Chip row: **primary = "Approve & send"**, secondary edit/preview, optional `warn` discard

Never let a staged action auto-execute. There's always an explicit human click.

### 3.3 Citation pill row

```html
<div class="cites">
  <span class="pill live">matters · 4 rows</span>
  <span class="pill">contact_forms · 3</span>
  <span class="pill">matter_events · 14</span>
</div>
```

Shown beneath every AI response. The pill text is `<table_name> · <row_count>`. The first pill is `live` (green dot) — it's the primary source. This is what makes the AI auditable.

### 3.4 Matter chip (inline entity reference)

When the AI mentions an entity in chat:

```html
<span class="matter-chip"><span class="pin"></span>Auto Injury · B. Martinez</span>
<span class="matter-chip urgent active"><span class="pin"></span>…</span>
```

A small 5px dot (the "pin") + label. Hover = gold tint. Active = ink border + ring. Urgent = red pin.

Clicking a matter chip pins the matter to the right drawer (Assistant screen) or navigates to the matter detail page.

### 3.5 Tool-use line

Below an AI message, a quiet mono line showing what tools the assistant ran:

```html
<div class="tooluse">
  › used <code>list_matters</code> · <code>retainer_health</code> · 142ms
</div>
```

Aligned to where the message body starts (44px indent from the avatar). Color `--dim`.

### 3.6 AI observation / "I noticed"

The left-border accent strip. Used when the AI volunteers something unprompted.

```html
<div class="observe">
  <div class="label">I noticed</div>
  <div class="txt">You charge 18% less than NC peers…</div>
  <div class="acts">…chips…</div>
</div>
```

- Left border: `2px solid var(--accent)`
- Background gradient: `linear-gradient(90deg, var(--accent-soft), transparent 80%)`
- The txt is **serif, italic, ~17–18px**. This is the AI being a peer, not a chatbot.

### 3.7 Composer

The sticky bottom input on chat surfaces.

**Anatomy:**
- Card with `--shadow-2`
- Contenteditable input with `data-ph` placeholder
- Below: row of context chips (`.ctx` — dashed border, mono) + voice + send icons
- Below that: a mono helper line with keyboard shortcuts and the trust line ("Blawby never writes to your records without your approval.")

### 3.8 Status pills (specific tones)

Map invoice and matter statuses to pills with a colored dot:

| Status | Class | Color |
|---|---|---|
| draft | `.pill.draft` | dim |
| sent | `.pill.sent` | gold |
| paid | `.pill.paid` | green (pos) |
| overdue | `.pill.overdue` | red (neg) |
| staged | `.pill.staged` | warn (orange) |

### 3.9 Letter / document paper

When rendering an engagement letter or invoice as a printed-looking document:

- White background
- 60px horizontal padding, 56px top, 72px bottom
- Source Serif 4 body at 14.5px, line-height 1.6
- Letterhead row with firm name (serif, accent for the lawyer's name) + address (mono, dim)
- Sections separated by 22px padding-top + 1px `#d3d6df` hairline
- Fee summary box: 4px radius, `#f6f3ea` background, 1px `#d3d6df` border
- Unresolved placeholder: `<span class="placeholder">{ai_est_total}</span>` — gold-tinted with mono font

The letter intentionally uses fixed hexes (not vars) — it should look the same regardless of app theme.

### 3.10 Left rail (app navigation)

Used in every authenticated screen.

**Anatomy:**
- 240px wide, sticky, `100vh`
- 1px right border
- Brand mark at top, mono meta line under
- `.new-btn` (full-width primary)
- `.rail-section` blocks with mono labels and clickable items
- Items have a 6px dot, 13px label, optional badge count
- Selected item: `--ink` background, accent text — full-width
- User chip pinned to bottom

**Never** add nested expandable nav. Two levels max. If you need a third, it lives inside the page, not the rail.

### 3.11 Right focus drawer (Assistant screen)

400px wide right rail that holds the entity the AI just pinned. See Assistant.html for the canonical example.

**Anatomy:**
- Sticky, 100vh, scrollable
- Top: kind label + serif title + sub + priority pulse
- Optional staged-action block at top
- 2×2 stat-tile grid
- Field list (label + value pairs)
- Timeline of events
- Quick actions row
- "Read-only view · all writes via assistant" footer

### 3.12 Split detail (list + doc)

Used in Invoices and Intakes. List column ~380px, detail column flex.

- List column: filter tabs at top, scrollable items below
- Active item has a 3px gold left accent
- Detail column: sticky head + body
- Stats / status banner near the top of detail
- Document or table fills the rest

### 3.13 Stat strip (5-cell horizontal)

The header strip on Matter detail. 5 equal cells, 1px dividers between, each cell:
- Mono label
- Serif large number (24–26px, `font-feature-settings: "tnum"`)
- Optional bar
- Optional warn-colored extra line

### 3.14 Briefing card grid (Assistant)

The 2-column grid of cards in the Assistant's morning briefing. **The first card spans both columns** and uses the `.feature` variant (gold gradient). Subsequent cards are normal.

### 3.15 Journey progress (Client portal)

A horizontal 5-step indicator with a gold line filling halfway:
- 32px circles, 2px border
- Done = ink fill, gold checkmark
- Now = gold fill, ring of accent-soft
- Future = paper fill, rule border
- Connecting line: 50% gold (progress), 50% rule

Use only on the client portal. Don't repeat this metaphor inside the staff app — milestones use the milestone list instead.

### 3.16 Sketch chart style

When a chart appears, it should be:
- **Single color** — `--accent` for the highlighted series, `--paper-2` + `--rule` border for the rest
- **No axis lines** except 1 baseline (`--rule`, 1px)
- **No legend** — label inline next to the data
- **Labels in mono** at 10px, color `--dim`
- **Sparklines** use a 1.2px ink stroke with an `--accent` gradient fill, 32–40px tall

Do **not** use multicolor charts, pie charts with more than 4 slices, or any 3D / glossy effects.

---

## 4 — Layout primitives

### 4.1 Page header

Every workspace page (Matters, Trust, etc.) opens with:
```
[ crumb · meta ]
[ H1 — serif, 44–56px, with one <em> phrase ]
[ optional lede / right-aligned stat summary ]
[ 1px rule ]
```

### 4.2 Page body

After the header, content sits within `--gutter` page padding (no centered container — full width). Use 22–32px vertical rhythm between sections.

### 4.3 Section header (within a page)

```
[ H3 serif 24–28px with optional <em> ] ........ [ mono label / count, optional buttons ]
[ 1px rule ]
[ 18px gap ]
```

Used in Reports between revenue / intake quality / projections sections.

### 4.4 Card section (within a page)

```
[ paper-2 strip: H3 + label ] ............... [ optional small buttons ]
[ 1px rule ]
[ body — table, list, or content at 18–22px padding ]
```

Used in Matter detail (activity, milestones, unbilled time), Trust (per-client balances, transactions).

---

## 5 — Iconography

We **do not** use an icon library yet. Current state:
- A handful of emoji are scattered (📞, 📄, 📎, 🎙, ↑, ↗, ←).
- Avatar glyphs (B, S, initials) are typographic.

**Refactor goal:** introduce a single, hairline icon set (recommendation: [Lucide](https://lucide.dev/) at `stroke-width: 1.5`). Replace every emoji with a Lucide icon. Use icons at 14px, 16px, or 18px — never larger inside a button. Color: inherit from text (`color: currentColor`).

Don't introduce icons in headings or hero areas — those carry weight from typography alone.

---

## 6 — Accessibility

- **Contrast:** `--ink` on `--paper` passes AAA at 14px+. `--dim` on `--paper` is AA only at 14px+; never use `--dim` for primary content.
- **Focus rings:** `box-shadow: 0 0 0 3px var(--accent-soft)` — applied to all focusable elements. Never `outline: none` without replacing it.
- **Hit targets:** 36×36px minimum for any clickable element. Chips are 28px+ — they're not the primary action, only secondary.
- **Semantic HTML:**
  - Use `<button>` for actions, `<a>` for navigation.
  - The AI message stream is a `<ul>` with `role="log" aria-live="polite"`.
  - Status changes (toast equivalents) post to `role="status"` regions.
- **Screen readers:** the gold dot in pills is decorative (`aria-hidden`) — the text carries the meaning. Same for the journey-step circles.
- **Motion:** respect `prefers-reduced-motion: reduce` — disable `rise` and `pulse` keyframes.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001s !important;
    transition-duration: .001s !important;
  }
}
```

---

## 7 — Refactor mapping

The frontend codebase is currently in `blawby-ai-chatbot/src` (Preact + Tailwind). The refactor should:

### 7.1 Replace ad-hoc Tailwind with token-driven CSS

- Keep Tailwind for layout utilities (`flex`, `grid`, `gap`, `p-*`, `m-*`).
- **Replace** every color, radius, shadow, and font Tailwind class with the CSS variables from `tokens.css`.
- For component-level styling, prefer scoped CSS modules or `data-*` attribute selectors over Tailwind utility chains. Long Tailwind chains hide intent.

### 7.2 Component module structure

```
src/
  design-system/
    tokens.css              ← single source of truth (already exists, copy from project root)
    components/
      Button.tsx
      Chip.tsx
      Pill.tsx
      Card.tsx
      Field.tsx
      Input.tsx
      Textarea.tsx
      Select.tsx
      Toggle.tsx
      Bar.tsx
      Avatar.tsx
      BrandMark.tsx
      Label.tsx
      Seg.tsx
      Table.tsx              ← grid-based, not <table>
    patterns/
      AISummary.tsx
      StagedAction.tsx
      Citations.tsx
      MatterChip.tsx
      ToolUseLine.tsx
      Observation.tsx        ← "I noticed"
      Composer.tsx
      StatusPill.tsx
      LetterPaper.tsx
      JourneyProgress.tsx
      StatStrip.tsx
      BriefingGrid.tsx
    layouts/
      AppShell.tsx           ← rail + main + optional focus
      PageHeader.tsx
      SplitDetail.tsx
      FocusDrawer.tsx
```

Each component exports a typed props API. No styled-components. No CSS-in-JS unless absolutely required.

### 7.3 Per-screen file mapping

The twelve hi-fi screens map to these routes:

| Screen file | Suggested route | Key components |
|---|---|---|
| `Assistant.html` | `/` (default home) | AppShell, AISummary, BriefingGrid, MatterChip, Composer, FocusDrawer |
| `Onboarding.html` | `/onboarding/:step` | Stepper, Field, Chip (selectable), AISuggestion |
| `Settings.html` | `/settings/:section` | Sectioned nav, Toggle, Field, Pill |
| `Matters.html` | `/matters` | AskBar, AISummary, Table, Seg, FilterChips |
| `Trust.html` | `/trust` | ComplianceBanner, StatStrip, Table, AuditTrail |
| `Engagement.html` | `/engagements/:id` | SplitEditor, Field, FeeModes, RiskReview, LetterPaper |
| `Invoices.html` | `/invoices` | SplitDetail, StatusPill, LetterPaper (invoice variant) |
| `Matter.html` | `/matters/:id` | StatStrip, Tabs, AISummary, Timeline, Milestones, AskCard |
| `Intakes.html` | `/intakes` | SplitDetail, AIVerdict, Scorecard, ConversationLog, PreflightChecks |
| `ClientPortal.html` | `/client` (subdomain or sub-path) | ClientHeader, StatusCard, JourneyProgress, MessageThread, RetainerCard |
| `Reports.html` | `/reports` | ExecSummary, KPI strip, Charts, NarrativeSections, Benchmark |
| `Intake.html` | `/p/:practiceSlug` (public) | IntakeWidget, ConversationCard, PayCard |

### 7.4 What to delete from the old codebase

Audit the current `src/features/*` for:
- Old card styles using `bg-yellow-*` / `bg-amber-*` Tailwind — replace with `var(--accent-soft)` patterns.
- Any component using `border-radius: 12px` or `16px` — drop to `--r-md` (8px) or smaller.
- Multi-color status systems — flatten to the 5 semantic colors above.
- Custom font imports beyond Source Serif 4 / Geist / Geist Mono — remove.

### 7.5 Don'ts

- Don't introduce a third typeface.
- Don't add a "dark mode toggle" UI — themes are a data attribute, not a user preference yet.
- Don't reintroduce gradients beyond the four already in the system (status card top band, AI summary card, staged action card, peer benchmark dark card).
- Don't use Tailwind `shadow-*` utilities — use `var(--shadow-1/2/3)`.
- Don't put icons in headings.
- Don't auto-execute AI actions. Ever.

---

## 8 — Inventory

### 8.1 Files in this project

| File | Purpose |
|---|---|
| `tokens.css` | All CSS variables + base primitives. Source of truth. |
| `DESIGN_SYSTEM.md` | This document. |
| `Design System.html` | Visual reference page (live token + component showcase). |
| `index.html` | Hub showing all twelve screens as cards. |
| `Assistant.html` | Main chat home (rail + chat + focus drawer). |
| `Onboarding.html` | Six-step practice setup. |
| `Settings.html` | AI behavior + integrations + danger zone. |
| `Matters.html` | List + AI ask bar + filterable table + board view. |
| `Trust.html` | IOLTA ledger + audit trail + reconciliation. |
| `Engagement.html` | Form + live letter preview + AI placeholders. |
| `Invoices.html` | Split list + detail (hi-fi invoice document). |
| `Matter.html` | Single-matter workspace (stats + tabs + timeline). |
| `Intakes.html` | Staff triage queue (AI verdict + pre-flight checks). |
| `ClientPortal.html` | Client-facing case status. |
| `Reports.html` | AI-narrated monthly review. |
| `Intake.html` | Public conversational intake widget (direct URL + embed). |

### 8.2 Reference schema (from `worker/schema.sql`)

The AI grounds replies in these tables. Component contracts assume them.

- `organizations` — practices
- `lawyers` / `members` — staff
- `services` — practice offerings
- `contact_forms` — intakes (pre-acceptance)
- `matters` — accepted cases
- `matter_events` — every action on a matter (time, calls, files, notes, status changes)
- `matter_questions` — Q&A captured during intake
- `ai_generated_summaries` — AI case summaries
- `ai_feedback` — thumbs / ratings
- `files` — uploaded documents (R2)
- `payment_history` — Stripe events
- `practice_assistant_actions` — **the staged-action queue** (this is what gates every AI write)

`practice_assistant_actions` is the lynchpin. Every AI-proposed write — invoice, status change, reminder, replenishment, engagement draft — is a row here, in state `pending`. Approval flips it to `accepted` and runs the actual mutation in a transaction.

---

## 9 — Checklist for a new screen

Before merging any new view:

- [ ] Uses `tokens.css` — no hardcoded hex / radius / shadow values
- [ ] Headings are Source Serif 4, weight 400, with one `<em>` per heading max
- [ ] No more than one `--accent` punctuation per visible region
- [ ] Any AI assertion has a citation row or "grounded in" label
- [ ] Any AI write goes through a `StagedAction` component
- [ ] Mono labels for every section, timestamp, ID
- [ ] Tabular numbers in tables (`tnum`)
- [ ] 36px+ hit targets, `accent-soft` focus rings
- [ ] `prefers-reduced-motion` respected
- [ ] No emoji in product copy (icons via Lucide if introduced)
- [ ] Responsive at 1100, 980, 720 breakpoints — at minimum collapse the focus drawer / left rail gracefully
- [ ] One static screenshot added to `index.html` as a thumbnail card

---

*Living doc. Update when patterns repeat ≥3 times — that's when they become primitives.*
