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
  - Handling cold-login or post-checkout flows where the intended organization must be explicit
  - Wiring data fetches that depend on org-scoped backend endpoints (the worker `/api/practice/*` routes that 403 when no active org is set)
related_components: ["payments", "development_workflow"]
tags: ["better-auth", "organization-plugin", "session", "active-organization-id", "pricing-gate", "multi-tenant", "fail-fast"]
---

# Better Auth `active_organization_id` is a session pointer, not a subscription signal

> **2026-05-24 update:** The frontend recovery hook described in older versions of this convention was removed. Do not reintroduce a hook that lists memberships and activates the first org. Better Auth and the backend own the session contract; if a route-unscoped authenticated workspace cannot resolve an active organization, surface the contract failure instead of inventing a frontend recovery path.

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

**When route-unscoped code cannot resolve a current workspace, fail visibly.** Do not list memberships and activate the first organization as a frontend recovery. Choosing "first org" is nondeterministic for multi-org users and hides backend/auth contract errors. The only frontend places that should call `authClient.organization.setActive({ organizationId })` are flows that already know the intended organization, such as:

- entering a route-scoped workspace (`/practice/:slug`) after resolving that slug to an organization ID;
- the org switcher after the user explicitly chooses an organization;
- post-checkout return handling when the return URL contains the subscribed `practiceId`.

Do not refresh the session with `getSession()` or dispatch custom `auth:*` browser events after those calls. Better Auth's client state is the reactive source of truth.

## Why This Matters

The signal-vs-pointer confusion is a class of bug, not a one-off. The same mistake can be made by:

- Any code reading `active_organization_id` to decide UI affordances ("hide nav while not subscribed", "show upgrade banner", "block creating a matter").
- Any backend endpoint that gates membership-checks on the *session-active org* instead of the *org being acted upon*.
- Any analytics or feature-flag code that treats `null active_organization_id` as "user has no plan".

Each of those, if shipped, recreates the same hard-redirect or wrong-UI failure mode under the legitimate `null` states above. The convention to internalize:

- **For "does this user have a workspace?"** → check membership presence (`organization.list()` or a cached `practices` array).
- **For "which workspace is the user currently looking at?"** → use the route slug for route-scoped pages, or read `active_organization_id` for route-unscoped pages.
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

**Bad — recovery by picking an arbitrary first organization:**

```ts
// Wrong: hides a missing/invalid active-org contract and may select
// the wrong workspace for multi-org users.
const orgs = await authClient.organization.list();
const firstId = orgs[0]?.id;
if (firstId) {
  await authClient.organization.setActive({ organizationId: firstId });
}
```

**Good — route-scoped setActive with a known target:**

```ts
// PracticeAppRoute has already resolved /practice/:slug to currentPractice.id.
if (currentPractice?.id && backendActiveOrgId !== currentPractice.id) {
  await authClient.organization.setActive({ organizationId: currentPractice.id });
}
```

**Gate-evaluation race to avoid** — even with the correct signal, the gate must not fire while the practices list or post-checkout synchronization is mid-refetch. In this codebase, suppress redirects when `practicesLoading || subscriptionSyncPending` is true (see [src/index.tsx](src/index.tsx) for the full wait condition). Otherwise a render frame before practice data lands can fire `/pricing` or misroute a practice-owner.

## Related

- Brainstorm: [docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md](docs/brainstorms/2026-05-15-pricing-gate-active-org-signal-requirements.md)
- Plan: [docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md](docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md)
- Auth architecture: [docs/engineering/AUTHENTICATION_ARCHITECTURE.md](docs/engineering/AUTHENTICATION_ARCHITECTURE.md) (codifies `active_organization_id` as canonical snake_case session field, anti-fallback rule)
- Loading-states convention: [docs/engineering/loading-states.md](docs/engineering/loading-states.md) (informs the `isResolving` design)
- PR: [Blawby/blawby-ai-chatbot#577](https://github.com/Blawby/blawby-ai-chatbot/pull/577)
