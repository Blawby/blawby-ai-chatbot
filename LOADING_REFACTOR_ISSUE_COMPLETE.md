# Unify loading primitives and replace ad hoc loading UI in specific files

## Problem
The app currently uses multiple loading primitives and several hard-coded loading UIs. This creates inconsistent visuals, duplicate maintenance, and mixed accessibility behavior. Examples already present in the repo include:
- fullscreen text-only loading divs in pages and app shell
- inline animated dot loader in `LoadingIndicator` component
- inline `animate-spin` spinners with mixed styling tokens
- custom skeleton rows with inconsistent background tokens (`bg-white/[0.07]` vs `bg-gray-200`)

This issue standardizes loading UI onto four shared primitives and replaces only the usages listed below.

## Scope
In scope:
- standardize spinner usage to one component
- add a shared skeleton primitive
- add a shared fullscreen loading primitive
- add a shared container-level loading primitive
- replace the listed usages with these components
- deprecate the legacy loading indicator

Out of scope:
- changing unrelated empty/error states
- redesigning async flows
- changing fetch timing or suspense architecture
- touching files not listed in this issue unless required for import cleanup or type fixes

## Components to create or modify

### `src/shared/ui/layout/LoadingSpinner.tsx` (modify existing)
- Canonical spinner primitive for the app
- Export: `export { LoadingSpinner }`
- Required props:
  - `size?: 'sm' | 'md' | 'lg'` 
  - `className?: string` (applies to outer wrapper div)
  - `ariaLabel?: string` 
- Size class mappings:
  - `sm`: `h-3 w-3 border-2`
  - `md`: `h-4 w-4 border-2` 
  - `lg`: `h-6 w-6 border-2`
- Must use accent-based token styling: `border-[rgb(var(--accent-foreground))] border-t-transparent`
- Must render with wrapper `div role="status" aria-live="polite"` containing visually hidden text
- Spinner element must have `aria-hidden="true"`
- Default `ariaLabel` uses i18n key `common:app.loading`

### `src/shared/ui/layout/LoadingScreen.tsx` (new)
- Shared fullscreen loading state for route/page-level loading
- Export: `export { LoadingScreen }`
- Required props:
  - `message?: string` (defaults to i18n `common:app.loading` when omitted)
  - `showSpinner?: boolean = true` 
  - `size?: 'sm' | 'md' | 'lg' = 'md'` 
- Must use `flex h-screen items-center justify-center` for viewport-level centering
- Internal layout: `flex flex-col items-center gap-2`
- Must use i18n key `common:app.loading` (already exists in `locales/en/common.json`)
- Must use `text-sm text-input-placeholder` class for message text
- Message renders only when non-empty
- Wrapper must have `role="status" aria-live="polite"`

### `src/shared/ui/layout/LoadingBlock.tsx` (new)
- Shared container-level loading state for nested contexts
- Export: `export { LoadingBlock }`
- Required props:
  - `message?: string` (defaults to i18n `common:app.loading` when omitted)
  - `showSpinner?: boolean = true` 
  - `size?: 'sm' | 'md' | 'lg' = 'md'` 
  - `className?: string` 
- Must use `flex h-full min-h-0 items-center justify-center` for container-level centering
- Internal layout: `flex flex-col items-center gap-2`
- Must preserve caller-provided `className` via `cn()` merging
- Must use `text-sm text-input-placeholder` class for message text
- Message renders only when non-empty
- Wrapper must have `role="status" aria-live="polite"`

### `src/shared/ui/layout/SkeletonLoader.tsx` (new)
- Shared skeleton primitive for placeholder content
- Export: `export { SkeletonLoader }`
- Required props:
  - `variant?: 'text' | 'avatar' | 'rect' = 'text'` 
  - `width?: string` 
  - `height?: string` 
  - `lines?: number = 1` 
  - `className?: string` 
  - `wide?: boolean = false` (for InspectorPanel compatibility)
- Prop precedence:
  - if `width` is provided, use it
  - if `height` is provided, use it  
  - otherwise for `variant="text"` use `wide` mapping
  - otherwise use default widths
- `wide` mapping for `variant="text"`: `w-28 h-3` when `wide=true`, `w-20 h-3` when `wide=false`
- `lines` renders repeated rows with `space-y-2` spacing
- Must standardize on background token: `bg-[rgb(var(--accent-foreground)/0.1)]`
- Must use `animate-pulse` class
- For `variant="avatar"`: use `w-9 h-9 rounded-full`
- For `variant="rect"`: use caller-provided dimensions or default `w-full h-4`

## Files to change

### `src/pages/PricingPage.tsx` 
- Import: `import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';`
- Current: `if (isPending || !isAuthenticated) { return (<SetupShell><div className="flex h-screen items-center justify-center text-sm text-input-placeholder">Loading…</div></SetupShell>) }`
- Change: `if (isPending || !isAuthenticated) { return (<SetupShell><LoadingScreen /></SetupShell>) }`
- Preserve existing `SetupShell` wrapper

### `src/pages/OnboardingPage.tsx` 
- Import: `import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';`
- Remove local `LoadingScreen` declaration first, then add shared import to avoid naming conflict
- Current: `const LoadingScreen = () => (<div className="flex h-screen items-center justify-center text-sm text-input-placeholder">Loading…</div>)` and multiple `return <LoadingScreen />` calls at lines 82, 87, 91
- Change: replace each with `<LoadingScreen />`
- Remove local `LoadingScreen` component definition
- Do not change onboarding logic

### `src/pages/AcceptInvitationPage.tsx` 
- Import: `import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';`
- Remove local `LoadingScreen` declaration first, then add shared import to avoid naming conflict
- Current: `const LoadingScreen = ({ message = 'Loading…' }: { message?: string }) => (<div className="flex h-screen items-center justify-center text-sm text-input-placeholder">{message}</div>)` defined at line 64
- Current usages: `if (isPending) { return <LoadingScreen /> }` at line 429 and `if (inviteState.status === 'loading' || inviteState.status === 'idle') { return <LoadingScreen message="Loading invitation…" /> }` at line 532
- Change: replace both with `<LoadingScreen />` and `<LoadingScreen message="Loading invitation…" />`
- Remove local `LoadingScreen` component definition
- Keep messages as literal strings (do not convert to i18n)

### `src/app/MainApp.tsx` 
- Import: `import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';`
- Current: `const WorkspaceSubviewFallback = () => (<div className="flex h-full min-h-0 items-center justify-center p-6 text-sm text-input-placeholder">Loading...</div>)` at line 65
- Change: replace with `<LoadingBlock className="p-6" />`
- Remove local `WorkspaceSubviewFallback` component definition
- Preserve `p-6` padding via `className` prop

### `src/index.tsx` 
- Import: `import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';`
- Remove both local declarations first, then add shared import to avoid naming conflict
- Current: `const LoadingScreen = () => (<div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>)` at line 60
- Current: `const FallbackLoader = () => (<div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>)` at line 912
- Usage sites:
  - `LoadingScreen` used in `<Suspense fallback={<LoadingScreen />}>` at line 214
  - `LoadingScreen` used in `function AuthenticatedApp()` return branches: `if (!practices.length) { return <LoadingScreen /> }` at line 352, `if (isPending || practicesLoading || shouldDelayPracticeConfig) { return <LoadingScreen /> }` at line 475, `if (!canAccessPractice) { return <LoadingScreen /> }` at line 487, `if (!slugPractice && !practicesLoading) { return <LoadingScreen /> }` at line 502
  - `LoadingScreen` used in `function WorkspaceApp()` return branches: `if (isLoading || sessionIsPending || practicesLoading) { return <LoadingScreen /> }` at line 578, `if (!slug) { return <LoadingScreen /> }` at line 598, `if (!resolvedPracticeId) { return <LoadingScreen /> }` at line 768, `if (isAuthenticatedClient && workspaceView === 'home' && slug) { return <LoadingScreen /> }` at line 772, `if (!isAuthenticatedClient && workspaceView === 'matters' && slug) { return <LoadingScreen /> }` at line 775
  - `LoadingScreen` used in `function WidgetApp()` return branch: `if (isLoading || !data) { return <LoadingScreen /> }` at line 884
  - `FallbackLoader` used in `<Suspense fallback={<FallbackLoader />}>` at line 921
- Change: replace all usage sites with `<LoadingScreen />`
- Remove both local component definitions

### `src/shared/ui/list/EntityList.tsx` 
- Import: `import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';`
- Current: `return (<div className={cn('p-4 text-sm text-input-placeholder', className)}>Loading...</div>)` at lines 39-43
- Change: `return <LoadingBlock className={cn('p-4 text-sm', className)} />`
- Preserve existing `className` prop and `p-4` padding

### `src/features/chat/components/MessageContent.tsx` 
- Import: `import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';`
- Current: `<div className="animate-spin h-4 w-4 border-2 border-accent-400 border-t-transparent rounded-full" role="status" aria-live="polite"><span className="sr-only">Loading…</span></div>` at lines 29-31
- Change: `<LoadingSpinner size="md" />`
- Keep current layout spacing intact

### `src/features/chat/components/LinkMatterModal.tsx` 
- Import: `import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';`
- Current: `{loadingState === 'loading-more' ? 'Loading…' : 'Load more'}` at line 289
- Change: `{loadingState === 'loading-more' ? <span className="inline-flex items-center"><LoadingSpinner size="sm" className="mr-2" />Loading…</span> : 'Load more'}`
- Preserve button width and text context with inline-flex wrapper
- Loading text remains visible for sighted users, screen readers get spinner label

### `src/shared/ui/inspector/InspectorPanel.tsx` 
- Import: `import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';`
- Remove import: `import { SkeletonRow } from './InspectorPrimitives';`
- Current: `conversationSkeletonRows.map((row) => (<SkeletonRow key={...} wide={row % 2 === 0} />))` at lines 685-687
- Current: `clientSkeletonRows.map((row) => (<SkeletonRow key={...} wide={row === 0} />))` at lines 692-694
- Current: `matterSkeletonRows.map((row) => (<SkeletonRow key={...} wide={row === 0 || row === 2} />))` at lines 699-701
- Change: replace all with `<SkeletonLoader variant="text" wide={row % 2 === 0} />` for conversation, `<SkeletonLoader variant="text" wide={row === 0} />` for client, `<SkeletonLoader variant="text" wide={row === 0 || row === 2} />` for matter
- Remove `conversationSkeletonRows`, `clientSkeletonRows`, `matterSkeletonRows` arrays at lines 348-350
- Keep conditional loading logic

### `src/features/chat/components/VirtualMessageList.tsx` 
- Import: `import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';`
- Current: skeleton structure at lines 781-799 with outer wrapper `mt-4 space-y-5` and three rows each with `flex items-start gap-3` and `space-y-2` text stacks
- Change: replace the three hard-coded skeleton rows one-for-one:
  ```tsx
  <div className="flex items-start gap-3">
    <SkeletonLoader variant="avatar" />
    <div className="space-y-2">
      <SkeletonLoader variant="text" width="w-36" />
      <SkeletonLoader variant="text" width="w-60" />
    </div>
  </div>
  ```
  (Repeat for second row with `w-44` and `w-72`, third row with `w-32`)
- Preserve outer wrapper `mt-4 space-y-5`
- Each row preserves `flex items-start gap-3`
- Each text stack preserves `space-y-2`
- Keep existing `showSkeleton` conditional logic

### `src/shared/components/LoadingIndicator.tsx` 
- Current: custom dots loader with 3 animated divs
- Search for all imports of `LoadingIndicator` across the codebase
- Replace each usage with `<LoadingSpinner />`
- Delete file only if zero imports remain after replacement

## Exact Refactor Plan
1. Modify `src/shared/ui/layout/LoadingSpinner.tsx` to use accent border tokens and accessibility structure
2. Create `src/shared/ui/layout/LoadingScreen.tsx` with viewport-level fullscreen behavior
3. Create `src/shared/ui/layout/LoadingBlock.tsx` with container-level behavior
4. Create `src/shared/ui/layout/SkeletonLoader.tsx` with standardized background token and variant support
5. Replace usage in `src/pages/PricingPage.tsx`
6. Replace usage in `src/pages/OnboardingPage.tsx` and remove local component
7. Replace usage in `src/pages/AcceptInvitationPage.tsx` and remove local component
8. Replace usage in `src/app/MainApp.tsx` and remove local component
9. Replace usage in `src/index.tsx` and remove local components
10. Replace usage in `src/shared/ui/list/EntityList.tsx`
11. Replace usage in `src/features/chat/components/MessageContent.tsx`
12. Replace usage in `src/features/chat/components/LinkMatterModal.tsx`
13. Replace usage in `src/shared/ui/inspector/InspectorPanel.tsx` and remove skeleton arrays
14. Replace usage in `src/features/chat/components/VirtualMessageList.tsx`
15. Search for remaining imports of `LoadingIndicator` and replace with `LoadingSpinner`
16. Delete `src/shared/components/LoadingIndicator.tsx` only if zero imports remain
17. Delete `SkeletonRow` from `src/shared/ui/inspector/InspectorPrimitives.tsx` only if zero imports remain
18. Update imports across all modified files
19. Run `pnpm typecheck`, `pnpm test`, and `pnpm lint`

## Acceptance Criteria
- No hard-coded `"Loading..."` or `"Loading…"` strings remain in listed files except test fixtures
- Each listed file imports the designated shared primitive and no longer declares a local loading component
- `src/app/MainApp.tsx` preserves `p-6` padding
- `src/shared/ui/list/EntityList.tsx` preserves `p-4` padding and caller `className`
- `src/features/chat/components/LinkMatterModal.tsx` keeps visible loading text in the button while loading
- `src/shared/components/LoadingIndicator.tsx` has zero imports and can be safely deleted
- `src/shared/ui/inspector/InspectorPrimitives.tsx` `SkeletonRow` has zero imports and can be safely deleted
- Remove any now-unused exports from `InspectorPrimitives.tsx` if the file becomes partially unused
- Both `LoadingScreen` and `FallbackLoader` local declarations removed from `src/index.tsx`
- `conversationSkeletonRows`, `clientSkeletonRows`, and `matterSkeletonRows` arrays are removed
- All fullscreen loading states use `LoadingScreen` component
- All container-level loading states use `LoadingBlock` component
- All content placeholder rows in listed files use `SkeletonLoader`
- Spinner circles use `border-[rgb(var(--accent-foreground))] border-t-transparent`
- All skeleton backgrounds use `bg-[rgb(var(--accent-foreground)/0.1)]`
- No `bg-gray-200` or `bg-white/[0.07]` skeleton placeholder classes remain in listed files
- No inline `animate-spin` loader markup remains in listed files
- No local components named `LoadingScreen` remain in listed files
- `pnpm typecheck` passes
- `pnpm test` passes
- `pnpm lint` passes

## Notes for Contributor
- The i18n key `common:app.loading` already exists in `locales/en/common.json`
- The accent token system is already implemented in the codebase
- Existing `LoadingSpinner` component at `src/shared/ui/layout/LoadingSpinner.tsx` should be enhanced, not replaced
- Do not convert literal non-generic loading messages like `"Loading invitation…"` to i18n in this issue
- All changes must preserve existing conditional logic and component structure
- Additional files may be touched only for import cleanup or type fixes
