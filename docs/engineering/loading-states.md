# Loading states

Canonical patterns for "this UI is waiting for data." See issue #533 for the audit that produced these rules.

## TL;DR

```tsx
// Lists & panels — keeps existing data visible during refetch.
{error && !data ? <Err/> : isLoading ? <LoadingBlock/> : data.length === 0 ? <Empty/> : <List/>}

// Detail pages — only show full-page loader when there is no data yet.
if (isLoading && !detail) return <LoadingBlock label="..." />;
// Inline indicator near the title for background refetches:
title={(<><Title/>{isFetching ? <LoadingSpinner size="sm" announce={false}/> : null}</>)}
```

## Hook contract (`AsyncState<T>`)

Every data-fetching hook should expose this shape (`src/shared/hooks/types.ts`):

```ts
type AsyncState<T> = {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;   // first load only
  isFetching: boolean;  // any in-flight request (superset of isLoading)
  refetch: () => Promise<void>;
};
```

- **`isLoading`** is true only until the first response. **Permanently false** after that.
- **`isFetching`** is true whenever a request is in flight, including refetches.
- **`data`** is `undefined` until first load. **Never reset to undefined** on refetch — let renderers keep the stale view while `isFetching` is true.

The wrapping hooks (`useMattersData`, `useClientsData`, `usePracticeTeam`, `useIntakesData`) follow this. `useUserProfile` is dead code; ignore.

## Primitives — when to use which

| Use | Primitive | Notes |
|---|---|---|
| First-load placeholder for a page-sized container | `<LoadingBlock>` (h-full) | Pass `minDurationMs={150}`–`200` to avoid flicker on fast networks. |
| Cold app boot (no UI yet) | `<LoadingScreen>` (h-screen) | Already wrapped by `<AuthBootGate>` in `App` — most callers don't need this directly. |
| Inline activity indicator (next to a title, inside a button) | `<LoadingSpinner size="sm" announce={false}/>` | Inherits `text-[rgb(var(--accent-foreground))]` color. |
| Skeleton for content with a known shape | `<SkeletonLoader variant=…>` + presets `InspectorSectionSkeleton`, `MessageRowSkeleton` | Variants: `text`, `title`, `avatar`, `button`, `input`, `chip`, `rect`. |
| AI thinking dot | `<AIThinkingIndicator/>` | Custom `aria-busy` + accent dot animation. |
| Lazy route fallback | `<LazyRouteBoundary>` | Wraps both `<Suspense>` (loading) and `<ErrorBoundary>` (chunk-load failure). |
| Empty/blank state | `<PanelEmptyState>` (compact) or `<WorkspacePlaceholderState>` (rich, with actions) | NEVER use these as a loader. |
| Progress ring 0–100 | `<ProgressRing useTrafficLights/>` (general) or `<UploadProgressRing/>` (upload-specific theme tokens) | `CompletionRing` was retired — do not reintroduce. |

## The four panel rendering patterns (`error → loading → empty → data`)

All seven matter sub-panels (`MatterMessagesPanel`, `MatterExpensesPanel`, `MatterMilestonesPanel`, `MatterNotesPanel`, `TimeEntriesPanel`, `DashboardSummaryCards`, `DashboardHero`, `MatterFilesSection`, `MatterFilesPanel`) follow this precedence:

```tsx
{error && data.length === 0 ? <ErrPanel/> :
 isLoading && data.length === 0 ? <LoadingBlock/> :
 data.length === 0 ? <PanelEmptyState/> :
 <DataList/>}
```

Why each guard:
- `error && data.length === 0` — only show full error if we have nothing else to render. Refetch errors with stale data should be inline, not destructive.
- `isLoading && data.length === 0` — same logic for loading. Existing data stays visible while we refetch.
- `data.length === 0` — true empty state, AFTER both loading and error are checked.

**Anti-pattern (banned):** `if (loading) return <LoadingBlock/>` at component top. This wipes all existing UI on every refetch (including in-flight uploads, drag zones, etc.). The lone valid use is `EntityList`, which is paired with `usePaginatedList` that always resets `items=[]` when `isLoading=true`.

## Detail pages

Detail pages can early-return on first load only:

```tsx
if (isLoading && !detail) return <LoadingBlock label="Loading invoice..." />;
if (error && !detail) return <ErrBox/>;
// Inline refetch indicator next to the title:
<EditorShell title={<>{detail.invoiceNumber}{isFetching ? <LoadingSpinner size="sm" announce={false}/> : null}</>} ... />
```

This keeps the page visible during background refetches triggered by mutations (sync, void, payment).

## Avoiding flicker on fast networks

`<LoadingBlock>` and `<LoadingScreen>` accept `minDurationMs` (default `0`). When set, they render `null` for that many ms after mount, then the spinner. Loads that finish faster than the threshold never flash a spinner.

Recommended values:
- Route subviews: `200`
- Inline panels: `150`
- Cold boot (`AuthBootGate`): `150`

## Auth boot gate

`<AuthBootGate>` wraps `<AppShell>` in `App`. While `useSessionContext().isPending` is true, it shows a single full-screen `<LoadingScreen>` so per-route `if (sessionPending) return <LoadingScreen />` checks become redundant (legacy checks remain as defense-in-depth — safe to remove in a follow-up).

## Lazy route boundaries

Replace `<Suspense fallback={<RouteFallback/>}>` with `<LazyRouteBoundary>`. The new boundary combines Suspense (initial chunk) AND ErrorBoundary (chunk load failure), so a network blip during dynamic import shows a "Reload" button instead of a blank screen.

## Mutation visibility (submit / save / delete)

Every async button must give the user feedback that the action is in flight. Two equivalent patterns are in use; pick whichever fits the surrounding code:

**Local boolean** (page-level handlers, dialogs):

```tsx
const [isSaving, setIsSaving] = useState(false);
const handleSave = async () => {
  setIsSaving(true);
  try { await mutate(); } finally { setIsSaving(false); }
};
<Button onClick={handleSave} disabled={isSaving}>
  {isSaving ? 'Saving…' : 'Save'}
</Button>
```

**Form context** (anything wrapped by `<Form>`):

```tsx
// Form.tsx already exposes isSubmittingSignal via context. FormActions
// auto-disables submit/cancel during submission. Add nothing — just don't
// re-implement isSubmitting at the page level.
<Form onSubmit={...}>
  <FormFields/>
  <FormActions/>
</Form>
```

Both patterns: spinner in the button is optional, but the disabled state and label change are required. Never use a bare `<Button onClick={async () => {…}}>` with no in-flight state — double-clicks become double-submits.

## Persistence (sessionStorage-backed cache)

`queryCache` writes to `sessionStorage` under key `blawby:queryCache:v1`. On page reload, hydrates non-evicted entries into the in-memory atom — so navigating back to a list shows data immediately instead of a loader. Cleared on `auth:session-cleared`. Versioned key so a deploy that changes data shapes can bump `v1` → `v2` to invalidate stored data.

Quota/private-browsing failures are silent (try/catch); the in-memory cache stays authoritative. Don't use this for huge blobs.

## Stale-while-revalidate

`coalesceGet` accepts `swr: true` (default for `useQuery`). When set, a stale entry is returned immediately AND a background refetch updates the cache. The nanostores subscription causes useQuery to re-render with fresh data when it arrives. `evictAt` (24× TTL) controls the hard delete deadline — past this, the entry is gone and the next read is a cold fetch.

For data that should never be served stale (auth, billing display about to be acted on), call `coalesceGet({ swr: false })` or use `queryCache.isFresh(key)` to gate.

## WS reconnecting indicator

`ChatContainer` tracks "have we ever been ready" via a ref. If `isReady` flips true once and then later goes false (socket dropped), a "Reconnecting to chat…" banner appears above the composer. Disappears when `isReady` flips true again. The transport hook (`useConversationTransport`) handles the actual reconnect with exponential backoff — this is purely UX surfacing.

## Migration notes

- Hooks renamed `loading` → `isLoading`: `useBillingData`, `useActivity`, `usePracticeManagement`. Update any consumer destructure: `loading: foo` → `isLoading: foo`.
- `isLoaded` field removed from `useMattersData`, `useClientsData`, `usePracticeTeam`. Replace `.isLoaded` with `!isLoading` (post-Phase-C3 they are equivalent because `isLoading` is permanently false after first load).
- `useIntakesData` now delegates to `useQuery` (in-flight coalescing, same as `useIntakeDetail` et al.). It still exposes `isLoaded`, derived as `data !== undefined` — equivalent to `!isLoading` once `isLoading` is permanently false after first load. Prefer `!isLoading` in new code.
- Page-level fetches are migrating to `useQuery` for in-flight coalescing. New patterns: `useIntakeDetail`, `useEngagementDetail`, `useInvoiceDetail`, `useClientInvoiceDetail`. After mutations, call `setData(updated)` (for instant cache write) or `refetch()` (for server-truth round-trip).
