---
title: "refactor: Public widget shell split, overlay portal, and container queries"
type: refactor
status: active
date: 2026-05-18
---

# refactor: Public widget shell split, overlay portal, and container queries

## Summary

Replace the public widget rendering pipeline's binary `variant: 'widget' | 'card' | 'preview'` toggle with three explicit shells (`EmbedShell`, `DirectShell`, `MarketingShell`), portal `Drawer` / `DragDropOverlay` (and any peer overlay that uses `position: fixed` inside the widget interior) to a `WidgetOverlayRoot` rendered at `document.body`, and switch `WorkspaceHomeView` / `ChatContainer` / `NavRail` / the inspector aside from viewport breakpoints to CSS `@container` queries so the widget renders correctly at 380px (embed), full mobile viewport (direct), and any in-between size — without the wrapper-induced clipping, fixed-position traps, or the awkward `max-w-2xl` desktop column that triggered this work. Decouples intake-template URL shape from layout: `/public/:slug/intake/:template` becomes `DirectShell` (template is a data choice, not a layout choice), and the existing decorated card aesthetic moves behind a new opt-in `/public/:slug/welcome` route owned by `MarketingShell`.

---

## Problem Frame

A customer landing on `/public/:practiceSlug/intake/:templateSlug` on a desktop browser sees a narrow centered card (`max-w-2xl` ≈ 672px) on a wide dark page, with bottom drawers (e.g. file picker, payment-auth) getting clipped at the card's rounded edge instead of sliding into the viewport. The clipping is structural, not stylistic: [src/shared/ui/layout/PublicIntakeCard.tsx:5](src/shared/ui/layout/PublicIntakeCard.tsx) applies `overflow-hidden` to the card, and ancestors of the drawer use `transform` (animations on [src/features/chat/views/WorkspaceHomeView.tsx:75-76](src/features/chat/views/WorkspaceHomeView.tsx)) which traps `position: fixed`. The drawer at [src/shared/ui/overlays/Drawer.tsx:62](src/shared/ui/overlays/Drawer.tsx) is rendered inline at `z-[300]` rather than portaled to `document.body` — the inconsistent sibling pattern that [src/shared/ui/inspector/MobileInspectorOverlay.tsx:67-100](src/shared/ui/inspector/MobileInspectorOverlay.tsx) already gets right at `THEME.zIndex.modal` (= 2100). The wrapper choice is also coupled to URL shape (`/intake/:template` → `variant="card"`) rather than user intent: a customer scanning a QR code, a customer typing the URL on their phone, a practice owner sharing a marketing link — all three currently get whichever wrapper the URL pattern happens to imply, not the one that fits the experience.

The codebase already has the foundations in place to fix this cleanly: `@tailwindcss/container-queries` is wired up in [tailwind.config.js:147](tailwind.config.js), [docs/engineering/responsive-audit.md:20](docs/engineering/responsive-audit.md) documents the convention ("inside the workspace, container queries; outside, viewport queries"), and the portal pattern is proven inside the same codebase by `MobileInspectorOverlay`. The work is consolidation and consistency, not invention.

---

## Requirements

- R1. Inside the widget interior tree (rooted at the shell box currently at [src/app/WidgetApp.tsx:592](src/app/WidgetApp.tsx)), no component renders `position: fixed` or `fixed inset-*` classes inline. Overlays that need viewport-rooted positioning portal to a new `WidgetOverlayRoot` mounted at `document.body`.
- R2. Bottom-anchored drawers, fullscreen overlays, drag-drop overlays, and similar viewport-rooted overlays slide / paint across the full visible widget area regardless of which shell wraps the widget (Embed, Direct, Marketing) and regardless of any `overflow-hidden` / `transform` ancestors in the widget interior.
- R3. The widget root declares `container-type: inline-size` with a stable container name. `WorkspaceHomeView`, `ChatContainer`, `NavRail`, and the inspector aside at [src/app/WidgetApp.tsx:723](src/app/WidgetApp.tsx) key off `@container` breakpoints, not `sm:` / `md:` / `lg:` viewport breakpoints. The widget renders correctly at 380px wide (embed iframe), at full mobile viewport, and at any wider container — without per-route media-query overrides.
- R4. Three shell components in [src/shared/ui/layout/](src/shared/ui/layout) — `EmbedShell`, `DirectShell`, `MarketingShell` — replace `PublicIntakeCard`. Each is composition-based (`{ children }` slot), follows the local `*Shell.tsx` naming convention, and renders `WidgetOverlayRoot` as a sibling so portal targets exist before any child mounts.
- R5. `PublicWorkspaceRoute` no longer takes a `variant` prop. Routes in [src/index.tsx:461-465](src/index.tsx) pass a `shell` (or wrap with the shell directly) rather than a variant string. The `variant: 'widget' | 'card' | 'preview'` type is removed.
- R6. Route → shell mapping: `/public/:slug` and its sub-routes (`/conversations`, `/conversations/:id`, `/matters`) → `EmbedShell` when the URL carries `?v=widget` (the embed loader contract), otherwise `DirectShell`. `/public/:slug/intake/:templateSlug` → `DirectShell` (no longer card). New `/public/:slug/welcome` → `MarketingShell` (opt-in branded landing).
- R7. `WidgetPreviewApp` continues to own its scenario chrome and preview postMessage bus, but renders the widget body inside `EmbedShell` so the embed-faithful 380px simulation stays accurate.
- R8. [src/shared/ui/layout/PublicIntakeCard.tsx](src/shared/ui/layout/PublicIntakeCard.tsx) is deleted. The `.intake-card-container` / `.intake-card` CSS hooks (verified used only by this one file) are removed. No deprecation period — per `AGENTS.md` line 60, this is a greenfield app with no backward-compat layer.
- R9. An ESLint rule (or restricted-syntax pattern, mirroring the conventions at [eslint.config.js:192-218](eslint.config.js) and [config/eslint-rules/loading-consistency.cjs](config/eslint-rules/loading-consistency.cjs)) prevents `position: fixed` / `fixed inset-*` / `fixed bottom-*` className literals from being added to files inside the widget interior tree. Shells, overlay portal targets, and toast roots are exempt.
- R10. `tests/e2e/responsive-screenshots.spec.ts` baselines are updated and committed for `/public/:slug`, `/public/:slug/intake/:template`, `/public/:slug/welcome`, and `?v=widget` at 375 / 768 / 1440. New baselines visually reviewed before commit.
- R11. The `criticalCssPlugin` in [vite.config.ts](vite.config.ts) retains `pruneSource: false`. Built CSS is verified to contain non-empty `@container` rules (no `@container (min-width: Npx) {}` empty bodies) — the Beasties-at-zero-viewport trap documented at [docs/engineering/responsive-audit.md:15](docs/engineering/responsive-audit.md) does not silently strip the new responsive rules.

---

## Scope Boundaries

- **Device-frame preview pattern in `MarketingShell`** — mentioned in conversation as a marketing-driven enhancement, not approved. `MarketingShell` ships as the existing decorated dark-page-with-centered-card aesthetic, moved to its own opt-in route.
- **Changes to `public/widget-loader.js`** — the iframe loader's URL contract, dimensions (`min(380px, calc(100vw - 40px))` × `360-780px`), and postMessage protocol stay exactly as-is. The refactor must preserve every assumption listed in §4 of the repo research.
- **Chat / intake business logic** — `ChatContainer`'s `layoutMode` prop, `WorkspaceHomeView` data flow, intake template resolution, conversation creation, postMessage bridge — none of these change behaviorally. Only layout chrome and overlay mounting move.
- **Overlay components that are anchored to a trigger by design** — `ContextMenu`, `Popover`, `Tooltip`, `Combobox` use `absolute` positioning relative to their trigger, not `fixed`. They are NOT migrated to the overlay portal; they correctly belong in the trigger's stacking context.
- **`AppShell` / authenticated app layout** — out of scope. The new shells are public-widget-only.
- **Backend / worker changes** — none. This is a frontend-only refactor.

### Deferred to Follow-Up Work

- **Device-frame preview pattern** for `MarketingShell` — if marketing requests it later, it becomes a `MarketingShell` enhancement, not a fourth shell.
- **Migrating `ToastContainer`, `OfflineBanner`, `ScrollToTop`, `UpdateAvailableToast`, `MobileTopNav` to portal-via-overlay-root pattern** — these live at the app shell level, not the widget interior, so their `position: fixed` is correctly viewport-rooted today. A future consolidation pass could route them through a unified overlay root, but it isn't load-bearing for this work.
- **Replacing the `short` Tailwind screen at [tailwind.config.js:36](tailwind.config.js)** (`{ raw: '(max-height: 500px)' }`) with a container-height query — unused in the widget tree today; nothing to migrate.
(The `docs/engineering/responsive-audit.md` widget-rows update is in scope — handled by U7 alongside the screenshot baselines, not deferred.)

---

## Context & Research

### Relevant Code and Patterns

- **Shell prior-art:** [src/shared/ui/layout/AppShell.tsx](src/shared/ui/layout/AppShell.tsx), [src/shared/ui/layout/SetupShell.tsx](src/shared/ui/layout/SetupShell.tsx), [src/shared/ui/layout/EditorShell.tsx](src/shared/ui/layout/EditorShell.tsx) — composition-based `{ children }` + named slot props, PascalCase, suffix `Shell`. Mirror this convention.
- **Portal precedent:** [src/shared/ui/inspector/MobileInspectorOverlay.tsx:67-100](src/shared/ui/inspector/MobileInspectorOverlay.tsx) — portals to `document.body` via `createPortal`, registers with `modalStack`, uses `THEME.zIndex.modal` (= 2100). The canonical pattern for the new `WidgetOverlayRoot` consumers.
- **Container-query reference components:** [src/shared/ui/layout/FormGrid.tsx:13](src/shared/ui/layout/FormGrid.tsx) (`@container` + `@md:grid-cols-2`), [src/features/matters/components/MatterSummaryCards.tsx:40](src/features/matters/components/MatterSummaryCards.tsx), [src/features/matters/components/MatterOverviewTab.tsx:497](src/features/matters/components/MatterOverviewTab.tsx). These show the established `@container` + `@<size>:` modifier pattern in this codebase.
- **Custom ESLint rule template:** [config/eslint-rules/loading-consistency.cjs](config/eslint-rules/loading-consistency.cjs) and [config/eslint-rules/no-inline-context-value.cjs](config/eslint-rules/no-inline-context-value.cjs) — the canonical shape for a repo-local AST rule registered under the `custom/` namespace at [eslint.config.js:11-12](eslint.config.js).
- **Z-index ladder:** [src/shared/utils/constants.ts:3-9](src/shared/utils/constants.ts) — `layout: 1900, fileMenu: 2000, modal: 2100, settings: 1500, settingsContent: 1600`. The new overlay portal anchors to `modal` (2100), not arbitrary `z-[300]` / `z-[9999]`.
- **Modal stack:** [src/shared/utils/modalStack.ts](src/shared/utils/modalStack.ts) — reference-counted body-scroll lock + topmost-modal tracking. Existing portal consumers register here; new ones should too.

### Institutional Learnings

- [docs/engineering/responsive-audit.md:15](docs/engineering/responsive-audit.md) — **Beasties critical-CSS gotcha**: the prerender runs at zero viewport; `pruneSource: true` silently strips every `sm:` / `md:` / `lg:` rule (and likely `@container` rules) from the prerendered CSS, leaving empty `@media(min-width:Npx){}` / `@container(min-width:Npx){}` blocks. Must verify `pruneSource: false` is preserved and grep the built CSS for empty container-query bodies after build. Covered by U8.
- [docs/engineering/responsive-audit.md:20](docs/engineering/responsive-audit.md) — codifies the convention this refactor implements: "Inside the workspace (pages, cards, forms, detail panes): container queries (`@sm:`/`@md:`/`@lg:`). The visible width depends on sidebar state and inspector panes, not viewport."
- [docs/engineering/responsive-audit.md:35](docs/engineering/responsive-audit.md) — explicitly notes that `MainApp.tsx` `layoutMode: 'widget'` "render[s] entirely separate shells outside this audit's scope" — pre-validates the explicit-shells direction.
- [docs/engineering/responsive-audit.md:141](docs/engineering/responsive-audit.md) — `tests/e2e/responsive-screenshots.spec.ts` already has public-widget baselines at 375/768/1440 — U7 updates these.

### External References

External research was skipped at Phase 1.2 — local patterns are well-established (7 `@container` consumers, 3 portal-based overlays, 3 prior shells), the technology stack is stable (Tailwind 3.4 with container-queries plugin already wired), and the user has confirmed the architectural direction. No new external grounding adds value over what the codebase already demonstrates.

---

## Key Technical Decisions

- **`WidgetOverlayRoot` is a static element rendered once per shell, not a context-managed portal manager.** Each shell renders `<div id="widget-overlay-root" />` as a sibling of the widget body. Overlay components find it via `document.getElementById('widget-overlay-root')` (with a `document.body` fallback for tests/SSR). Rationale: `MobileInspectorOverlay` already uses the simple `document.body` portal pattern with no context machinery; adding a context provider here would be premature abstraction for a single-portal use case.
- **`@container` name is `widget`** — declared on the shell box currently at [src/app/WidgetApp.tsx:592](src/app/WidgetApp.tsx) via `[container-type:inline-size] [container-name:widget]` Tailwind arbitrary properties (or via a small CSS rule). Children use `@container widget (min-width: Npx)` queries, accessed via Tailwind's `@<size>/widget:` modifier syntax. Rationale: a named container is grep-able, avoids ambiguity when components nest inside other containers (e.g., `FormGrid` inside `WorkspaceHomeView`), and matches the responsive-audit convention.
- **Container breakpoints align with Tailwind's container-queries plugin defaults** — `@sm` (24rem = 384px), `@md` (28rem = 448px), `@lg` (32rem = 512px), `@xl` (36rem = 576px). The 380px embed sits below `@sm`, so widget-mode-only chrome (e.g., the close button at [src/app/WidgetApp.tsx](src/app/WidgetApp.tsx)) keys off "no `@sm` match" (i.e., default styles). Wider widget containers progressively reveal the inspector aside, denser composer, etc.
- **`DirectShell` paints its own background and minimum height.** Without `PublicIntakeCard`'s wrapper, the global `body { background-color: rgb(var(--surface-app)); }` rule at [src/index.css:268-271](src/index.css) is what the user sees by default. `DirectShell` overrides this with `bg-surface-app-frame min-h-[100dvh] flex flex-col` so the direct path looks intentional, not naked. No `overflow-hidden`, no `max-w-*`, no rounded clipping.
- **The `?v=widget` query parameter remains the canonical "I am embedded" signal**, consumed at [src/app/PublicWorkspaceRoute.tsx:37](src/app/PublicWorkspaceRoute.tsx) and at the embed loader at [public/widget-loader.js:88-98](public/widget-loader.js). Shell selection logic in `PublicWorkspaceRoute` reads this query (and the new `/welcome` route segment for `MarketingShell`) to pick the shell. Routes in [src/index.tsx](src/index.tsx) no longer pass a `variant`.
- **`setWidgetRuntimeContext(true)` fires for `EmbedShell` and `DirectShell` and `MarketingShell`** — all three are public widget contexts. Today only `isWidget = true` triggers it; the `variant === 'card'` branch sets `isWidget = true` via the `variant === 'card'` shortcut at [src/app/PublicWorkspaceRoute.tsx:36](src/app/PublicWorkspaceRoute.tsx). After the refactor, the flag is set by each shell on mount (via effect) rather than by route-prop heuristic. Cleaner ownership.
- **Lint enforcement is a `no-restricted-syntax` selector**, not a new rule file. The pattern at [eslint.config.js:192-218](eslint.config.js) already restricts className regex matches; extending it for `fixed` / `fixed inset-` / `fixed bottom-` / `fixed top-` inside files matching the widget-interior glob is a 10-line addition. Mirrors the codebase's preference for minimal tooling.
- **Drawer's `z-[300]` and DragDropOverlay's `z-[9999]` collapse to `THEME.zIndex.modal`** (2100). The arbitrary z-indexes were the symptom of inline rendering inside the widget's stacking context; once portaled, they all live at the modal layer. ToastContainer's `modal + 50` (2150) continues to sit above them, which is correct (toasts above modals).

---

## Open Questions

### Resolved During Planning

- **Where does `MarketingShell` get opted into?** Resolved: explicit route segment `/public/:slug/welcome`. Routes are visible in analytics and grep-able; a query-param hidden marketing mode would be a footgun.
- **Where does `WidgetPreviewApp` fit in the shell taxonomy?** Resolved: keep `WidgetPreviewApp` as its own top-level component (it owns the scenario picker chrome and the preview postMessage bus), but have it render the widget body inside `EmbedShell` so the 380px-faithful sizing is preserved structurally rather than duplicated.
- **Is a `WidgetOverlayRoot` context provider needed?** Resolved: no. The portal target is a static `<div id="widget-overlay-root" />` inside each shell. Overlays find it with `getElementById`, falling back to `document.body`. Matches the existing portal pattern; avoids premature abstraction.
- **Container name vs anonymous container?** Resolved: named `widget`. Avoids accidental cross-talk with `FormGrid` and `MatterSummaryCards`, which already declare their own anonymous containers inside the widget body.
- **What happens to the `variant: 'widget' | 'card' | 'preview'` prop on `PublicWorkspaceRoute`?** Resolved: deleted. Per `AGENTS.md` line 60, no backward-compat shim. Routes in [src/index.tsx](src/index.tsx) pick the shell directly.

### Deferred to Implementation

- **Exact `@container` breakpoint thresholds** for the inspector aside, NavRail layout, and home-view greeting size. Plan-time we know the relevant transitions (~380px embed vs ~768px medium vs ~1024px wide-direct), but the exact pixel cutoffs are an implementation detail to be settled by running the widget in DevTools at each width and choosing the cleanest threshold per component.
- **Whether to keep `widget-shell-gradient` as a class hook or inline the (currently no-op) background-color rule into shells.** Plan-time the class is documented as a deliberate no-op at [src/index.css:273-278](src/index.css). Decision is cosmetic and bundles with whatever shells end up needing.
- **The exact glob pattern for the lint rule's widget-interior scope.** Plan-time: roughly `src/features/chat/**`, `src/features/intake/**`, the widget root and overlay portals excluded. The exact pattern is best tuned against a real ESLint pass.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Shell-portal-container layering, in order from outer to inner:**

```
Route                  Shell                  Portal target          Widget root
                                              (rendered ONCE,
                                              sibling of widget)

/public/:practiceSlug
  (no ?v=widget)    →  <DirectShell>         <div id="widget-      <WidgetApp>
                          (full viewport,      overlay-root" />        (declares
                           bg-surface-                                   container-type:
                           app-frame,                                    inline-size,
                           min-h-[100dvh],                               container-name: widget)
                           no overflow-                                  │
                           hidden)                                       ├─ WorkspaceHomeView
                                                                         │   (uses @sm:/@md:/@lg:
                                                                         │    inside @container widget)
                                                                         ├─ ChatContainer (same)
                                                                         ├─ NavRail (same)
                                                                         └─ Inspector aside
                                                                             @lg/widget:block

/public/:practiceSlug
  (?v=widget)       →  <EmbedShell>          <div id="widget-      <WidgetApp>
                          (transparent,        overlay-root" />        (same as above)
                           no chrome,
                           identical to
                           current bare
                           variant="widget")

/public/:practiceSlug/welcome
                      →  <MarketingShell>    <div id="widget-      <WidgetApp>
                          (current decorated   overlay-root" />        (same as above —
                           dark-page-with-                              container queries
                           centered-card                                continue to work
                           aesthetic,                                   inside the card,
                           OPT-IN ONLY)                                 since container-type
                                                                        is set on the widget
                                                                        root, not the shell)

/public/:practiceSlug/intake/:templateSlug
                      →  <DirectShell>        (same as direct)      (same as direct, with
                                                                     intake template prop
                                                                     threaded to WidgetApp
                                                                     as today — data, not
                                                                     layout)
```

**Overlay portal flow (example: Drawer opens inside DirectShell):**

```
Drawer.open === true
  │
  ├─ useEffect mounts via createPortal(
  │   <DrawerSurface .../>,
  │   document.getElementById('widget-overlay-root') ?? document.body
  │ )
  │
  ├─ DrawerSurface paints at THEME.zIndex.modal (= 2100)
  │   with position: fixed inset-0 (now in document.body's
  │   stacking context, NOT the widget tree's)
  │
  └─ modalStack.registerModal('drawer:<id>')
     modalStack.lockBodyScroll()
```

The widget interior may freely use `overflow-hidden`, `transform`, `filter`, `will-change` — the overlay portal escapes all of them by rendering at `document.body`.

---

## Implementation Units

### U1. Portal overlays out of the widget interior

**Goal:** Migrate `Drawer` and `DragDropOverlay` (the two `position: fixed` overlays mounted inside the widget tree today) to portal to a `WidgetOverlayRoot` rendered at `document.body`. Establish the pattern so future overlays use it.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `src/shared/ui/overlays/WidgetOverlayRoot.tsx` (the portal target component + small `resolveOverlayMount()` helper)
- Modify: `src/shared/ui/overlays/Drawer.tsx` (wrap return in `createPortal`)
- Modify: `src/shared/ui/DragDropOverlay.tsx` (wrap return in `createPortal`)
- Modify: `src/shared/utils/constants.ts` (drop the arbitrary `z-[300]` / `z-[9999]` — overlays use `THEME.zIndex.modal`)
- Test: `tests/component/widget-overlay-portal.test.tsx` (new)

**Approach:**
- `WidgetOverlayRoot` renders a single `<div id="widget-overlay-root" />` element. It is stateless; consumers find the mount point by id. Renders nothing else.
- `Drawer` reads the mount point via `document.getElementById('widget-overlay-root') ?? document.body` inside an effect-guarded `useState` to avoid SSR issues (Preact + preact-iso may prerender; the responsive audit doc confirms prerender runs at zero viewport).
- `Drawer` keeps `lockBodyScroll` / `unlockBodyScroll` from `modalStack.ts`. Add a `registerModal` / `unregisterModal` call to match the pattern in `Dialog.tsx` and `Fullscreen.tsx` — Drawer currently does not register, which means Escape handling can fight with other overlays.
- `DragDropOverlay` portals identically. No `modalStack` registration (it doesn't take focus or trap escape).
- Replace the inline `z-[300]` / `z-[9999]` with `THEME.zIndex.modal` (= 2100) — these were arbitrary values to defeat ancestor stacking; once portaled, they live at the canonical modal layer.

**Patterns to follow:**
- [src/shared/ui/inspector/MobileInspectorOverlay.tsx:67-100](src/shared/ui/inspector/MobileInspectorOverlay.tsx) — exact portal + `registerModal` + `lockBodyScroll` pattern. Mirror it.
- [src/shared/ui/dialog/Dialog.tsx:95-135](src/shared/ui/dialog/Dialog.tsx) — z-index from `THEME.zIndex.modal`, not arbitrary.

**Test scenarios:**
- *Happy path:* `Drawer` with `open={true}` renders inside `document.getElementById('widget-overlay-root')` — assertable via `within(overlayRoot).getByRole('dialog')`. The trigger component's DOM subtree contains no `[role="dialog"]`.
- *Happy path:* `DragDropOverlay` with `visible={true}` renders inside the overlay root.
- *Edge case:* When `WidgetOverlayRoot` is absent (e.g. rendered in isolation in a test or outside any shell), `Drawer` falls back to `document.body` — the dialog still mounts and is clickable.
- *Edge case:* Two `Drawer` instances open simultaneously — both render into the overlay root, both register with `modalStack`, only the topmost handles Escape (covered by `modalStack.isTopmostModal` invariant).
- *Integration:* `Drawer` opened from within a component whose ancestor has `overflow-hidden` and `transform: translateZ(0)` paints at viewport edges, not clipped to the ancestor. Render a wrapper with `<div style={{ overflow: 'hidden', transform: 'translateZ(0)' }}><Drawer open .../></div>` and assert `getBoundingClientRect()` of the drawer surface equals viewport.
- *Integration:* Body scroll is locked when Drawer opens, unlocked when it closes, reference-counted correctly when two overlays open and close in any order (covered by `modalStack` but worth verifying with both Drawer instances).

**Verification:**
- `npm run test:component` passes including the new portal test file.
- Manually: open the public widget at `https://local.blawby.com/public/<slug>/intake/<template>`, trigger a flow that opens a bottom drawer (e.g. file upload or payment-auth prompt), observe the drawer slides from the viewport bottom and is not clipped at the card's rounded edge.

---

### U2. Container queries on the widget root

**Goal:** Declare `container-type: inline-size` + `container-name: widget` on the widget root. Migrate viewport breakpoints inside the widget interior (`lg:` on the inspector aside, any `sm:`/`md:`/`lg:` in `WorkspaceHomeView` / `ChatContainer` / `NavRail`) to `@<size>/widget:` container modifiers.

**Requirements:** R3

**Dependencies:** None (independent of U1, but logically lands before U3 so the shells assume container-query support exists)

**Files:**
- Modify: `src/app/WidgetApp.tsx` (line 592 — add `[container-type:inline-size] [container-name:widget]` to the shell box, or add a CSS class that does this)
- Modify: `src/app/WidgetApp.tsx` (line 723 — inspector aside `hidden w-80 shrink-0 lg:block lg:w-96` → `hidden @lg/widget:block @lg/widget:w-80 @xl/widget:w-96`, threshold tuned in implementation)
- Modify: `src/app/WidgetPreviewApp.tsx` (lines 348, 371, 388, 418, 445 — the five `widget-shell-gradient` shell boxes also need `[container-type:inline-size] [container-name:widget]` so preview-mode widgets behave identically)
- Modify: `src/features/chat/views/WorkspaceHomeView.tsx` — audit for `sm:`/`md:`/`lg:` viewport modifiers inside the file; convert to `@<size>/widget:`. Repo research confirms the file has zero `min-h-*` / `max-w-*` / `transform` blockers, but a pass for viewport modifiers is needed.
- Modify: `src/features/chat/components/ChatContainer.tsx` — same audit. Repo research confirms it uses `flex` + `h-full` + `w-full` + `overflow-hidden` (clean), but any internal `lg:` / `md:` modifiers should switch.
- Modify: `src/shared/ui/nav/NavRail.tsx` — same audit.
- Test: `tests/component/widget-container-queries.test.tsx` (new — render `WidgetApp` inside a 380px wrapper vs a 1024px wrapper, assert inspector aside hidden vs shown)

**Approach:**
- Add the container declaration via Tailwind arbitrary properties on the existing shell box, not via a new wrapper element. Avoids changing the DOM tree.
- For each viewport modifier inside the widget interior, find the equivalent container breakpoint. The Tailwind container-queries plugin default scale (`@sm` = 24rem, `@md` = 28rem, `@lg` = 32rem, `@xl` = 36rem) maps cleanly to the widget's range (380px embed sits below `@sm`; the inspector aside currently shows at `lg:` ≥ 1024px viewport, which inside the widget container roughly means `@xl/widget:` or `@2xl/widget:` depending on tuned threshold).
- Per the responsive audit doc, the convention is `@<size>/<name>:` so the container name is referenced explicitly. Confirms which container is being queried when components nest (e.g., `FormGrid` inside `WorkspaceHomeView` already has its own anonymous `@container`).

**Patterns to follow:**
- [src/shared/ui/layout/FormGrid.tsx:13](src/shared/ui/layout/FormGrid.tsx) — `<div className="@container">…<div className="grid grid-cols-1 @md:grid-cols-2">`.
- [src/features/matters/components/MatterSummaryCards.tsx:40](src/features/matters/components/MatterSummaryCards.tsx) — established `@container` consumer to mirror.
- [docs/engineering/responsive-audit.md:20](docs/engineering/responsive-audit.md) — the convention this implements.

**Test scenarios:**
- *Happy path:* `WidgetApp` rendered inside a 380px-wide test wrapper exposes no inspector aside (`queryByTestId('inspector-aside')` returns null).
- *Happy path:* `WidgetApp` rendered inside a 1024px-wide test wrapper exposes the inspector aside (`getByTestId('inspector-aside')` succeeds).
- *Edge case:* `WidgetApp` rendered at exactly the threshold width (TBD in implementation) — assert deterministic behavior on either side of the threshold by testing at `threshold - 1px` and `threshold + 1px`.
- *Integration:* `WidgetApp` inside `MarketingShell`'s `max-w-2xl` card and `WidgetApp` inside `DirectShell`'s full viewport both fire the correct `@container` rules — the container declaration is on the widget root, so any shell that gives it less width sees the narrower layout automatically.

**Verification:**
- Component test passes at 380px and 1024px.
- Manually load `https://local.blawby.com/public/<slug>` at viewport widths 375, 768, 1024, 1440 in DevTools; load the embed via the embed loader on a test page; confirm the inspector aside and any other migrated breakpoints respond to widget width, not viewport width.

---

### U3. Create `EmbedShell`, `DirectShell`, `MarketingShell`

**Goal:** Three new shell components in `src/shared/ui/layout/` that wrap `WidgetApp` (or any child) and render `WidgetOverlayRoot` as a sibling. Each shell owns its outer chrome; none clips overflow or constrains widget width.

**Requirements:** R4

**Dependencies:** U1 (`WidgetOverlayRoot` exists)

**Files:**
- Create: `src/shared/ui/layout/EmbedShell.tsx`
- Create: `src/shared/ui/layout/DirectShell.tsx`
- Create: `src/shared/ui/layout/MarketingShell.tsx`
- Test: `tests/component/public-widget-shells.test.tsx` (new — one test per shell, snapshot + a few assertions)

**Approach:**
- All three shells take `{ children: ComponentChildren }` and render `<>{children}<WidgetOverlayRoot /></>` so any overlay inside `children` can portal to the sibling overlay root via id lookup.
- `EmbedShell`: renders children with no chrome, transparent background. `bg-transparent` (so the iframe wrapper's `border-radius: 16px` from `widget-loader.js` and the parent page's body show through correctly). No min-height (inherits the iframe height). Sets `setWidgetRuntimeContext(true)` via effect.
- `DirectShell`: `bg-surface-app-frame min-h-[100dvh] flex flex-col`. No `overflow-hidden`, no `max-w-*`, no rounded corners. Mobile-first: the widget fills the viewport. On wider container widths, the widget's `@container` rules naturally introduce internal max-widths (if any) — the shell does not impose them.
- `MarketingShell`: identical visual shape to current `PublicIntakeCard` minus `overflow-hidden` (the overlay portal makes it unnecessary). `min-h-screen bg-surface-app-frame p-4 md:p-8 flex items-center justify-center` outer + `mx-auto max-w-2xl w-full bg-surface-workspace rounded-2xl shadow-glass md:mt-8 min-h-[600px] md:min-h-[700px]` inner — same classes, no clipping. Rationale: the user has not approved a redesign of the marketing aesthetic; only the structural problems are fixed.

**Patterns to follow:**
- [src/shared/ui/layout/SetupShell.tsx](src/shared/ui/layout/SetupShell.tsx) — closest existing analog (simple full-screen wrapper with optional decoration). Mirror the prop shape and file layout.
- [src/shared/ui/layout/AppShell.tsx](src/shared/ui/layout/AppShell.tsx) — for the named-slot composition pattern if any shell grows to multiple slots.

**Test scenarios:**
- *Happy path:* `<EmbedShell><div data-testid="body" /></EmbedShell>` renders the body and also renders an element with id `widget-overlay-root`.
- *Happy path:* `DirectShell` renders with `bg-surface-app-frame` and `min-h-[100dvh]`, no `overflow-hidden` class anywhere in its DOM, no `max-w-2xl` class on its descendants.
- *Happy path:* `MarketingShell` renders with the centered card aesthetic and `max-w-2xl` on the inner card, but does NOT have `overflow-hidden` on the card.
- *Integration:* `<DirectShell><Drawer open .../></DirectShell>` mounts the drawer inside the shell's overlay root — confirms the U1 portal wiring works inside a real shell.

**Verification:**
- Component tests pass.
- Snapshot of each shell mounted at 375 / 1440 viewport in the new test file matches expectation.

---

### U4. Replace `variant` prop with shell selection in `PublicWorkspaceRoute` and routes

**Goal:** Delete `variant: 'widget' | 'card' | 'preview'` from `PublicWorkspaceRoute`. Routes in `src/index.tsx` select the shell explicitly. `PublicWorkspaceRoute` reads `?v=widget` (and the new `/welcome` route) to decide between `EmbedShell` / `DirectShell` / `MarketingShell`. `WidgetPreviewApp` continues to render its own scenario chrome but mounts the widget body inside `EmbedShell`.

**Requirements:** R5, R6, R7

**Dependencies:** U3

**Files:**
- Modify: `src/app/PublicWorkspaceRoute.tsx` (delete `variant` prop, replace the three-way render branch at lines 152-163 with shell selection)
- Modify: `src/index.tsx` (lines 461-465 — drop `variant="card"` and `variant="widget"`; add the new `/public/:practiceSlug/welcome` route)
- Modify: `src/app/WidgetPreviewApp.tsx` (wrap its widget body in `EmbedShell`; the scenario-picker chrome it owns remains outside)
- Modify: `src/shared/utils/widgetAuth.ts` consumers — confirm `setWidgetRuntimeContext` is now called from the shells, not from `PublicWorkspaceRoute`. Move the `useEffect` from [src/app/PublicWorkspaceRoute.tsx:65-71](src/app/PublicWorkspaceRoute.tsx) into each shell's mount lifecycle.
- Test: extend `tests/component/widget-app.test.tsx` to cover the new shell selection, OR add a new `tests/component/public-workspace-route.test.tsx`.

**Approach:**
- `PublicWorkspaceRoute` retains `practiceSlug`, `templateSlug`, `conversationId` props. Drops `variant`.
- Inside `PublicWorkspaceRoute`, derive a `shell` local variable:
  - If `?preview=1` → render `WidgetPreviewApp` (which internally wraps in `EmbedShell`).
  - Else if `?v=widget` or `?template=...` (preserves the existing widget-mode signal) → `EmbedShell`.
  - Else if the route is `/public/:slug/welcome` (new) → `MarketingShell`. The marker for this can be a new `variant="marketing"` prop on the route registration in `src/index.tsx`, OR — simpler — the route component for `/welcome` is its own component (`PublicMarketingRoute`) that wraps `PublicWorkspaceRoute` content in `MarketingShell`. The latter avoids reintroducing a variant prop.
  - Else → `DirectShell`.
- Update route registrations in `src/index.tsx`:
  - `/public/:practiceSlug/intake/:templateSlug` no longer passes `variant="card"`. Same `PublicWorkspaceRoute` component, no prop change → defaults to `DirectShell` per the derivation above.
  - `/public/:practiceSlug` and the four widget-mode sub-routes stop passing `variant="widget"`. Same component, no prop → `EmbedShell` when `?v=widget`, `DirectShell` otherwise.
  - New: `/public/:practiceSlug/welcome` → renders `<MarketingShell><PublicWorkspaceRoute practiceSlug={...} /></MarketingShell>` (or via a tiny route component, whichever is cleaner with preact-iso conventions).
- `WidgetPreviewApp`: wrap its existing `widget-shell-gradient` content blocks in `<EmbedShell>`. The scenario picker, preview message bus, and config UI stay where they are — they are preview chrome, not widget chrome.

**Patterns to follow:**
- Existing route definitions at [src/index.tsx:467-489](src/index.tsx) — clean route-level component wrapping with no inline lambdas, where possible.

**Test scenarios:**
- *Happy path:* Visiting `/public/:slug` without `?v=widget` renders `DirectShell` around `WidgetApp`. Assert by querying for `bg-surface-app-frame` on the outer container and no `max-w-2xl` anywhere.
- *Happy path:* Visiting `/public/:slug?v=widget` renders `EmbedShell` (transparent, no chrome).
- *Happy path:* Visiting `/public/:slug/intake/:template` renders `DirectShell` (NOT the card). Regression test for the migration.
- *Happy path:* Visiting `/public/:slug/welcome` renders `MarketingShell` with the centered card.
- *Happy path:* Visiting `/public/:slug?preview=1` renders `WidgetPreviewApp` with its inner widget body wrapped in `EmbedShell`.
- *Integration:* `setWidgetRuntimeContext(true)` is called when any of the three shells mounts; `setWidgetRuntimeContext(false)` on unmount. Currently this is called from `PublicWorkspaceRoute`'s effect; the move is verifiable via spy / mock on `widgetAuth.ts`.

**Verification:**
- All existing tests under `tests/component/widget-app.test.tsx` still pass.
- New shell-selection tests pass.
- Manual sweep: load each of the five existing public routes + the new `/welcome` route at `https://local.blawby.com`; confirm the shell choice matches expectation.

---

### U5. Delete `PublicIntakeCard` and related CSS hooks

**Goal:** Remove `PublicIntakeCard.tsx`, the `.intake-card-container` / `.intake-card` CSS class hooks, and the `variant: 'widget' | 'card' | 'preview'` type. Audit for any other unused props or imports orphaned by U4.

**Requirements:** R8

**Dependencies:** U4

**Files:**
- Delete: `src/shared/ui/layout/PublicIntakeCard.tsx`
- Modify: any file that imports `PublicIntakeCard` (verified by repo research: only `PublicWorkspaceRoute.tsx:10`; will be removed in U4)
- Modify: `src/index.css` — remove `.intake-card-container` and `.intake-card` rules if present. (Repo research found these classes only referenced in the JSX of `PublicIntakeCard.tsx`; verify they are not defined in CSS and remove if they are.)
- Modify: `src/app/PublicWorkspaceRoute.tsx` — remove `variant` from the props interface (already done in U4, but verify the interface is fully cleaned).

**Approach:**
- After U4 lands, `PublicIntakeCard` has zero importers and can be deleted.
- Grep the entire repo for `intake-card-container`, `intake-card`, `variant === 'card'`, `variant === 'widget'`, `variant === 'preview'` — remove any stragglers.
- Per `AGENTS.md` line 72, audit for orphaned props or threaded-through-but-unused values; clean up anything U4 left behind.

**Patterns to follow:**
- `AGENTS.md` line 60 (greenfield app, no backward-compat) and line 72 (audit for orphans).

**Test scenarios:**
- Test expectation: none — pure deletion / cleanup. Coverage is the absence of stale references; verified by `npm run lint` + `npm run typecheck` passing with no unused-import warnings related to `PublicIntakeCard`.

**Verification:**
- `npm run lint --max-warnings=0` passes.
- `npm run typecheck` passes.
- `git grep -E "PublicIntakeCard|intake-card-container|intake-card\b|variant.*['\"]card['\"]"` returns no hits.

---

### U6. ESLint rule: no `position: fixed` inside widget interior

**Goal:** Add a `no-restricted-syntax` selector (or, if cleaner, a dedicated custom rule mirroring `loading-consistency.cjs`) that blocks `fixed` / `fixed inset-*` / `fixed top-*` / `fixed bottom-*` className literals inside files matching the widget-interior glob. Shells, overlay portal targets, toast roots, and the inspector overlay are exempt.

**Requirements:** R9

**Dependencies:** U1 (the portal pattern must exist before the rule is enforceable — otherwise the rule would fail on the very components it is meant to govern, before they are migrated)

**Files:**
- Modify: `eslint.config.js` — either add a `no-restricted-syntax` selector to the existing pattern at lines 192-218, OR add a new `files: [<widget-interior-glob>]` block with a fresh restriction.
- Optional: `config/eslint-rules/no-fixed-in-widget-interior.cjs` (only if the inline `no-restricted-syntax` form is insufficient — start with inline, escalate if needed)

**Approach:**
- Define the widget-interior glob: `src/features/chat/**/*.{ts,tsx}`, `src/features/intake/**/*.{ts,tsx}`, plus any chat-specific files outside those directories that mount inside `WidgetApp`. Exclude `src/shared/ui/overlays/**`, `src/shared/ui/layout/**`, `src/shared/ui/inspector/**`, and `src/app/**` (where the shells and `WidgetApp` itself live).
- The selector: `JSXAttribute[name.name="className"] > Literal[value=/\\bfixed\\b/]` and the same for template literals on className. Mirrors the codebase's existing pattern for `animate-spin` and `bg-white`/`text-white` className regex restrictions.
- Message: "Use the WidgetOverlayRoot portal (see src/shared/ui/overlays/Drawer.tsx for the pattern) instead of `position: fixed` inside the widget interior — fixed positioning is trapped by ancestor `transform` / `overflow-hidden` and breaks bottom drawers / overlays. See docs/plans/2026-05-18-001-refactor-public-widget-shell-plan.md U1."

**Patterns to follow:**
- [eslint.config.js:89-106](eslint.config.js) — existing `no-hardcoded-colors` className regex restriction.
- [eslint.config.js:192-218](eslint.config.js) — existing `no-restricted-syntax` block with JSX selectors.
- [config/eslint-rules/loading-consistency.cjs](config/eslint-rules/loading-consistency.cjs) — escalation path if a dedicated rule is needed.

**Test scenarios:**
- *Happy path:* A new file under `src/features/chat/components/` containing `<div className="fixed inset-0">` triggers an ESLint error.
- *Happy path:* A new file under `src/shared/ui/overlays/` containing the same className does NOT trigger the error (exempt).
- *Edge case:* Files under `src/shared/ui/layout/` (where shells live) are exempt — `DirectShell.tsx`'s `min-h-[100dvh]` and similar must lint clean even if they have other `fixed`-like patterns.
- Verification scenario (not a unit test): Run `npm run lint --max-warnings=0` against the full repo after all units land — passes with zero new violations.

**Verification:**
- `npm run lint` exits 0 with `--max-warnings=0` after the rule is in place and the codebase is migrated.
- Manually: add a `<div className="fixed inset-0">` to a file under `src/features/chat/components/` temporarily, run `npm run lint`, confirm the error fires; revert.

---

### U7. Update responsive screenshot baselines + `responsive-audit.md`

**Goal:** Regenerate `tests/e2e/responsive-screenshots.spec.ts` baselines for every public widget route at 375 / 768 / 1440. Visually review the new PNGs before commit. Update `docs/engineering/responsive-audit.md` to enumerate the three shells and remove the "outside this audit's scope" caveat from the widget rows.

**Requirements:** R10

**Dependencies:** U2, U3, U4, U5 (final visual state must be in place)

**Files:**
- Modify: `tests/e2e/responsive-screenshots.spec.ts` — confirm coverage includes the four new test points: `/public/:slug` (Direct), `/public/:slug?v=widget` (Embed), `/public/:slug/intake/:template` (Direct, was card), `/public/:slug/welcome` (Marketing, new).
- Update: PNG baselines under `tests/e2e/__screenshots__/` (or wherever Playwright stores them — confirmed via Playwright config).
- Modify: `docs/engineering/responsive-audit.md` — expand the widget rows to enumerate `EmbedShell` / `DirectShell` / `MarketingShell` with their container-query coverage. Remove "outside this audit's scope" notes.

**Approach:**
- After U2–U5 are in place, run `npm run test:e2e:screenshots:update` (or the equivalent — verify exact script name from `package.json`) to regenerate baselines.
- Open the new PNGs side by side with the pre-refactor ones. For each:
  - Embed (`?v=widget`): should look identical to today's embedded widget — no regression.
  - Direct, mobile (375px): full-bleed widget, no card, no clipping.
  - Direct, tablet (768px) and desktop (1440px): widget fills viewport with `@container`-driven internal layout — inspector aside visible at the wider widths.
  - Intake template at all widths: was wrapped in card before, now `DirectShell` — expect visual change.
  - `/welcome`: same as today's intake template look-and-feel (the card aesthetic).
- Commit baselines alongside the source change. Per the responsive-audit doc, visual review is mandatory.
- Update the audit doc with one-paragraph descriptions of each shell + a table mapping shell → container-query coverage → reference routes.

**Patterns to follow:**
- [docs/engineering/responsive-audit.md:141](docs/engineering/responsive-audit.md) — existing screenshot-update procedure.

**Test scenarios:**
- *Happy path:* `responsive-screenshots.spec.ts` passes after baselines are updated — every public widget route has a green snapshot at 375 / 768 / 1440.
- *Verification scenario:* Visual diff review (human-in-the-loop, captured in the PR description) shows: (a) embed visually identical pre/post, (b) intake template route visually changed from card to direct, (c) `/welcome` matches the old intake template look, (d) no unexpected delta on chrome, fonts, colors.

**Verification:**
- `npm run test:e2e` (or the responsive-screenshots subset) passes.
- Baselines committed.
- `docs/engineering/responsive-audit.md` widget rows updated.

---

### U8. Verify Beasties critical CSS preserves `@container` rules

**Goal:** Confirm the prerender / critical-CSS pipeline does not silently strip the new `@container` rules. Verify `pruneSource: false` is still set in `vite.config.ts`'s `criticalCssPlugin`. After a production build, grep the built CSS for empty `@container (min-width: …) {}` blocks; if any exist, debug.

**Requirements:** R11

**Dependencies:** U2 (the `@container` rules must exist in source first)

**Files:**
- Verify: `vite.config.ts` — `pruneSource: false` in `criticalCssPlugin` config.
- Verify: production build output (e.g., `dist/assets/*.css`) — no empty `@container` blocks.
- No source files modified unless the build verification fails.

**Approach:**
- Run `npm run build` (production build, includes Beasties critical-CSS extraction per the responsive audit doc).
- Inspect the built CSS:
  - Confirm at least one `@container widget (min-width: …) { … }` block is present with a non-empty body.
  - Confirm no empty `@container (min-width: …) {}` or `@container widget (…) {}` blocks exist (the Beasties zero-viewport-prerender symptom).
- If empty blocks exist: this is the documented trap. Either (a) confirm `pruneSource: false` is still set and the empty block is unrelated, or (b) investigate the `@container` syntax compatibility with Beasties — may require a small config change or a `@layer` workaround.

**Patterns to follow:**
- [docs/engineering/responsive-audit.md:15](docs/engineering/responsive-audit.md) — the documented gotcha and the verification procedure.

**Test scenarios:**
- *Verification scenario:* `grep -E "@container[^{]*\\{\\s*\\}" dist/assets/*.css` (or equivalent) returns nothing.
- *Verification scenario:* `grep -c "@container widget" dist/assets/*.css` returns ≥ 1 with non-trivial body length.

**Verification:**
- Production build completes.
- No empty container-query blocks in built CSS.
- A smoke test of the prerendered HTML (loaded with JS disabled) shows the widget renders in a sane default state — not relying on `@container` rules that were stripped.

---

## System-Wide Impact

- **Interaction graph:** Overlay-portal migration changes where `Drawer` and `DragDropOverlay` are mounted in the DOM tree. Any code that does `containerRef.current.contains(drawerElement)`-style traversals would break; repo research found no such code, but a grep for `.contains(` and ref-based DOM ancestry checks is a good defensive sanity check during U1.
- **Error propagation:** Shells set `setWidgetRuntimeContext(true)` on mount and `false` on unmount. If a route transition happens between shells (e.g., `/public/:slug` → `/public/:slug/welcome`), there is a brief unmount-then-mount window. The flag is consumed by `widgetAuth.ts` — verify that consumers tolerate a transient `false` between transitions (they should; this is the same behavior as the current `PublicWorkspaceRoute` effect).
- **State lifecycle risks:** `modalStack`'s reference-counted body-scroll lock — verify that adding `Drawer` to the `registerModal` pattern (which it currently bypasses) doesn't unbalance the count if any existing code path relies on Drawer NOT registering. Repo research did not find such a dependency, but the unit test for U1 should explicitly cover open-then-close cycles.
- **API surface parity:** The embed iframe loader's contract (URL shape, dimensions, postMessage protocol) is unchanged. Routes still respond to `?v=widget` identically. No customer-visible API surface is altered.
- **Integration coverage:** The `WidgetPreviewApp` admin preview path is structurally adjacent — it embeds `WidgetApp` at 380px-faithful sizing to simulate the embed. U4 routes it through `EmbedShell` so the simulation is structurally identical, not approximate. Verify the preview scenarios (`messenger-start`, `consultation-payment`, `service-routing`, `intake-template`) all still render correctly.
- **Unchanged invariants:** `ChatContainer.layoutMode: 'widget' | 'desktop' | 'mobile'` continues to govern chat-pane sizing and centering — the shells do not duplicate this axis. `WidgetApp`'s outer JSX structure (the `widget-shell-gradient` shell box, `flex flex-col`, the absolute-positioned content rows) is preserved; only the className and the parent (shell) change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Embed iframe regression — the embed loader's `?v=widget` route renders into a 380px iframe and any visual regression on this path is customer-facing. | U7's screenshot baselines explicitly cover `?v=widget` at all three widths. Visual review of pre/post is mandatory. Embed sizing assumptions (380px max width, 360–780px height) are preserved at the loader level — the refactor does not touch `widget-loader.js`. |
| Beasties critical-CSS strips `@container` rules silently (the documented trap from responsive-audit.md). | U8 explicitly verifies built CSS contains non-empty `@container` bodies and `pruneSource: false`. Falls under "build verification" — if it fails, the PR does not ship. |
| Stale references to `PublicIntakeCard`, `variant === 'card'`, or `intake-card-container` survive after U5. | U5's verification includes `git grep` for all three patterns. CI lint with `--max-warnings=0` catches unused-import survivors. |
| `Drawer`'s body-scroll lock + new `registerModal` call introduces double-counting bug if other code path relied on Drawer NOT registering. | Repo research found no such dependency. U1 test scenarios cover open-close cycles and stacked overlays. |
| Visual regression on `/public/:slug/intake/:templateSlug` — customers currently linking to that URL see a card; post-refactor they see full-bleed. | This is intentional behavior change per R6 (template is data, not layout). Documented in PR description. Anyone wanting the card aesthetic uses `/public/:slug/welcome` instead. **Note for review:** check with product/marketing if there are existing marketing campaigns or QR codes pointing at `/intake/:template` URLs expecting the card look — if so, a 301 redirect or alternate route may be needed. |
| Container queries don't fire inside the embed iframe due to some interaction with `100dvh` or `100cqh`. | Repo research confirmed `WidgetApp.tsx:592` already uses `supports-[height:100cqh]:h-[100cqh]` as a hedge. U2's component test renders `WidgetApp` inside fixed-width wrappers (380px, 1024px) and asserts container-query rules fire — this catches the failure mode before manual testing. |
| The ESLint rule (U6) over-triggers on legitimate shell or overlay code. | Glob exemptions for `src/shared/ui/layout/**`, `src/shared/ui/overlays/**`, `src/shared/ui/inspector/**`, `src/app/**`. Start with a narrow glob and widen if necessary. |
| `widget-shell-gradient` class hook is referenced from somewhere this plan didn't catch. | Repo research confirmed it's defined in `src/index.css:273-278` as a deliberate no-op and referenced from `WidgetApp.tsx:592` + `WidgetPreviewApp.tsx` (5 places). Grep before commit if U2 changes the class itself. |

---

## Documentation / Operational Notes

- **`docs/engineering/responsive-audit.md`** must be updated in U7 to enumerate the three shells, remove the "widget shell outside this audit's scope" caveat, and add the new `/welcome` route to the coverage matrix.
- **PR description** should note the intake-template route layout change explicitly (was card, now direct) and flag it for marketing / product review before merge.
- **No runtime config changes** — no env vars, no feature flags, no rollout phasing per CLAUDE.md guidance and the user's explicit feedback against phased hedging.
- **No backend or worker changes** — frontend-only.
- **Browser verification** per CLAUDE.md Section 5: use `https://local.blawby.com` (Mode A — staging backend). The refactor is presentation-layer; no need for Mode B local backend.
- **After this lands**, the "portal overlays out of the widget tree to escape transformed ancestors" pattern is a strong candidate for `/ce-compound` — the institutional learning gap flagged by the learnings researcher.

---

## Sources & References

- Conversation prior turn (no formal brainstorm document): the user's question about why the public widget URL feels wide vs. the embed, followed by the approved 4-part long-term direction (`WidgetOverlayRoot`, container queries, three shells, decouple template from layout).
- Repo research report (in conversation): full map of widget root, overlay inventory, embed loader contract, route registrations, lint config, test infrastructure, shell prior-art.
- Learnings research (in conversation): pointed at [docs/engineering/responsive-audit.md](docs/engineering/responsive-audit.md) as the single most relevant doc — codifies the container-query convention, documents the Beasties trap, identifies prior portal precedent.
- [src/app/PublicWorkspaceRoute.tsx](src/app/PublicWorkspaceRoute.tsx) — variant branching to replace.
- [src/app/WidgetApp.tsx](src/app/WidgetApp.tsx) — widget root, line 592 shell box.
- [src/shared/ui/layout/PublicIntakeCard.tsx](src/shared/ui/layout/PublicIntakeCard.tsx) — to delete.
- [src/shared/ui/overlays/Drawer.tsx](src/shared/ui/overlays/Drawer.tsx) — portal migration target.
- [src/shared/ui/inspector/MobileInspectorOverlay.tsx](src/shared/ui/inspector/MobileInspectorOverlay.tsx) — portal pattern to mirror.
- [public/widget-loader.js](public/widget-loader.js) — embed iframe contract (unchanged).
- [src/index.tsx:461-465](src/index.tsx) — route registrations.
- [docs/engineering/responsive-audit.md](docs/engineering/responsive-audit.md) — container-query convention, Beasties trap, screenshot baselines.
- [tailwind.config.js](tailwind.config.js) — `@tailwindcss/container-queries` plugin wired at line 147; responsive convention comment at lines 1-23.
- [eslint.config.js](eslint.config.js) — custom rule pattern (lines 11-12), `no-restricted-syntax` example (lines 192-218), `no-hardcoded-colors` className regex example (lines 89-106).
- `AGENTS.md` (repo root) — line 60 ("greenfield app, no backward-compat"), line 65-70 ("reuse over create"), line 72 ("audit for orphaned files / props before complete").
- `CLAUDE.md` (repo root) — Section 5 (browser verification via `local.blawby.com`), Section 6 (Compound Engineering as default workflow).
