---
name: Blawby
description: Stripe-dashboard energy for a multi-tenant legal practice tool.
colors:
  accent-default-gold: "#D4AF37"
  accent-default-gold-hover: "#CA8A04"
  surface-app-light: "#F8FAFC"
  surface-card-light: "#FFFFFF"
  surface-card-hover-light: "#F1F5F9"
  surface-input-light: "#F1F5F9"
  surface-app-dark: "#080C11"
  surface-sidebar-dark: "#0A0F15"
  surface-card-dark: "#121A24"
  surface-card-raised-dark: "#18222E"
  border-subtle: "#F1F5F9"
  border-default: "#E2E8F0"
  border-strong: "#CBD5E1"
  text-primary-light: "#0F172A"
  text-primary-dark: "#F1F5F9"
  text-secondary: "#64748B"
  text-disabled: "#94A3B8"
  info: "#1D4ED8"
  success: "#166534"
  warning: "#9A3412"
  error: "#991B1B"
typography:
  display:
    fontFamily: "Outfit, Inter, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-default-gold}"
    textColor: "#0F0F0F"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-default-gold-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-card-hover-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface-card-light}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-input-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
---

# Design System: Blawby

## 1. Overview

**Creative North Star: "The Stripe of Law"**

Blawby is a multi-tenant legal-practice tool whose surfaces should read like a competent associate's prepared workspace: information laid out where the lawyer reaches for it, no chrome performing seriousness on the page's behalf. The reference is **Stripe Dashboard** — light-first by default, information-dense without being cramped, comfortable with tables, money, and numbers, slightly editorial in type voice. Trustworthy more than cool. The surface does its job and disappears.

Color is the most unusual constraint in this system. The accent ramp is **dynamic per practice**: each firm picks its own brand color, and the UI re-themes at runtime. That means **visual identity cannot lean on the accent hue.** Identity comes from layout, type, surface restraint, and rhythm. The accent is signal, not voice.

This system explicitly rejects four aesthetics, in order of risk:

1. **Legacy legal SaaS** (Clio, MyCase, PracticePanther, Smokeball). Navy-and-cream chrome, dense toolbars, 2012-enterprise form clutter. We are replacing these tools; we will not look like them.
2. **Generic AI tool template.** Gradient orbs, glass cards, blurred backdrops, accent-glow shadows around buttons, "Ask me anything" hero, ChatGPT-clone dark mode. The product uses AI; it is not an AI demo. **Several patterns of this kind currently exist in the codebase as legacy decoration; they are deprecated below.**
3. **Stuffy law-firm aesthetic.** Mahogany, leather, gold scales-of-justice, serif headlines, courthouse columns. The product is not a law firm.
4. **Consumer-warm SaaS.** Pastels, illustrations, hand-drawn vibes, Cal.com or Notion-personal energy. Wrong register for professional tooling.

**Key Characteristics:**

- **Light-default, dark-equal.** Both themes are first-class; neither is "the look." The default surface is near-white slate, the dark variant is a deep blue-black with measured contrast lift.
- **Tinted-neutral palette.** Surfaces are slate-warm whites and blue-blacks; the accent is a single per-practice hue used at <15% of any screen.
- **Flat by default.** Shadows are structural (lifting overlays above surface), not decorative.
- **Rounded but not soft.** 12–16px on containers, full pill on interactive controls. Sharp enough to feel tool-like, soft enough to feel composed.
- **Typography does the work.** Outfit display, Inter body. Hierarchy comes from weight contrast and size ratio, not from color or chrome.
- **Multi-tenant aware.** Every color choice is tested against the eight preset accents and arbitrary hex — the system must look right whether the practice picked gold, blue, green, or magenta.

## 2. Colors

A fixed neutral structure defines the room, with a single gold accent used sparingly across the product.

### Primary

The accent is fixed gold. It is not tenant-configurable and should not be runtime-themed.

- **Product Accent** (`var(--accent)`): Primary CTAs, focus rings, link text, active nav indicator, hover-state fills at 8–28% alpha. Used on **≤15% of any given screen.** The accent is a stamp, not a backdrop.
- **Accent Color: Gold** (`#D4AF37`): The single approved accent across all surfaces.

### Neutral

The fixed structural palette. These tokens never re-theme per tenant.

**Light theme:**
- **Slate Frame** (#F8FAFC, `surface-app`): the app's outermost canvas.
- **Paper** (#FFFFFF, `surface-card` / `surface-sidebar` / `surface-header`): the surface most content sits on.
- **Quiet Hover** (#F1F5F9, `surface-card-hover` / `surface-input`): the rest state for inputs and the hover state for cards. The same color does both jobs on purpose — interactive elements feel "pressable" because they share the input rest state.
- **Subtle Line** (#F1F5F9, `border-subtle`): hairlines between content that doesn't need a hard break.
- **Default Line** (#E2E8F0, `border-default`): the standard container border.
- **Strong Line** (#CBD5E1, `border-strong`): emphasis only.
- **Ink** (#0F172A, `text-primary`): primary text. Slate-900, not pure black.
- **Quiet Ink** (#64748B, `text-secondary` / `text-muted`): labels, meta, secondary copy.
- **Disabled Ink** (#94A3B8, `text-disabled`): unavailable controls.

**Dark theme:**
- **Inkwell** (#080C11, `surface-app`): a measured blue-black, not full neutral.
- **Inkwell Sidebar** (#0A0F15, `surface-sidebar`), **Inkwell Header** (#0C1118), **Inkwell Page** (#0D131B), **Inkwell Section** (#0F161F), **Inkwell Card** (#121A24): six-step depth ladder, each step ~3-4 units brighter, so layered surfaces read as elevation without shadow.
- **Inkwell Raised** (#18222E, `surface-card-raised`), **Inkwell Hover** (#1D2836).
- **Ink-on-dark** (#F1F5F9, `text-primary`): not pure white; flat to read at length.

### Status

Status colors are the only non-accent colors that carry meaning. Used at low alpha for backgrounds, full hue for foreground text and icons.

- **Info Blue** (#1D4ED8 light / #93C5FD dark, `info-foreground`)
- **Success Green** (#166534 light / #4ADE80 dark, `success-foreground`)
- **Warning Orange** (#9A3412 light / #F97316 dark, `warning-foreground`)
- **Error Red** (#991B1B light / #F87171 dark, `error-foreground`)

### Named Rules

**The Tenant Identity Rule.** The accent carries the tenant, not the brand. Never use the accent for chrome (page borders, large surface fills, full-bleed backgrounds). It is reserved for: primary action, focus, selection, link, and active state. If a non-customer-facing surface needs decoration and you find yourself reaching for the accent, you are violating this rule.

**The Sub-15 Rule.** The accent appears on no more than 15% of any rendered screen. Measure if unsure. The Stripe-Dashboard register is composed by neutrals; the accent is what catches the eye precisely because it is rare.

**The No-Pure Rule.** No `#FFFFFF` body text. No `#000000` surfaces. Every neutral is tinted toward slate so the system reads as warm enough to live in. Pure values are reserved for legal forms exported to PDF.

## 3. Typography

**Display Font:** Outfit (variable weight 100–900) with Inter, system-ui, sans-serif fallback.
**Body Font:** Inter (variable weight 100–900) with system-ui, sans-serif fallback.

Both fonts are preloaded as latin and latin-ext subsets. The pairing leans editorial: Outfit's slightly geometric display character against Inter's neutral working text. **Outfit is reserved for moments that deserve a moment**: page titles on brand surfaces, hero copy, marketing surfaces. Inter does everything else, including all in-app working surfaces. Lawyers should not feel they're reading marketing copy while filing a matter.

### Hierarchy

- **Display** (Outfit, 600, clamped from 24px to 40px, line-height 1.1, letter-spacing -0.01em): hero copy, page titles on the marketing surfaces (Pricing, Auth, public widget). Rarely appears inside the product shell.
- **Headline** (Inter, 600, 20–24px, line-height 1.25, letter-spacing -0.005em): page titles inside the product shell (PracticeHome, matter detail, settings). Sets the page voice without taking the page over.
- **Title** (Inter, 600, 16–18px, line-height 1.3): section headers, card titles, dialog titles.
- **Body** (Inter, 400, 14px, line-height 1.55): default working text. Cap at 65–75 characters per line for long-form blocks.
- **Body Small** (Inter, 400, 13px, line-height 1.5): table rows, list items, dense content.
- **Label** (Inter, 500, 12px, letter-spacing 0.01em): field labels, meta, badges, status text. Never uppercase by default — uppercase is reserved for status badges and abbreviations.

### Named Rules

**The Two-Voice Rule.** Outfit speaks for the brand. Inter speaks for the work. Inside the product shell, Outfit should appear on at most one element per screen — typically a top-of-page page title — and never inside a card or table.

**The 65–75ch Rule.** Long-form text — markdown bodies, intake question prose, terms surfaces — is capped at 65–75 characters per line. Reading rhythm matters more than fitting more on the page. (Chat markdown already enforces this through container width; named here so it isn't undone.)

## 4. Elevation

The system is **flat by default**. Cards, panels, and inputs sit at rest with a 1px border and no perceptible shadow. Depth is built primarily through **tonal layering** — six progressively brighter surface tokens in dark mode, three in light — so a card on a card reads as elevated without a drop shadow appearing.

Shadows do appear, but they are structural and used sparingly:

- **Default rest** (`0 1px 2px rgba(15, 23, 42, 0.05)` light / `0 1px 2px rgba(0,0,0,0.18)` dark): the faintest possible lift on `panel` and primary cards. Easy to miss — that is the point.
- **Card hover** (`0 8px 22px rgba(0,0,0,0.16)`): cards that respond to hover get a measurable lift, signaling interactivity. Used only on cards that are actually clickable.
- **Overlay lift** (`0 32px 80px rgba(15, 23, 42, 0.16)` light / `0 10px 24px rgba(0,0,0,0.24)` dark, the `--shadow-glass` token): dialogs, popovers, modals. The shadow is what makes "I am floating above your content" legible.

### Named Rules

**The Flat-By-Default Rule.** Surfaces at rest are flat. Shadows only appear as a response: hover, focus, elevation above an underlying surface (modal, popover, dropdown). A static card with a drop shadow at rest is wrong.

**The No-Glow Rule.** Shadows are dark-on-light or black-on-dark. Colored shadows — accent-tinted glows around buttons, gradient halos, "ambient" light leaks — are prohibited. The `0 4px 14px rgb(var(--accent-500) / 0.18)` shadow currently on `.btn-primary` is legacy and must be removed.

## 5. Components

### Buttons

Implemented in `src/index.css` as a single component class system (`.btn` + variant), with 9+ variants and 4 size steps. Every variant is `rounded-full` (pill).

- **Shape:** Pill (`rounded-full`, `border-radius: 9999px`). Pill form is the system's signature.
- **Size scale:** `btn-xs` (px-2.5, py-1, 12px text) · `btn-sm` (px-3, py-1.5, 12px) · `btn-md` (px-4, py-2, 14px, default) · `btn-lg` (px-6, py-3, 16px). Icon-only variants take square boxes at the equivalent heights.
- **Primary** (`btn-primary`): solid accent background, contrast-aware foreground (light or dark text chosen at runtime per accent), 200ms transition on hover. **Currently ships with an accent-glow box-shadow (`0 4px 14px rgb(var(--accent-500) / 0.18)`) — flag for removal**; the Flat-By-Default and No-Glow rules apply.
- **Secondary** (`btn-secondary`): `surface-elevated` background, `border-default` border, primary text. The workhorse of "this is a button but not the action."
- **Ghost** (`btn-ghost` / `btn-icon`): transparent at rest, `surface-card-hover` background on hover. For toolbar-density situations where chrome would crowd.
- **Outline** (`btn-outline`): transparent + `border-default`. Stronger than ghost, quieter than secondary.
- **Accent-ghost** (`btn-accent-ghost`): transparent at rest, accent-tinted background at 8% on hover, accent text. For "this is the suggested action but not committed yet."
- **Danger / Warning** (`btn-danger`, `btn-warning`, `btn-danger-ghost`): red and orange tinted backgrounds at low alpha, status-foreground text.
- **Inverted** (`btn-inverted`): glass-blur, `bg-white/20`, `backdrop-blur-2xl`. **Legacy. The glass aesthetic conflicts with the AI-tool anti-reference; this variant is deprecated** and should be replaced with `btn-primary` on any surface where it is currently used decoratively.
- **Link** (`btn-link`): text-only, accent-colored, underline on hover.
- **Menu item** (`btn-menu-item`): full-width, left-aligned, used inside dropdowns and side nav. Rounded `xl` rather than full.
- **Tab** (`btn-tab`): segmented-toggle children. Active state uses `accent-soft` background with `accent-border` ring.

**States:** Focus rings are 2px in `accent-ring` (40% alpha accent). Active state scales to 0.98 briefly (200ms). Disabled state drops opacity to 50% and disables pointer events.

### Cards

- **Shape:** `rounded-2xl` (16px). The signature container.
- **Background:** `surface-card` (white light / `#121A24` dark) with a `border-subtle` 1px border.
- **Shadow strategy:** flat at rest (`0 1px 2px rgba(15, 23, 42, 0.05)`); lift on hover only when the card is interactive.
- **Internal padding:** 16px standard (`p-4`). Dense list-of-cards layouts may go to 12px.
- **Variants:**
  - **Card** (`.card`): default container.
  - **Card-muted** (`.card-muted`): used for empty states, `surface-card` at 72% alpha, no shadow, muted text. Reads as "intentionally empty," not "loading."
  - **Card-raised** / **side-card**: stronger contrast, `border-default` border. Used for inspector panes and "this is its own thing" subsections.
  - **Panel** (`.panel`): visually similar but `surface-section` background. The structural container behind cards.

**Glass aliases removed.** `.glass-card`, `.glass-panel`, and `.glass-input` are deprecated shims in `index.css` that resolve to `.card`, `.panel`, and `.input-surface` respectively. New code must use the canonical names. The `glass-*` names will be removed in a future cleanup pass.

### Inputs

- **Shape:** `rounded-xl` (12px). Distinct from buttons (full pill) on purpose — pills are actions, rounded rectangles are values.
- **Background:** `surface-input` (`#F1F5F9` light / `#0A0F16` dark). Slightly recessed against `surface-card`.
- **Border:** `border-subtle` 1px at rest.
- **Focus:** 2px ring in `accent-ring` (40% alpha accent), border shifts to `accent-500/40`. Inset shadow stays.
- **Error state:** 2px ring in `error-500/40` plus 12px outer glow at 20% — the only place an outer glow is permitted, because the state is genuinely worth being startled by.
- **Disabled:** opacity 50%, pointer events off.

### Navigation

The app uses a unified Sidebar primitive (Pencil ID "GtRGH"). On desktop it occupies a 260px column (collapses to 64px icon-rail); on mobile it becomes a full-height drawer.

- **Active item:** `nav-active-bg` (= `accent-soft`, 12% alpha accent) background, primary text color, **2px inset left border in `accent-utility`**. The active indicator is the inset shadow, not a side-stripe full-height bar.
- **Inactive item:** text at 75% alpha, transparent background, hover lifts to 85% alpha plus `surface-card-hover` background.
- **Sidebar surface:** `surface-sidebar` token; `border-subtle` against the workspace surface to its right.

### Tabs (Segmented Toggle)

A common pattern across the app — used for switching between matter sub-views, intake stages, filter modes.

- **Container:** `rounded-full` pill, `surface-elevated` background, `border-default` border.
- **Active thumb:** `accent-soft` background, `accent-border` inset ring (1px). The thumb animates between positions in 300ms ease-out.
- **Item text:** medium weight, primary color when active, placeholder color when inactive.

### Status surfaces

`.status-info`, `.status-success`, `.status-warning`, `.status-error` — light fills at 10% alpha of the corresponding hue, 20% alpha border, status-foreground text. Used for inline messages, alert boxes, callouts.

### Signature Component: AppShell

The product's structural backbone. A four-column responsive grid (`sidebar | listPanel | main | inspector`) that collapses to drawers on mobile, with optional header and bottom-bar slots and a configurable accent backdrop variant.

**Behavior:**
- Desktop: explicit grid columns (`260px / 280px / 1fr / 336px` when all four are present).
- Mobile: header + main only; sidebar and inspector become drawer overlays.
- The `accentBackdropVariant` slot allows a per-page decorative layer of radial gradients and blurred orbs. **The `settings` and `workspace` accent-backdrop variants are deprecated** (gradient orbs are an AI-tool-template anti-pattern); the `none` variant should be the default going forward.

## 6. Do's and Don'ts

Concrete guardrails. The Don'ts here directly mirror PRODUCT.md's anti-references and reflect the current legacy patterns in the code that should not be extended.

### Do:

- **Do** treat the accent as the practice's signature, not the product's. Use it on ≤15% of any rendered screen.
- **Do** earn elevation. Cards sit flat at rest; shadows appear on hover for interactive cards and on overlays only.
- **Do** layer depth tonally. Use the six-step dark-mode surface ladder (`surface-app` → `surface-sidebar` → `surface-header` → `surface-page` → `surface-section` → `surface-card`) before reaching for a shadow.
- **Do** lead pages with a single headline in Inter 600. Save Outfit for the marketing surfaces and the rare hero moment.
- **Do** use `rounded-2xl` for cards, `rounded-xl` for inputs, `rounded-full` for actions. The radii encode role; mixing them confuses scanability.
- **Do** verify every screen renders correctly under all eight preset accents and at least one arbitrary hex. If a layout breaks when the accent changes, the layout was wrong.
- **Do** keep status colors as the only non-accent meaningful colors. Reserve them for state (info, success, warning, error) and never use them decoratively.
- **Do** honor `prefers-reduced-motion`. Existing animations already gate on it; new motion must too.
- **Do** translate-test copy. With 13+ locales, no English string should rely on word order, length, or unique grammar.
- **Do** route every text, background, and border color through the token layer in `src/design-system/tokens.css`. Text mute ramp (strongest → softest readable): `text-ink` → `text-ink-2` → `text-ink-3` → `text-dim` → `text-dim-2`. Backgrounds: `bg-paper` / `bg-paper-2` / `bg-card`. Borders: `border-rule`. Status: `text-pos` / `text-warn` / `text-neg` / `text-accent`. One edit to `tokens.css` should re-theme everywhere; if a swap to dark or parchment doesn't pick up your color, you bypassed the token layer.

### Don't:

- **Don't** use gradient orbs as background decoration. The current `accentBackdropVariant: 'settings'` and `'workspace'` variants are legacy; remove existing instances and do not add new ones. (Anti-ref: *Generic AI tool template*.)
- **Don't** use accent-tinted glow shadows on buttons. The current `btn-primary` shadow is legacy and should be flattened. (Rule: *No-Glow*.)
- **Don't** apply gradient overlays to cards. The current `.card` / `.card-surface` background-image gradients are decorative and conflict with Flat-By-Default; strip them on the next polish pass.
- **Don't** use glassmorphism as a default treatment. The `btn-inverted` variant and `--surface-glass` token are removed. The `glass-card`, `glass-panel`, and `glass-input` class names are deprecated aliases — use `card`, `panel`, and `input-surface` instead. The `border-line-glass` Tailwind token is also deprecated; use `border-line-subtle` for dividers and card borders. Glass is permitted only as a deliberate scrim above content (e.g., a fixed overlay), never as a primary surface treatment.
- **Don't** use `#FFFFFF` or `#000000` literally. All neutrals are tinted slate.
- **Don't** put Outfit inside the product shell except for a single page-title moment. No Outfit in tables, cards, dialogs, or forms.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe. The nav-active indicator uses an inset shadow specifically to avoid this pattern.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight or size.
- **Don't** rely on the accent for visual identity at the page level. The accent could be any hue from gold to magenta to grey — the page must compose well without it.
- **Don't** ship "gold scales of justice" or any stuffy law-firm motifs. (PRODUCT.md anti-ref: *Stuffy law-firm aesthetic*.) **The current gold default conflicts with this and should be revisited:** either change the default to a neutral or to a hue that aligns with the "Stripe of Law" register.
- **Don't** ship Clio/MyCase chrome: dense toolbars, inline-tooltip clutter, navy+cream container backgrounds. (PRODUCT.md anti-ref: *Legacy legal SaaS*.)
- **Don't** ship the AI-demo "Ask me anything" hero on any product surface. The chat is a working tool; treat it as such. (PRODUCT.md anti-ref: *Generic AI tool template*.)
- **Don't** modal-first. Inline editing, side panels, and progressive disclosure beat modal dialogs for almost every flow inside the product shell.
- **Don't** use opacity fractions on text (`text-ink/60`, `text-ink/40`, `text-ink/90`) or `opacity-N` on text containers (`<p className="opacity-80">`) as a substitute for the right semantic token. They create semi-transparent blends that vary by background, fall below AA contrast in dark mode, and don't respond to theme changes. Pick the right ink/dim token: `text-ink/80,90` → `text-ink`; `text-ink/60,70` → `text-dim`; `text-ink/40,50` → `text-dim-2`; `text-ink opacity-80` → `text-ink-2`. (Enforced in issue #672 / Commit 9; exceptions: `disabled:opacity-50`, `opacity-0/100` visibility animations, decorative icon mutes.)
- **Don't** use raw Tailwind palette classes (`text-gray-*`, `text-slate-*`, `text-zinc-*`, `text-neutral-*`, `text-stone-*`, `bg-gray-*`) on text, background, or border. They have no connection to the token system and won't re-theme. The only documented exception is `src/features/matters/utils/matterStatusStyles.ts` (semantic status hex pending a token equivalent).
- **Don't** hardcode hex values in `className` (`text-[#6b7790]`) or inline `style=` attributes (`color: '#0f1e36'`, `borderTop: '1px solid #d3d6df'`). They freeze a single theme's value at write-time. Use the Tailwind token utility when possible, or the CSS variable when the style must be inline (`color: 'var(--ink)'`, `border: '1px solid var(--rule)'`). The stale `#6b7790` hex (former `--dim` value) appears in legacy spots and must be removed on contact. (`.letter-paper` CSS styles are excepted by design for print rendering.)
