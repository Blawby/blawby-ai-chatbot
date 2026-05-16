---
title: "Better Auth `active_organization_id` is a session pointer, not a subscription signal"
date: 2026-05-15
category: conventions
module: auth
problem_type: convention
component: authentication
severity: high
applies_when:
  - Building routing gates that decide whether a user is "subscribed" or has "no workspace yet"
  - Reading `session.session.active_organization_id` to drive UI decisions
  - Designing recovery for cold-login or post-checkout flows where the session may be valid but no org is yet active
  - Wiring data fetches that depend on org-scoped backend endpoints (the worker `/api/practice/*` routes that 403 when no active org is set)
related_components: ["payments", "development_workflow"]
tags: ["better-auth", "organization-plugin", "session", "active-organization-id", "pricing-gate", "multi-tenant", "recovery-hook"]
---

# Better Auth `active_organization_id` is a session pointer, not a subscription signal

## Context

Production regression May 2026: paying customers were hard-redirected to `/pricing` on cold login. Root cause — two frontend routing gates ([src/index.tsx](src/index.tsx) AppShell and RootRoute, plus a matching data-fetch guard in [src/shared/hooks/usePracticeManagement.ts](src/shared/hooks/usePracticeManagement.ts)) read `session.session.active_organization_id` as "is this user subscribed?". It is not that signal. Multiple legitimate states leave it `null` for a user who owns or belongs to one or more orgs.

Live-reproduced with [docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md](docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md) and fixed in [PR #577](https://github.com/Blawby/blawby-ai-chatbot/pull/577). Plan: [docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md](docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md).

## Guidance

Treat `session.session.active_organization_id` as **the currently-selected org pointer for this session**, set by `authClient.organization.setActive({ organizationId })` (or via the `active_organization_id` cookie). It is `null` whenever no one has called `setActive` for the current session, which is independent of whether the user has any practice memberships.

**Legitimate `null` states observed in production:**

- Fresh login on a clean browser (Better Auth sets the session row before any `setActive` call).
- Cookie rotation between deploys.
- Multi-org user where none has been marked active.
- Post-Stripe-checkout webhook race: the org is created server-side after the session is established, so the cookie/session row was minted with no active org.
- Returning subscriber whose org cookie expired or was never persisted.

**The right signal for "is this user subscribed?":**

```
hasPracticeMembership = practices.length > 0
```

…derived from a list of memberships, not from the active-org pointer. In this codebase, `useWorkspaceResolver` exposes `hasPracticeMembership` directly. As belt-and-braces against transient practice-list staleness, also accept a non-null `active_organization_id` as proof of membership — Better Auth only sets it after a member-link exists, so if it's populated, the user demonstrably has at least one org.

```
needsFirstSubscription = completedOnboarding
                         AND !hasPracticeMembership
                         AND !active_organization_id
                         AND !isPricingRoute
                         AND !isSubscriptionSuccessReturn
```

**When the session is in the `null active_organization_id` state but the user has memberships, recovery is required**, not a redirect. The recovery shape:

1. List the user's memberships via Better Auth's direct endpoint: `authClient.organization.list()`. **Do not** use the worker's `/api/practice/list` — that endpoint requires an active-org context and 403s from the null state, which defeats the recovery.
2. If the list is non-empty, activate the first: `authClient.organization.setActive({ organizationId })`. Again — Better Auth's direct endpoint, not the worker's `/api/practice/{id}/active` route (same chicken-and-egg).
3. Refresh the session via `getSession()` and dispatch `auth:session-updated` so consumers re-render with the new active org populated.
4. Memoize the recovery per `userId` so it runs at most once per session; reset the memo on `auth:session-cleared`.

This is implemented in [src/shared/hooks/useEnsureActiveOrganization.ts](src/shared/hooks/useEnsureActiveOrganization.ts).

## Why This Matters

The signal-vs-pointer confusion is a class of bug, not a one-off. The same mistake can be made by:

- Any code reading `active_organization_id` to decide UI affordances ("hide nav while not subscribed", "show upgrade banner", "block creating a matter").
- Any backend endpoint that gates membership-checks on the *session-active org* instead of the *org being acted upon*.
- Any analytics or feature-flag code that treats `null active_organization_id` as "user has no plan".

Each of those, if shipped, recreates the same hard-redirect or wrong-UI failure mode under the legitimate `null` states above. The convention to internalize:

- **For "does this user have a workspace?"** → check membership presence (`organization.list()` or a cached `practices` array).
- **For "which workspace is the user currently looking at?"** → read `active_organization_id`.
- **Never conflate the two.**

A secondary trap: the worker's `/api/practice/*` proxy routes themselves require an active-org context (they are middleware-gated on `practiceId` in the URL or active-org in the session). They are NOT a reliable substitute for Better Auth's direct endpoints when bootstrapping from a null state — the brainstorm and original plan for this fix initially chose them and had to be swapped mid-implementation when the live repro returned 403.

## When to Apply

- Reviewing any new routing gate, redirect, or UI affordance that reads from `session.session`.
- Writing a recovery hook or post-checkout effect that needs to ensure an active org is set.
- Wiring data fetches that 403 without active-org context — verify the caller has the right membership *before* it tries to fetch.
- Auditing existing code for "treats `active_organization_id` as a subscription bool" anti-pattern.

## Examples

**Bad — treats pointer as state:**

```ts
// Pre-fix src/index.tsx (RootRoute) — wrong signal:
const needsFirstSubscription = Boolean(
  completedOnboarding &&
  !activeOrganizationId &&            // ← pointer mistaken for state
  !isSubscriptionSuccessReturn
);

if (needsFirstSubscription) {
  navigate('/pricing', true);          // ← paying users redirected here
}
```

**Good — membership presence as state, pointer as belt-and-braces:**

```ts
// Post-fix src/index.tsx — practice-membership is the signal:
const needsFirstSubscription = Boolean(
  completedOnboarding &&
  !hasPracticeMembership &&            // ← derived from listed memberships
  !activeOrganizationId &&             // ← belt-and-braces against fetch staleness
  !isSubscriptionSuccessReturn
);
```

**Bad — recovery via worker endpoints that themselves require active-org:**

```ts
// Doesn't work: both endpoints 403 from the null state we're recovering from
const practices = await listPractices();              // GET /api/practice/list → 403
await setActivePractice(practices[0].id);             // PUT /api/practice/{id}/active → 403
```

**Good — recovery via Better Auth direct endpoints:**

```ts
// src/shared/hooks/useEnsureActiveOrganization.ts
const result = await authClient.organization.list();              // /api/auth/organization/list
const orgs = (result as { data?: unknown })?.data ?? result;
const firstId = Array.isArray(orgs) && typeof orgs[0]?.id === 'string'
  ? orgs[0].id
  : null;
if (firstId) {
  await authClient.organization.setActive({ organizationId: firstId });  // /api/auth/organization/set-active
  await getSession();                                                    // refresh
  window.dispatchEvent(new CustomEvent('auth:session-updated'));
}
```

**Gate-evaluation race to avoid** — even with the correct signal, the gate must not fire while the recovery is in flight or while the practices list is mid-refetch. In this codebase, suppress redirects when `isResolving || practicesLoading || subscriptionSyncPending` is true (see [src/index.tsx](src/index.tsx) for the full wait condition). Otherwise a render frame between "recovery succeeded" and "practices refetch lands" can fire `/pricing` or misroute a practice-owner to `/client/dashboard`.

## Routing intent (canonical pattern as of 2026-05-16)

The "wait for flags" gate above was rebuilt as a discriminated union to eliminate the flag race at the type level. The canonical answer to *"where should this user be right now?"* now lives in [src/shared/auth/routeIntent.ts](src/shared/auth/routeIntent.ts) as a pure function `computeRouteIntent(inputs): RouteIntent`. The React side is a thin wrapper at [src/shared/hooks/useAuthRouteIntent.ts](src/shared/hooks/useAuthRouteIntent.ts) that gathers inputs from the existing primitives (session, recovery hook, workspace resolver, post-Stripe sync) and delegates.

`RouteIntent` kinds encode the legitimate gate states by name:

- `loading` — any input in-flight (session pending, practice list mid-fetch, recovery resolving, post-Stripe sync). **Loading is first-class, not implied by stale-false flags.**
- `unauthenticated` — no user; the consumer redirects to `/auth`.
- `onboarding-required` — authenticated user with `onboarding_complete: false`; consumer redirects to `/onboarding`.
- `no-subscription` — authenticated, onboarded, but `!hasPracticeMembership && !active_organization_id` (the belt-and-braces above is enforced *inside* the union).
- `post-stripe-syncing` — `?subscription=success` is present and the post-Stripe recovery is firing.
- `practice-workspace` / `client-workspace` — settled; carries the destination data.

The consumer is a side-effect-only emitter at [src/shared/auth/AuthenticatedRouter.tsx](src/shared/auth/AuthenticatedRouter.tsx) that returns `<Redirect>` for the kinds that need it and `null` otherwise. AppShell mounts it as a sibling of the Router; RootRoute switches on the kind directly.

**All raw reads of `session.session.active_organization_id` are now routed through [`getActiveOrganizationPointer`](src/shared/lib/authClient.ts) — the single canonical reader, exported from the auth-client module so it lives next to `unwrapSessionData` and the rest of the session normalization.** New code should not read the field directly. Adding a new gate state means extending `RouteIntent` (TypeScript will fail the consumer's exhaustive switch until every kind is handled), which is more discoverable than reading `session.session.active_organization_id` correctly.

The relevant work: [PR #577](https://github.com/Blawby/blawby-ai-chatbot/pull/577) (membership-signal fix), [PR #580](https://github.com/Blawby/blawby-ai-chatbot/pull/580) (memoization-of-failure fix), [docs/plans/2026-05-16-002-refactor-route-intent-consolidation-plan.md](docs/plans/2026-05-16-002-refactor-route-intent-consolidation-plan.md) (this refactor).

## Related

- Brainstorm: [docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md](docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md)
- Plan: [docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md](docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md)
- Auth architecture: [docs/engineering/AUTHENTICATION_ARCHITECTURE.md](docs/engineering/AUTHENTICATION_ARCHITECTURE.md) (codifies `active_organization_id` as canonical snake_case session field, anti-fallback rule)
- Loading-states convention: [docs/engineering/loading-states.md](docs/engineering/loading-states.md) (informs the `isResolving` design)
- PR: [Blawby/blawby-ai-chatbot#577](https://github.com/Blawby/blawby-ai-chatbot/pull/577)
