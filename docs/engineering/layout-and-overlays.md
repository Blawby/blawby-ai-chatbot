# Layout and Overlay Architecture (ChatGPT-like UX)

This document defines our layout and overlay standards for desktop, tablet, and mobile, aiming for a ChatGPT-like experience: simple, predictable, and robust.

## Goals

- Single, predictable layering model for overlays (banners, menus, modals, toasts).
- Minimal layout shifts. Overlays should not push content unless explicitly desired.
- Consistent behavior across breakpoints (mobile/tablet/desktop).
- Easy to reason about stacking contexts and scroll containers.

## Core Principles

- Overlays render via portal to `document.body`.
- A clear z-index contract is used everywhere (no ad-hoc `z-[...]`).
- One top-level slot for fixed overlays (e.g., banners, mobile nav).
- Prefer overlaying over push-down; if push-down is needed, use a global CSS variable.

## Z-index Contract

Add these to `THEME.zIndex` in `src/utils/constants.ts` and reference them instead of inline Tailwind z-classes:

- `modal`: 2100
- `fileMenu` (menus/popovers): 2000
- `banner`: 950
- `nav` (mobile top nav): 900
- `layout`: 1900 (legacy; avoid if possible)
- `settings`: 1500, `settingsContent`: 1600 (legacy)

Ordering (top to bottom): Modal > FileMenu > Banner > Nav > Sidebars/Content.

## Overlay Implementation

- Always render overlays via `createPortal(..., document.body)`.
- Use `style={{ zIndex: THEME.zIndex.<layer> }}` instead of Tailwind z utilities to avoid drift.
- Keep overlays fixed-positioned and independent of the page layout.
- Enable `pointer-events: auto` for clickable overlays.

### Components

- Modals: Already using portal and `THEME.zIndex.modal`. Keep.
- Top Banner (onboarding, status): Portal + `THEME.zIndex.banner`. No layout shift by default.
- Mobile Top Nav: Prefer portal + `THEME.zIndex.nav` for consistency.
- Menus/Popovers: Use `THEME.zIndex.fileMenu`.

## Layout Slots

In `AppLayout` define logical regions:

- TopFixed (overlay slot): logical home for banners and mobile nav. These render via portal; AppLayout doesn’t pad for them.
- Shell: LeftSidebar | Content | RightSidebar arranged via CSS grid or flex.

Avoid placing overlays within the shell where they can be trapped by stacking contexts.

## Scroll Model

Choose ONE consistent model and apply across the app:

- Model A (recommended): Single primary scroll container for the central content; sidebars use `overflow-y-auto` as needed. Overlays use `position: fixed`.
- Model B: Full-page scroll; avoid nested scrolls entirely unless necessary.

Avoid nested sticky/overflow combinations that create unexpected stacking contexts.

## Optional Push-down Support

If an overlay should push layout down (rare), use a CSS custom property instead of hard-coded padding:

- Global var: `--app-top-offset: 0px` (set on `:root` or a top-level provider).
- Regions that should be offset read: `padding-top: var(--app-top-offset)`.
- An overlay can temporarily set the var (e.g., banner height) if push-down is desired.

Default remains overlay without push-down to minimize reflow.

## Responsive Behavior (ChatGPT-like)

- Mobile (<768px):
  - MobileTopNav fixed at top (portal).
  - Sidebars become drawers or are hidden; open via nav.
  - Banners appear above nav or below based on priority (we place banners above nav).
- Tablet (>=768px and <1024px):
  - Optional left sidebar as drawer; content primary.
- Desktop (>=1024px):
  - Left sidebar visible. Optional right sidebar.

## Accessibility

- All overlays must be keyboard accessible.
- Modals trap focus and close on Escape.
- Banners are reachable by keyboard and screen readers (role, aria-live if appropriate).

## Testing Checklist

- Overlay ordering: Banner below modal; menus/popovers above banner.
- Mobile: Banner and MobileTopNav do not overlap important touch targets.
- No layout shift when toggling overlays (unless opting into push-down).
- Sidebars/content do not cover overlays.

## Migration Steps

1. Define `banner` and `nav` in `THEME.zIndex`.
2. Migrate MobileTopNav to use `THEME.zIndex.nav` and optionally a portal.
3. Keep Top Banner on portal; set zIndex to `THEME.zIndex.banner`.
4. Remove inline `z-[]` usages for overlays; use THEME constants.
5. Normalize scroll model (Model A recommended) and remove unnecessary nested overflow.
6. Introduce `--app-top-offset` only if push-down is required.

## FAQ

- Why portals? They avoid layout/stacking traps and guarantee consistent overlay behavior.
- Why constants for z-index? Shared source of truth prevents accidental regressions and makes ordering obvious.
- Why overlay (not push-down)? Less reflow, fewer layout hacks, cleaner mental model; push-down remains available via CSS var if ever needed.
