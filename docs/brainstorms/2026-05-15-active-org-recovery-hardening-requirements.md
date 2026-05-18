---
date: 2026-05-15
topic: active-org-recovery-hardening
status: superseded
superseded_by: commit d8835163 (cherry-pick of ec0809cd into staging on 2026-05-16)
superseded_reason: backend verification showed 12 of 13 residuals were code-review hypotheticals, not observed production failures
---

> **⚠ SUPERSEDED — RETAINED AS HISTORICAL RECORD ONLY.**
>
> On 2026-05-16, this brainstorm's premises were checked against the actual backend at `blawby-backend`:
>
> - The backend is vanilla, stable Better Auth + PostgreSQL + Drizzle. `onAPIError.throw: false`. No production evidence the "transient backend errors" cited throughout this doc actually occur.
> - `active_organization_id: null` on a fresh session is the **documented Better Auth contract** ([databaseHooks.ts:78-84](../../../blawby-backend/src/shared/auth/hooks/databaseHooks.ts) in the backend repo: *"the client app is responsible for calling `authClient.organization.setActive()` after sign-in, per the better-auth organization plugin docs"*). It is not a failure mode.
> - No frontend route deletes organizations in this app. R5's "stale `active_organization_id` pointing at a deleted/cancelled org" scenario does not exist here. Stripe subscription cancellation marks the subscription cancelled; it does not delete the org.
> - **R1 (P0 #1 memoization-of-failure) was the only residual with concrete reasoning** behind it (silent backend-error catch + always-memoize would lock a user out on a single network blip). A fix was already written as commit [`ec0809cd`](https://github.com/Blawby/blawby-ai-chatbot/commit/ec0809cd) on the `fix/pricing-gate-membership-signal` branch — removing the silent catch (so errors propagate per CLAUDE.md) and moving the memoization to success-only branches, with 3 regression-guard tests. That commit was merged into staging as [`d8835163`](https://github.com/Blawby/blawby-ai-chatbot/commit/d8835163) on 2026-05-16.
> - The remaining 12 residuals (P0 #2 post-Stripe userId-null race, P1 no timeouts, P1 stale-pointer / cancelled-subscription strand, P1 /client/dashboard flash race, R6–R8 structural prevention, R9–R11 test hardening) are theoretical code-review hypotheticals. Per the pinned [CLAUDE.md](../../CLAUDE.md) rule, frontend fallbacks for backend behavior that isn't actually failing are not added.
>
> **If any of those theoretical residuals turn into observed production symptoms** — e.g., `[Workspace] failed to auto-activate practice` log spikes, user reports of /pricing redirects after PR #577 merged, observed `/client/dashboard` flash for a practice-owner — reproduce first, root-cause, then plan against the verified failure. Do not re-open this brainstorm as the starting point; it bakes in too many assumed failure modes.
>
> The plan that was written against this brainstorm — [docs/plans/2026-05-16-001-fix-active-org-recovery-hardening-plan.md](../plans/2026-05-16-001-fix-active-org-recovery-hardening-plan.md) — is also marked superseded.

---

# Hardening the active-org recovery before extending it further

## Summary

PR #577 stopped the wrong-signal redirect to `/pricing` by introducing `useEnsureActiveOrganization` as the shared recovery for cold-login and post-Stripe entry. The hook ships with 13 catalogued residuals, including 2 P0s that recreate the same hard-redirect bug class under transient backend errors. This brainstorm scopes the hardening pass that closes those residuals **and** introduces structural prevention so the active-org-pointer-vs-state mistake cannot re-enter the codebase via a new gate, a new effect, or a future agent reading from `session.session` directly.

---

## Problem Frame

The recovery hook is now a single point of failure for every authenticated entry. AppShell, RootRoute, and the post-Stripe `?subscription=success` block all delegate to it. When the recovery works, every paying user lands on their workspace home. When it doesn't — and the residuals catalogued in [docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md](../plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md#code-review-residuals-pr-577-ce-code-review-autofix-run) describe at least five distinct ways it can fail to — the same paying customer is silently locked back into the wrong-redirect bug or a stuck `LoadingScreen`, with no path out short of a hard refresh.

The two P0s are the sharpest edges:

- **P0 #1 — memoization-of-failure.** [src/shared/hooks/useEnsureActiveOrganization.ts:78-82](../../src/shared/hooks/useEnsureActiveOrganization.ts) marks `resolvedForUserIds.add(userId)` in the outer `finally`, so any transient throw from `authClient.organization.list()` / `setActive()` / `getSession()` permanently flags the user as "resolved with no org" for the session. A single packet loss → `/pricing` for the rest of the tab's lifetime.
- **P0 #2 — post-Stripe userId-null race.** If `useSession()` is still pending when the post-Stripe effect fires, `forceResolve()` short-circuits but the surrounding `.then(refetchPractices).finally(stripUrl)` chain runs anyway, and `subscriptionSyncHandledRef.current = true` permanently blocks re-entry. The user who just paid for a subscription lands at `/pricing` with no recovery on the next render frame.

Beyond the P0s, the hook has no timeouts (Better Auth backend hang → infinite `LoadingScreen`, a worse bug than the one it replaced), no handling of stale `active_organization_id` pointing at a deleted org (cancelled-subscription strand), and a known race where a paying practice-owner can be momentarily routed to `/client/dashboard` because `practicesLoading` flips before the refetch's loading state lands.

The structural angle: today `session.session.active_organization_id` is a raw field readable by any code in the app. The convention captured in [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) is a doc, not a guardrail. The next agent writing a new gate has the same anti-pattern equally available to them. Until the read is gated at the type level, the same bug can re-enter via a feature flag check, a "show upgrade banner" affordance, or any analytics tag.

---

## Actors

- A1. **Paying user with established membership** — currently at risk of being re-trapped at `/pricing` (P0 #1) or stuck on `LoadingScreen` (P1 #4) under transient backend failure.
- A2. **Just-subscribed user returning from Stripe Checkout** — at risk of P0 #2 when their `useSession()` hasn't resolved by the time the `?subscription=success` effect fires.
- A3. **Practice-owner with `practices.length > 1`** — at risk of being routed to the wrong active practice (P2 finding: `practices[0]` non-deterministic ordering) or briefly to `/client/dashboard` (P1 #3 race).
- A4. **Cancelled-subscription user** — has a stale `active_organization_id` pointing at a deleted org; the gate does not currently redirect to `/pricing` but also has no workspace to land in.
- A5. **Future agent adding a new gate or affordance** — today, can read `session.session.active_organization_id` directly and re-create the same bug class with no friction.

---

## Requirements

**Hook hardening (close the recurrence triggers)**

- R1. Recovery success memoization must happen on success only — a thrown error from any of `authClient.organization.list()`, `setActive()`, or `getSession()` must leave the user re-eligible for the next render-driven retry. The "no memberships found" terminal state (empty list returned cleanly) does memoize, since it is a successful determination.
- R2. The post-Stripe `?subscription=success` effect must not advance its `subscriptionSyncHandledRef` flag until `userId` has resolved on the session. While `useSession()` is still `isPending`, the effect waits.
- R3. Every outbound Better Auth call inside the recovery hook (`organization.list`, `setActive`, `getSession`) must be bounded by a per-call timeout. On timeout, treat as a thrown error per R1 (retry on next render). A configurable per-call ceiling, defaulting to a value selected during planning, is acceptable.
- R4. When the gate effect runs after recovery has set `active_organization_id` but before the practice-list refetch's loading flag has flipped, routing must not transiently land a practice-owner at `/client/dashboard`. The transient state `activeOrganizationId AND !hasPracticeMembership` is a "wait for refetch" state, not a "treat as client-only" state.
- R5. A user whose `active_organization_id` points at a deleted/cancelled org must land somewhere coherent. Planning will decide between (a) clearing the stale pointer and treating them as a zero-practice user → `/pricing`, or (b) routing them to a dedicated cancelled-subscription page, but this brainstorm rules out the current "no workspace to land in" terminal state.

**Structural prevention (close the bug class)**

- R6. The codebase must expose a single typed read for "is this user subscribed?" and a single typed read for "which org is currently active?" — two distinct functions with names that cannot be confused, owned by one module. Today the pointer-vs-state distinction lives in prose; after this work, it lives in the type system. Direct reads of `session.session.active_organization_id` outside that module should be either removed, deprecated, or flagged for review by a lint rule.
- R7. The duplicated `getActiveOrganizationId` helpers (`src/index.tsx:233`, `src/shared/hooks/usePracticeManagement.ts:592`, plus the local declaration in `useEnsureActiveOrganization.ts:49-54`) must be consolidated into the typed module from R6. Three identical bodies, three opportunities for drift.
- R8. The convention doc at [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) must be updated to reference the new typed reads as the canonical access path, so the doc and the code agree on what "correct" looks like.

**Test coverage (raise the regression floor)**

- R9. The deferred SC2 case — a user with `onboarding_complete: true` and zero practice memberships still gets routed to `/pricing` — must move from manual QA to automated E2E. Building the "completed onboarding + zero memberships" fixture is part of this work.
- R10. The existing E2E spec [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) must assert `active_organization_id` was `null` **before** login (the bug repro pre-condition), in addition to the existing post-login assertion that it is set. Without this, the test would pass even if the regression silently returned via a different code path.
- R11. `src/shared/hooks/usePracticeManagement.ts` must have unit coverage for the guard removed in PR #577 U2 — at minimum, a test asserting that `fetchPractices` proceeds when `active_organization_id` is null. Today there is zero unit coverage for that hook, so a future maintainer could re-add the deleted guard with no test feedback.

---

## Acceptance Examples

- AE1. **Covers R1.** Given a paying user has just signed in cold and the network drops the response to `authClient.organization.list()` once, when the recovery hook fires again on the next render, the user lands on their workspace home rather than being permanently flagged "resolved with no org."
- AE2. **Covers R2.** Given a user returns from Stripe Checkout with `?subscription=success` and `useSession()` is still `isPending` when the post-Stripe effect mounts, when the session resolves, the recovery still fires and the user lands on workspace home rather than `/pricing`.
- AE3. **Covers R3.** Given the Better Auth backend hangs indefinitely on `authClient.organization.list()`, when the timeout elapses, the user sees `/pricing` (the conservative pre-fix terminal state) rather than `LoadingScreen` forever.
- AE4. **Covers R4.** Given a paying practice-owner has just had their org auto-activated by recovery and the practice-list refetch is still in flight, when AppShell's gate effect runs, the user is not transiently navigated to `/client/dashboard`.
- AE5. **Covers R5.** Given a user has a stale `active_organization_id` pointing at a cancelled-and-deleted org, when they cold-load, the recovery does not loop and the user lands at the coherent terminal state chosen during planning (not the current "no workspace to land in" limbo).
- AE6. **Covers R6.** Given a contributor writes a new "hide nav while not subscribed" affordance, when they reach for `session.session.active_organization_id` directly, the type system or lint flags it and points them at the typed "is this user subscribed?" read.

---

## Success Criteria

- **Human outcome.** Zero recurrence of the original `/pricing` hard-redirect bug for paying users under any of the catalogued failure modes (transient backend errors, post-Stripe userId-null race, backend hang). The observability log `[Workspace] failed to auto-activate practice` returns to near-zero in production after the hardening lands.
- **Structural outcome.** A future agent cannot write code that conflates "is this user subscribed?" with `active_organization_id` without active friction from the type system, lint, or a code-review automated check. The convention doc and the code agree.
- **Downstream-agent handoff.** `ce-plan` can take this document and produce a file-by-file plan without inventing product behavior, terminal states, or success criteria. Every requirement traces to either an observable user outcome or a stated structural reason.

---

## Scope Boundaries

- **Backend changes are out.** Same constraint as PR #577. The `worker/middleware/practiceContext.ts` and `worker/routes/authProxy.ts` reads of `activeOrganizationId` are intentionally pointer-shaped — the field there is the practice resolver. The bug class lives at the frontend boundary, and that is where the fix lives.
- **MCP agent surface is out.** Tracked separately in [docs/brainstorms/2026-05-15-blawby-mcp-agent-surface-requirements.md](2026-05-15-blawby-mcp-agent-surface-requirements.md) and the matching plan. Different feature, different reviewer set.
- **`PracticeAppRoute`'s `setActive` sync loop is out.** Verified safe in the original brainstorm (it switches active practice when slug ≠ active org, and is one of the two callers explicitly confirmed correct). Touching it now would expand blast radius without addressing a known bug.
- **Removing the recovery hook entirely (the inverted alternative, see Key Decisions) is out of this brainstorm.** Worth surfacing as an option, but it requires backend coordination and is properly its own track.
- **Improving cancelled-subscription UX (beyond "land somewhere coherent") is out.** R5 closes the limbo state; designing the cancelled-subscription page itself is a separate brainstorm.
- **The remaining P2/P3 residuals** (post-Stripe `.catch()` unreachable, `getSession` failure misleading log, non-403 errors falling through silently, multi-org `practices[0]` non-deterministic ordering, redundant 403 fetch on every new mount, module-level event listener never removed) are out unless they fall naturally into the same edits. They are tracked in the plan; not load-bearing for the bug class.

---

## Key Decisions

- **Hardening + structural prevention (recommended) over hardening alone.** The bug class is what was actually shipped — a single naming collision between "pointer to current org" and "user's subscription state." The 2 P0s and P1s are instances of that class; closing them without changing the surface area lets the next gate re-introduce the same mistake. R6–R8 raise the cost of recurrence to "type-system friction" instead of "doc the next engineer didn't read."
- **Memoize only successful determinations.** Both the success case (org activated) and the "no memberships found" terminal case are valid memoization targets — they represent decisions the hook reached cleanly. Thrown errors are not decisions; they are transient state. R1 codifies the distinction.
- **Timeout values are a planning decision, not a brainstorm decision.** The brainstorm requires bounded calls (R3); the exact ceiling depends on observed Better Auth p99 latency, which is a planning-time research item.
- **R5's terminal state (zero-practice vs cancelled-subscription page) is deferred to planning.** Both are coherent outcomes that resolve the limbo state; choosing between them depends on adjacent product work the brainstorm does not need to resolve.
- **Inverted alternative not chosen (here): killing the recovery hook by having the backend auto-set `active_organization_id` at session establishment for single-org users.** This would close the chicken-and-egg at its source, eliminating the recovery hook entirely. Rejected for *this* brainstorm because it is a backend change, requires coordination with the same-named field semantics across Better Auth's own assumptions, and would leave the same anti-pattern available to any frontend code that later reads the field for a non-pointer purpose. Worth its own brainstorm as a longer-horizon move.

---

## Dependencies / Assumptions

- The convention doc at [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) accurately describes Better Auth's current semantics. Verified against the hook implementation and PR #577's plan; no evidence of drift since merge.
- `authClient.organization.list()` and `authClient.organization.setActive()` continue to bypass org-context middleware on the worker side. If the worker proxy ever adds middleware to those routes, R3's timeout is the safety net but R5's terminal state may need re-evaluation.
- The "completed onboarding + zero memberships" fixture (R9) is producible by signing up a new user via the existing test signup flow and stopping before practice creation. No backend fixture work required. Unverified assumption — flagged in Outstanding Questions.
- Existing E2E auth fixture conventions (`ownerContext`, `waitForSession`, etc. from `tests/e2e/fixtures.auth.ts`) extend to a zero-practice user without architectural changes. Unverified assumption — flagged in Outstanding Questions.
- The `[Workspace] failed to auto-activate practice` log already wired in [src/shared/hooks/useEnsureActiveOrganization.ts:76](../../src/shared/hooks/useEnsureActiveOrganization.ts) is sufficient as the "near-zero in production" signal named in Success Criteria. Verified by reading the hook.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R5][User decision] When a user has a stale `active_organization_id` pointing at a deleted/cancelled org, what is the chosen terminal state — (a) clear the pointer and redirect to `/pricing` (treating them as a re-onboarding subscriber), or (b) route to a dedicated `/subscription/cancelled` page? Choice affects whether planning needs to design a new page or just clear the pointer.
- [Affects R6][User decision] Preferred structural-prevention mechanism for direct `session.session.active_organization_id` reads — (a) a single typed module that owns the reads and exposes named functions, (b) an ESLint rule that flags raw reads outside that module, (c) both. Option (c) is strongest but adds tooling cost; the brainstorm requires at least one of these be in place.

### Deferred to Planning

- [Affects R3][Technical] Exact timeout ceilings for each Better Auth call. Should be informed by observed p99 latency for `organization.list` / `setActive` / `getSession` in production logs.
- [Affects R9][Needs research] Whether the existing E2E signup flow supports creating a user who completes onboarding but skips practice creation, or whether a new fixture-creation helper is needed. Investigate during planning.
- [Affects R10][Technical] Where in the Playwright spec to assert the pre-login `active_organization_id: null` precondition — before sign-in submit, or via a session-state inspector after the auth cookie sets but before any recovery effect runs.
