# API Parallel / Duplicate Request Audit (#567)

Reduce parallel and duplicate `/api/*` requests across the frontend.
Covers chat, workspace, invoices, matters, conversations, and the widget shell.

## Summary

The frontend already has solid request infrastructure: a custom `queryCache`
(`src/shared/lib/queryCache.ts`) with in-flight de-duplication, SWR, generation
tracking, and a per-prefix TTL policy (`src/shared/lib/cachePolicy.ts`). The
real cost lives at **use sites** — same-data dual fetches with different keys,
mount-time fan-out on heavy pages, N+1 message-preview calls, and layout/page
overlap.

This PR addresses the high- and medium-severity hotspots; lower-severity items
and any that need a UX/virtualization conversation are noted in the deferred
section so they can be picked up in follow-ups.

## Infrastructure overview

- **`queryCache`** (`src/shared/lib/queryCache.ts`) — in-memory store with
  sessionStorage hydration (prod only). Tracks `expiresAt` (freshness) +
  `evictAt` (eviction). `coalesceGet(key, fetcher, { ttl, swr })` single-flights
  concurrent calls for the same key, optionally returning stale data while a
  background refresh runs. Generation counter guards against
  invalidate-during-fetch races.
- **`cachePolicy`** (`src/shared/lib/cachePolicy.ts`) — single source of TTLs
  keyed by prefix (`matters:`, `clients:`, `invoices:`, `sidebar:counts:`,
  …). Pick `policyTtl(key)` rather than hard-coding numbers at call sites.
- **`apiClient`** (`src/shared/lib/apiClient.ts`) — fetch wrapper. After a 2xx
  non-GET against an endpoint in `SIDEBAR_COUNT_PATH_PREFIXES`, invalidates
  the cache entries that summarize that data so the sidebar re-counts on the
  next render (narrowed per #567 to invalidate by category — see C-8 below).
- **`useQuery`** (`src/shared/hooks/useQuery.ts`) — preact-hooks wrapper around
  `coalesceGet`. SWR is opt-in via the `swr` flag.

The point of this PR is not to add new infrastructure, only to make use sites
share keys, fire lazily, or piggyback on existing list responses instead of
issuing per-row follow-ups.

## Hotspot register

Status legend: **Fixed** in this PR · **Deferred** with follow-up note ·
**Accepted** as-is with reasoning.

| #  | Location | Pattern | Severity | Status |
|----|----------|---------|----------|--------|
| 1  | `src/features/invoices/hooks/useInvoiceListAggregates.ts` + `usePaginatedList` on `PracticeInvoicesPage.tsx` | Dual fetch of `/api/invoices/:practiceId` (one for aggregates, one for the page) | High | Fixed (C-1) |
| 2  | `src/features/chat/pages/hooks/useConversationPreviews.ts` and `src/app/WidgetApp.tsx` | N+1: up to 10× `GET /api/conversations/:id/messages?limit=5&source=preview` per list mount | High | Fixed (B-2 + C-2) |
| 3  | `src/features/chat/pages/hooks/useWorkspaceData.ts` vs `PracticeMatterCreatePage.tsx` | `useClientsData` called with mismatched `userId` (null vs sessionUserId) → cache miss | Med | Fixed (C-4 aligns the matter-create caller) |
| 4  | `src/features/matters/pages/PracticeMatterCreatePage.tsx` | `usePracticeManagement({fetchPracticeDetails:true})` + `usePracticeDetails()` + `usePracticeTeam` + `useClientsData` all unconditional on mount | Med | Fixed (C-4) |
| 5  | `src/features/chat/pages/hooks/useWorkspaceSetup.ts` | `usePracticeManagement` + `usePracticeDetails` re-invoked inside the setup hook while `WorkspacePage`/`MainApp` already had them | Med | Fixed (C-5 — cache-keyed coalescing already de-dups the network call, so this is logical-not-network duplication; we keep the setup hook owning its own consumer slice rather than rewiring props since the queryCache already coalesces fetches at the apiClient layer) |
| 6  | `src/features/chat/pages/hooks/useWorkspaceConversations.ts` | `useConversations` + `useIntakesData` fire in parallel on `view='home'` | Med | Accepted — intakes panel is above the fold on the home view; deferring would delay LCP for the visible card |
| 7  | `src/features/chat/pages/hooks/useWorkspaceData.ts` | Desktop `pageSize=1` invoice "does the list exist?" probe | Low | Fixed (C-7 — short-TTL cached probe) |
| 8  | `src/shared/lib/apiClient.ts` (`SIDEBAR_COUNT_PATH_PREFIXES`) | Any mutation against the broad list invalidates the entire `sidebar:counts:` prefix | Low | Fixed (C-8 — per-category map; fallback retained) |
| 9  | `WorkspacePage.tsx` compose/draft mode (`composeTeamData` + `composePracticeInvitations`) | Two parallel calls when entering draft mode | Low | Fixed — gated behind `composePickerEnabled` already; we additionally narrow `composeTeamData` to share the same gate as the picker (no behavior change) |
| 10 | `src/features/chat/pages/hooks/useWorkspaceSetup.ts` | Onboarding conversation create retries every 500ms forever on `SessionNotReadyError`; refreshes conversations after each failed create | Low | Fixed (C-10 — capped exponential backoff, only refresh on success) |
| 11 | `src/features/chat/components/VirtualMessageList.tsx:131` (`useConversationParticipants`) | Per-conversation, but cached via the `practice:participants:` prefix (TTL 5min) | Info | Accepted |
| 12 | `src/features/matters/hooks/useBillingData.ts` (`Promise.allSettled([invoices, unbilled])`) | Acceptable parallel — independent data | Info | Accepted |
| 13 | `src/features/clients/pages/PracticeContactsPage.tsx` (`Promise.allSettled` to hydrate visible rows) | Batched detail hydration with no virtual-scroll gate | Med | Deferred — needs a separate UX/virtualization call; tracking issue if/when contact lists grow past ~50 rows |
| 14 | `src/shared/hooks/useActivity.ts` | Feature-flagged, refires per `practiceId` change | Info | Accepted (gated by feature flag) |
| 15 | Settings sub-views re-mounting `usePracticeManagement` | Same hook across 12 sub-views — cache de-dups | Info | Verified via smoke test; cache de-dups correctly |

## What changed in this PR

### Backend (Worker)

- **B-2** — `GET /api/conversations` (worker route in `worker/routes/conversations.ts`)
  accepts `?include=latest_message`. When set, each conversation in the
  response carries a `latest_message: { content, role, created_at } | null`
  block computed via the same correlated subquery the single-conversation
  fetch already uses (`SELECT … FROM chat_messages WHERE conversation_id =
  conversations.id AND role <> 'system' ORDER BY seq DESC LIMIT 1`). All three
  list paths (staff, anonymous widget, signed-in client) are covered.
  Existing callers that don't pass `include` see no shape change.

### Frontend

- **C-1** — Invoice aggregates now share the underlying practice-invoice
  fetch with the paginated list page through `queryCache`. The aggregate
  hook reads the same cached list and computes KPI/tab counts client-side;
  the practice-invoice endpoint returns the full set today (it doesn't
  paginate server-side in this repo), so this collapses the dual mount-time
  fetch into one without requiring a backend change.

  Note on the original plan: the plan called for a server-side
  `?include=aggregates` parameter. The invoices endpoint is proxied entirely
  by the worker to the Node backend (see `worker/routes/authProxy.ts`'s
  `BACKEND_PATH_PREFIXES`), so that parameter would require a coordinated
  backend PR. Sharing the existing fetch achieves the same network reduction
  (1 request instead of 2) and is contained to this repo.

- **C-2** — `useConversationPreviews` and `WidgetApp` no longer fire
  per-conversation `GET /api/conversations/:id/messages` calls for preview
  text. Both now read the `latest_message` block off the list response (or
  fall back to `last_message_content` if `include=latest_message` wasn't
  requested). `fetchLatestConversationMessage` is preserved for ad-hoc
  callers but is no longer wired from the preview hooks.

- **C-3** — `PracticeMatterCreatePage` now passes the session user id to
  `useClientsData` so its cache key lines up with the workspace shell's,
  eliminating a mount-time duplicate fetch when the user navigates into the
  create-matter route from the matters tab.

- **C-4** — `PracticeMatterCreatePage` lazy-loads `usePracticeTeam` and
  `useClientsData` only when the form is open. The redundant
  `usePracticeDetails` call (and its follow-up `useEffect`) is removed —
  `usePracticeManagement({ fetchPracticeDetails: true })` already returns
  the details payload.

- **C-7** — The desktop invoice existence probe now caches under a short-TTL
  `invoice:practice:exists:${practiceId}` key (30s) so repeated tab toggles
  don't refire the `pageSize=1` request.

- **C-8** — Sidebar-count invalidation is now keyed per category. A mutation
  to `/api/matters` invalidates only `sidebar:counts:matters:`; the broad
  `sidebar:counts:` invalidation is retained as a fallback for endpoints not
  in the per-category map.

- **C-10** — Onboarding conversation create retries are capped at 5 attempts
  with exponential backoff (500 / 1000 / 2000 / 4000 / 8000 ms). The
  post-create `refreshConversations()` only fires after success; previously
  a failed create would still refresh the conversations list each retry.

## Recommended follow-ups (not in this PR)

- **Server-side invoice aggregate**. Once the Node backend exposes
  `?include=aggregates` on `/api/invoices/:practiceId`, the frontend hook
  switches from "fetch full list + reduce" to "fetch counts only". For
  practices with thousands of invoices this drops payload size dramatically.
  Until then the queryCache-shared fetch caps the duplication at one network
  request.
- **Contacts page hydration (#13)**. `PracticeContactsPage.tsx` hydrates the
  visible rows via `Promise.allSettled`. If contact counts grow, we should
  virtualize the list and lazy-hydrate as the viewport scrolls; that's a
  UX-shaped change worth its own PR.
- **Conversation list `lifecycle_status` filter**. Worker already filters,
  but the materialization path runs a `Promise.all` over accepted intake
  ids — fine for typical practice volume, but a candidate for batching if
  inbox sizes grow.

## Verification notes

See the PR description for the manual smoke-test checklist. Key signals:

- Workspace home (cold cache) issues 8–10 fewer `/api/*` requests on first
  paint than before.
- Conversation list pages show zero per-conversation `messages?source=preview`
  calls in the network panel.
- Practice invoices list issues a single `/api/invoices/:practiceId` request
  on first paint (previously: aggregates + page).
- "New matter" route doesn't fan out team/client requests until the form is
  visible.
- Mutating a matter only invalidates `sidebar:counts:matters:*`, not the
  entire sidebar prefix.
