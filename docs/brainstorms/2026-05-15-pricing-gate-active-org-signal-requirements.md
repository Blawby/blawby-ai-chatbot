# Pricing-gate signal swap — stop using `activeOrganizationId` as the subscription check

**Date:** 2026-05-15
**Scope:** Standard, frontend-only
**Severity:** Production — real paying customers are being hard-redirected to `/pricing` after they've already subscribed.

## The problem

Paying customers in production are being hard-redirected to `/pricing` on cold load. The frontend has two routing gates that compute the same boolean:

```text
needsFirstSubscription =
  session.user is authenticated AND not anonymous
  AND session.user.onboarding_complete === true
  AND session.session.active_organization_id is null/missing
  AND not already on /pricing
  AND query.subscription !== 'success'
```

That gate fires in:

- `src/index.tsx:351-358` (`AppShell` — in-app redirect)
- `src/index.tsx:617-621` (`RootRoute` — top-level redirect)

The signal it depends on — [`session.session.active_organization_id`](src/index.tsx:114) — is **the currently-selected org for the session**, not a "user owns ≥1 org" derived boolean. Better Auth's organization plugin sets it via `setActivePractice(...)`, and it is `null` whenever:

- The user logged in fresh and nothing called `setActivePractice` for them yet.
- Cookies were rotated between deploys.
- The user owns multiple practices and none is marked "active."
- A returning subscriber's session is otherwise valid but the org cookie expired or was never persisted.

In all of those states the user is *actually* a paying subscriber on the backend, but the frontend reads "no active org selected" and conflates it with "never subscribed" → hard redirect to `/pricing`. No API is failing; the session is correctly returning `null` for an unset field, and the frontend is interpreting "unset" as "absent."

The fix shape is already proven by the post-Stripe success effect at `src/index.tsx:653-666`:

```text
1. getSession()
2. if !active_organization_id:
     practices = await listPractices()
     if practices[0]?.id:
       setActivePractice(firstId)
       getSession()  // refresh
```

That recovery already does the right thing — it just only fires on the `?subscription=success` round-trip from Stripe Checkout. Every other entry path skips it.

## Goal

A paying user with ≥1 practice membership on the backend should never see the `/pricing` page involuntarily, regardless of whether their session has `active_organization_id` set yet. The `/pricing` gate should fire only when the user *actually* has no practice memberships of any kind.

## Non-goals

- No backend changes. `listPractices`, `setActivePractice`, and `getSession` already exist as frontend-callable helpers via the Better Auth org plugin proxy.
- Not redesigning workspace routing (`/practice/*` vs `/client/*`). The existing `useWorkspaceResolver` and `resolveAuthenticatedHomePath` already disambiguate those buckets once `practices` is populated.
- Not introducing a feature flag. Speed of unblock outweighs flag overhead; rollback is a one-commit revert.

## Decision: replace the signal entirely (Option B)

Gate on **practice membership presence**, not on `active_organization_id`.

- `useWorkspaceResolver` already exposes `hasPracticeMembership = Boolean(currentPractice?.id || practices.length > 0)` (`src/shared/hooks/useWorkspaceResolver.ts:50`). This is the correct "is this user a member of any practice" signal — it captures both firm-owners (firm-side users) and clients-of-firms (firm-customer-side users) because Better Auth's organization plugin lists all orgs the user is a member of.
- The gate becomes: fetch practices when `completedOnboarding`, then redirect to `/pricing` only when `practices.length === 0`.
- When `practices.length > 0` but `active_organization_id` is missing, auto-activate the first practice as a side effect (the existing post-Stripe recovery) so downstream code that depends on the active org stays correct.

Rejected: Option A (lift the success-return recovery as-is). It would unblock the demo but leave `active_organization_id` as the documented "subscription" signal — which is conceptually wrong and would re-bite us the next time a code path expects it to mean "subscribed." Production fire calls for the conceptual fix, not just the symptom patch.

## Success criteria

1. **Reproduction is fixed.** Cold-login a user that owns ≥1 practice on a session where `active_organization_id` starts `null`. They land on their workspace home, not `/pricing`. Verified via a Playwright test against staging plus manual repro on the demo account.
2. **The genuine zero-practice case still gates.** A new user who completes onboarding but never created/joined a practice still gets routed to `/pricing`. Existing onboarding-then-checkout flow continues to work end-to-end.
3. **No flicker on cold load.** Users do not see `/pricing` even for one frame on cold load while practices fetch resolves. The gate waits for `practicesLoading === false` before evaluating.
4. **Post-Stripe success path still works.** The `?subscription=success` recovery at `src/index.tsx:638-683` continues to set the active practice after a fresh checkout. (Likely converges into the same shared hook.)
5. **No backend changes.** No new Worker routes, no schema migrations, no Better Auth config edits.
6. **Observability.** A single console log (or Sentry breadcrumb if wired) emits when the recovery path runs — `[Workspace] auto-activated first practice (no active_organization_id on session)` — so we can see post-deploy how often the recovery vs. the legitimate gate fires.

## Touchpoints (where the change lives)

These are the files involved. Exact structure (shared hook vs inlined effects) is a planning decision, not a brainstorm decision.

- `src/index.tsx:114-119` — `getSessionActiveOrganizationId`. Keep; still useful as a check, just not as the subscription gate.
- `src/index.tsx:230-282` — `AppShell` setup and `authenticatedHomePath`. The `shouldFetchWorkspacePractices` condition currently excludes `completedOnboarding && !activeOrganizationId` from fetching — that exclusion is the same wrong-signal bug and must be flipped.
- `src/index.tsx:344-395` — `AppShell` gating effect. `needsFirstSubscription` must gate on practice membership, not on `active_organization_id`.
- `src/index.tsx:592-715` — `RootRoute` setup, post-Stripe recovery effect, gating effect. Same swap; `shouldFetchRootPractices` likewise must always fetch when `completedOnboarding`.
- (Possibly new) `src/shared/hooks/useEnsureActiveOrganization.ts` — shared hook that runs `listPractices → setActivePractice(first) → refresh` whenever `completedOnboarding && !activeOrganizationId && !already-tried-this-session`. Used by both AppShell and RootRoute. Idempotent; one-shot per session.

## Risks called out

- **Race condition: rendering before practices have loaded.** A naive change could flash `/pricing` while `practices` is mid-fetch. Gate evaluation must wait until `practicesLoading === false` (or until `useWorkspaceResolver` has cached data from a prior render in the same session). Existing code in `RootRoute` already gates on `practicesLoading`; AppShell's gate must adopt the same wait.
- **High-traffic file.** `src/index.tsx` owns routing for every authenticated entry. Regression risk is real; downstream routes (`/practice/*`, `/client/*`, `/onboarding`, `/auth`) depend on `activeOrganizationId` resolving in time. Mitigation: the recovery effect must always *fire and resolve* before authenticated routes render their first frame for the affected users.
- **Existing subscribers whose subscription is `canceled` / `incomplete_expired`.** Today they're gated at `/pricing`. After this change they would *also* be gated — `listPractices()` would return `[]` for them — so no behavior change. Worth confirming during QA.
- **A user who is *only* a client (a firm's customer, not a firm-owner) with no active org.** Today they may be wrongly redirected to `/pricing`. After this change they would be routed via `useWorkspaceResolver` to `/client/dashboard` because `practices.length > 0` includes their membership. This is a correctness improvement, not a regression.

## Assumptions

- `listPractices()` (`src/shared/lib/apiClient.ts:1204`) returns every org the user is a member of, including client memberships. Verified by reading the function and its use at `src/index.tsx:657` (the post-Stripe success path treats `practices[0]` as authoritative for picking an active org). If that ever stops being true, this fix needs to widen its membership query — but no current evidence indicates a gap.
- The user's session can be refreshed mid-flight via `getSession()` and the result is picked up by `useSessionContext` without a page reload. Verified by the existing post-Stripe block dispatching `auth:session-updated` to trigger re-render.

## Out of scope for this brainstorm

- Backend changes — explicitly off the table per CLAUDE.md's "fix the API contract first" guideline being overridden by the deploy constraint.
- A feature flag — production fire scope, ship-and-watch with the observability log instead.
- A broader audit of every other place that reads `active_organization_id`. Two callers were verified safe (`PracticeAppRoute` switches active practice when slug ≠ active org, the post-Stripe block recovers from null). A wider audit is a follow-up if observability shows other guards misfiring.

## Handoff

Next step is implementation. Recommended driver: `/ce-plan` for a precise file-by-file plan, then `/ce-work` to execute — or `/ce-work` directly if you want to skip the plan step given the touchpoints above are already enumerated.
