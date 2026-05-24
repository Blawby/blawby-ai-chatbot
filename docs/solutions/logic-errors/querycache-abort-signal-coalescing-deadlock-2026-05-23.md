---
title: queryCache.coalesceGet deadlocks when fed a per-mount AbortSignal
date: 2026-05-23
category: docs/solutions/logic-errors
module: Workspace data fetching (queryCache + usePaginatedList)
problem_type: logic_error
component: frontend_stimulus
symptoms:
  - "A list page renders permanently empty after its fetch is migrated to queryCache.coalesceGet"
  - "Every list request shows net::ERR_ABORTED in the network tab and no 200 ever completes"
  - "The cache never populates, so even a long dwell on the page shows no data and no error"
root_cause: async_timing
resolution_type: code_fix
severity: high
related_components:
  - usePaginatedList
  - queryCache
tags: [query-cache, single-flight, abort-signal, use-paginated-list, swr, data-fetching, preact]
---

# queryCache.coalesceGet deadlocks when fed a per-mount AbortSignal

## Problem

When migrating a list page that uses `usePaginatedList` (`src/shared/hooks/usePaginatedList.ts`) onto the shared SWR cache `queryCache.coalesceGet` (`src/shared/lib/queryCache.ts`), forwarding `usePaginatedList`'s per-mount `AbortSignal` into the cached fetch makes the list load **nothing** — forever. The cache never populates and the page shows an empty state even though data exists.

## Symptoms

- A list page (e.g. Engagements) renders permanently empty right after wrapping its fetch in `coalesceGet`.
- DevTools Network shows the list endpoint requested repeatedly, **all `net::ERR_ABORTED`**, never a `200`.
- A page that uses its *own* single-fire `useEffect` (e.g. `IntakesPage`) does **not** exhibit this — it caches fine even with the signal — which is the misleading part: the same migration "works on one page, breaks on another."

## What Didn't Work

- **Waiting longer on the page** — assuming the fetch just hadn't settled. It never settles; every attempt aborts within the same render flush, and no retry is scheduled.
- **Assuming the bug was the cache TTL or `swr` flag.** Neither matters here — the request is aborted before it can be cached, so freshness logic never runs.
- **Suspecting unstable hook deps causing a refetch loop.** The deps were stable; the real driver is `usePaginatedList`'s intentional double-fire on mount (see below), not dep churn.

## Solution

Do **not** forward `usePaginatedList`'s per-mount abort signal into the cached fetch. Let the request complete (it also warms the cache for the next visit); `usePaginatedList` already discards superseded results via its internal `requestId` guard.

Before (deadlocks — list never loads):

```ts
fetchPage: async (page, signal) => {
  const cacheKey = `engagement:list:${practiceId}:${activeTab}:p${page}`;
  const result = await queryCache.coalesceGet(
    cacheKey,
    (sig) => listEngagements(practiceId, { page, /* … */ }, { signal: sig }),
    { ttl: policyTtl(cacheKey), signal, swr: false }, // ← signal poisons the coalesced call
  );
  return { items: result.items, hasMore: result.total > page * PAGE_SIZE };
},
```

After (loads and caches):

```ts
fetchPage: async (page, _signal) => {           // signal intentionally unused
  const cacheKey = `engagement:list:${practiceId}:${activeTab}:p${page}`;
  const result = await queryCache.coalesceGet(
    cacheKey,
    () => listEngagements(practiceId, { page, /* … */ }), // no signal
    { ttl: policyTtl(cacheKey), swr: false },
  );
  return { items: result.items, hasMore: result.total > page * PAGE_SIZE };
},
```

For a page driven by its own single `useEffect` (like `IntakesPage`), the outer `signal.aborted` guards that gate `setState` can stay — just keep the signal out of the `coalesceGet` fetcher.

## Why This Works

`usePaginatedList` runs its fetch effect **twice on mount**: a reset effect bumps a `resetCounter`, which re-triggers the fetch effect; the first run's cleanup aborts its `AbortController`.

`coalesceGet` is single-flight — it stores the in-flight promise under the cache key in an `inflight` map and hands the **same** promise to any concurrent caller. The abort fires on a microtask, but the second (surviving) effect run calls `coalesceGet` **synchronously** while the first promise is still in `inflight`, so it coalesces onto that first promise — which is bound to the now-aborted signal. When the abort lands, **both** callers reject with `AbortError`, `inflight` is cleared, and nothing schedules another fetch (`resetCounter`/`page`/`hasMore` are stable). The list is stuck empty.

Removing the signal means the first request can't be aborted, so it completes, caches, and resolves both coalesced callers with real data. The superseded first effect's result is dropped by `usePaginatedList`'s `requestId` check; the surviving one renders.

`IntakesPage` escaped the bug only because it fires its fetch **once** per dependency change — there's no second synchronous caller to coalesce onto a doomed promise.

## Prevention

- **Never tie a `coalesceGet` call to a short-lived per-mount / per-effect `AbortSignal`** when the same key may be requested again immediately (effect double-fire, React/Preact StrictMode double-invoke, rapid remount). The single-flight coalescing means one caller's cancellation poisons every other caller of that key.
- Prefer letting cached fetches **complete** (they warm the cache); rely on a `requestId`/sequence guard to ignore stale results rather than cancelling the network request.
- When migrating a page to the cache, **test it with data present**, not just an empty/new account. The empty state hides the bug — a brand-new practice legitimately shows "No results," so an aborted-and-never-loaded list looks identical to a genuinely empty one.
- Quick check after wiring caching: open DevTools Network, visit the list, and confirm exactly one `200` (not a cluster of `ERR_ABORTED`), then navigate away and back and confirm **zero** new requests within the TTL.

## Related Issues

- PR #627 (`debug/post-signup-navigation-broken`) — introduced and fixed this while routing `IntakesPage`, `EngagementsPage`, and `ClientIntakesView` through `queryCache`.
- `src/shared/lib/queryCache.ts` — `coalesceGet` single-flight + SWR implementation.
- `src/shared/hooks/usePaginatedList.ts` — the reset-effect double-fire and `requestId` guard.
