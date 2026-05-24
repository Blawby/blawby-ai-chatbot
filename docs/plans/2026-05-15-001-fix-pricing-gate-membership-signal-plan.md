---
title: "fix: Pricing gate uses practice membership, not active_organization_id"
status: completed
created: 2026-05-15
superseded_by: 2026-05-24 remove frontend active-org recovery/custom auth events
type: fix
depth: standard
origin: docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md
severity: production
---

# fix: Pricing gate uses practice membership, not active_organization_id

> **2026-05-24 note:** This plan is retained as implementation history. Its membership-vs-pointer diagnosis remains useful, but the frontend recovery-hook shape was later removed. Current convention is to rely on Better Auth/backend session state, call `authClient.organization.setActive` only when the target org is known, and fail visibly instead of choosing the first membership as a workaround.

Paying customers in production are being hard-redirected to `/pricing` after they've already subscribed. The frontend reads `session.session.active_organization_id` as a "is this user subscribed?" boolean, but Better Auth's organization plugin uses that field as the *currently-selected org pointer*, which is legitimately `null` on fresh login or any session where `setActivePractice(...)` hasn't been called yet. The same wrong-signal pattern exists at the data layer too — `usePracticeManagement` refuses to call `listPractices()` when `active_organization_id` is `null`, so even if the routing gates are fixed they would have no data to gate on.

This plan replaces the signal with practice-membership presence, fetched once per session, with auto-activation of the first practice as a side effect (the same recovery already proven by the post-Stripe `?subscription=success` block at `src/index.tsx:653-666`). All-frontend; no backend changes; no feature flag.

(see origin: `docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md`)

---

## Goal

A paying user with ≥1 practice membership on the backend should never see `/pricing` involuntarily, regardless of whether their session has `active_organization_id` set yet. The `/pricing` gate should fire only when the user *actually* has no practice memberships of any kind.

### Success criteria

| ID  | Criterion |
|-----|-----------|
| SC1 | Cold-login with `demo.owner.local@blawby.test` (live-verified to currently land on `/pricing`) lands on `/practice/demo-owner-local`. |
| SC2 | A user with `onboarding_complete: true` AND zero practice memberships still gets redirected to `/pricing`. |
| SC3 | No `/pricing` URL appears in the browser navigation history at any point during the SC1 flow — recovery completes before the gate is evaluated. |
| SC4 | The post-Stripe `?subscription=success` round-trip still results in the new active practice being set and the user landing on workspace home. |
| SC5 | No backend changes — no new Worker routes, schema migrations, or Better Auth config edits. |
| SC6 | A single observability log fires on the recovery path: `[Workspace] auto-activated first practice (no active_organization_id on session)`. |

---

## Scope Boundaries

### In scope

- Replace `active_organization_id` as the subscription gate signal in `src/index.tsx` (both AppShell and RootRoute).
- Remove the matching wrong-signal guard in `src/shared/hooks/usePracticeManagement.ts` that early-returns when `active_organization_id` is null.
- Extract a shared `useEnsureActiveOrganization` hook used by both routing gates and (consolidated) by the post-Stripe recovery effect.
- One Playwright E2E test that codifies the cold-login → workspace home flow.
- One console log emitted on the recovery path for observability.

### Out of scope (true non-goals)

- Backend changes of any kind, per origin doc.
- A feature flag or rollback toggle. Production fire scope; revert is one commit.
- Redesigning `/practice/*` vs `/client/*` workspace routing. `useWorkspaceResolver` and `resolveAuthenticatedHomePath` already disambiguate those buckets correctly once practices are populated.
- A broader audit of every other place `active_organization_id` is read. Two callers were verified safe during brainstorm — `PracticeAppRoute` (synchronizes when route slug differs from active org) and the post-Stripe block (recovers from null). A wider audit is a follow-up if observability shows other guards misfiring.

### Deferred to Follow-Up Work

- Consolidating `getActiveOrganizationId` (duplicated locally in `src/index.tsx:114` and `src/shared/hooks/usePracticeManagement.ts:47`) into one shared util. The duplicates are read-only with identical bodies and not load-bearing for this fix.
- E2E coverage for SC2 (zero-practice user still gated at `/pricing`). U5 verifies SC1 and SC3 deterministically; SC2 is verified manually in this plan's rollout step. Building a "completed onboarding + zero practices" fixture is its own track of work.

---

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| **Gate on `hasPracticeMembership`** (derived from `practices.length > 0`), not on `session.active_organization_id`. | The brainstorm-confirmed signal swap. `active_organization_id` is a session-scoped pointer to the currently-selected org; it is `null` whenever no one has called `setActivePractice` yet for this session, which has nothing to do with subscription status. |
| **Single shared `useEnsureActiveOrganization` hook** used by AppShell, RootRoute, and the consolidated post-Stripe block. | The codebase already proves the recovery shape works in the post-Stripe success effect (`src/index.tsx:653-666`). A shared hook means one recovery path instead of three near-identical ones. |
| **Recovery is idempotent and one-shot per session** (gated by a `ref`), but invalidates on session-cleared events. | Prevents tight loops when the gate effect re-runs. Resetting on `auth:session-cleared` keeps the recovery fresh after sign-out / sign-in within the same tab. |
| **Suppress gate evaluation until `practicesLoading === false`.** | Prevents the `/pricing` flash on cold load that would happen if the gate fired before `listPractices()` resolved. |
| **Keep the post-Stripe block's success-return logic** (clearing the `?subscription` query param, dispatching `auth:session-updated`) — only the recovery body is replaced by the shared hook. | The query-param cleanup and event dispatch are still load-bearing for the success-return UX, independent of the recovery itself. |

---

## High-Level Technical Design

This is directional guidance for review, not implementation specification. The implementer should treat it as context, not code to reproduce.

**Today's flow (broken):**

```text
Session loads → active_organization_id is null
    ↓
AppShell / RootRoute compute needsFirstSubscription = !active_organization_id
    ↓
Redirect to /pricing
```

**With the fix:**

```text
Session loads → user.onboarding_complete = true
    ↓
useEnsureActiveOrganization fires (one-shot per session):
    1. listPractices()
    2. if practices.length > 0 AND !active_organization_id:
         setActivePractice(practices[0].id)
         refresh session
         emit observability log
    3. mark resolved
    ↓
Gate evaluates: needsFirstSubscription = (practices.length === 0)
    ↓
practices.length > 0 → route via resolveAuthenticatedHomePath → /practice/<slug> or /client/dashboard
practices.length === 0 → /pricing (genuine first-subscription case)
```

The recovery hook is the unified replacement for three current code paths:

- The wrong-signal early-return in `usePracticeManagement.ts:674-680` (deleted).
- The wrong-signal gate in `AppShell` (`src/index.tsx:351-358`) (data source swapped).
- The wrong-signal gate in `RootRoute` (`src/index.tsx:617-621`) (data source swapped).
- The inline recovery body in `RootRoute`'s post-Stripe `?subscription=success` effect (`src/index.tsx:653-666`) (replaced by hook call; surrounding query-param cleanup and event dispatch stay).

---

## Implementation Units

### U1. Create the shared `useEnsureActiveOrganization` hook

**Goal:** Centralize the "if no active org but practices exist, auto-activate the first one" recovery into one idempotent hook usable by both routing gates and the consolidated post-Stripe success effect.

**Requirements:** SC1, SC3, SC4, SC6.

**Dependencies:** None.

**Files:**
- Create `src/shared/hooks/useEnsureActiveOrganization.ts`.
- Create `src/shared/hooks/__tests__/useEnsureActiveOrganization.test.tsx`.

**Approach:**

The hook owns three states: `pending` (waiting for session or practices fetch), `resolved` (recovery attempted or unnecessary), and exposes `isResolving` so callers can suppress gate evaluation while it runs. It reads `session` and `practicesLoading` from existing contexts/hooks, calls `listPractices()` once per session, and — when practices exist AND `active_organization_id` is null — calls `setActivePractice(practices[0].id)`, refreshes the session via `getSession()`, dispatches `auth:session-updated`, and emits the observability log named in SC6. The hook is idempotent via a module-level `Set<userId>` so multiple consumers in the same render tree don't trigger duplicate fetches, and listens for `auth:session-cleared` to drop its memo when the user signs out.

The hook must NOT auto-fire when `user.onboarding_complete !== true` (those users belong in onboarding, not the recovery), when the user is anonymous, or when `?subscription=success` is in the URL (the existing post-Stripe block owns that round-trip and will call the hook imperatively after its query-param cleanup).

**Return shape:** the hook returns `{ isResolving: boolean, forceResolve: () => Promise<void> }`. `forceResolve()` is the imperative entry point used by U4's consolidated post-Stripe effect; it runs the recovery body once and resolves the returned promise when the session has been refreshed (or immediately if the hook already memoized success for this user). Calling `forceResolve()` bypasses the `?subscription=success` URL guard since the post-Stripe block is the caller that owns that URL state.

**Patterns to follow:**
- The recovery shape itself: `src/index.tsx:653-666` (current post-Stripe block).
- Event dispatch convention: `auth:session-updated` / `auth:session-cleared` already wired in `src/shared/contexts/SessionContext.tsx:128-146`.
- Module-level fetch coalescing: `src/shared/hooks/usePracticeManagement.ts:35-79` (the `sharedPracticeSnapshot` / `practicesInFlight` pattern).

**Test scenarios:**
- Hook resolves immediately (no fetch) when `user.is_anonymous === true`. Input: session with anonymous user. Action: render hook. Expected: `isResolving === false`, no `listPractices` call, no `setActivePractice` call.
- Hook resolves immediately when `user.onboarding_complete !== true`. Input: authenticated user with `onboarding_complete: false`. Action: render hook. Expected: `isResolving === false`, no fetch.
- Hook auto-activates when practices exist and active org is null. Input: `onboarding_complete: true`, `active_organization_id: null`, `listPractices()` returns one practice. Action: render hook. Expected: `setActivePractice(first.id)` called once, `getSession()` called, `auth:session-updated` event dispatched, observability log emitted, `isResolving` ends `false`.
- Hook does NOT call `setActivePractice` when active org is already set. Input: `onboarding_complete: true`, `active_organization_id: 'existing-org'`. Action: render hook. Expected: no `setActivePractice` call, no log, `isResolving` ends `false`.
- Hook resolves to "no practices" terminal state when `listPractices()` returns `[]`. Input: empty practices list. Action: render hook. Expected: no `setActivePractice` call, `isResolving === false`, gate caller will see zero practices.
- Hook does not double-fetch within the same session. Input: two consumers of the hook rendered concurrently for the same `userId`. Action: render both. Expected: `listPractices` called exactly once.
- Hook resets on session cleared. Input: hook resolved, then `auth:session-cleared` dispatched, then new user signs in. Action: render hook with new session. Expected: `listPractices` called again for the new user.
- Hook auto-fire path does NOT fire when `?subscription=success` is present in the URL. Input: `window.location.search === '?subscription=success'`. Action: render hook (no `forceResolve` call). Expected: no fetch (post-Stripe block owns this round-trip and will call `forceResolve` itself).
- `forceResolve()` runs the recovery even when `?subscription=success` is present. Input: same as above, but caller invokes `forceResolve()`. Action: await the returned promise. Expected: `setActivePractice` is called, `getSession()` is called, the returned promise resolves after the session refresh completes.
- `forceResolve()` is idempotent within the same session. Input: call `forceResolve()` twice for the same user. Action: await both. Expected: `listPractices` called once, both promises resolve.

**Verification:** The hook's unit tests pass. The hook never calls `setActivePractice` when one is already set. The observability log appears exactly once per recovery.

---

### U2. Remove the wrong-signal data-fetch guard in `usePracticeManagement`

**Goal:** Allow `listPractices()` to actually run when `active_organization_id` is null, so the new gate has data to evaluate. Without this, the routing-gate fix has nothing to gate on.

**Requirements:** SC1, SC2.

**Dependencies:** None (independent of U1).

**Files:**
- Modify `src/shared/hooks/usePracticeManagement.ts` (lines 674-680, the early-return guard inside `fetchPractices`).

**Approach:**

Delete the `if (!getActiveOrganizationId(sessionRef.current))` early-return at `src/shared/hooks/usePracticeManagement.ts:674-680`. The downstream 403 handling already exists at lines 963-969 (`if (isHttpError(err) && err.response.status === 403)`) and correctly treats a 403 as "user has no org" — that's the correct terminal state to land in for a user with zero practices, replacing the early-return.

The `practicesFetchForbidden` flag's existing recovery clause at lines 685-691 (which clears the flag when `getActiveOrganizationId` becomes truthy) becomes mildly less useful once the gate doesn't depend on the field, but it's still correct — clearing the flag on session change is fine. Leave it in place; the cleanup is deferred.

The local `getActiveOrganizationId` helper at lines 47-51 remains used by the `practicesFetchForbidden` clearing logic. Don't remove it.

**Patterns to follow:**
- The existing 403 terminal-state handling at `src/shared/hooks/usePracticeManagement.ts:963-969`.

**Test scenarios:**
- `fetchPractices` calls `listPractices()` when `active_organization_id` is null but the user is authenticated and non-anonymous. Input: session with `user.id` set, `is_anonymous: false`, `active_organization_id: null`. Action: render `usePracticeManagement({ autoFetchPractices: true })`. Expected: `listPractices()` is called; previously it was not.
- A 403 from `listPractices()` still sets `practicesFetchForbidden` and leaves `practices === []`. Input: backend returns 403. Action: render hook. Expected: `practicesFetchForbidden === true`, `practices === []`, no infinite retry.
- A successful response populates `practices` even when `active_organization_id` is still null. Input: backend returns one practice; session's `active_organization_id` remains null until U1's recovery runs. Action: render hook. Expected: `practices.length === 1`.

**Verification:** `usePracticeManagement` returns a non-empty `practices` array for users who own ≥1 practice, regardless of whether `active_organization_id` is set on the session.

---

### U3. Replace the AppShell gate to use the shared hook

**Goal:** AppShell's in-app redirect no longer treats null `active_organization_id` as "needs subscription"; it gates on practice-membership presence after the recovery hook has resolved.

**Requirements:** SC1, SC2, SC3.

**Dependencies:** U1, U2.

**Files:**
- Modify `src/index.tsx` (`AppShell`, lines ~225-395).

**Approach:**

Inside `AppShell`, call `useEnsureActiveOrganization()` and read `isResolving` from it. The `needsFirstSubscription` calculation at lines 351-358 changes its data source: instead of `!activeOrganizationId`, it becomes `!hasPracticeMembership` (already exposed by the existing `useWorkspaceResolver` call at line 253). The `shouldFetchWorkspacePractices` condition at line 252 must drop the `(!completedOnboarding || Boolean(activeOrganizationId) || isClientRoute)` clause — always fetch when onboarding is complete.

The gate-firing effect (lines 284-395) must not redirect to `/pricing` while `isResolving === true` OR while `practicesLoading === true`. Both are loading states that precede a valid gate decision.

The `authenticatedHomePath` memoization at lines 274-282 must drop the `if (completedOnboarding && !activeOrganizationId) return null;` short-circuit — that path is now resolvable once practices are loaded.

**Patterns to follow:**
- The existing `isClientRoute` / `isPublicRoute` / `isPricingRoute` exclusion pattern in `shouldFetchWorkspacePractices`.
- The existing `bypassOnboardingForRoute` pattern for not re-redirecting users already on a debug or public route.

**Test scenarios:**
- (Covered end-to-end by U5.) AppShell does not navigate to `/pricing` for a user whose practices fetch returns ≥1 practice, even when `active_organization_id` starts null.
- AppShell navigates to `/pricing` for a user with `onboarding_complete: true` and `practices.length === 0`. (Covered by U5 with the second test user.)

**Verification:** Manual cold-login with `demo.owner.local@blawby.test` lands on `/practice/demo-owner-local`, not `/pricing`. Browser history shows no intermediate `/pricing` entry.

---

### U4. Replace the RootRoute gate and consolidate the post-Stripe block

**Goal:** RootRoute's top-level redirect uses the same shared hook and signal as AppShell. The existing post-Stripe `?subscription=success` recovery effect delegates its recovery body to the shared hook, keeping only the query-param cleanup and event dispatch.

**Requirements:** SC1, SC2, SC3, SC4.

**Dependencies:** U1, U2.

**Files:**
- Modify `src/index.tsx` (`RootRoute`, lines ~592-715).

**Approach:**

Inside `RootRoute`, call `useEnsureActiveOrganization()`. Drop the `needsFirstSubscription` calculation at lines 617-621 in favor of `practices.length === 0` (read from `useWorkspaceResolver`, which is already called at lines 603-611 — change `shouldFetchRootPractices` at line 602 to always fetch when `completedOnboarding`, not gated on `activeOrganizationId`).

The post-Stripe `?subscription=success` effect at lines 638-683 keeps its outer structure — the `subscriptionSyncHandledRef` guard, the `setSubscriptionSyncPending(true)`, the final `history.replaceState` to strip the query param, and the `setSubscriptionSyncPending(false)` — but replaces the inline recovery body (lines 648-666) with a call to `useEnsureActiveOrganization`'s imperative `forceResolve()` API (returned by the hook alongside its render-time return value). The `setSubscriptionSyncPending` state and `practicesLoading` are both inputs to the second effect (lines 685-715) — leave that wait-condition logic intact.

The gate-firing effect at lines 685-715 must also wait for `isResolving === true` from the shared hook before navigating to `/pricing`.

**Patterns to follow:**
- The existing `subscriptionSyncPending` pattern for suppressing the redirect during async recovery.
- Imperative-from-effect convention: `forceResolve()` returns a Promise so the post-Stripe effect can `await` it before its `.finally(() => setSubscriptionSyncPending(false))`.

**Test scenarios:**
- (Covered end-to-end by U5.) RootRoute does not navigate to `/pricing` for a user whose practices fetch returns ≥1 practice, even when `active_organization_id` starts null.
- (Covered by U5 success-return test.) Returning from Stripe with `?subscription=success` results in the new active practice being set, the query param being stripped, and the user landing on workspace home.

**Verification:** Manual cold-login flow matches U3's verification. A simulated post-Stripe round-trip (navigating to `/?subscription=success` after a fresh checkout) still strips the query param and lands on practice home.

---

### U5. Playwright E2E codifying the cold-login flow

**Goal:** Lock in the regression-free behavior with a Playwright test that exercises the exact reproduction we verified live during brainstorm.

**Requirements:** SC1, SC2, SC3.

**Dependencies:** U1, U2, U3, U4.

**Files:**
- Create `tests/e2e/pricing-gate-membership.spec.ts`.

**Approach:**

Two tests:

1. **Subscribed-user cold login** — sign in as `E2E_OWNER_EMAIL`, assert the final landing URL matches `/practice/<slug>` (or `/client/<slug>` if owner is configured as client-only — branch on `useWorkspaceResolver` shape rather than hardcoding). Assert that no navigation event during the login resolved to `/pricing` (use Playwright's `page.on('framenavigated', ...)` to record the URL history). Assert that `await page.evaluate(() => fetch('/api/auth/get-session').then(r => r.json()))` returns a session with non-null `active_organization_id` post-login.

2. **Zero-practice user gate still fires** — covered by **manual QA** in this plan's rollout step rather than E2E. The existing E2E fixtures (`E2E_OWNER_EMAIL`, `E2E_CLIENT_EMAIL`) do not include a "completed onboarding + zero practices" user, and standing one up requires either a new signup flow inside the test (race-prone) or a fixture-management change beyond this plan's scope. Document the manual verification step in U5 as a comment block at the top of the spec file, and leave automation as a tracked follow-up.

**Patterns to follow:**
- `tests/e2e/widget-auth.spec.ts` for the auth fixture and session-wait helper.
- `tests/e2e/helpers/auth.ts` (`waitForSession`).
- `tests/e2e/fixtures.auth.ts` for the `ownerContext` fixture pattern.

**Execution note:** Run against the local stack at `https://local.blawby.com` per CLAUDE.md's E2E setup. Confirm the test passes locally before declaring the unit done.

**Test scenarios:**
- Covers SC1 — subscribed-owner cold login lands on workspace home (not `/pricing`).
- Covers SC3 — no `/pricing` URL appears in the navigation event stream during login.
- Covers SC2 — zero-practice user with completed onboarding still gets gated. (Conditional on existing test fixtures supporting the state; otherwise skipped with a written reason.)

**Verification:** `npm run test:e2e -- pricing-gate-membership` passes locally. The test fails (as a sanity check) when run against the current `staging` HEAD without U1-U4 applied.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Race condition: `/pricing` flash before practices load.** AppShell or RootRoute evaluates the gate before `useEnsureActiveOrganization` resolves and flashes the redirect for a frame. | Gate-firing effects in U3 and U4 must wait for `isResolving === false` AND `practicesLoading === false`. U5's SC3 assertion catches a regression here by recording the entire navigation history. |
| **High-traffic file regression.** `src/index.tsx` owns routing for every authenticated entry; downstream routes (`/practice/*`, `/client/*`, `/onboarding`, `/auth`) all assume `activeOrganizationId` is set in time. | The recovery hook always *fires and resolves* before the gate evaluates, so by the time any downstream route mounts, the session has been refreshed with the activated org. `PracticeAppRoute`'s existing `setActivePractice` sync (`src/index.tsx:804-826`) still catches slug ≠ active-org mismatches as a second-line guard. |
| **Existing subscribers whose subscription is `canceled` / `incomplete_expired`.** Today they're gated at `/pricing`. After this change they are also gated because `listPractices()` returns `[]` for them — no regression, but worth confirming during QA. | Manual QA pass: log in as a user with a canceled subscription, confirm pricing redirect still fires. Out of scope to *improve* this behavior here; just confirming it's preserved. |
| **Recovery loop if `setActivePractice` succeeds but `getSession()` returns stale data.** The hook would think it succeeded, but the next render sees stale `active_organization_id: null` and re-fires. | Module-level `Set<userId>` memoizes successful resolution and only clears on `auth:session-cleared`. If `getSession()` returns stale, the hook still marks resolved — the gate then evaluates on `practices.length`, which is correct independent of the session field. |
| **Observability log spam.** If the recovery fires too often (e.g., per render), it floods console / Sentry. | Memoization above ensures one log per session per user. U1's test scenarios include "does not double-fetch within same session." |

---

## System-Wide Impact

This change affects every authenticated entry path into the app:
- `/` (RootRoute redirect) — gate signal changes
- All in-app navigations during a logged-in session (AppShell redirect) — gate signal changes
- Post-Stripe `?subscription=success` round-trip — recovery body is consolidated but surrounding behavior is preserved
- `usePracticeManagement` consumers — `practices` will now populate for users who previously got an empty list due to null `active_organization_id`. No consumer treats an unexpectedly-populated `practices` array as an error, but a manual scan confirms this is purely additive correctness.

No backend touch surface. No widget / public-route / client-route behavior change (those bypass the gate via existing `isPublicRoute` / `isClientRoute` / route-specific bypasses).

---

## Rollout & Verification

- **Pre-merge:** U5 Playwright test passes locally against the full repro account.
- **Pre-merge:** Manual cold-login against `https://local.blawby.com` with `demo.owner.local@blawby.test` lands on practice home with no `/pricing` intermediate.
- **Pre-merge:** Manual repro of zero-practice user (or `test.skip` with explicit reason in U5).
- **Pre-merge:** Manual `?subscription=success` round-trip works end-to-end.
- **Post-deploy:** Watch logs for `[Workspace] auto-activated first practice (no active_organization_id on session)`. If the rate spikes far above the rate of fresh logins, that's a signal of a deeper session-handling bug worth investigating (out of scope here).
- **Rollback:** Single-commit revert. No feature flag, no database state.

---

## Implementation Notes & Follow-Up (post-merge)

### Deviation from planned endpoints

Plan called for the recovery hook to use `listPractices()` and `setActivePractice()` from `src/shared/lib/apiClient.ts`. **Discovered mid-implementation via live Playwright repro** that those calls route through the worker's `/api/practice/list` and `/api/practice/{id}/active` endpoints, both of which are middleware-gated on active-org context and 403 from a null state — exactly the state the recovery is trying to bootstrap from. Chicken-and-egg.

**Swapped to Better Auth's direct endpoints** mid-implementation: `authClient.organization.list()` and `authClient.organization.setActive({ organizationId })`. These hit `/api/auth/organization/*` via Better Auth's plugin client, which the worker passes through verbatim without org-context middleware. Tests, types, and the recovery body were updated to match. The deviation is captured in [src/shared/hooks/useEnsureActiveOrganization.ts](src/shared/hooks/useEnsureActiveOrganization.ts) comments and in the new convention doc [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md).

### Belt-and-braces guard added during self-review

The plan's gate signal was `!hasPracticeMembership` alone. Self-review identified a race where the practice-list refetch effect and the gate effect could run in the same commit phase after recovery completes, with `practicesLoading` and `hasPracticeMembership` both reading stale values for one render. Added `!activeOrganizationId` as a co-required condition — a non-null active org is independent proof of membership regardless of practice-list staleness. Lives in both AppShell and RootRoute gates ([src/index.tsx](src/index.tsx)).

### Code review residuals (PR #577, ce-code-review autofix run)

Multi-agent code review on PR #577 surfaced 13 findings that did not block the production-fire merge but are tracked here as follow-up work. Full synthesis at the run artifact (`/tmp/compound-engineering/ce-code-review/20260515-220925-a8861688/synthesis.md`). Highest-priority items:

- **#1 P0 — Memoization-of-failure (6 reviewers converged).** `resolvedForUserIds.add(userId)` in the outer `finally` of `runRecovery` runs regardless of success. Any transient error in `listMembershipOrgs` / `setActiveOrganization` / `getSession` permanently marks the user "resolved with no org" for the session. Fix: move the `add` call inside the success branch; let failures retry on the next render.
- **#2 P0 — Post-Stripe userId-null race (3 reviewers).** If `useSession()` is still pending when the post-Stripe effect fires, `forceResolve()` short-circuits but the surrounding `.then(refetchPractices).finally(stripUrl)` chain runs anyway. `subscriptionSyncHandledRef.current = true` then permanently blocks re-entry. Fix: guard the effect on `userId` resolving before kicking the chain.
- **#3 P1 — `/client/dashboard` misroute race.** Even with the belt-and-braces guard, a render frame after recovery completes can route a paying practice-owner to `/client/dashboard` because `practicesLoading` flips false before the refetch's `setGlobalLoading(true)` lands. Fix: gate the transient state with `if (activeOrganizationId && !hasPracticeMembership) return;`.
- **#4 P1 — No timeouts on Better Auth calls.** Backend hang → `isResolving` stuck true forever → infinite `LoadingScreen`. Trades the original wrong-redirect bug for a worse stuck-on-loader bug. Fix: `Promise.race` against an N-second timeout in `useEnsureActiveOrganization`.
- **#5 P1 — `BackendSessionSchema` doesn't declare `active_organization_id`.** Forces the four `as Record<string, unknown>` casts that the helper-dedup follow-up depends on. Fix: add `active_organization_id: z.string().nullable().optional()` to [worker/types/wire/auth.ts](worker/types/wire/auth.ts).
- **#6 P1 — Cancelled-subscription strand.** Stale `active_organization_id` pointing at a deleted org doesn't redirect to `/pricing` but also has no workspace to land in.
- **#7 P1 — `usePracticeManagement` has zero unit coverage for U2/U3 changes.** A future maintainer could re-add the deleted guard with no test feedback.
- **#8 P1 — E2E may not exercise the bug repro.** The Playwright spec asserts `active_organization_id` is truthy post-login but doesn't assert it was `null` pre-login.
- **#9 P2 — Helper duplication.** `useSessionContext().activePracticeId` already exposes the same field; the diff re-implements the read in 4 places (`active_organization_id` plus 3 inline casts). Consolidating drops the casts.
- Plus P2/P3 items: post-Stripe `.catch()` unreachable, `getSession` failure misleading log, non-403 errors fall through silently, multi-org `practices[0]` non-deterministic ordering, redundant 403 fetch on every new mount, module-level event listener never removed.

### Pre-existing test failure (not introduced by this PR)

`tests/unit/middleware/auth.test.ts > parses active organization id from root-level Better Auth payload fields` fails on the staging baseline and is in a worker module (`worker/middleware/auth.ts`) untouched by this branch. Investigation deferred — separate concern.

### Surfaced into convention doc

The pointer-vs-state insight from this fix was captured as durable knowledge in [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md), seeding the previously-nonexistent `docs/solutions/` knowledge store for this repo.
