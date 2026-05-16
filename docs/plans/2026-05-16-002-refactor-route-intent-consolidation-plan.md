---
title: "Consolidated session/auth/routing fix — route-intent refactor + backend contract fixes"
type: mixed
status: frontend-shipped
date: 2026-05-16
updated: 2026-05-16
origin: docs/audits/2026-05-16-session-auth-surface-audit.md
related_pr: https://github.com/Blawby/blawby-ai-chatbot/pull/581
spans_repos: ["blawby-ai-chatbot", "blawby-backend"]
---

# Consolidated session/auth/routing fix

## Summary

Single plan spanning two repos, addressing **all observed bugs** found during the Playwright verification pass of the session/auth audit. Theoretical concerns are excluded per [CLAUDE.md](../../CLAUDE.md).

**Headline frontend work** (this repo, `blawby-ai-chatbot`): replace the scattered `useEffect`-and-`navigate()` gate pattern in [src/index.tsx](../../src/index.tsx) with a single `useAuthRouteIntent()` hook returning a discriminated-union `RouteIntent`. Closes the verified `/pricing` flash bug (~911ms, reproducible 2/2 on cold sign-in, AND reproducible on direct navigation to any in-app URL like `/practice/{slug}/settings/account`).

**Backend work** (separate repo, `blawby-backend`): close two observed contract gaps where the backend returns errors for valid empty states, causing frontend cascades.

**Out of scope** (deferred or wholly skipped): theoretical races never observed, the discarded brainstorm's defensive-hardening plan, magic-link wire-up (product decision), routing-library swap.

(see origin: [docs/audits/2026-05-16-session-auth-surface-audit.md](../audits/2026-05-16-session-auth-surface-audit.md))

---

## Problem Frame

Four observed problems, three verified end-to-end during Playwright pass on 2026-05-16, plus one architectural anti-pattern that all three share as root cause:

### 1. Verified frontend bug — `/pricing` flash for ~911ms on first AppShell mount

Live Playwright verification (2/2 cold sign-ins as `demo.owner.local@blawby.test`) showed the user lands at `/pricing` for ~911ms before being redirected to `/practice/<slug>`. The recovery hook's `[Workspace] auto-activated first practice` log fires **291ms AFTER** the gate replaces the URL with `/pricing`.

**Additional reproduction** during the Playwright pass: navigating directly to `https://local.blawby.com/practice/demo-owner-local/settings/account` with a valid session ALSO flashes `/pricing` first. So the bug isn't specific to `/auth → workspace` — ANY first-time mount of AppShell with a session that has `active_organization_id: null` flashes `/pricing` while the recovery hook fires.

Root cause in [src/index.tsx:694](../../src/index.tsx): `if (isPending || ensuringActiveOrg || (shouldFetchRootPractices && practicesLoading)) return;` reads stale `false` values for `ensuringActiveOrg` and `practicesLoading` on render #1, because both flags are initialized with `useState(false)` (or a lazy initializer that can evaluate `false`) and only flip to `true` via `useEffect` on render #2. By then the gate has already navigated.

### 2. Verified backend bug — `/api/preferences/{category}` returns 404 for users without a preferences row, breaks the account settings page

Playwright pass discovered: navigating to `/practice/{slug}/settings/account` produces **260+ console errors in 2 seconds**, the AccountPage React tree thrashes in an infinite re-render loop. Root cause confirmed at [blawby-backend / src/modules/preferences/services/preferences.service.ts:99-101](../../../blawby-backend/src/modules/preferences/services/preferences.service.ts):

```ts
if (!row) {
  throw new HTTPException(404, { message: 'Preference not found' });
}
```

The backend treats "user has never set any preferences" (a normal, valid state for any new user) as an HTTP error. The frontend at [src/features/settings/pages/AccountPage.tsx:157](../../src/features/settings/pages/AccountPage.tsx) awaits `getPreferencesCategory<AccountPreferences>('account')`, which surfaces the 404 as a thrown `HttpError`. The catch at line 186-189 sets error state, but something downstream (likely `loadAccountData` being recomputed via `useCallback` deps that flip per render) re-fires the effect → re-throws → re-renders. This is the **same anti-pattern** as the `active_organization_id` confusion — both surface from backend treating empty states as error states.

Per [CLAUDE.md](../../CLAUDE.md): *"When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first; do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented."* This is a backend fix.

### 3. Verified backend code-level defect — `requireAuth.ts:37` `primaryWorkspace` UUID-fallback

From the audit (Batch 4). The middleware substitutes `user.primaryWorkspace` (a string literal `'practice' | 'client' | 'public'`) for `activeOrganizationId` (a UUID) when the session lacks an active org. Downstream consumers treat `activeOrganizationId` as a UUID for membership/permission queries.

Playwright pass verified: for the demo owner user, `primaryWorkspace` is currently `null`, so the substitution returns `null` and downstream queries correctly 403 with "No organization context found". The defect is **dormant for users where `primaryWorkspace` happens to be unset**, but would activate for any user where the best-effort `primaryWorkspace` setter at `organization.service.ts:53-71` succeeded (which is intended for all org-creators and members). Type-violation present in code regardless of current activation state.

### 4. Architectural anti-pattern shared across all three bugs above

[src/index.tsx](../../src/index.tsx) computes routing decisions from boolean loading flags inside `useEffect`s, then calls `navigate()` imperatively. This pattern is brittle:

- Duplicated `needsFirstSubscription` logic in both AppShell (lines 353-364) and RootRoute (lines 634-642) with slight drift
- 5 different readers of `session.session.active_organization_id` (`src/index.tsx:232-236`, `:611-614`, `:808-810`; `SessionContext.tsx:33-39`; `usePracticeManagement.ts:590-594`; `useEnsureActiveOrganization.ts:49-54`) with inconsistent trim/casting behavior
- Imperative `navigate()` from `useEffect` produces visible URL flashes on every "wait state → resolved state" transition

The user's framing: *"we have a lot of gates and we need to remove those gates and come up with something better that's best practice."* Option 2 from the post-audit debrief (discriminated-union routing state with a single owner hook) was selected.

### What's NOT in this plan (verified non-issues per the audit pass)

- ✅ Login / sign-up flows (email+password, Google OAuth) — verified working via Playwright sign-in
- ✅ Logout — verified working via Playwright `POST /api/auth/sign-out` (with `Content-Type: application/json` empty body, which the frontend's `authClient.signOut()` wrapper handles correctly)
- ✅ Password-user account deletion — verified UI exists; reachable once the AccountPage render loop is fixed
- ✅ Cookie domain / sameSite / secure config — verified consistent
- ✅ `useSession()` hook — verified working
- ✅ Worker proxy `/api/auth/*` pass-through — verified working
- ✅ Stripe webhooks / subscription billing — verified mature and well-instrumented (idempotent + signature-verified + race-handled)
- 🔍 Post-Stripe userId-null race — theoretical, no observed evidence (still excluded per CLAUDE.md)
- 🔍 `/client/dashboard` flash race — theoretical, no observed evidence (Playwright pass confirmed: zero `/client/dashboard` in nav history during owner sign-in; flash markers empty)
- ⚠ OAuth account deletion (missing `sendDeleteAccountVerification`) — backend gap, not in scope here; track separately
- ⚠ Stale unit test `tests/unit/middleware/auth.test.ts:38-58` — trivial one-line PR to delete the test, can ship in parallel or before, not coupled to this plan
- ⚠ Magic link half-built — product decision required (remove backend plugin OR wire frontend); not a bug

---

## Requirements

### Frontend (this repo)

- R1. **Close the verified `/pricing` flash bug** at every entry path that mounts AppShell. Cold sign-in AND direct-URL navigation must not produce `/pricing` in URL history at any point for an authenticated user with valid memberships. Final landing remains `/practice/<slug>`.
- R2. **Single source of truth for routing intent.** Exactly one hook computes "where should this user be right now?" — `useAuthRouteIntent()` returning a `RouteIntent` discriminated union. AppShell and RootRoute consume the same value; no duplicated logic.
- R3. **Loading is an explicit kind, not an implied flag race.** `RouteIntent` includes `{ kind: 'loading' }` as a first-class state. Any input being in-flight (session pending, practice list mid-fetch, recovery in-flight, post-Stripe sync in-flight) produces this kind. Consumers explicitly handle `loading` — they don't have to remember to suppress redirects while flags are stale.
- R4. **No `navigate()` from `useEffect` in the new code path.** Redirection happens declaratively via a small component that returns either the matched workspace UI or a `<Redirect to={...} />`. The component renders once per intent transition, not many times via flag flips.
- R5. **The 5 raw reads of `session.session.active_organization_id` consolidate.** Either the new intent hook is the canonical read site, or the readers are inlined into the intent's input computation. After the refactor, no consumer reads the field directly except (a) the intent hook itself, (b) the canonical normalization in `src/shared/lib/authClient.ts`, (c) the type declaration in `src/shared/types/user.ts`.
- R6. **No defensive code for theoretical failures.** Per [CLAUDE.md](../../CLAUDE.md), no timeouts, retry counters, fallback paths, or guards for failures that aren't observed. The audit verified the backend is stable; this refactor does not add hardening for hypothetical backend issues. The one frontend-defensive change in scope — loading-by-default initial state in `usePracticeManagement.ts` and `useEnsureActiveOrganization.ts` — is justified by an observed bug (the flash), not theoretical concern.
- R7. **Router-library stays as `preact-iso`.** The discriminated union pattern works with any router; we wrap one small `<Redirect>` component around the existing `route()` API.

### Backend (separate repo, `blawby-backend`)

- R8. **`GET /api/preferences/{category}` returns `{}` (empty preferences) for users without a preferences row** — not 404. The "no preferences row" state is normal for new users. The contract change: return 200 with an empty object/category instead of throwing `HTTPException(404)`. Affects `getPreferences` and `getPreferencesByCategory` in [blawby-backend / src/modules/preferences/services/preferences.service.ts:55-103](../../../blawby-backend/src/modules/preferences/services/preferences.service.ts). Alternative implementation that achieves the same outcome: auto-create an empty preferences row in an `AuthUserSignedUp` event listener; the GET endpoints continue to return the (now-always-present) row. Either approach acceptable; primary route is the simpler "return empty for missing" change.
- R9. **`requireAuth.ts:37` drops the `?? primaryWorkspace` fallback.** `activeOrganizationId` is set to `activeOrgId ?? null`, not `activeOrgId ?? primaryWorkspace ?? null`. Downstream consumers already handle `null` correctly (they return 403/400). The current fallback silently substitutes a non-UUID string in place of a UUID, which is a latent type-violation. Affects [blawby-backend / src/shared/middleware/requireAuth.ts:37](../../../blawby-backend/src/shared/middleware/requireAuth.ts).

---

## Scope Boundaries

### In scope (cross-repo)

- Frontend refactor: discriminated-union routing state, replacing AppShell + RootRoute + post-Stripe gate effects (this repo).
- Backend contract fix: `GET /api/preferences/{category}` returns empty preferences for missing rows instead of 404 (backend repo).
- Backend code-defect fix: drop `?? primaryWorkspace` fallback at `requireAuth.ts:37` (backend repo).

### Out of scope (deferred or skipped)

- **The recovery hook (`useEnsureActiveOrganization`) is not replaced.** It still owns the `setActive` side effect when an authenticated user has `active_organization_id: null`. Its `isResolving` flag becomes a consumer input to `useAuthRouteIntent` rather than a flag that gating code reads directly. The hook's loading-by-default fix is part of this work because the new intent hook reads `isResolving`.
- **`PracticeAppRoute`'s `setActive` sync loop stays untouched** (per the brainstorm + PR #577 + PR #580 boundary). The intent hook only governs entry routing (AppShell + RootRoute). Once a user is on `/practice/<slug>`, the existing sync logic owns slug↔activeOrg coupling.
- **No router-library swap.** No `@tanstack/router`, no migration. preact-iso stays.
- **No magic-link wire-up.** Audit finding #3 (magic link half-built) is a separate product call, not in this plan.
- **No stale-test deletion.** Audit finding #11 (delete `tests/unit/middleware/auth.test.ts:38-58`) is a separate trivial PR; can land in parallel or before this work without coupling.
- **No new typed-module / lint-rule / convention-doc.** The prior discarded plan's structural prevention layer is not revived. The discriminated union itself encodes the pointer-vs-state distinction at the type level (within `RouteIntent`'s kinds), which is enough structural prevention for this domain.
- **No defensive code for theoretical issues.** No fix for the post-Stripe userId-null race, no fix for `/client/dashboard` flash, no per-call timeouts on Better Auth calls, no stale-active-org-pointer cleanup — all of these were verified theoretical during the audit pass and remain excluded.

### Deferred to Follow-Up Work

- **Backend one-session-per-user race** (audit #7). Separate PR to `blawby-backend` to wrap session create + prior-session delete in a transaction. Not addressed here because no observed reproduction of two-session-survives state.
- **Backend `sendDeleteAccountVerification` for OAuth users** (audit #6). Separate PR to `blawby-backend`, gated on reproduction with a Google-only test user.

---

## Context & Research

### Relevant code and patterns

- **Gate code to replace:**
  - AppShell gate effect: [src/index.tsx:281-395](../../src/index.tsx) (suppression at :287, `needsFirstSubscription` at :353-364, `navigate('/pricing')` at :381)
  - RootRoute gate effect: [src/index.tsx:692-715](../../src/index.tsx) (suppression at :694, `needsFirstSubscription` at :634-642, `navigate('/pricing')` at :706)
  - Post-Stripe effect: [src/index.tsx:659-690](../../src/index.tsx)
- **Recovery hook (consumed, not replaced):** [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) — current `isResolving` flag at :90 (`useState(false)`), auto-fire effect at :112-122
- **Loading-flag race source #1:** [src/shared/hooks/usePracticeManagement.ts:595-597](../../src/shared/hooks/usePracticeManagement.ts) — lazy `useState(() => ...)` that can evaluate `false` at first render even when an auto-fetch will fire
- **Loading-flag race source #2:** [src/shared/hooks/useEnsureActiveOrganization.ts:90](../../src/shared/hooks/useEnsureActiveOrganization.ts) — `useState(false)` initial value; flips to `true` only after the effect fires
- **Workspace resolver (consumed):** [src/shared/hooks/useWorkspaceResolver.ts:29-91](../../src/shared/hooks/useWorkspaceResolver.ts) — already derives `hasPracticeMembership`, `canAccessPracticeWorkspace`, `defaultWorkspace`. The new intent hook calls this.
- **Existing path resolver (consumed):** `resolveAuthenticatedHomePath` in [src/index.tsx:95-113](../../src/index.tsx) — already maps `{defaultWorkspace, fallbackSlug, hasPracticeMembership}` to a path string. Reusable.
- **Router primitive:** preact-iso `useLocation()` and `route(url, replace?)` from `'preact-iso'`. Used throughout `src/index.tsx`.

### Verified bug evidence

- Playwright cold sign-in 2/2 reproduction recorded in [docs/audits/2026-05-16-session-auth-surface-audit.md](../audits/2026-05-16-session-auth-surface-audit.md), section "Verified bug discovered during Playwright pass". 911ms `/pricing` flash; console log proves recovery hook hadn't run yet when the gate navigated.

### Convention doc

[docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) — pointer-vs-state distinction stays canonical; the discriminated union enforces it implicitly (kinds use semantic names like `practice-workspace` and `no-subscription` rather than raw pointer reads).

---

## Key Technical Decisions

- **`RouteIntent` is a discriminated union with a `kind` discriminator.** Each kind carries exactly the data its consumer needs (e.g., `practice-workspace` carries `slug`). No "is this a workspace?" booleans flying around. Type narrowing in TypeScript makes downstream consumption exhaustive and safe.
- **One owner, many consumers.** `useAuthRouteIntent()` is the sole producer. AppShell and RootRoute call it; both render the same component (`<AuthenticatedRouter>` or `<RouteIntentEffect>`, name TBD) that takes the intent and either renders the matched UI or returns a `<Redirect>`. No duplication.
- **Loading is explicit and first-class.** `kind: 'loading'` is returned whenever any required input is in-flight. The intent's "we don't know yet" state is named, not implied by a `null` or stale flag. Consumers either show `<LoadingScreen />` or wait — they don't redirect.
- **Pure transition logic, separately testable.** The kind-resolution logic lives in `src/shared/auth/routeIntent.ts` as a pure function `computeRouteIntent(inputs): RouteIntent`. The React hook `useAuthRouteIntent()` is a thin wrapper that gathers inputs from existing hooks and calls the pure function. Lets us table-test every kind transition without React.
- **Declarative redirect via a small `<Redirect>` component.** The component calls `route(target, true)` in a `useEffect` on mount, then returns `null`. One transition per intent, not many. This is still technically `useEffect`-driven navigation, but it's encapsulated and runs at most once per intent change — no race because the parent only renders `<Redirect>` when the intent is settled (loading is its own branch).
- **`useEnsureActiveOrganization` keeps its `isResolving` flag, but gets a loading-by-default initial state.** The lazy `useState` initializer evaluates the same eligibility predicate the auto-fire effect uses. On render #1, if the hook *will* fire `runRecovery`, `isResolving === true`. Closes the race at its source.
- **`usePracticeManagement` gets the same treatment.** The lazy initializer at lines 595-597 currently evaluates `false` in some edge cases (per the verified bug). Tighten it so it returns `true` whenever an auto-fetch will fire on mount. This is a one-line fix; required for the new intent hook to correctly report `kind: 'loading'` on render #1.
- **Post-Stripe handling becomes a kind, not a separate effect.** `?subscription=success` in the URL plus an in-flight recovery → `kind: 'post-stripe-syncing'`. The URL strip (`window.history.replaceState`) happens inside the post-Stripe handling component when the intent transitions out of that kind. The behavior is preserved; the structure is unified.
- **No new typed module, no new ESLint rule.** The discriminated union *is* the structural prevention. A future contributor adding a new "where should the user be?" kind has to extend `RouteIntent`, which is more discoverable than reading `session.session.active_organization_id` correctly.

---

## High-Level Technical Design

> *Directional grammar — not implementation specification.*

### Discriminated union

```ts
// src/shared/auth/routeIntent.ts

export type RouteIntent =
  | { kind: 'loading' }                                       // any input in-flight
  | { kind: 'unauthenticated'; redirectAfterAuth?: string }   // → /auth (with optional return)
  | { kind: 'onboarding-required'; userId: string }           // → /onboarding (or stay if already there)
  | { kind: 'no-subscription' }                               // → /pricing
  | { kind: 'post-stripe-syncing' }                           // ?subscription=success in URL; recovery is firing
  | { kind: 'practice-workspace'; slug: string }              // → /practice/<slug>
  | { kind: 'client-workspace' };                             // → /client/dashboard

export interface RouteIntentInputs {
  isSessionPending: boolean;
  user: { id: string; isAnonymous: boolean; onboardingComplete: boolean } | null;
  activeOrganizationId: string | null;
  isResolvingActiveOrg: boolean;
  practicesLoading: boolean;
  hasPracticeMembership: boolean;
  defaultWorkspace: 'public' | 'client' | 'practice' | null;
  currentPracticeSlug: string | null;
  fallbackPracticeSlug: string | null;
  isSubscriptionSuccessReturn: boolean;
  subscriptionSyncInFlight: boolean;
  // The current URL — used to decide if a redirect is actually needed
  currentPath: string;
  currentSearch: string;
}

export function computeRouteIntent(inputs: RouteIntentInputs): RouteIntent;
```

### Decision tree (computeRouteIntent, in priority order)

```text
1. If isSessionPending → 'loading'

2. If !user → 'unauthenticated' (with redirectAfterAuth = currentPath if not /auth)

3. If user.isAnonymous → (treat as authenticated anonymous; goes to default workspace) — same kinds as registered, but path resolution differs

4. If !user.onboardingComplete → 'onboarding-required' (unless already on /onboarding/*)

5. If isSubscriptionSuccessReturn AND subscriptionSyncInFlight → 'post-stripe-syncing'

6. If isResolvingActiveOrg OR practicesLoading → 'loading'
   (this is THE fix — these flags being true means we don't know yet; explicit loading kind)

7. If !hasPracticeMembership AND !activeOrganizationId → 'no-subscription'

8. If defaultWorkspace === 'client' OR !hasPracticeMembership → 'client-workspace'

9. Otherwise → 'practice-workspace' with slug = currentPracticeSlug ?? fallbackPracticeSlug
```

### Consumer pattern

```tsx
// Replaces the AppShell gate and RootRoute gate

function AuthenticatedRouter({ intent }: { intent: RouteIntent }) {
  switch (intent.kind) {
    case 'loading':
    case 'post-stripe-syncing':
      return <LoadingScreen />;

    case 'unauthenticated':
      return <Redirect to={'/auth' + (intent.redirectAfterAuth ? `?redirect=${encodeURIComponent(intent.redirectAfterAuth)}` : '')} />;

    case 'onboarding-required':
      return <Redirect to="/onboarding" />;

    case 'no-subscription':
      return <Redirect to="/pricing" />;

    case 'practice-workspace':
      return <Redirect to={`/practice/${intent.slug}`} />;
      // (Or: render the practice workspace directly if URL already matches)

    case 'client-workspace':
      return <Redirect to="/client/dashboard" />;
  }
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { route(to, true); }, [to]);
  return null;
}
```

The `<Redirect>` component runs `route(...)` once per `to` change — no flag-race window because the parent only mounts it when the intent is settled. `kind: 'loading'` renders `<LoadingScreen />` instead, no navigation at all.

---

## Implementation Units

### U1. Create the pure `routeIntent.ts` module

**Goal:** Encode the discriminated union and `computeRouteIntent` as a pure, React-free function. Testable with table-driven unit tests.

**Requirements:** R2, R3.

**Dependencies:** None.

**Files:**
- Create: `src/shared/auth/routeIntent.ts`
- Create: `src/shared/auth/__tests__/routeIntent.test.ts`

**Approach:**
- Export `RouteIntent` discriminated union and `RouteIntentInputs` interface (shapes per High-Level Technical Design).
- Export `computeRouteIntent(inputs: RouteIntentInputs): RouteIntent` as a pure function. No React, no hooks, no globals.
- Implement the decision tree exactly as documented above. Use early returns; one `kind` per branch.
- Add narrow JSDoc on each kind explaining when it fires.

**Patterns to follow:**
- Pure-function pattern from [src/shared/utils/money.ts](../../src/shared/utils/money.ts).
- Discriminated-union exhaustive switch — use a `never`-check helper to ensure all kinds are handled at consumer sites.

**Test scenarios** (table-driven, one assertion per row):
- Happy path: authenticated owner, recovery completed, practices loaded, has membership → `practice-workspace` with correct slug
- Happy path: authenticated client (no practice membership), default workspace = 'client' → `client-workspace`
- Cold sign-in: session resolved, user OK, recovery still resolving → `loading` (NOT `no-subscription`)
- Cold sign-in: session resolved, practices loading → `loading`
- Post-Stripe return: `?subscription=success` + sync in flight → `post-stripe-syncing`
- Post-Stripe return: `?subscription=success` + sync done → falls through to the right authenticated kind
- Logged out: no user → `unauthenticated`, with redirectAfterAuth captured
- Anonymous user → onboarding-required or workspace, per `onboardingComplete`
- Onboarding incomplete → `onboarding-required`
- No memberships AND no active org → `no-subscription`
- No memberships BUT active_organization_id is set (belt-and-braces case from the convention doc) → workspace, not /pricing
- Session pending → `loading` regardless of all other inputs
- Loading kinds DO NOT downgrade to `no-subscription` even if `hasPracticeMembership === false` (the bug we're fixing)

**Verification:** All test scenarios pass. `npm run typecheck` passes. A new "kind" added to the union without updating the consumer's switch is caught by TypeScript (verified via `// @ts-expect-error` test).

---

### U2. Fix loading-by-default in `usePracticeManagement` and `useEnsureActiveOrganization`

**Goal:** Eliminate the verified flag race at its source. Both hooks must report `loading: true` on render #1 when they will fetch / fire on mount.

**Requirements:** R1, R3.

**Dependencies:** None (independent of U1; both can land in parallel).

**Files:**
- Modify: [src/shared/hooks/useEnsureActiveOrganization.ts:90](../../src/shared/hooks/useEnsureActiveOrganization.ts) — `isResolving` initial state
- Modify: [src/shared/hooks/usePracticeManagement.ts:595-597](../../src/shared/hooks/usePracticeManagement.ts) — `isLoading` lazy initializer
- Modify: existing tests for both hooks under `tests/unit/shared/hooks/` to assert correct initial state

**Approach:**

For `useEnsureActiveOrganization.ts`:
- Change `const [isResolving, setIsResolving] = useState(false);` to a lazy initializer that evaluates the SAME eligibility predicate as the auto-fire effect at lines 112-122. Pseudocode:

  ```ts
  const [isResolving, setIsResolving] = useState(() => {
    // Same conditions the auto-fire effect uses
    const eligible = Boolean(!isPending && userId && !isAnonymous && onboardingComplete && !activeOrgId);
    if (!eligible) return false;
    if (resolvedForUserIds.has(userId)) return false;
    if (isSubscriptionSuccessReturn()) return false;
    return true;
  });
  ```

  The auto-fire effect then keeps the existing `setIsResolving(true)` call (idempotent — already true), and the `finally` still calls `setIsResolving(false)` on completion.

For `usePracticeManagement.ts:595-597`:
- The current lazy initializer:
  ```ts
  const [isLoading, setIsLoading] = useState(() => isGloballyFetching || Boolean(
    autoFetchPractices && !sessionLoading && sessionUserId && !isAnonymous && !practicesLoaded && !practicesFetchForbidden
  ));
  ```
  The race comes from evaluating `false` when, say, `sessionUserId` is still undefined at first render even though it's about to become defined. Tighten: report `loading: true` whenever the hook will eventually fetch, including the brief window where the inputs are settling.
- Concretely: if `autoFetchPractices && !isAnonymous && !practicesLoaded && !practicesFetchForbidden`, treat the hook as loading even if `sessionLoading === true` or `sessionUserId` is pending. The fetch will fire as soon as session resolves, so reporting `loading: true` is correct.

**Patterns to follow:**
- Existing lazy `useState` initializer pattern in the same file.

**Test scenarios:**
- For `useEnsureActiveOrganization`:
  - Render hook with eligible session → assert `isResolving === true` from render #1 (before any effects run)
  - Render hook with ineligible session (anonymous, onboarding incomplete, etc.) → assert `isResolving === false` from render #1
  - Render hook with already-resolved memo → assert `isResolving === false` from render #1
  - Existing 13 tests still pass (regression guard)
- For `usePracticeManagement`:
  - Render hook with `autoFetchPractices: true` and session userId NOT YET available → assert `isLoading === true` from render #1
  - Render hook with `autoFetchPractices: false` → assert `isLoading === false`
  - Existing tests still pass

**Verification:** Hook tests pass. Manual cold sign-in via Playwright reproduces the OLD `/pricing` flash WITHOUT this fix, and does NOT reproduce it WITH this fix. (This is the canary verification — once U2 lands, U5/U6 reaches the same outcome via the discriminated-union path.)

---

### U3. Create `useAuthRouteIntent()` hook

**Goal:** React hook that gathers inputs from existing hooks (session, recovery, practice management, URL) and returns a `RouteIntent` by calling `computeRouteIntent`.

**Requirements:** R2, R3, R5.

**Dependencies:** U1 (`computeRouteIntent` exists), U2 (loading flags initialize correctly).

**Files:**
- Create: `src/shared/hooks/useAuthRouteIntent.ts`
- Create: `tests/unit/shared/hooks/useAuthRouteIntent.test.tsx`

**Approach:**
- Hook reads from existing primitives:
  - `useSessionContext()` → `session`, `isPending`
  - `useEnsureActiveOrganization()` → `isResolving`, `forceResolve`
  - `useWorkspaceResolver({ autoFetchPractices: true })` → `practicesLoading`, `hasPracticeMembership`, `defaultWorkspace`, `currentPractice`, `practices`
  - `useLocation()` from preact-iso → `path`, `query`
- Derives `activeOrganizationId` ONCE — this becomes the single read site. Remove the other 5 readers in U4/U5.
- Tracks `subscriptionSyncInFlight` locally via the same pattern the current post-Stripe effect uses (`subscriptionSyncHandledRef` + `setSubscriptionSyncPending`). This logic moves *into* the hook so it's a hook-private state, not RootRoute-private.
- Calls `computeRouteIntent({ ...gathered inputs }) ` and returns the resulting `RouteIntent`.

**Patterns to follow:**
- Existing `useWorkspaceResolver` composition pattern.
- Memo-stable references for the inputs object (avoid re-computing on every render).

**Test scenarios:**
- Mock the underlying hooks via `vi.mock` per the established pattern in [src/shared/hooks/__tests__/usePracticeManagement.test.ts](../../src/shared/hooks/__tests__/usePracticeManagement.test.ts).
- Render the hook in various session states; assert the returned `kind` matches expected.
- Specifically test the cold-sign-in scenario: session present, recovery `isResolving: true`, practices `practicesLoading: true` → `kind: 'loading'` (NOT `no-subscription`).
- Test the post-stripe round-trip: `?subscription=success` in URL → `kind: 'post-stripe-syncing'` initially, then transitions to authenticated kind once sync flag clears.

**Verification:** Hook returns expected kinds for all scenarios. `npm run typecheck` passes.

---

### U4. Replace AppShell gate with `<AuthenticatedRouter>` consuming the intent

**Goal:** Delete the AppShell gate effect's `needsFirstSubscription`/`needsClientRedirect`/etc. logic. AppShell renders `<AuthenticatedRouter intent={useAuthRouteIntent()} />` for the gate decision; otherwise renders its children as before.

**Requirements:** R1, R2, R4, R5.

**Dependencies:** U1, U2, U3.

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) — AppShell component (lines ~219-395)
- Create: `src/shared/auth/AuthenticatedRouter.tsx` — the small consumer component (switch on `RouteIntent.kind`, return matched UI or `<Redirect>`)
- Create: `src/shared/auth/Redirect.tsx` — one-shot redirect component
- Test: `tests/unit/shared/auth/AuthenticatedRouter.test.tsx`

**Approach:**
- Delete from AppShell:
  - The `activeOrganizationId` derivation at lines 232-236 (raw read of `session.session.active_organization_id`)
  - The `needsFirstSubscription` build at lines 353-364
  - The `authenticatedHomePath` memo at lines 272-279 (replaced by the intent's kind data)
  - The gate effect at lines 281-395 — replaced by `<AuthenticatedRouter intent={intent} />` in the JSX
- Keep:
  - Anything related to the actual app shell UI (sidebars, layout, providers)
  - The `useEnsureActiveOrganization()` call — still needed as the side-effect that fires `setActive`. The new hook reads its `isResolving`.
- Add `<AuthenticatedRouter>` at the appropriate point in the JSX tree. When `intent.kind === 'loading' | 'post-stripe-syncing'`, render `<LoadingScreen />`. When it's a redirect kind, render `<Redirect to={...} />`. When it's a workspace kind that matches the current path, render the children.

**Patterns to follow:**
- Existing JSX structure of AppShell.
- The `<Redirect>` component is small (a `useEffect` that calls `route(to, true)`).

**Test scenarios:**
- `<AuthenticatedRouter intent={{ kind: 'loading' }}>` renders `<LoadingScreen />`, does NOT call `route`.
- `<AuthenticatedRouter intent={{ kind: 'unauthenticated' }}>` calls `route('/auth', true)` once.
- Same for each redirect kind.
- If the same intent is passed across re-renders, `route` is NOT called repeatedly (use a ref or compare intent kinds).
- When the current path already matches the intent (e.g., user is on `/pricing` and intent is `no-subscription`), no redundant `route` call is fired.

**Verification:** AppShell renders correctly for all `RouteIntent` kinds. No raw `session.session.active_organization_id` read remains in AppShell after this unit. `npm run typecheck` passes.

---

### U5. Replace RootRoute gate with `<AuthenticatedRouter>` and consolidate post-Stripe handling

**Goal:** Delete the RootRoute gate effects (lines 692-715), the duplicated `needsFirstSubscription` (lines 634-642), and the standalone post-Stripe effect (lines 659-690). RootRoute renders `<AuthenticatedRouter intent={useAuthRouteIntent()} />` — same pattern as AppShell.

**Requirements:** R1, R2, R4, R5.

**Dependencies:** U1, U2, U3, U4 (`<AuthenticatedRouter>` exists from U4).

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) — RootRoute component (lines ~601-746)

**Approach:**
- Delete from RootRoute:
  - The `rootSessionRecord` / `activeOrganizationId` derivation at lines 610-614
  - The `needsFirstSubscription` build at lines 634-642
  - The `authenticatedHomePath` memo at lines 643-651
  - The post-Stripe effect at lines 659-690 (logic moves into `useAuthRouteIntent`)
  - The gate effect at lines 692-746 (replaced by `<AuthenticatedRouter>` JSX)
- Keep:
  - Anything outside the gate logic (TBD on inspection — there may not be much; RootRoute is mostly the gate)
- The post-Stripe URL-strip (`window.history.replaceState`) moves into `useAuthRouteIntent` — it fires when the hook detects the sync has completed.

**Patterns to follow:**
- Same `<AuthenticatedRouter>` consumer pattern as U4.

**Test scenarios:**
- The verified `/pricing` flash bug does NOT occur post-refactor. Playwright cold-login flow: navigation history must NOT include `/pricing` for a practice-owner with valid memberships. The final URL must be `/practice/<slug>`.
- Logged-out user navigating to `/` → redirected to `/auth`.
- Onboarding-incomplete user navigating to `/` → redirected to `/onboarding`.
- Post-Stripe return: URL strips `?subscription=success`, user lands at workspace home.

**Verification:** RootRoute renders correctly for all `RouteIntent` kinds. Existing E2E spec at [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) passes. The verified `/pricing` flash is gone (Playwright re-verification per U7).

---

### U6. Migrate remaining `session.session.active_organization_id` readers (R5)

**Goal:** After U4 + U5 eliminate the AppShell + RootRoute + recovery-hook readers, three more remain: `PracticeAppRoute` (line 808-810), `SessionContext` (lines 33-39), and `usePracticeManagement` (lines 590-594). Consolidate to read from the intent hook's input computation OR a single inline helper.

**Requirements:** R5.

**Dependencies:** U1.

**Files:**
- Modify: [src/index.tsx:808-810](../../src/index.tsx) — `PracticeAppRoute` reader. Replace with a small inline helper or use the intent (but `PracticeAppRoute` is downstream of the gate; using the intent is overkill — a small inline `getActiveOrganizationPointer(session)` helper from `routeIntent.ts` is cleaner).
- Modify: [src/shared/contexts/SessionContext.tsx:33-39](../../src/shared/contexts/SessionContext.tsx) — replace with the same inline helper.
- Modify: [src/shared/hooks/usePracticeManagement.ts:590-594](../../src/shared/hooks/usePracticeManagement.ts) — replace with the same inline helper.
- Export the helper from `routeIntent.ts` (a small named function `getActiveOrganizationPointer(session)` — pure, single-line trim+check).

**Approach:**
- The helper is one function, defined and exported from `routeIntent.ts` since it's the only file that should read the raw field. All five readers (the new intent hook + the three above + any others discovered during the refactor) call this helper.
- The helper signature: `getActiveOrganizationPointer(session: { session?: Record<string, unknown> } | null | undefined): string | null` with trim check.

**Patterns to follow:**
- Existing trim-check semantics from the 4 of 5 readers that have them.

**Test scenarios:**
- Unit-test the helper exhaustively (null, undefined, empty string, whitespace-only, valid string).
- `PracticeAppRoute`'s `setActive` sync still triggers correctly when URL slug ≠ session active-org.
- `SessionContext.activePracticeId` returns the trimmed value or null.

**Verification:** No raw `session.session.active_organization_id` reads remain in `src/**` outside `routeIntent.ts`, `src/shared/lib/authClient.ts` (canonical normalization), and `src/shared/types/user.ts` (type declaration only). Verified by grep.

---

### U7. Playwright verification + E2E spec correction

**Goal:** Re-verify the `/pricing` flash bug is closed using the same Playwright methodology that confirmed it. Update the E2E spec at `tests/e2e/pricing-gate-membership.spec.ts` so it catches a regression of this bug going forward.

**Requirements:** R1.

**Dependencies:** U1-U6.

**Files:**
- Modify: [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts)

**Approach:**
- The existing test uses `page.on('framenavigated', ...)` which **may not fire for `history.replaceState` transitions** (the audit flagged this; the verified flash used `replaceState`). Replace or supplement with a direct `replaceState` interceptor pattern:

  ```js
  await page.addInitScript(() => {
    window.__navHistory = [];
    const orig = history.replaceState.bind(history);
    history.replaceState = (...args) => { window.__navHistory.push(args[2]); return orig(...args); };
    // Same for pushState
  });
  ```

  After cold sign-in, evaluate `window.__navHistory` and assert no entry contains `/pricing`.

- Add a second scenario: `?subscription=success` round-trip with a session in steady state lands at workspace home without flashing `/pricing` or `/client/dashboard`.

- Run the test against the post-refactor staging branch; confirm it passes.

**Test scenarios:**
- Owner cold-login → no `/pricing` in `__navHistory`, no `/client/dashboard` in `__navHistory`, final URL is `/practice/<slug>`. (Direct port of the verification flow that confirmed the bug.)
- Owner returning from `?subscription=success` → same outcome.
- Client cold-login → lands at `/client/dashboard`, no `/pricing` flash.

**Verification:** `npm run test:e2e -- pricing-gate-membership` passes against post-refactor staging. Manual Playwright run reproduces no flash.

---

### U8. Remove obsolete duplicated code + update convention doc

**Goal:** Tidy up. Remove anything left over from the old gate pattern that's no longer referenced. Update the convention doc to describe the new pattern.

**Requirements:** R5.

**Dependencies:** U1-U7.

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) — remove `resolveAuthenticatedHomePath` if no longer used (subsumed by `computeRouteIntent`), or keep if it has consumers outside AppShell/RootRoute.
- Modify: [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) — add a "Routing intent" subsection pointing at `routeIntent.ts` as the canonical "where should this user be?" computation. Note that all gating happens via the discriminated union, not via direct flag reads.
- Consider adding a small new doc: `docs/solutions/conventions/route-intent-discriminated-union-2026-05-16.md` — pattern reference for future contributors.

**Approach:**
- After U4/U5, `resolveAuthenticatedHomePath` may have zero consumers. Check via grep; if zero, remove.
- The convention doc update should be brief: 3-5 paragraphs describing the new pattern, when to use it, and that the loading/redirect/workspace decisions live in `RouteIntent`'s kinds.

**Test scenarios:**
- Test expectation: none — cleanup unit.

**Verification:** `npm run typecheck` passes. `npm run lint` passes. Grep confirms no dead references to removed names.

---

### U9. ⚠ Backend repo: `/api/preferences/{category}` returns empty preferences for users without a row

**Goal:** Fix the backend contract bug that causes [src/features/settings/pages/AccountPage.tsx](../../src/features/settings/pages/AccountPage.tsx) to infinite-render-loop (260+ console errors in 2 seconds) for new users. The backend must treat "no preferences row" as a valid empty state, not an error.

**Repo:** `blawby-backend` — this unit lands in a separate PR there.

**Requirements:** R8.

**Dependencies:** None.

**Files** (in `blawby-backend`):
- Modify: `src/modules/preferences/services/preferences.service.ts:55-103` — `getPreferences` (line 55-74) and `getPreferencesByCategory` (line 76-103). Both throw `HTTPException(404, { message: 'Preference not found' })` when the user has no row. Change to return empty shapes:
  - `getPreferences`: return `{ user_id: ctx.userId, general: {}, notifications: applyNotificationDefaults({}), security: {}, account: {}, onboarding: applyOnboardingDefaults({}), profile: {} }` (or whatever the minimum schema-valid empty `Preferences` shape is).
  - `getPreferencesByCategory`: return `{}` (an empty `Record<string, unknown>`).
- Modify: tests in `blawby-backend/test/modules/preferences/` — flip the "no row → 404" assertions to "no row → empty response".

**Approach:**
- This is a contract-direction change. Re-read the route docs / OpenAPI spec; update if the 404 case was documented (it shouldn't be, since "missing preferences" is a valid empty state for new users).
- Frontend code in this repo's `src/features/settings/pages/AccountPage.tsx:157-189` already handles `prefs?.custom_domains` and `prefs?.receive_feedback_emails` with `?.` and `??` operators. With the backend now returning `{}` instead of throwing, the existing frontend code works without modification — the render-loop bug closes for free.
- Alternative implementation (slightly more work, but more consistent): add an `AuthUserSignedUp` listener in `blawby-backend / src/modules/auth/listeners.ts` (or a `UserCreated` listener) that creates an empty preferences row when a new user is created. The GET endpoints continue to error on missing rows, but missing rows no longer occur. Choose this if other backend code relies on "row exists" as an invariant.

**Patterns to follow** (in `blawby-backend`):
- Backend service-layer convention from `blawby-backend / CLAUDE.md` — throw `HTTPException` for genuine errors, return data otherwise.
- Default-application pattern already in use at `preferences.service.ts:71-72` (`applyNotificationDefaults`, `applyOnboardingDefaults`) — extend to all category accessors.

**Test scenarios** (in `blawby-backend`):
- New user (no preferences row) → `GET /api/preferences` returns 200 with empty/default category shapes, NOT 404.
- New user → `GET /api/preferences/account` returns 200 with `{}`, NOT 404.
- New user → `GET /api/preferences/notifications` returns 200 with default notification preferences.
- User WITH preferences row → existing happy-path tests pass unchanged.
- A subsequent `PUT /api/preferences/account` with a value succeeds and a follow-up GET returns the saved value.

**Verification (cross-repo):** After both this unit AND U1-U8 land:
- Sign in as a fresh user (or `demo.owner.local` after their preferences row is dropped from the DB) → navigate to `/practice/{slug}/settings/account` → page renders cleanly with zero console errors. Account deletion button is clickable. Profile fields render from session data (no preferences-dependent fields show stale or undefined values).

---

### U10. ⚠ Backend repo: drop `?? primaryWorkspace` fallback at `requireAuth.ts:37`

**Goal:** Close the latent type-violation in the auth middleware (audit finding #14). `activeOrganizationId` must be either a real org UUID or `null` — never the string literal `'practice'` / `'client'` / `'public'`.

**Repo:** `blawby-backend` — this unit lands in a separate PR there.

**Requirements:** R9.

**Dependencies:** None.

**Files** (in `blawby-backend`):
- Modify: `src/shared/middleware/requireAuth.ts:37` — change:
  ```ts
  c.set('activeOrganizationId', activeOrgId ?? primaryWorkspace ?? null);
  ```
  to:
  ```ts
  c.set('activeOrganizationId', activeOrgId ?? null);
  ```
- Modify any tests that assert the `primaryWorkspace` fallback (likely none — the fallback was a silent code-path, not a documented behavior).

**Approach:**
- Search for downstream consumers of `c.get('activeOrganizationId')` and confirm they handle `null` correctly. Verified during audit: `requireOrgMembership.ts:36`, `inject-ability.ts:19`, `engagement-contracts/handlers.ts:7-60`, `service-context.ts:28` — all already handle null and surface proper 403/400 responses.
- Playwright verification during the audit pass confirmed: for the demo owner with `primaryWorkspace: null`, this fallback was already returning `null` (defect dormant). For users with `primaryWorkspace: 'practice'`, this fix prevents the literal string from being passed downstream as if it were a UUID.

**Patterns to follow** (in `blawby-backend`):
- Existing null-handling convention in `requireOrgMembership.ts:36` (returns 403 "No organization context found" on null).

**Test scenarios** (in `blawby-backend`):
- User with `activeOrgId: null` and `primaryWorkspace: 'practice'` → `c.get('activeOrganizationId')` returns `null`, downstream call to `requireOrgMembership` 403s with "No organization context found".
- User with `activeOrgId: 'real-uuid'` and `primaryWorkspace: 'practice'` → `c.get('activeOrganizationId')` returns `'real-uuid'`, downstream queries succeed.
- User with `activeOrgId: null` and `primaryWorkspace: null` → unchanged behavior (still returns null).

**Verification (cross-repo):** After this unit AND U1-U8 land:
- Playwright test that signs in via fetch, immediately calls `/api/practice/list` before recovery fires setActive → response is 403 "No organization context found" with `activeOrganizationId` field in error context explicitly `null` (not `'practice'`).
- No frontend behavior change expected for users whose recovery hook fires normally — the flow continues to be: sign in → recovery sets active org → subsequent calls succeed.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **The `<Redirect>` component still uses `useEffect` to call `route()`, so technically still has the same race?** | No — the race in the current code is between flag updates (which lag by one render) and the gate effect (which reads stale flags). The new pattern eliminates flag races by making `loading` a kind: the parent only renders `<Redirect>` when the intent is settled. `<Redirect>` then runs its single `route()` call once, deterministically. There's no "wait for flags to flip" window. |
| **`computeRouteIntent` is pure but reads many inputs — risk of incorrect decision tree.** | Table-driven unit tests cover every kind transition. TypeScript exhaustive switch in `<AuthenticatedRouter>` ensures no kind is missed at the consumer. |
| **The loading-by-default fix in U2 might over-report loading and cause UI flicker on legitimately-loaded states.** | The lazy initializer only returns `true` when the hook *will* fire — if the hook will not fetch (anonymous, already resolved, ineligible), it returns `false`. Unit tests for each branch lock this down. Manual verification: a returning logged-in user with everything cached should NOT see a loading screen. |
| **Post-Stripe URL-strip moving into the hook could break the existing pattern.** | The URL-strip happens on intent transition out of `post-stripe-syncing`, not on an effect dep change. Behavior is preserved; structure is unified. Tested with a scenario in U3's test suite. |
| **The `<Redirect>` component could navigate before subsequent renders settle, causing a "double redirect" if `to` changes rapidly.** | Memoize `to` and use a ref to track the last-fired target; skip if unchanged. Documented in U4's test scenarios. |
| **Existing pricing-gate E2E test may not catch the flash today (replaceState vs framenavigated).** | U7 explicitly addresses this — install a `replaceState` interceptor in the spec's init script and assert against the recorded history. |
| **The recovery hook (`useEnsureActiveOrganization`) still fires `setActive` as a side effect, which couples the routing intent to a backend write.** | This coupling exists today; not made worse by this refactor. The recovery is the documented Better Auth flow (`databaseHooks.ts:78-84`). If we ever want to decouple, that's a backend change out of this plan's scope. |
| **`src/index.tsx` is high-traffic; merge conflicts likely.** | Land as a single PR; deletions in AppShell + RootRoute + creation of `<AuthenticatedRouter>` are tightly coupled and shouldn't split. Run typecheck + tests at each unit's end as a safety net. |

---

## System-Wide Impact

- **Interaction graph:** AppShell and RootRoute lose their gate effects; both gain `<AuthenticatedRouter intent={...}>`. The recovery hook becomes a side-effect-only producer (still fires `setActive`, but its `isResolving` is read by the new intent hook, not by gate code). Post-Stripe handling consolidates into the new hook. The AccountPage's preferences fetch no longer infinite-loops because the backend stops returning 404 for empty states.
- **Error propagation:** Frontend recovery hook's per-call error handling (post-PR #580) stays in place. Backend `getPreferences` error path narrows — only genuine failures (DB error, CASL denial) throw; "no row exists" returns empty data. Other backend error contracts unchanged.
- **State lifecycle risks:** The post-Stripe `subscriptionSyncHandledRef` moves from RootRoute-private into the new hook's internal state. Verify cleanup on hook unmount.
- **API surface parity:** Frontend: no public API changes; new hook is purely additive. Backend: `GET /api/preferences` and `GET /api/preferences/{category}` change from "may 404" to "always 200 with possibly-empty body" — this is a contract widening (clients that previously caught the 404 still work; clients that previously errored now see empty data). The `requireAuth.ts:37` change is internal middleware behavior with no external API surface.
- **Integration coverage:** The Playwright E2E in U7 is the load-bearing test that the `/pricing` flash is closed. The cross-repo verification at the end of U9 is the load-bearing test that the AccountPage render-loop is closed. Unit tests cover the pure computation; component tests cover the Redirect/Loading rendering.
- **Unchanged invariants:** PR #577's gate-signal swap (`hasPracticeMembership`, not `active_organization_id`) stays correct — the intent's decision tree uses both fields per the convention doc. PR #580's memoization-on-success-only stays in place. Better Auth's documented "client calls setActive after sign-in" contract stays canonical. `databaseHooks.ts:78-84` invariant (no auto-fill of `active_organization_id`) unchanged.

---

## Documentation / Operational Notes

- **Convention doc** (existing) updated in U8.
- **New pattern doc** (optional) added in U8 if the team wants a standalone reference for future contributors.
- **Observability:** The existing `[Workspace] auto-activated first practice (no active_organization_id on session)` log at [src/shared/hooks/useEnsureActiveOrganization.ts:76](../../src/shared/hooks/useEnsureActiveOrganization.ts) is unchanged. After this refactor, it should still fire exactly once per cold-login session per user. If post-deploy telemetry shows a change in volume, that's signal.
- **Rollout:** Single PR. Single-commit revert if needed. No feature flag.
- **Re-verification post-merge:** Run the same Playwright cold-login flow that confirmed the bug; confirm zero `/pricing` in `__navHistory`. Update the audit document's "Verified bug" section to mark it closed.

---

## Sources & References

- **Audit:** [docs/audits/2026-05-16-session-auth-surface-audit.md](../audits/2026-05-16-session-auth-surface-audit.md)
- **Bug repros:** Audit's "Verified bug discovered during Playwright pass" section (`/pricing` flash); audit's Triage table rows #6 and #14 (backend findings); session-history task #15 (preferences-404 finding) and task #16 (direct-URL flash reproduction)
- **Convention doc:** [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md)
- **Predecessor PRs:**
  - [Blawby/blawby-ai-chatbot#577](https://github.com/Blawby/blawby-ai-chatbot/pull/577) — original /pricing redirect fix
  - [Blawby/blawby-ai-chatbot#580](https://github.com/Blawby/blawby-ai-chatbot/pull/580) — memoization-of-failure fix (P0 #1 closed)
- **Discarded plan (anti-pattern reference):** [docs/plans/2026-05-16-001-fix-active-org-recovery-hardening-plan.md](2026-05-16-001-fix-active-org-recovery-hardening-plan.md) — superseded; documents what NOT to do (defensive code for theoretical failures)
- **Key source files (frontend):**
  - Gates to replace: [src/index.tsx](../../src/index.tsx) (AppShell ~219-395, RootRoute ~601-746)
  - Recovery hook: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts)
  - Practice management: [src/shared/hooks/usePracticeManagement.ts](../../src/shared/hooks/usePracticeManagement.ts)
  - Workspace resolver: [src/shared/hooks/useWorkspaceResolver.ts](../../src/shared/hooks/useWorkspaceResolver.ts)
  - Session context: [src/shared/contexts/SessionContext.tsx](../../src/shared/contexts/SessionContext.tsx)
  - Account page (renders broken without U9): [src/features/settings/pages/AccountPage.tsx](../../src/features/settings/pages/AccountPage.tsx)
  - Existing E2E: [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts)
- **Key source files (backend, in `blawby-backend` repo):**
  - Preferences contract bug (U9): `src/modules/preferences/services/preferences.service.ts:55-103`
  - Middleware UUID-fallback defect (U10): `src/shared/middleware/requireAuth.ts:37`

---

## Execution sequencing (cross-repo)

This plan spans two repos. Frontend units (U1-U8) and backend units (U9, U10) are independent — they can land in any order. Recommended sequencing:

| Order | Unit(s) | Repo | Why this order |
|---|---|---|---|
| **1** | U9 (preferences 404 → empty) | `blawby-backend` | One-file backend PR; lowest risk; unblocks reachability of the AccountPage for new users immediately. Land first so frontend testing isn't blocked. |
| **2** | U10 (drop primaryWorkspace fallback) | `blawby-backend` | One-line backend PR. Land alongside or right after U9. |
| **3** | U1-U2 (pure routeIntent + loading-by-default) | `blawby-ai-chatbot` | Foundation; isolated changes, no UI behavior change yet (loading-by-default fix already closes the /pricing flash on its own — verify with Playwright at end of U2). |
| **4** | U3-U5 (hook + AppShell + RootRoute consumers) | `blawby-ai-chatbot` | Bulk of the route-intent refactor; single PR, single revert path. |
| **5** | U6-U8 (reader migration, E2E hardening, cleanup) | `blawby-ai-chatbot` | Polish; can ship with U3-U5 or as a follow-up PR. |

After U1-U2 alone, the `/pricing` flash bug is closed (because the loading-by-default fix means the existing gate's `if (... || practicesLoading) return` suppression now sees the correct `true` value on render #1). U3-U8 add the architectural cleanup on top.

**Optional split:** if you want to ship the user-visible bug fix fast, U1+U2 alone is a small frontend PR that closes the verified flash. U3-U8 is then a second larger PR for the gate refactor. U9 and U10 are independent backend PRs that can ship at any time.
