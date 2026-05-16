---
title: "fix: Harden active-org recovery and close the pointer-vs-state bug class"
type: fix
status: superseded
date: 2026-05-16
deepened: 2026-05-16
superseded_by: commit d8835163 (cherry-pick of ec0809cd into staging on 2026-05-16)
superseded_reason: backend verification showed 12 of 13 catalogued residuals were code-review hypotheticals, not observed production failures; the 1 real bug (R1) already had a fix on PR #577's branch
origin: docs/brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md
---

> **⚠ SUPERSEDED — DO NOT IMPLEMENT THIS PLAN.**
>
> On 2026-05-16, after reviewing the backend at `blawby-backend` against this plan's premises:
>
> - **Backend is stable.** Vanilla Better Auth + PostgreSQL + Drizzle, `onAPIError.throw: false`, standard throw-based 500 handling. No production evidence of transient failures the plan is hardening against.
> - **`active_organization_id: null` on a fresh session is the documented Better Auth contract**, not a bug ([databaseHooks.ts:78-84](../../../blawby-backend/src/shared/auth/hooks/databaseHooks.ts) in the backend repo).
> - **Orgs aren't deleted in this app** — no frontend route or backend route exposes `deleteOrganization`. R5's "stale pointer to deleted org" scenario doesn't exist here.
> - **R1 (memoization-of-failure) was already fixed** on the `fix/pricing-gate-membership-signal` branch as commit [`ec0809cd`](https://github.com/Blawby/blawby-ai-chatbot/commit/ec0809cd). That commit was merged into staging as [`d8835163`](https://github.com/Blawby/blawby-ai-chatbot/commit/d8835163) on 2026-05-16. P0 #1 is closed with 3 regression-guard tests.
> - The other 12 residuals (P0 #2 post-Stripe race, P1 timeouts, P1 stale-pointer, P1 /client/dashboard flash, R6–R8 structural prevention, R9–R11 test hardening) are theoretical code-review hypotheticals. Per the pinned CLAUDE.md rule, frontend fallbacks for backend behavior that isn't actually failing are not added.
>
> **If a real symptom appears** (production logs of `[Workspace] failed to auto-activate practice` spiking; user reports of /pricing redirect after PR #577 merged; observed `/client/dashboard` flash for a practice-owner) — reproduce first, root-cause, then plan against the verified failure. Do not use this plan as a starting point; it bakes in too many assumed failure modes.
>
> See the matching supersession note at the top of [docs/brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md](../brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md).

---

# fix: Harden active-org recovery and close the pointer-vs-state bug class

## Summary

Close the 13 catalogued residuals from PR #577 (2 P0s and 5 P1s in `useEnsureActiveOrganization`) and introduce structural prevention so the active-org-pointer-vs-state mistake cannot re-enter the codebase via a new gate, effect, or future agent. The work splits into four groups: hook hardening (P0s + timeouts + transient-state guard + stale-pointer detect-and-route), structural prevention (a typed module exposing two named reads, plus convention-doc realignment), new terminal page (a minimal `/subscription/cancelled` route for stale-pointer users), and test-coverage hardening (fix vitest include path so hook unit tests actually run, add the deferred SC2 E2E, lock down the pre-login `null` precondition).

(see origin: [docs/brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md](../brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md))

---

## Problem Frame

The recovery hook is now a single point of failure for every authenticated entry — AppShell, RootRoute, and the post-Stripe `?subscription=success` block all delegate to it. When it works, paying users land on workspace home. When it doesn't, the same paying customer is silently locked back into the wrong-redirect bug (P0 #1 — memoization-of-failure) or stuck on `LoadingScreen` (P1 — no timeouts), with no path out short of a hard refresh. The structural angle: today `session.session.active_organization_id` is a raw field readable by any code — the convention captured in [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) is a doc, not a guardrail. Research surfaced five direct readers across `src/**`, not the three the brainstorm catalogues, so the surface area for recurrence is wider than initially scoped.

---

## Requirements

- R1. Recovery success memoization happens on success only — any thrown error from `authClient.organization.list()` / `setActive()` / `getSession()` leaves the user re-eligible for next-render retry. The "no memberships found" terminal state (empty list returned cleanly) does memoize.
- R2. The post-Stripe `?subscription=success` effect does not advance `subscriptionSyncHandledRef` until `userId` resolves; while `useSession()` is pending, the effect waits.
- R3. Every outbound Better Auth call inside recovery (`organization.list`, `setActive`, `getSession`) is bounded by a per-call timeout. Default ceiling: 5000ms, exposed as `RECOVERY_CALL_TIMEOUT_MS`. On timeout, treat as thrown error per R1.
- R4. The transient state `activeOrganizationId AND !hasPracticeMembership` is a "wait for refetch" state, not a "treat as client-only" state — gates must not transiently route a paying practice-owner to `/client/dashboard`.
- R5. A user whose `active_organization_id` points at a deleted/cancelled org lands at a coherent terminal state. **Decision:** route to a new dedicated `/subscription/cancelled` page (brainstorm option b). The page itself is minimal scaffolding for this plan — a clear message ("Your subscription has been cancelled") + a primary action ("Resubscribe" → `/pricing`) + a secondary action ("Sign out"). Comprehensive UX design for the cancelled-subscription page stays out per the brainstorm and is its own follow-up brainstorm.
- R6. Two distinct typed reads, named so they cannot be confused, live in a single module: `getActiveOrganizationPointer(session)` (returns `string | null`, pointer-semantic) and `hasSubscribedMembership(session, practices)` (returns boolean, state-semantic). **Decision:** typed module only (brainstorm option a) — no ESLint rule. The module is the positive structural enforcement (named accessors with the pointer-vs-state distinction encoded in the API surface and JSDoc). A future contributor who reaches for raw `session.session.active_organization_id` has the typed module available as the discoverable alternative, but is not lint-blocked. Trade-off: lower tooling cost, lower friction to add new auth-related reads, higher reliance on code-review and convention-doc discipline to catch recurrence. Mitigation: the convention doc (R8) names the typed module as the canonical access path and is cross-linked from the module's JSDoc.
- R7. The duplicated `getActiveOrganizationId`-shaped helpers (research surfaced 5 readers, not 3: [src/index.tsx:232-236](../../src/index.tsx), [src/index.tsx:611-614](../../src/index.tsx), [src/index.tsx:808-810](../../src/index.tsx), [src/shared/contexts/SessionContext.tsx:33-39](../../src/shared/contexts/SessionContext.tsx), [src/shared/hooks/usePracticeManagement.ts:590-594](../../src/shared/hooks/usePracticeManagement.ts), [src/shared/hooks/useEnsureActiveOrganization.ts:49-54](../../src/shared/hooks/useEnsureActiveOrganization.ts)) consolidate into the typed module from R6. `PracticeAppRoute` uses the pointer accessor (its sync loop is pointer-semantic and brainstorm-confirmed correct); the other readers use the subscription accessor.
- R8. The convention doc at [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) is updated to reference the new typed reads as canonical and to point at the lint rule's error message.
- R9. The deferred SC2 case (`onboarding_complete: true` AND zero practice memberships → `/pricing`) moves from manual QA to automated E2E. Building the "completed onboarding + zero memberships" fixture is part of this work.
- R10. [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) asserts `active_organization_id` was `null` **before** login (the bug repro pre-condition), in addition to the existing post-login assertion.
- R11. `src/shared/hooks/usePracticeManagement.ts` has unit coverage for the guard removed in PR #577 U2. **Prerequisite:** the existing `src/shared/hooks/__tests__/` directory is not in the vitest unit project's `include:` allowlist, so the existing `usePracticeManagement.test.ts` and `usePracticeTeam.test.ts` files are not running today. R11 fixes the include path AND adds the guard-coverage test.

**Origin actors:** A1 (paying user with established membership), A2 (just-subscribed user returning from Stripe), A3 (practice-owner with `practices.length > 1`), A4 (cancelled-subscription user), A5 (future agent adding a new gate or affordance).
**Origin acceptance examples:** AE1 (covers R1), AE2 (covers R2), AE3 (covers R3), AE4 (covers R4), AE5 (covers R5), AE6 (covers R6).

---

## Scope Boundaries

- **Backend changes are out** — same constraint as PR #577. The worker reads of `activeOrganizationId` are intentionally pointer-shaped (it is the practice resolver there). Includes: no edits to `worker/middleware/practiceContext.ts`, `worker/routes/authProxy.ts`, or `worker/types/wire/auth.ts` (the `BackendSessionSchema` `active_organization_id` declaration gap is tracked as a separate follow-up).
- **MCP agent surface is out** — tracked in [docs/plans/2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md](2026-05-15-002-feat-blawby-mcp-agent-surface-plan.md).
- **`PracticeAppRoute`'s `setActive` sync loop is out** — brainstorm-confirmed correct. R7 migrates only its *read* of the pointer to go through the new module's `getActiveOrganizationPointer` accessor; the sync loop logic at [src/index.tsx:808-826](../../src/index.tsx) is untouched.
- **Removing the recovery hook entirely (backend auto-sets `active_organization_id` for single-org users)** is out — backend change, requires Better Auth coordination, own track.
- **Comprehensive cancelled-subscription UX is out** — R5 creates the `/subscription/cancelled` route with minimal scaffolding (clear message + Resubscribe + Sign out actions), enough to "land somewhere coherent". A full design pass on the cancelled-subscription page (copy, layout, A/B variants, win-back flow, telemetry) is its own follow-up brainstorm, not in scope here.
- **The P2/P3 residuals not load-bearing for the bug class** are out unless they fall naturally into the same edits: post-Stripe `.catch()` unreachable, `getSession` failure misleading log, non-403 errors falling through silently, multi-org `practices[0]` non-deterministic ordering, redundant 403 fetch on every new mount, module-level event listener never removed.

### Deferred to Follow-Up Work

- **`BackendSessionSchema.active_organization_id` declaration** (PR #577 residual P1 #5): adding `active_organization_id: z.string().nullable().optional()` to [worker/types/wire/auth.ts](../../worker/types/wire/auth.ts) would let the typed module drop its `Record<string, unknown>` cast and read the field through Zod-validated types. Backend-adjacent, requires a separate PR.
- **Multi-org `practices[0]` non-deterministic ordering** (PR #577 residual P2): the recovery picks the first org returned by `authClient.organization.list()`. For multi-org users, order is not guaranteed stable. Tracked separately; not load-bearing for the P0 bug class this plan closes.
- **Migration of `src/hooks/__tests__/` legacy unit-test directory paths to the canonical `src/shared/hooks/__tests__/` location** — R11 fixes the include glob for the new location; legacy paths in the include list stay until a cleanup pass.

---

## Context & Research

### Relevant Code and Patterns

- **Hook to harden:** [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) — P0 #1 at line 79 (`resolvedForUserIds.add` in outer `finally`), forceResolve at lines 124-134, eligibility at lines 103-110, auto-fire effect at lines 112-122.
- **AppShell gate:** [src/index.tsx](../../src/index.tsx) AppShell at lines 219-395. `needsFirstSubscription` build at lines 353-364, redirect at lines 380-383, gate suppression at line 287, `authenticatedHomePath` memoization at lines 272-279 (the `resolveAuthenticatedHomePath({ ..., hasPracticeMembership })` call at line 278 is where R4's `/client/dashboard` flash originates).
- **RootRoute gate:** [src/index.tsx](../../src/index.tsx) RootRoute at lines 592-715. `needsFirstSubscription` build at lines 634-642, redirect at lines 705-708, gate suppression at line 694, post-Stripe effect at lines 638-683, `forceResolve()` call at line 674.
- **PracticeAppRoute (pointer-semantic reader, sync loop out of scope):** [src/index.tsx:808-810](../../src/index.tsx).
- **Five direct readers of `session.session.active_organization_id` in `src/**`:** AppShell [src/index.tsx:232-236](../../src/index.tsx), RootRoute [src/index.tsx:611-614](../../src/index.tsx), PracticeAppRoute [src/index.tsx:808-810](../../src/index.tsx), SessionContext [src/shared/contexts/SessionContext.tsx:33-39](../../src/shared/contexts/SessionContext.tsx) (lacks `trim()` check — subtle inconsistency), usePracticeManagement [src/shared/hooks/usePracticeManagement.ts:590-594](../../src/shared/hooks/usePracticeManagement.ts). Sixth (canonical normalization, leave as-is): [src/shared/lib/authClient.ts:149-150,166](../../src/shared/lib/authClient.ts). Type-declaration-only (leave as-is): [src/shared/types/user.ts:288](../../src/shared/types/user.ts).
- **Branded-type pattern to mirror:** [src/shared/utils/money.ts:1-2](../../src/shared/utils/money.ts) — `type MajorAmount = number & { readonly __brand: 'MajorAmount' }` + a constructor function.
- **Timeout patterns to reuse:** [src/shared/lib/apiClient.ts:116-138](../../src/shared/lib/apiClient.ts) `composeAbortSignals` (uses `DOMException('Request timed out', 'TimeoutError')`) for `AbortController`-aware callers; [src/shared/hooks/useConversationTransport.ts:157-161](../../src/shared/hooks/useConversationTransport.ts) bare `Promise.race` for callers without abort hooks (Better Auth client falls in this bucket — its plugin methods don't accept `AbortSignal`). Error-detection convention in callers: `error instanceof DOMException && error.name === 'TimeoutError'`.
- **ESLint custom-rule wiring:** [eslint.config.js:10-12](../../eslint.config.js) loads `.cjs` rules from `config/eslint-rules/` via `createRequire`. Examples in place: `loading-consistency.cjs`, `no-inline-context-value.cjs`, and an inline `no-hardcoded-colors` at lines 89-106. `no-restricted-syntax` selectors used at lines 192-218. `no-restricted-imports` used at lines 161-189.
- **Vitest unit project include allowlist (critical for R11):** [config/vitest/vitest.config.ts:43-56](../../config/vitest/vitest.config.ts) — explicit `include:` paths list. The existing `src/shared/hooks/__tests__/usePracticeManagement.test.ts` and `usePracticeTeam.test.ts` are NOT in the list and therefore do not run today. R11 must extend the glob.
- **Vitest unit-test mocking pattern for hooks:** mirror [src/shared/hooks/__tests__/usePracticeManagement.test.ts](../../src/shared/hooks/__tests__/usePracticeManagement.test.ts) — `vi.hoisted`, manual jsdom in the test file (because unit project runs in Node), `vi.mock('@/shared/lib/authClient', ...)`, `vi.mock('@/shared/contexts/SessionContext', ...)`.
- **Playwright auth fixtures:** [tests/e2e/fixtures.auth.ts](../../tests/e2e/fixtures.auth.ts) exposes `ownerContext`, `clientContext`, `anonContext`, `unauthContext` (no `waitForSession` helper — the brainstorm reference is aspirational; use `page.waitForResponse('/api/auth/get-session')` instead). Auth-state paths: [tests/e2e/helpers/authState.ts](../../tests/e2e/helpers/authState.ts) (`AUTH_STATE_PATHS.{owner|client|anonymous}`). R9's "onboarded + zero practices" fixture adds a fifth context alongside these.
- **Existing E2E spec to extend:** [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) — currently asserts no `/pricing` in navigation history (line 50-51) and truthy `active_organization_id` post-login (lines 59-61). R10 adds the pre-login `null` precondition.

### Institutional Learnings

- [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) — load-bearing. Codifies the pointer-vs-state distinction and the recovery shape. Two non-obvious constraints to preserve through R7's consolidation:
  1. Recovery must call Better Auth direct endpoints (`authClient.organization.list/setActive`), never the worker's `/api/practice/*` proxy — the worker proxy is org-context-gated and 403s from the null state.
  2. Gates must wait on `isResolving || practicesLoading || subscriptionSyncPending` to avoid a render-frame race.
- **`docs/solutions/` is otherwise empty on this scope.** No prior learnings exist for memoization-on-success patterns, transient-error retry, `AbortController` timeout wrappers, ESLint custom-rule conventions, branded-type patterns, E2E auth fixture patterns, or vitest hook conventions. This plan creates first-instance precedent for several of these — a follow-up learnings capture is in the documentation plan.

### External References

External research skipped — the codebase has well-established local patterns for every primitive this plan needs (branded types in `money.ts`, ESLint custom rules in `config/eslint-rules/`, timeout patterns in `apiClient.ts`, hook unit tests in `__tests__/`, E2E auth fixtures in `fixtures.auth.ts`). The convention doc captures the domain-specific learnings.

---

## Key Technical Decisions

- **Single typed module at `src/shared/auth/activeOrganization.ts` with two named exports.** `getActiveOrganizationPointer(session): string | null` returns the pointer-shaped read for sync-loop callers like `PracticeAppRoute`. `hasSubscribedMembership(session, practices): boolean` is the membership-presence read for routing gates. No write-side accessor — R5's dedicated-page approach removes the need for a `clearActiveOrganization` write at the recovery boundary (the cancelled page's "Resubscribe" flow overwrites the stale pointer naturally via the new subscription's `setActive`, and "Sign out" clears via the existing session-clear path). The module is positive structural enforcement only: named accessors with the pointer-vs-state distinction encoded in the API surface, paired with JSDoc and a convention-doc cross-link. There is no ESLint rule — see R6 decision in Requirements.
- **No branded type for the pointer.** Considered `OrganizationPointer = string & { __brand }` following [src/shared/utils/money.ts:1-2](../../src/shared/utils/money.ts) (the codebase's only branded-type precedent), rejected. The bug class is field-name confusion ("read `active_organization_id` where you wanted membership state"), not string-type confusion ("passed a name where you wanted an id"). The brand would propagate contagiously into every consumer (string concatenation, fetch URLs, logging) and each `String(...)` brand-erasure cast silently re-introduces the ambiguity the brand was meant to prevent. The function names at the source carry the structural prevention without the migration friction. `money.ts`'s brand earns its keep through runtime arithmetic; pointer-vs-state has no analogous operation.
- **Convention-doc + module-discoverability is the structural prevention strategy.** Without a lint rule, the typed module's defenses are (a) the named accessors give a positive, discoverable API surface that's easier to use than the raw read, (b) the convention doc at [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) names the module as canonical and is updated by U10 to point at the new accessors, (c) the module's JSDoc cross-links back to the convention doc so a future contributor lands on the right guidance from either direction. Accepted trade-off: a contributor who deliberately bypasses the module by writing a raw read is not blocked at lint time — relies on code review to catch recurrence. This is the documented R6 decision (option a, typed module only).
- **Memoize on success AND on the clean "no memberships" terminal state, NOT on thrown errors** (R1). The brainstorm distinguishes "decisions the hook reached cleanly" (memoize) from "transient state" (retry). Memoization state: `resolvedForUserIds: Set<string>` for cleanly-determined outcomes, `failedAttemptCountForUserIds: Map<string, number>` to bound retry on broken backends (cap = 3 attempts before terminal `/pricing`), and `verifiedPointerForUserIds: Set<string>` for U6's pointer-validity verification (so a valid user incurs the verification `list()` call exactly once per session, not per render). All three are cleared together by the `auth:session-cleared` listener.
- **`setActive` is the success-commit point of recovery, not `getSession`.** A clean `setActive` resolve means the server-side pointer is now correct; the local session refresh via `getSession()` is a best-effort cache update for the current render. If `setActive` succeeds and `getSession` throws or times out, U2 commits the memo as success (`resolvedForUserIds.add(userId)`), logs a downgraded warning, and dispatches `auth:session-updated` — the next `useSession()` poll or the existing listener pulls the fresh row. Without this distinction, the hook would retry a server-committed setActive (potential duplicate-write or false-failure counter increment per correctness review C1).
- **Per-call timeout via `Promise.race`** wrapping each Better Auth call individually (not the whole recovery). Default `RECOVERY_CALL_TIMEOUT_MS = 5000` exposed as an importable module-top constant so tests can drop it to 50ms via direct import + reassign — no `vi.useFakeTimers` mixing with the JSDOM-real-timer pattern the sibling tests in [src/shared/hooks/__tests__/usePracticeManagement.test.ts](../../src/shared/hooks/__tests__/usePracticeManagement.test.ts) established. Timeouts throw `DOMException('... timed out', 'TimeoutError')` matching [src/shared/lib/apiClient.ts:116-138](../../src/shared/lib/apiClient.ts). A `setActive`-specific timeout is treated as ambiguous-success rather than as a thrown error: the hook performs a verification `getSession()` and, if the post-timeout session shows the pointer is now active, commits as success-after-timeout rather than incrementing the failed-attempt counter.
- **R5 stale-pointer handling: detect-and-route to `/subscription/cancelled` (no clearing at recovery time).** When `authClient.organization.list()` returns a list that does NOT include the active pointer, the pointer is *candidate-stale*. Recovery invalidates the local cache and re-fetches `list()` once for second-confirmation (defense against `list()` cache flap — see correctness review C2). If both consecutive `list()` calls omit the pointer, the recovery hook exposes a new `staleActiveOrganization: boolean` flag in its return value. AppShell and RootRoute consume this flag and, when true, redirect to the new `/subscription/cancelled` route (U12) instead of computing `needsFirstSubscription`. The stale pointer remains in the session row until the user takes an action — "Resubscribe" creates a new subscription and the resulting `setActive` overwrites the stale pointer; "Sign out" clears the entire session. Either path naturally resolves the stale-pointer state without requiring the recovery hook to call `setActive(null)` or otherwise wrestle with Better Auth's SDK surface. This eliminates the U6.0 SDK spike that the previous design needed.
- **Transient-state guard for R4** lives in [src/index.tsx](../../src/index.tsx) AppShell's `authenticatedHomePath` memoization at lines 272-279 — add the explicit clause: when `activeOrganizationId && !hasPracticeMembership && practicesLoading === false`, return null (treat as "wait for refetch", not "route to client home"). Same guard added to RootRoute's gate-firing effect at lines 685-715.
- **`hasSubscribedMembership` consumers must also suppress on `isResolving`.** The function's OR-clause (`practices.length > 0 || activePointer != null`) is correct for the steady state but creates a narrow window during U6's clear-and-retry path where a stale-pointer-with-no-memberships user briefly reads as `true` before the clear lands. Every consumer of `hasSubscribedMembership` (AppShell gate, RootRoute gate) must wrap its evaluation with the existing `isResolving || practicesLoading` wait condition. U7's module JSDoc explicitly documents this contract so future consumers don't re-introduce the race (closes correctness review C3).
- **Test-first execution posture for U2-U6** (the hook fixes). Each P0/P1 has a reproducible failing-test pattern — write the test that demonstrates the bug, watch it fail, fix the hook, watch it pass. Lock down regression with the test before touching the production code path.
- **`src/index.tsx`-edit ordering: U8 (mechanical reader migration) lands first as a no-op refactor, then U12 (cancelled-page route registration), then U3 (post-Stripe userId guard) and U5 (transient-state guard) land against the post-migration file.** All four units touch this file (lines 232-236 / 611-614 / 808-810 for U8, route table for U12, 638-683 for U3, 272-279 + 685-715 for U5). Inverting the "bug-fix first, structural second" posture here for the in-file ordering trades a small delay on user-visible structural prevention for zero merge-conflict risk between the four units. The user-visible bug fixes (U2, U4, U6) still ship before structural prevention reaches production — only the reader migration and route registration move earlier in the sequence. Line numbers in this plan are anchors-as-of-2026-05-16; implementers must re-resolve them against HEAD when each unit lands.

---

## Open Questions

### Resolved During Planning

- **R5 terminal state** — resolved to option (b) dedicated `/subscription/cancelled` page (per user direction). Rationale: user prefers an explicit cancelled-subscription terminal state over reusing `/pricing` for the stale-pointer case; gives clearer messaging for a user whose subscription was cancelled vs a user who never subscribed. Page UX is minimal scaffolding for this plan; comprehensive design is a follow-up brainstorm. Eliminates the need for a Better Auth SDK spike (no `setActive(null)` clearing required at recovery time).
- **R6 mechanism** — resolved to option (a) typed module only (per user direction). Rationale: user prefers the lower-friction, lower-tooling-cost approach. Typed module is the positive structural prevention via discoverable named accessors; convention doc + code review carry the secondary defense. Accepted trade-off: a deliberate raw read is not lint-blocked.
- **R3 timeout ceiling** — resolved to 5000ms default per Better Auth call, exposed as `RECOVERY_CALL_TIMEOUT_MS` constant. Rationale: generous enough for slow networks (Better Auth p99 not directly measured but bounded by the worker round-trip + Better Auth's own DB read, observed sub-second locally); short enough that a hung backend degrades to `/pricing` within ~5s (acceptable degradation vs infinite `LoadingScreen`); configurable so production telemetry can tune later.
- **R11 fixture availability** — resolved by direct inspection. The `src/shared/hooks/__tests__/usePracticeManagement.test.ts` already exists with `usePracticeManagement` mocking infrastructure but isn't being executed because the directory is missing from the vitest `include:` allowlist. R11 fixes the include path AND adds the guard-coverage scenario.
- **Retry bound for R1** — resolved to 3 attempts before terminal-state fallback. Rationale: enough to absorb transient packet loss without re-firing infinitely on an actually-broken backend.

### Deferred to Implementation

- **Pre-login `null` assertion mechanism in U11's R10 work** — default is direct cookie/storage-state inspection (zero server side-effects per correctness review C8). Fall back to `page.evaluate(() => fetch('/api/auth/get-session'))` only if the cookie shape doesn't carry enough info to assert the pre-login null state. The fetch path is flagged as "simpler" in earlier planning, but it side-effects the very state being asserted (Better Auth's session hydration touches `last_seen_at`) and can race with the recovery hook. Document the chosen approach in the test comment so a future contributor doesn't "simplify" by switching to fetch.
- **Cancelled-page Sign Out wiring** in U12 — verify whether the existing sign-out flow can be invoked from the page via the existing auth UI primitives (preferred) or whether a thin wrapper around `authClient.signOut()` is needed. Tradeoff decided in U12.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Typed module API surface (R6, R7)

```text
// src/shared/auth/activeOrganization.ts — directional grammar, not implementation

// Pointer-semantic reader. Returns the currently-selected org pointer for this session.
// Use for: sync loops, "which org is being viewed right now" UI, telemetry tags.
export function getActiveOrganizationPointer(
  session: SessionLike,
): string | null;

// State-semantic reader. Returns whether the user has any practice membership signal.
// Use for: routing gates, "should this user see /pricing" decisions, gating affordances.
// Belt-and-braces logic from the convention doc: practices.length > 0 OR active pointer set.
//
// CONTRACT — consumers MUST also wait on `isResolving || practicesLoading` before acting
// on this read. The OR-clause creates a narrow window during stale-pointer detection where
// this returns `true` for a user who is actually about to terminal-fall to /subscription/
// cancelled. Suppressing while the recovery hook is mid-flight prevents the misroute race.
// (See docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md
//  for the canonical pointer-vs-state convention this module enforces.)
export function hasSubscribedMembership(
  session: SessionLike,
  practices: ReadonlyArray<{ id: string }>,
): boolean;

// Internal helper not exported — the raw string read, used by both readers above.
```

The module exports only readers — no write-side accessor. R5's stale-pointer handling routes to
the dedicated /subscription/cancelled page (U12) rather than calling setActive(null), so the
SDK-uncertainty surface that previously needed a named clearActiveOrganization wrapper is
no longer load-bearing here.

### Memoization state machine (R1 + retry bound + partial-success commit + R5 stale-pointer detect-and-route)

```text
            ┌──────────────────────────────────────────────────────────┐
            │  Per userId state (module-level):                        │
            │  - resolvedForUserIds: Set<string>                       │
            │  - failedAttemptCountForUserIds: Map<string, num>        │
            │  - verifiedPointerForUserIds: Set<string>  (U6)          │
            │  - staleActiveOrganizationForUserIds: Set<string> (U6)   │
            │  - inFlightForUserIds: Map<string, Promise<void>>        │
            └──────────────────────────────────────────────────────────┘

           Recovery hook return shape:
           { isResolving, forceResolve, staleActiveOrganization: boolean }

  eligible & !inFlight & !resolved & attempts<3
                  │
                  ▼
            ┌──────────┐
            │ runRecovery│
            └──────────┘
                  │
   ┌──────────────┴──────────────────────────────────────────────────┐
   │                                                                  │
   ▼                                                                  ▼
list() throws/timeout                                       list() resolves
   └→ attempts.set(userId, n+1)                                       │
      if n+1 >= 3: resolved.add(userId)  (terminal)                   │
      else: eligible again next render                                │
                                                                      │
                                              ┌──────────────────────┬┴──────────────────────────┐
                                              ▼                      ▼                            ▼
                                       list returns []     activePointer in list          activePointer NOT in list
                                       └→ resolved.add        └→ verifiedPointer.add         └→ second-confirm:
                                          (terminal —            (single-shot per session,      re-fetch list once;
                                           no memberships)        no setActive needed —          if STILL absent:
                                           gate → /pricing        pointer already valid)         staleActiveOrganization.add;
                                                                                                 hook return: staleActiveOrganization=true
                                                                                                 gate → /subscription/cancelled
                                                                                                (NO clearActiveOrganization call;
                                                                                                 page actions resolve pointer)

                                       active pointer absent on session (cold-login path):
                                       └→ pick firstId from list → setActive(firstId)
                                              ┌────┴──────┐
                                              │           │
                                         throws/timeout  resolves
                                              │           │
                                              │           ▼
                                              │       getSession()
                                              │       ┌────┴────┐
                                              │     throws    resolves
                                              │       │         │
                                              │       │         ▼
                                              │       │   ✓ resolved.add(userId)
                                              │       │
                                              │       ▼  ← C1 fix: setActive succeeded,
                                              │   ✓ resolved.add(userId)   server has the write;
                                              │     log warn but commit    getSession is best-effort
                                              │
                                              ▼  ← C5 fix: setActive timeout is ambiguous-success;
                                         verify via getSession()
                                         ┌────┴────┐
                                     session has   session has
                                     activeOrgId   no activeOrgId
                                         │             │
                                         ▼             ▼
                                 ✓ resolved.add    attempts.set(n+1)

  auth:session-cleared event → drop ALL of: resolvedForUserIds, failedAttemptCountForUserIds,
                               verifiedPointerForUserIds, staleActiveOrganizationForUserIds, inFlightForUserIds
```

### Post-Stripe userId-null race (R2 fix sketch)

```text
RootRoute post-Stripe effect (src/index.tsx ~638-683):

   if (subscription === 'success' && !subscriptionSyncHandledRef.current) {
+    if (!userId) return;                          // ← NEW: wait for session
     subscriptionSyncHandledRef.current = true;
     setSubscriptionSyncPending(true);
     forceResolve()
       .then(refetchPractices)
       .finally(() => {
         stripUrl();
         setSubscriptionSyncPending(false);
       });
   }

  Dependency array gains `userId` so the effect re-fires when session resolves.
```

### Transient-state guard (R4)

```text
AppShell authenticatedHomePath memo (src/index.tsx ~272-279):

  // Existing: bypass while loading
  if (ensuringActiveOrg || practicesLoading) return null;

+ // NEW: transient state — recovery completed but practices refetch hasn't landed.
+ // Do not flash /client/dashboard for a practice-owner.
+ if (activeOrganizationId && !hasPracticeMembership) return null;

  return resolveAuthenticatedHomePath({ defaultWorkspace, fallbackSlug, hasPracticeMembership });
```

---

## Implementation Units

### U1. Fix vitest unit-project include allowlist for `src/shared/hooks/__tests__/`

**Goal:** Make the existing `src/shared/hooks/__tests__/` unit-test files actually run, so U2-U6's failing-test-first cycle has somewhere to live. The brainstorm's "zero unit coverage" claim was effectively true because of this gap.

**Requirements:** R11 (prerequisite).

**Dependencies:** None — this is the first unit.

**Files:**
- Modify: [config/vitest/vitest.config.ts](../../config/vitest/vitest.config.ts) (the `unit` project's `include:` array at lines 43-56).

**Approach:** Add `'src/shared/hooks/__tests__/**/*.test.{ts,tsx}'` to the unit project's `include:` array. Verify the existing `usePracticeManagement.test.ts` and `usePracticeTeam.test.ts` now execute. Do NOT touch the legacy `src/hooks/__tests__/` paths — they stay until a separate cleanup.

**Patterns to follow:**
- Existing entries in the `include:` array — match the glob style and trailing-comma convention.

**Test scenarios:**
- Happy path: `npm run test:unit` discovers and executes `usePracticeManagement.test.ts` (currently passing if the file's existing scenarios are correct; verify pass or fix flakes before proceeding).
- Happy path: `npm run test:unit` discovers and executes `usePracticeTeam.test.ts`.
- Integration: a deliberately-failing test added under `src/shared/hooks/__tests__/__discovery__.test.ts` (delete after verification) demonstrates the discovery path works end-to-end.

**Verification:** Both pre-existing test files appear in `npm run test:unit` output. If either file has stale/broken assertions (it's been silently un-run since creation), fix them in a separate commit within this unit so the baseline is green before U2 builds on it.

---

### U2. Fix P0 #1 — memoize recovery on success only

**Goal:** Move `resolvedForUserIds.add(userId)` out of the outer `finally` and into success-only branches, so a thrown error from any Better Auth call leaves the user re-eligible for next-render retry (with a bounded retry counter as backstop).

**Requirements:** R1 (covers AE1).

**Dependencies:** U1.

**Files:**
- Modify: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) (`runRecovery` body at lines 56-86, particularly the outer `finally` at line 78-82).
- Test: `src/shared/hooks/__tests__/useEnsureActiveOrganization.test.ts` (create).

**Approach:**
- Add module-level `failedAttemptCountForUserIds: Map<string, number>` alongside the existing `resolvedForUserIds: Set<string>` and `inFlightForUserIds: Map<string, Promise<void>>`.
- In `runRecovery`, restructure so `resolvedForUserIds.add(userId)` fires on these success commit points:
  1. Successful `list() + setActive() + getSession()` chain (steady-state happy path).
  2. Successful `list() + setActive()` followed by a *thrown* `getSession()` — `setActive` succeeded means the server has the write; getSession's failure is a best-effort cache miss, not a recovery failure. Log a downgraded warning, dispatch `auth:session-updated`, mark resolved. This closes correctness review C1 (otherwise the hook double-fires `setActive` on next render because the local session still reads `null`).
  3. Successful `list()` returning `[]` (clean "no memberships" terminal state).
  4. Failed-attempts counter reaching `MAX_RECOVERY_ATTEMPTS` (3) — treat as terminal to bound retry on broken backends.
- On thrown error inside `list()` OR `setActive()`: increment `failedAttemptCountForUserIds`, do NOT add to `resolvedForUserIds` unless cap reached. (Errors inside `getSession()` after `setActive()` succeeded follow path #2 above.)
- Outer `finally` keeps `inFlightForUserIds.delete(userId)` (always run — it's the in-flight tracker, not the memo).
- Update `eligible` derivation at lines 103-110 to also check `failedAttemptCountForUserIds.get(userId) < MAX_RECOVERY_ATTEMPTS`.
- Update `auth:session-cleared` listener at line 41 to also clear `failedAttemptCountForUserIds` (and U6's `verifiedPointerForUserIds` / `clearedPointerForUserIds` when those land).

**Execution note:** Test-first. Write the failing test that simulates a thrown `organization.list()` and asserts the user is re-eligible on next render. Watch it fail. Then fix.

**Technical design:** see "Memoization state machine" in High-Level Technical Design.

**Patterns to follow:**
- Existing `inFlightForUserIds` coalescing pattern at lines 33, 57-58, 80.
- Existing `dropMemo` listener at lines 35-42.

**Test scenarios:**
- Covers AE1. Edge case (`list` throws): mock `authClient.organization.list` to throw once, then resolve. Action: render hook twice. Expected: second render fires recovery successfully and resolves; counter increments to 1 then resets implicitly when resolved.
- Edge case (`setActive` throws): user re-eligible, attempt counter incremented to 1, `resolvedForUserIds` does NOT contain userId.
- **Partial success (covers correctness review C1): `list` ok + `setActive` ok + `getSession` throws.** Mock all three accordingly. Action: render hook, then re-render. Expected: (a) `resolvedForUserIds` contains userId after first render (success-commit at `setActive`), (b) `auth:session-updated` event dispatched, (c) warning logged at downgraded severity, (d) second render does NOT re-fire `setActive` (eligibility false because resolved), (e) attempt counter NOT incremented.
- **Terminal-state positive memoization assertion (closes testing review gap):** mock all three Better Auth calls to throw forever. Action: render hook 4 times. Expected: third attempt is last; fourth render does not fire `list`; `resolvedForUserIds` CONTAINS userId after the third throw (positive memoization fact, not just absence of further calls); a subsequent `auth:session-cleared` dispatch restores eligibility (proves it's memoization, not a different gate).
- Happy path: clean run, `resolvedForUserIds` contains userId after success, no retry counter modified.
- Happy path (terminal): `list()` returns `[]` cleanly → `resolvedForUserIds` contains userId, no retry counter modified.
- Integration: `auth:session-cleared` event during failed-attempt counting clears the counter so a re-login from the same tab starts fresh. Input: 2 failed attempts, then dispatch `auth:session-cleared`, then render. Expected: render fires recovery (counter reset).
- **Mid-flight session-cleared (closes testing review gap):** runRecovery's inner Promise is in-flight when `auth:session-cleared` fires. Action: dispatch event while the mock Better Auth call is pending; let the call then resolve. Expected: the in-flight resolution lands but does NOT pollute the post-clear memoization state; `inFlightForUserIds` is cleared by the event listener (verify the listener handles in-flight cleanup); next render is eligible.
- **Concurrent consumers, one failure, single counter increment (closes testing review gap C6):** render the hook in two consumer components in the same render tree (mocking AppShell + RootRoute). Action: trigger one failure. Expected: `failedAttemptCountForUserIds.get(userId) === 1` (not 2) — verifies the existing `inFlightForUserIds.get(userId)` coalescing means both consumers await the same IIFE, which increments the counter exactly once per attempt.

**Verification:** A user who experiences one transient `organization.list()` failure on cold-login can still successfully recover on the next render. A user with a genuinely broken backend hits `/pricing` after 3 attempts (degradation, not infinite spin). A user who hits the partial-success path (setActive ok, getSession failed) lands at workspace home without `setActive` being re-issued on next render.

---

### U3. Fix P0 #2 — post-Stripe userId-null race

**Goal:** Block the post-Stripe `?subscription=success` effect from advancing `subscriptionSyncHandledRef` until `userId` has resolved on the session. While `useSession()` is `isPending`, the effect waits.

**Requirements:** R2 (covers AE2).

**Dependencies:** U1, U2 (the failing-test pattern from U2 carries forward).

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) RootRoute post-Stripe effect at lines 638-683.
- Test (primary): a component-tier RootRoute test that mocks `useSessionContext` and asserts effect ordering. The race lives in the post-Stripe effect itself — `forceResolve`'s userId-null guard is a backstop, but the load-bearing invariant ("`subscriptionSyncHandledRef` does NOT advance while session is pending") is at the RootRoute level. Per testing review: testing only the hook proves `forceResolve` is safe to call with null userId; it does NOT prove the ref doesn't advance prematurely. Component-test the actual RootRoute.
- Test (secondary): `src/shared/hooks/__tests__/useEnsureActiveOrganization.test.ts` adds the belt-and-braces `forceResolve` userId-null guard scenario.

**Approach:**
- Add an early-return `if (!userId) return;` at the very top of the post-Stripe effect, BEFORE the `subscriptionSyncHandledRef.current` check and the `setSubscriptionSyncHandledRef.current = true` assignment. Order of guards: `?subscription=success URL check` → `ref already-handled check` → `userId guard` → `ref-set` → `forceResolve` chain.
- Add `userId` to the effect's dependency array so it re-fires once the session resolves.
- In `useEnsureActiveOrganization`'s `forceResolve` (lines 124-134), also guard on userId — return a resolved promise immediately if `userId === null`, but DO NOT mark `subscriptionSyncHandledRef.current = true` from inside `forceResolve` (that's a RootRoute concern; the hook should not know about it).
- Add an inline code comment at the early-return making explicit that reordering the guards resurrects the P0 (per correctness review C7).

**Execution note:** Test-first at the RootRoute component level. Write the test that mocks `useSessionContext` to be `{ session: null, isPending: true }` with `?subscription=success` in the URL, asserts the ref does NOT advance and the URL is NOT stripped, then flips `useSessionContext` to a resolved session and asserts the effect now fires once.

**Patterns to follow:**
- The existing `subscriptionSyncHandledRef` ref-guard pattern in [src/index.tsx](../../src/index.tsx).
- Pending-session early-return pattern in [src/index.tsx:694](../../src/index.tsx) (gate-suppression check).

**Test scenarios:**
- Covers AE2. Edge case (RootRoute test, primary): `useSession()` is pending when post-Stripe effect mounts → effect does NOT advance the ref, does NOT fire `forceResolve`, does NOT strip URL. Input: `useSessionContext` returns `{ session: null, isPending: true }`, URL has `?subscription=success`. Action: render RootRoute. Expected: `subscriptionSyncHandledRef.current === false`, URL still has the query param, no `forceResolve` call.
- Happy path (RootRoute test): session resolves while URL still has `?subscription=success` → effect now fires once. Input: `useSessionContext` flips from pending to resolved with valid userId. Action: re-render. Expected: ref advances, `forceResolve` called, URL stripped after `.finally`.
- Edge case (RootRoute test, locks down guard ordering): trigger an unrelated dep change (e.g. `location` identity) between the pending-session render and the resolved-session render. Expected: the ref-already-handled check correctly suppresses double-firing once the second resolution arrives.
- Integration (hook test, secondary): `forceResolve()` returns resolved promise immediately when userId is null, so callers don't deadlock if they invoke it pre-session-resolution.

**Verification:** A user returning from Stripe Checkout with `?subscription=success` lands on workspace home regardless of whether `useSession()` is pending when the page mounts.

---

### U4. Bound Better Auth calls with per-call timeouts

**Goal:** Wrap each of `authClient.organization.list()`, `authClient.organization.setActive()`, and `getSession()` with a `Promise.race` timeout. On timeout, behave identically to a thrown error (caught by U2's retry path → re-eligible until attempt cap → terminal `/pricing` after cap). Replaces the current "Better Auth backend hangs forever → infinite `LoadingScreen`" failure mode.

**Requirements:** R3 (covers AE3).

**Dependencies:** U1, U2 (the retry path is the terminal handler for timeouts).

**Files:**
- Modify: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) (`listMembershipOrgs` at lines 7-23, `setActiveOrganization` at lines 25-30, and the inline `getSession()` call at line 70).
- Test: `src/shared/hooks/__tests__/useEnsureActiveOrganization.test.ts` (extend with timeout scenarios).

**Approach:**
- Export `RECOVERY_CALL_TIMEOUT_MS = 5000` as a module-top constant, importable by tests so they can override to a fast value (50ms) via direct import + reassign — NOT via `vi.useFakeTimers()`. Per testing review: no existing test in `src/shared/hooks/__tests__/` uses fake timers; mixing fake and real timers with the JSDOM-real-timer pattern in [src/shared/hooks/__tests__/usePracticeManagement.test.ts](../../src/shared/hooks/__tests__/usePracticeManagement.test.ts) introduces flake vectors. Honor the established pattern.
- Add a small private helper `raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>` that does `Promise.race([promise, rejectAfter(timeoutMs)])`. The rejection is a `DOMException(`${label} timed out`, 'TimeoutError')` matching the existing convention in [src/shared/lib/apiClient.ts:116-138](../../src/shared/lib/apiClient.ts).
- Wrap each Better Auth call: `await raceWithTimeout(authClient.organization.list(), RECOVERY_CALL_TIMEOUT_MS, 'authClient.organization.list')`.
- Critically, remove the silent `try { ... } catch {}` in `listMembershipOrgs` at lines 12-21 — that swallowed all errors and returned `[]`, conflating "clean empty list" (memoizable) with "errored, retry me" (NOT memoizable). After this change, `listMembershipOrgs` throws on error and the U2 retry path catches it.
- **`setActive` timeout is ambiguous-success, not failure (closes correctness review C5):** wrap `setActive` with `raceWithTimeout` but, on `DOMException(..., 'TimeoutError')`, perform a verification `getSession()` (also wrapped with timeout). If the post-timeout session shows `active_organization_id === firstId` (the org we tried to set), commit as success: `resolvedForUserIds.add(userId)`, log a "success-after-timeout" warning, dispatch `auth:session-updated`. If the verification still shows null OR also times out, score as failure (increment counter via U2 path).

**Execution note:** Test-first with REAL timers and a low `RECOVERY_CALL_TIMEOUT_MS` override (e.g. set to 50ms at the top of the describe block, restored in `afterEach`). Mock `authClient.organization.list` to return `new Promise(() => {})` (never resolves); assert the call rejects with a `DOMException` named `TimeoutError` within ~100ms of real time.

**Technical design:**

```text
// Directional sketch:
async function raceWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DOMException(`${label} timed out`, 'TimeoutError')),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

**Patterns to follow:**
- Timeout-error shape: `DOMException(message, 'TimeoutError')` matching [src/shared/lib/apiClient.ts:116-138](../../src/shared/lib/apiClient.ts).
- Detection convention in callers (none needed inside the hook, but documented): `error instanceof DOMException && error.name === 'TimeoutError'`.
- The bare `Promise.race` shape from [src/shared/hooks/useConversationTransport.ts:157-161](../../src/shared/hooks/useConversationTransport.ts) — match it closely.

**Test scenarios:**
- Covers AE3. Edge case (`list` hangs): mock `list` to return a never-resolving Promise; set `RECOVERY_CALL_TIMEOUT_MS` to 50ms in test. Action: render hook, await ~100ms real time. Expected: rejection thrown with `DOMException` named `TimeoutError`, attempt counter incremented to 1.
- Edge case (`setActive` hangs, ambiguous-success verification path — closes correctness review C5): mock `list` to return a valid org list, `setActive` to hang, `getSession` to resolve with `active_organization_id` set to the org id from list. Action: render hook. Expected: `setActive` times out → verification `getSession()` runs → session reports success → `resolvedForUserIds.add(userId)` (NOT a counter increment); `[Workspace] auto-activated practice via post-timeout verification` log emitted.
- Edge case (`setActive` hangs, verification confirms failure): same setup but `getSession` returns `active_organization_id: null`. Expected: counter incremented; user eligible next render.
- Edge case (`getSession` hangs): same outcome as `list` (rejection, counter increment).
- Happy path: call resolves before timeout → no rejection, recovery completes normally.
- Edge case (timeout race cleanup): verify the timeout's `setTimeout` is cleared when the underlying promise resolves first (no memory leak). Test via `vi.spyOn(globalThis, 'clearTimeout')` and assert it was called once with the timer handle.
- Edge case (silent error-swallowing removed): a thrown error inside `list()` now propagates to U2's retry path, not returns `[]`. Verify via a mock that throws and assert `resolvedForUserIds` is NOT populated.

**Verification:** A simulated backend hang results in the user landing at `/pricing` within ~5 seconds (after 3 timed-out attempts at 5s each = ~15s worst case for full terminal fallback), never on infinite `LoadingScreen`. The timeout constant is importable and overridable for tests via direct module import, not via `vi.useFakeTimers`.

---

### U5. Add transient-state guard against `/client/dashboard` flash

**Goal:** After recovery sets `active_organization_id` but before the practice-list refetch's loading flag lands, the gate must NOT route a practice-owner to `/client/dashboard`. The transient state `activeOrganizationId && !hasPracticeMembership` is a "wait for refetch" state.

**Requirements:** R4 (covers AE4).

**Dependencies:** U1.

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) AppShell `authenticatedHomePath` memoization at lines 272-279.
- Modify: [src/index.tsx](../../src/index.tsx) RootRoute gate-firing effect at lines 685-715.
- Test: extend U2's test suite OR add a thin component-tier test for the AppShell gate. Prefer extending an existing E2E spec ([tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts)) with a "no transient `/client/dashboard` in navigation history" assertion.

**Approach:**
- AppShell `authenticatedHomePath` memo: add an explicit transient-state clause that returns `null` (treat as "wait") when `activeOrganizationId && !hasPracticeMembership` AND `practicesLoading === false`. The existing `practicesLoading` short-circuit handles the "fetch still in flight" case; this new clause handles the narrower "fetch landed but with stale empty data" frame.
- RootRoute: add the same clause to the gate-firing effect's wait condition at line 694. After this, the effect waits while `isPending || ensuringActiveOrg || (shouldFetchRootPractices && practicesLoading) || (activeOrganizationId && !hasPracticeMembership)`.
- This is a 2-line change in each gate location; the bulk of the work is the test that locks it down.

**Execution note:** The race window is sub-frame; `page.on('framenavigated')` alone is insufficient because it fires only on hard navigations and `pushState`/`replaceState` transitions — a client-side router that re-derives a route from state changes WITHOUT calling navigate (e.g., a memo returning a different homepath that conditionally renders a different subtree) can flash `/client/dashboard`-content without ever firing `framenavigated`. Per testing review: pair the URL-history assertion with a DOM-marker assertion installed via `page.evaluate` that records every distinct route marker (e.g., a `data-testid='client-dashboard'` on the client dashboard's root component) seen during cold-login.

**Patterns to follow:**
- Existing `practicesLoading` check at [src/index.tsx:287](../../src/index.tsx).
- Existing `framenavigated` recording pattern at [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts).
- MutationObserver pattern: install before sign-in submit via `page.evaluate`, store appearances on `window.__testFlashRecord__`, read after cold-login completes.

**Test scenarios:**
- Covers AE4 (URL-history assertion): after recovery completes, `framenavigated` history during the cold-login flow contains the practice-owner's home (`/practice/<slug>`) but never `/client/dashboard`. Input: full E2E cold-login as practice-owner. Action: record `framenavigated`. Expected: `urls.filter(u => u.includes('/client/')).length === 0`.
- Covers AE4 (DOM-marker assertion, closes testing review gap on sub-frame flash): a MutationObserver records every appearance of `[data-testid='client-dashboard']` in the DOM during the same cold-login flow. Expected: zero appearances. **Implementation prerequisite:** verify the client-dashboard root component has a stable `data-testid` attribute; if not, add one as part of this unit (minimal, no behavior change).
- Edge case (correct routing for client users): a real client-only user (no practice membership at all) still lands at `/client/dashboard` after recovery resolves to the empty terminal state. Input: client user E2E. Action: same recording. Expected: `/client/dashboard` IS in the history (correct routing for that user class), DOM-marker appears as expected.

**Verification:** Cold-login as `demo.owner.local@blawby.test` never shows `/client/dashboard` in the navigation history. Cold-login as a client user lands correctly at `/client/dashboard`.

---

### U6. Detect stale `active_organization_id` and route to `/subscription/cancelled`

**Goal:** A user whose `active_organization_id` points at an org that no longer exists in their membership list lands at the coherent `/subscription/cancelled` terminal state, not at the current "no workspace to land in" limbo. The recovery hook detects the mismatch and surfaces it; AppShell and RootRoute consume the signal and route accordingly. No pointer-clearing happens at recovery time — the cancelled page's actions (Resubscribe, Sign out) naturally resolve the stale pointer downstream.

**Requirements:** R5 (covers AE5).

**Dependencies:** U1, U2, U4, U7 (uses the module's `getActiveOrganizationPointer` for the pointer read), U12 (the `/subscription/cancelled` route must exist before gates can redirect to it).

**Files:**
- Modify: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) (`runRecovery` orchestration at lines 56-86, eligibility check at lines 103-110, hook return shape at line 136 — add `staleActiveOrganization: boolean`).
- Modify: [src/index.tsx](../../src/index.tsx) — AppShell and RootRoute gate effects consume the new flag and redirect to `/subscription/cancelled` when true.
- Test: `src/shared/hooks/__tests__/useEnsureActiveOrganization.test.ts` (extend with stale-pointer detection scenarios).

**Approach:**
- Today, the recovery hook's eligibility check at lines 103-110 includes `!activeOrgId` — meaning if `active_organization_id` is set, recovery does NOT fire. This is correct for the happy path but wrong for the stale-pointer case.
- Change the eligibility shape: when `activeOrgId` is set AND `verifiedPointerForUserIds.has(userId) === false`, the hook runs a verification-only path (separate from the cold-login recovery path). Verification calls `authClient.organization.list()` once.
  - If the list includes `activeOrgId` → `verifiedPointerForUserIds.add(userId)`. Hook returns `staleActiveOrganization: false`. Single-shot per session.
  - If the list does NOT include `activeOrgId` → second-confirmation: re-fetch `list()` once (defense against `list()` cache-flap per correctness review C2). If both consecutive calls omit the pointer → `staleActiveOrganizationForUserIds.add(userId)`. Hook returns `staleActiveOrganization: true` and continues to return `true` for the rest of the session.
- The verification `list()` failures do NOT increment `failedAttemptCountForUserIds` (per correctness review C4 — verification failures for valid users must not exhaust full-recovery retries). If verification `list()` throws, behave as if the pointer is valid (skip verification this session); `verifiedPointerForUserIds.add(userId)`. The recovery hook does not assume staleness on transient backend errors.
- This adds one extra `list()` call per session for users with a valid pointer. Memoized via `verifiedPointerForUserIds`, so the overhead is exactly one call per session, never per render. Acceptable trade-off for closing the stale-pointer limbo state.
- AppShell ([src/index.tsx](../../src/index.tsx) `authenticatedHomePath` memo at lines 272-279) and RootRoute (gate effect at lines 685-715) consume `staleActiveOrganization` from the hook and, when true, navigate to `/subscription/cancelled` instead of computing `needsFirstSubscription`. The redirect short-circuits before the existing `hasSubscribedMembership` evaluation — a stale pointer takes priority over the membership-presence signal because the user's pointer is *into a deleted org*, not a missing pointer.
- No `setActive(null)` or `clearActiveOrganization` is called at recovery time. The stale pointer remains in the session row; the cancelled page's actions resolve it.

**Execution note:** Test-first. Mock `authClient.organization.list()` to return a list NOT containing the active pointer (twice for second-confirmation), watch the recovery surface `staleActiveOrganization: true`, then drive the AppShell test to assert the redirect to `/subscription/cancelled`.

**Patterns to follow:**
- The recovery body's existing `firstId` selection pattern at lines 63-66.
- Single-shot memoization pattern from `resolvedForUserIds` (existing line 32).
- Navigation pattern at [src/index.tsx:380-383](../../src/index.tsx) for the existing `/pricing` redirect.

**Test scenarios:**
- Covers AE5. Edge case (genuinely stale pointer): `active_organization_id: 'deleted-org-id'`, two consecutive `list()` calls return `[]`. Action: render hook. Expected: `staleActiveOrganizationForUserIds` contains userId, hook returns `staleActiveOrganization: true`, no `setActive` call, no infinite loop.
- **Cache-flap defense (closes correctness review C2): pointer is candidate-stale on first `list()`, fresh on second `list()`.** Mock `list` to return `[]` first, then `[{ id: 'pointer-id' }]`. Expected: `staleActiveOrganization` returns `false` (second confirmation saw the org); `verifiedPointerForUserIds` is populated; no false-positive redirect.
- Edge case (valid pointer): `active_organization_id: 'valid-id'`, first `list()` returns `[{ id: 'valid-id' }, ...]`. Action: render hook twice. Expected: `staleActiveOrganization: false` both times, `verifiedPointerForUserIds` populated after first render, second render does NOT re-fire `list` (verification is single-shot per session).
- Edge case (multi-org user with stale pointer + valid alternative): `active_organization_id: 'deleted-org-id'`, two consecutive `list()` calls return `[{ id: 'valid-id' }]`. Action: render. Expected: `staleActiveOrganization: true` (the active pointer is not in the list, even though a valid org exists). The cancelled page's Resubscribe / explicit account-switching flow is the user's path forward — recovery does NOT auto-switch them to the valid org because that would silently change which workspace they were in.
- Edge case (verification `list()` throws): valid pointer, verification list throws. Expected: `staleActiveOrganization: false` (skip verification this session); `verifiedPointerForUserIds` populated; full-recovery `failedAttemptCountForUserIds` NOT incremented.
- Integration (AppShell): when `staleActiveOrganization: true`, AppShell navigates to `/subscription/cancelled` regardless of other gate state. Verify via component test or E2E.
- Integration (RootRoute): same as AppShell for the root path.

**Verification:** Manual repro: temporarily corrupt a test user's `active_organization_id` to a non-existent UUID; cold-load the app; user lands at `/subscription/cancelled` without spinner or loop. Cache-flap defense verified by the unit test (manual repro is hard to construct).

---

### U7. Create the typed `activeOrganization` module

**Goal:** Single module exposing two named reads — `getActiveOrganizationPointer` (pointer-semantic) and `hasSubscribedMembership` (state-semantic). This is the structural piece R6 requires (option a: typed module only, no ESLint rule).

**Requirements:** R6, R7 (covers AE6).

**Dependencies:** None — independent of the hook-hardening units.

**Files:**
- Create: `src/shared/auth/activeOrganization.ts`.
- Create: `src/shared/auth/__tests__/activeOrganization.test.ts`.

**Approach:**
- `getActiveOrganizationPointer(session): string | null` — reads `session.session.active_organization_id`, applies the trim-check (matching the 4 production callers, not `SessionContext`'s no-trim variant), returns the string or null. Plain `string`, not branded — see Key Technical Decisions for the brand rejection rationale.
- `hasSubscribedMembership(session, practices): boolean` — returns `(Array.isArray(practices) && practices.length > 0) || getActiveOrganizationPointer(session) !== null`. The `OR` clause is the belt-and-braces logic from the convention doc. **JSDoc contract** documents that consumers MUST also suppress acts on this read while the recovery hook reports `isResolving === true || practicesLoading === true` — the OR-clause creates a narrow window during U6's stale-pointer detection where this returns `true` for a user about to terminal-route to `/subscription/cancelled`. The contract closes correctness review C3.
- Module-level JSDoc cites the convention doc verbatim so the contract survives a future "simplification" PR that wants to inline the reads. Includes a prominent comment block at the top of the module: "If you are reading `session.session.active_organization_id` directly elsewhere in this codebase, use one of the two accessors below instead. See [convention doc] for why."
- Export `SessionLike` type that captures the minimum shape needed (`{ session?: Record<string, unknown> | null } | null | undefined`).
- No write-side accessor. R5's stale-pointer handling (U6) routes to the dedicated cancelled page rather than calling setActive(null) — no SDK-uncertainty surface to wrap.

**Execution note:** Test-first for the public API contracts. No branded-type test needed since brand was rejected.

**Patterns to follow:**
- Module-private helper convention from [src/shared/utils/money.ts](../../src/shared/utils/money.ts) (without the brand-constructor part).
- Trim check from the four production callers (matches majority behavior; deliberate decision to NOT match `SessionContext`'s no-trim variant).

**Test scenarios:**
- Happy path (pointer): `getActiveOrganizationPointer({ session: { session: { active_organization_id: 'org-123' } } })` returns `'org-123'`.
- Edge case (pointer): null session → returns null.
- Edge case (pointer): non-string value → returns null.
- Edge case (pointer): empty string → returns null (trim check).
- Edge case (pointer): whitespace-only string → returns null (trim check).
- Happy path (membership): non-empty practices array → returns true regardless of active_organization_id.
- Happy path (membership): empty practices BUT non-null active_organization_id → returns true (belt-and-braces).
- Edge case (membership): empty practices AND null active_organization_id → returns false (the "send to /pricing" terminal).
- Edge case (membership): null session AND null practices → returns false (no crash on null).

**Verification:** `npm run test:unit -- activeOrganization` passes. `npm run typecheck` passes.

---

### U8. Migrate all readers to the typed module (lands first among `src/index.tsx` edits, as no-op refactor)

**Goal:** Replace the five direct readers of `session.session.active_organization_id` with the new module's accessors. AppShell, RootRoute, and `usePracticeManagement` use `hasSubscribedMembership` (state-semantic, wrapped with the `isResolving || practicesLoading` suppression per U7 contract). `PracticeAppRoute` and `SessionContext` use `getActiveOrganizationPointer` (pointer-semantic — preserving `PracticeAppRoute`'s sync-loop semantics per brainstorm constraint). `useEnsureActiveOrganization` switches to using both internally.

This unit lands FIRST among the four `src/index.tsx`-touching units (U3, U5, U8, U12) per the Key Technical Decisions ordering. The migration is mechanical and behavior-preserving (no-op refactor with the brand rejected and the trim-tightening on `SessionContext` made explicit), so it's safe to ship ahead of the bug-fix logic in U3 and U5 and the new-route registration in U12.

**Requirements:** R7.

**Dependencies:** U7 (module must exist).

**Files:**
- Modify: [src/index.tsx](../../src/index.tsx) — three reader sites: AppShell (lines 232-236), RootRoute (lines 611-614), PracticeAppRoute (lines 808-810).
- Modify: [src/shared/contexts/SessionContext.tsx](../../src/shared/contexts/SessionContext.tsx) — replace the local `getActivePracticeId` helper at lines 33-39 with a call into the new module. **Note:** this changes `activePracticeId`'s null behavior subtly (the existing helper does NOT trim; the new module does). Verify no consumer relies on a whitespace-only `activePracticeId` (semantically nonsensical; a consumer relying on it would already be a bug).
- Modify: [src/shared/hooks/usePracticeManagement.ts](../../src/shared/hooks/usePracticeManagement.ts) — replace `sessionActiveOrgIdForDeps` IIFE at lines 590-594 and the related `getActiveOrganizationId` helper if still present.
- Modify: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) — delete the local `getActiveOrganizationId` helper at lines 49-54 and import from the new module.
- Test: `src/shared/contexts/__tests__/SessionContext.test.tsx` if not present; otherwise extend existing. Verify the `activePracticeId` context value behaves identically (modulo the trim-check tightening, which is intentional).

**Approach:**
- Mechanical replacement. Each reader now imports `import { getActiveOrganizationPointer, hasSubscribedMembership } from '@/shared/auth/activeOrganization'`.
- AppShell's `activeOrganizationId` at lines 232-236 becomes `const activeOrganizationId = getActiveOrganizationPointer(session);`. Downstream usage at lines 361 (the belt-and-braces in `needsFirstSubscription`) stays — `string | null` is fully type-compatible.
- The `hasPracticeMembership` derivation at the existing `useWorkspaceResolver` call (around line 253 in AppShell) is left as the canonical practices reader; `hasSubscribedMembership` becomes a derived helper called only where the OR-with-pointer belt-and-braces is needed.
- `PracticeAppRoute`'s sync loop at lines 804-826 (per brainstorm constraint) is NOT restructured — only its read of the pointer at lines 808-810 is migrated to `getActiveOrganizationPointer(session)`.
- `SessionContext.tsx`'s `activePracticeId` becomes a thin wrapper: `const activePracticeId = getActiveOrganizationPointer(session)`.

**Execution note:** Run `npm run typecheck` after each file is migrated. Since the brand was rejected, no widespread typecheck regressions are expected — but the trim-tightening on `SessionContext.activePracticeId` may surface a test that asserts whitespace-only id returns as a string. Fix in the same commit.

**Patterns to follow:**
- The existing import convention from `@/shared/...` paths.
- The existing string-narrowing pattern these readers are replacing — verify the new module's behavior matches for the truthy case (and intentionally diverges for the whitespace-only case).

**Test scenarios:**
- Integration: all routing gates behave identically post-migration for a happy-path user. Verify via the existing E2E spec [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts).
- Integration: `useEnsureActiveOrganization` still correctly fires recovery — the dependency on the local helper is replaced by the module import, no behavior change.
- Edge case: `activePracticeId` from `SessionContext` returns null for a whitespace-only `active_organization_id` (subtle behavior tightening). Verify via a unit test, not just grep — add an assertion to `SessionContext.test.tsx` that constructs a session with `active_organization_id: '   '` and asserts `activePracticeId === null`. (Closes the residual risk in the System-Wide Impact section about silent regressions.)
- Per-reader assertion (closes testing review gap on aggregate E2E coverage): each of the five migrated readers has at least one direct unit assertion confirming it now reads via the new module. For `usePracticeManagement` and `useEnsureActiveOrganization`, extend the existing hook test suites. For `SessionContext`, add a direct assertion. For `src/index.tsx` gates, the integration E2E covers behavior; an explicit unit test isn't needed unless one already exists.

**Verification:** `npm run typecheck` passes. `npm run test:unit` passes. `npm run test:e2e -- pricing-gate-membership` passes. `npm run lint` passes. No raw `session.session.active_organization_id` reads remain in `src/**` outside the new module, the canonical normalization in `authClient.ts`, and the type declaration in `user.ts` (verified by `grep` rather than by lint, since R6 resolved to typed-module-only without a lint rule).

---

<!-- U9 (ESLint rule) was retired when R6 resolved to option (a) typed module only.
     Per the U-ID stability rule (never renumber), the U9 ID is intentionally absent. -->

---

### U10. Update the convention doc

**Goal:** Realign [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md) with the new typed module so doc and code agree.

**Requirements:** R8.

**Dependencies:** U7, U8 (the doc references the new module and the post-migration code).

**Files:**
- Modify: [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md).

**Approach:**
- **Guidance section (lines 26-61):** Add a "Canonical reads" subsection pointing at `src/shared/auth/activeOrganization.ts` and naming both `getActiveOrganizationPointer` and `hasSubscribedMembership`. Explicitly call out that there is **no lint rule** enforcing this — discoverability via the named accessors and this convention doc is the structural prevention strategy (R6 option a). Code reviewers should flag raw `session.session.active_organization_id` reads added outside the canonical module.
- **Why This Matters section (lines 63-77):** Add a third bullet: "Future contributors should reach for the canonical accessors in `src/shared/auth/activeOrganization.ts` rather than reading `session.session.active_organization_id` directly. Not enforced at lint time — code review carries this."
- **New section "Stale-pointer terminal state":** Document the R5 detection-and-route convention. When `authClient.organization.list()` does NOT include the session's active pointer (verified via second-confirmation), the recovery hook signals `staleActiveOrganization: true` and gates route to `/subscription/cancelled` (U12). The stale pointer remains in the session row until user action; recovery does not call `setActive(null)`.
- **Examples section (lines 86-138):** Replace the inline `typeof sessionRecord?.active_organization_id === 'string'` snippets with calls into the new module. The "Bad — treats pointer as state" example stays as a counter-example; the "Good" examples become module-import-based.
- **Implementation reference (line 61, 126):** Update the `useEnsureActiveOrganization.ts` reference to also mention the new module. Update the embedded recovery snippet at lines 127-136 to import from the new module rather than re-implement the read inline.

**Patterns to follow:**
- The doc's existing structure — section ordering, code-block conventions, link styles.
- The "Bad/Good" example pattern is load-bearing; preserve it.

**Test scenarios:**
- Test expectation: none — this is a documentation update. Verification is via human review and link validation.

**Verification:** All file paths in the doc resolve. All code snippets are consistent with the post-U7/U8 module surface. The "Bad/Good" examples are accurate against the current codebase.

---

### U11. Test coverage hardening — pre-login null assertion, SC2 E2E, and `usePracticeManagement` guard coverage

**Goal:** Three test-coverage additions: (a) lock down the pre-login `active_organization_id: null` precondition in the existing E2E spec (R10), (b) add automated coverage for the deferred SC2 case (zero-practice user → `/pricing`) including building the fixture (R9), (c) add unit coverage for the guard `usePracticeManagement` no longer has (R11 — `fetchPractices` proceeds when `active_organization_id` is null).

**Requirements:** R9, R10, R11.

**Dependencies:** U1 (vitest include path must be fixed first), U7/U8 (the unit tests should use the new module's mocks consistently if relevant).

**Files:**
- Modify: [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) — add the pre-login null precondition assertion AND the SC2 test case.
- Modify: [tests/e2e/fixtures.auth.ts](../../tests/e2e/fixtures.auth.ts) — add an `onboardedNoOrgContext` fixture alongside `ownerContext`/`clientContext`/`anonContext`.
- Modify: [tests/e2e/helpers/authState.ts](../../tests/e2e/helpers/authState.ts) — add an `AUTH_STATE_PATHS.onboardedNoOrg` entry pointing at a new storage-state file.
- Create: `tests/e2e/fixtures/storageState/onboardedNoOrg.json` (or wherever the existing auth-state files live — verify path in implementation).
- Modify or create: `src/shared/hooks/__tests__/usePracticeManagement.test.ts` — add scenarios asserting `fetchPractices` proceeds when `active_organization_id` is null.
- Modify: `playwright.auth.config.ts` if needed to register the new fixture's storage state setup.

**Approach:**
- **R10 (pre-login null assertion):** Before the existing sign-in step in [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts), assert `active_organization_id` is null. **Default approach (closes correctness review C8):** inspect the auth cookie / storage state directly via Playwright's `context.cookies()` or `context.storageState()` — zero server side-effects. Only fall back to `page.evaluate(() => fetch('/api/auth/get-session'))` if the cookie shape doesn't carry enough info to assert pre-login null state. Document the chosen approach in a test comment.
- **R9 (SC2 E2E) — committed approach (closes testing review gap):** Use Playwright's route-interception to intercept the POST that creates the first practice during signup, return a 200 without persistence, and capture the resulting "completed onboarding + zero memberships" state as the `onboardedNoOrgContext` fixture's storageState. This avoids needing a backend test-helper or pre-baked database state. Sequence:
  1. New Playwright spec under `tests/e2e/fixtures-setup/onboardedNoOrg.setup.ts` (or extend the existing auth-setup pattern in `tests/e2e/helpers/authState.ts`) drives the signup flow.
  2. Before submitting the "create first practice" form, register `page.route('**/api/practice', route => route.fulfill({ status: 200, body: JSON.stringify({ success: true }) }))`.
  3. Submit the form. The frontend believes the practice was created; the backend never persisted. Onboarding completes; zero practices exist.
  4. Capture `context.storageState()` to `tests/e2e/fixtures/storageState/onboardedNoOrg.json`.
  - Fallback (if route-interception path fails): use Playwright's `request` API to directly call the signup + onboarding endpoints and stop before the practice-create call. Last-resort fallback: backend test-helper PR (out of scope here, would re-scope the plan).
- **R11 (`usePracticeManagement` guard coverage):** Add at least two scenarios:
  1. `fetchPractices` calls `listPractices()` when `active_organization_id` is null (and the user is authenticated non-anonymous).
  2. A successful response populates `practices` even when `active_organization_id` is null.
  The existing `usePracticeManagement.test.ts` already mocks `authClient` and `SessionContext`; extend rather than rewrite.

**Execution note:** Validate the route-interception approach in the first hour of U11 implementation. If it fails (e.g., the signup flow uses a non-standard request shape that doesn't match the route pattern), surface immediately and re-engage on the fallback chain — do NOT silently skip R9 to a documented manual-QA step.

**Patterns to follow:**
- Existing fixtures in [tests/e2e/fixtures.auth.ts](../../tests/e2e/fixtures.auth.ts).
- Existing storage-state convention in [tests/e2e/helpers/authState.ts](../../tests/e2e/helpers/authState.ts).
- Existing unit-test mocking pattern in [src/shared/hooks/__tests__/usePracticeManagement.test.ts](../../src/shared/hooks/__tests__/usePracticeManagement.test.ts).
- Playwright `page.waitForResponse('/api/auth/get-session')` for session-readiness waits.

**Test scenarios:**
- Covers R10. Integration: pre-login `active_organization_id` is null. Input: cold browser, no auth cookie yet. Action: hit auth page, submit credentials, before any recovery effect runs, inspect session. Expected: `active_organization_id === null`. Then proceed with existing post-login assertion.
- Covers R9 / SC2. Integration: a user with `onboarding_complete: true` and zero memberships lands at `/pricing`. Input: `onboardedNoOrgContext` fixture. Action: navigate to `/`. Expected: final URL is `/pricing`, no transient `/practice/*` or `/client/*` in navigation history.
- Covers R11 #1. Happy path: `fetchPractices` calls `listPractices()` when `active_organization_id` is null. Input: session with `user.id` set, `is_anonymous: false`, `active_organization_id: null`. Action: render `usePracticeManagement({ autoFetchPractices: true })`. Expected: `listPractices()` is called.
- Covers R11 #2. Happy path: a successful response populates `practices` even when `active_organization_id` is still null. Input: mocked `listPractices()` returns one practice, session's `active_organization_id` remains null. Action: render hook. Expected: `practices.length === 1`.
- Edge case (R11): 403 from `listPractices()` still sets `practicesFetchForbidden` and leaves `practices === []`. (Already covered by existing test scenarios in the file, but verify it's still passing post-vitest-include-fix.)

**Verification:** `npm run test:unit` includes the new `usePracticeManagement` scenarios and they pass. `npm run test:e2e -- pricing-gate-membership` exercises both the original `/pricing`-not-flashed assertion AND the new pre-login null precondition AND the new SC2 zero-practice case. All three pass against the post-U2-U6 hook.

---

### U12. Create the `/subscription/cancelled` route and page

**Goal:** A coherent terminal page for users whose `active_organization_id` points at a deleted/cancelled org. Minimal scaffolding for this plan — clear message + Resubscribe (→ `/pricing`) + Sign out. Comprehensive UX design (copy variants, win-back flow, telemetry) is a separate brainstorm.

**Requirements:** R5 (covers AE5 alongside U6).

**Dependencies:** U7 is helpful (the page may read session state via the typed module), but not strictly required — the page can be wired up independently and U6 + AppShell route to it.

**Files:**
- Create: `src/pages/SubscriptionCancelledPage.tsx` (or wherever the existing app's page convention is — verify against [src/index.tsx](../../src/index.tsx) routing structure; likely `src/pages/` or `src/routes/` depending on convention).
- Create: `src/pages/__tests__/SubscriptionCancelledPage.test.tsx` (or component-tier test alongside).
- Modify: [src/index.tsx](../../src/index.tsx) — register the `/subscription/cancelled` route. Verify the existing route table location (the file owns routing; the registration is one line near the other routes like `/pricing`).
- Possibly modify: any existing `isPublicRoute` / `isAuthOnlyRoute` / `isPricingRoute` helpers if the page needs the same gate-bypass treatment as `/pricing`.

**Approach:**
- Verify the existing routing convention first. `/pricing` is the closest analogue — find its route registration in [src/index.tsx](../../src/index.tsx) and mirror the shape. Likely a top-level Route with no auth wrapper (the user is authenticated but the page should bypass the normal subscription-gating logic — otherwise it would itself be gate-blocked).
- Page composition: use existing layout primitives (likely a centered card with the existing brand styling). Content:
  - Header: "Your subscription has been cancelled" (exact copy can be revised by product later; this minimal version is sufficient).
  - Body: 1-2 sentences explaining the user's account is still accessible but no active workspace is available. Reference the cancellation date if reachable from session/practice data, but optional — don't block on its availability.
  - Primary action button: "Resubscribe" → navigates to `/pricing`.
  - Secondary action button or link: "Sign out" → invokes the existing sign-out flow (verify the wiring approach during implementation — likely either reuses an existing sign-out UI component or wraps `authClient.signOut()` thinly).
- The page does NOT call `setActive(null)` or attempt to clear the stale pointer. The user's actions (Resubscribe → new subscription's setActive overwrites; Sign out → session-cleared event) resolve the pointer state.
- Add a route guard: if a user arrives at `/subscription/cancelled` but their session is NOT in the stale-pointer state (i.e. `staleActiveOrganization === false`), redirect to home. Prevents the page from being a dead-end if a user reaches it via direct URL.

**Execution note:** Build the page UI second, the route registration first. A bare route returning "Cancelled (placeholder)" is enough to unblock U6's gate redirect; the page content can be polished in the same unit or split into a follow-up.

**Patterns to follow:**
- Existing `/pricing` route registration and page component for layout/styling parity.
- Existing sign-out UI primitives (search for `signOut` in the codebase; common locations are user-menu components or settings flows).
- Existing gate-bypass route convention (`isPublicRoute` / `isPricingRoute` helpers if present).

**Test scenarios:**
- Happy path (route): `/subscription/cancelled` resolves to the page component without auth errors. Input: authenticated user with stale pointer. Action: navigate to `/subscription/cancelled`. Expected: page renders, message visible.
- Happy path (Resubscribe action): clicking Resubscribe navigates to `/pricing`. Verify via component test or E2E.
- Happy path (Sign out action): clicking Sign out invokes the existing sign-out flow. Verify the session is cleared post-action (E2E or component test).
- Edge case (route guard): authenticated user without stale pointer hits `/subscription/cancelled` directly. Expected: redirect to home (the gate guard fires). Prevents dead-end navigation.
- Edge case (unauthenticated): anonymous user hits `/subscription/cancelled` directly. Expected: redirect to `/auth` per existing app-wide unauthenticated-redirect convention. (May come "for free" from existing route guards.)
- Integration (with U6): a user with a corrupted `active_organization_id` cold-loads the app → AppShell or RootRoute detects `staleActiveOrganization: true` → navigates to `/subscription/cancelled` → page renders. Cover via E2E if reproducible; otherwise component-tier test with mocked hook state.

**Verification:** Manual: corrupt a test user's `active_organization_id` to a non-existent UUID, cold-load the app, verify landing at the new page. Click Resubscribe → arrives at `/pricing`. Click Sign out → arrives at `/auth`. Page renders consistently with the existing app's visual style.

---

## System-Wide Impact

- **Interaction graph:** Every authenticated entry path delegates to `useEnsureActiveOrganization`. AppShell, RootRoute, and the post-Stripe block all observe its `isResolving` state for gate suppression and (newly) its `staleActiveOrganization` flag for `/subscription/cancelled` redirection. The typed module from U7 becomes a new dependency for AppShell, RootRoute, PracticeAppRoute, SessionContext, `usePracticeManagement`, and the hook itself.
- **Error propagation:** Better Auth call failures (network, timeout, SDK error) now propagate via U2's retry-counter path. The convention from this plan: failures are NEVER swallowed in `listMembershipOrgs` (U4 removes the silent catch); they're caught at the recovery boundary in `runRecovery` and routed to retry-or-terminal logic. Verification-path failures (U6) do NOT exhaust the retry counter for valid-pointer users.
- **State lifecycle risks:** The hook gains three new pieces of per-userId state — `failedAttemptCountForUserIds` (U2), `verifiedPointerForUserIds` (U6), `staleActiveOrganizationForUserIds` (U6). All must be cleared together on `auth:session-cleared`. The `dropMemo` listener at [src/shared/hooks/useEnsureActiveOrganization.ts:35-42](../../src/shared/hooks/useEnsureActiveOrganization.ts) is the single place to add this; verify in U2 and U6 reviews.
- **API surface parity:** The typed module is plain `string` (brand rejected — see Key Technical Decisions). U8's migration is mechanical; no contagious type-erasure casts. Lint is not extended to ban raw reads — R6 resolved to option (a) module only; code review carries the secondary defense against recurrence.
- **Integration coverage:** The transient `/client/dashboard` flash race (R4) can only be reliably caught with E2E because the timing window is sub-frame. The Playwright `framenavigated` recording paired with the MutationObserver DOM-marker assertion in U5 is the load-bearing test; unit tests are insufficient.
- **New route surface:** `/subscription/cancelled` (U12) is a new top-level route. Verify it's added to any existing `isPublicRoute` / `isPricingRoute`-style helpers if those helpers control gate-bypass behavior — otherwise the cancelled page might itself be gate-blocked.
- **Unchanged invariants:** PR #577's core fix — the gate signal swap from `active_organization_id` to `hasPracticeMembership` — stays in place. The convention doc's guidance on "use Better Auth direct endpoints, NOT worker `/api/practice/*`" stays in place. PracticeAppRoute's `setActive` sync loop is untouched. Worker code is untouched. The post-Stripe block's query-param cleanup (`history.replaceState`) and event dispatch (`auth:session-updated`) stay in place — only the userId-guard is new (R2). The stale pointer in the session row is NOT cleared at recovery time; user actions on the cancelled page resolve it.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Retry counter still permits infinite spin if the cap is wrong.** A 3-attempt cap over 5s timeouts = ~15s worst-case to terminal `/pricing` fallback. If the network is genuinely flaky but recoverable on attempt 4+, we trade a slightly-worse UX for the certainty that broken backends degrade. | The 3-attempt cap is configurable via a module-top constant; precedent in the codebase is `RECONNECT_MAX_ATTEMPTS = 5` ([src/shared/hooks/useConversationTransport.ts:13](../../src/shared/hooks/useConversationTransport.ts)) and `MAX_NO_PROGRESS_ATTEMPTS = 3` ([src/shared/hooks/useConversation.ts:682](../../src/shared/hooks/useConversation.ts)). Production telemetry on `[Workspace] failed to auto-activate practice` log informs tuning. |
| **Convention drift without lint enforcement (R6 option a trade-off).** Without an ESLint rule, a future contributor reading `session.session.active_organization_id` raw is not blocked at lint time. The convention drift the brainstorm called out as a structural risk is mitigated by discoverability but not eliminated. | The typed module's named accessors are the positive defense; the updated convention doc (U10) is cross-linked from the module's JSDoc. Code review is the secondary catch. If recurrence happens, the team can add the lint rule in a follow-up PR — the typed module is the structural foundation that makes the rule cheap to add later. |
| **`src/index.tsx`-edit merge-conflict risk between U3, U5, U8, U12.** Four units touch this file. | Explicit ordering: U8 (mechanical reader migration) lands first as a no-op refactor, then U12 (cancelled-page route registration — also localized), then U3 and U5 (logic-bearing changes). Line numbers in this plan are anchors-as-of-2026-05-16; implementers re-resolve them against HEAD when each unit lands. The single-PR rollout posture (see Documentation / Operational Notes) eliminates external conflict pressure. |
| **SC2 E2E route-interception fixture may not work** if the signup flow's request shape doesn't match the Playwright route pattern. | U11 validates the route-interception approach in the first hour of implementation. If it fails: fallback via Playwright `request` API direct calls; last-resort: backend test-helper PR (re-scopes plan). Do NOT silently fall back to documented manual-QA (which is the status quo R9 exists to eliminate). |
| **U2's partial-success path (setActive ok, getSession throws) requires careful reasoning** because it commits the memo on a thrown error. A future "simplification" PR might re-add a uniform "all errors retry" path and silently re-introduce the double-setActive bug. | The partial-success commit point is documented in code comments with reference to this plan's correctness review C1. The test scenario asserts both positive memoization (resolved on first render) and negative (no setActive re-fire on second render). |
| **U6's verification `list()` call on every cold-mount for valid users** is one extra Better Auth call per session, every session, for every user. | Memoized via `verifiedPointerForUserIds: Set<string>` — exactly one call per session, never per render. Acceptable overhead for closing the stale-pointer limbo state. If production telemetry shows the `list()` p99 is high, the verification can be made async-fire-and-forget without blocking the gate evaluation (deferred optimization). |
| **`hasSubscribedMembership` OR-clause race during U6's stale-pointer detection window** could misroute a stale-pointer user as "subscribed" for one render before the gate redirects to `/subscription/cancelled`. | U7's JSDoc contract requires every consumer to wrap evaluations with `isResolving || practicesLoading` suppression. AppShell and RootRoute already have this wait condition; U8's migration preserves it; future consumers are warned by the contract. Closes correctness review C3. |
| **Stale pointer remains in the session row** after a user routes to `/subscription/cancelled` and dismisses the page (e.g., closes the tab). On next visit, recovery re-runs the same detection and re-routes to the cancelled page. | This is the intended behavior — a user with a stale pointer should always land at the cancelled page until they take an action (Resubscribe or Sign out). The user-action path resolves the pointer naturally. If the user-action paths prove insufficient (e.g., a user wants to "go back to the app" without resubscribing or signing out), that's a UX question for the cancelled-page follow-up brainstorm, not this plan. |
| **U12 page wiring may break in unexpected ways** because routing in [src/index.tsx](../../src/index.tsx) is dense and route-bypass helpers may need explicit extension for the new path. | U12 implementation explicitly verifies the route lands and is not gate-blocked. E2E test in U6 + U12 integration scenario catches misconfiguration end-to-end. If existing route-bypass helpers (`isPublicRoute` etc.) need extension, that's a small additive change inside U12's scope, not a separate unit. |
| **Convention doc and code drift again after this work.** The convention doc was a doc-not-guardrail before; without a lint rule this time, the same risk remains. | U10 puts the doc and code in the same content domain — the module's JSDoc cites the doc, and the doc lists the module's accessors as canonical. A future search-and-replace touching the module surface area surfaces the doc as a sibling. Code review is the human safeguard. |
| **U2 + U3 + U4 interact at runtime** — each unit hardens an orthogonal failure mode, but they compose at the recovery boundary. | Add a cross-unit integration test scenario to U2's suite: a single test that drives the hook through "transient list() failure → next render → post-Stripe entry with pending session → next render → setActive timeout" and asserts terminal `/pricing` within bounded attempts. Lock down the composition, not just each unit in isolation. |

---

## Documentation / Operational Notes

- **Convention doc** updated in U10. The new `/subscription/cancelled` route is the only new public-route surface introduced by this plan.
- **Three new institutional learnings** are candidates for capture after this plan lands (currently no `docs/solutions/` content for any of them):
  1. `docs/solutions/conventions/typed-module-for-session-pointer-vs-state-2026-05-16.md` — the typed-module pattern for separating pointer/state reads (no lint rule per R6 option a; module + convention doc + code review as the prevention strategy).
  2. `docs/solutions/design-patterns/memoize-on-success-only-2026-05-16.md` — the "memoize on decision, retry on transient state" pattern, with bounded retry counter.
  3. `docs/solutions/design-patterns/promise-race-timeout-for-non-abortable-rpc-2026-05-16.md` — the `Promise.race`-based timeout pattern for RPC clients that don't accept `AbortSignal`.
- **Observability:** the existing `[Workspace] failed to auto-activate practice` log at [src/shared/hooks/useEnsureActiveOrganization.ts:76](../../src/shared/hooks/useEnsureActiveOrganization.ts) is the load-bearing signal. After this work, the log's volume should drop to near-zero in production. A spike post-deploy indicates a new failure mode worth investigating. Optionally add a separate counter/log when `staleActiveOrganization` triggers — informs how many production users are landing at the cancelled page and shapes the follow-up cancelled-page UX brainstorm.
- **Rollout:** Single PR, no feature flag (matches PR #577's posture). The structural-prevention work (U7, U8, U10) and the new cancelled page (U12) could split into a follow-up PR if review surfaces concerns about scope, but the hook fixes (U1-U6) and test coverage (U11) should land as one unit since the bug fixes block production users right now. U12 is required for U6's gate redirect to land somewhere coherent, so it bundles with the hook fixes either way.
- **Pre-existing test failure not introduced here:** `tests/unit/middleware/auth.test.ts > parses active organization id from root-level Better Auth payload fields` was flagged in PR #577's post-merge notes as failing on staging baseline. Untouched by this plan; remains a separate concern.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md](../brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md)
- **Convention doc:** [docs/solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md](../solutions/conventions/better-auth-active-organization-id-pointer-2026-05-15.md)
- **Predecessor plan:** [docs/plans/2026-05-15-001-fix-pricing-gate-membership-signal-plan.md](2026-05-15-001-fix-pricing-gate-membership-signal-plan.md) (introduced the hook; this plan hardens it)
- **Related PR:** [Blawby/blawby-ai-chatbot#577](https://github.com/Blawby/blawby-ai-chatbot/pull/577)
- **Auth architecture context:** [docs/engineering/AUTHENTICATION_ARCHITECTURE.md](../engineering/AUTHENTICATION_ARCHITECTURE.md)
- **Loading-states convention:** [docs/engineering/loading-states.md](../engineering/loading-states.md)
- **Key source files:**
  - Hook to harden: [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts)
  - Gates to update: [src/index.tsx](../../src/index.tsx) (AppShell ~219-395, RootRoute ~592-715)
  - Five readers to migrate: [src/index.tsx](../../src/index.tsx) (lines 232-236, 611-614, 808-810), [src/shared/contexts/SessionContext.tsx](../../src/shared/contexts/SessionContext.tsx) (lines 33-39), [src/shared/hooks/usePracticeManagement.ts](../../src/shared/hooks/usePracticeManagement.ts) (lines 590-594), [src/shared/hooks/useEnsureActiveOrganization.ts](../../src/shared/hooks/useEnsureActiveOrganization.ts) (lines 49-54)
  - Branded-type pattern: [src/shared/utils/money.ts](../../src/shared/utils/money.ts)
  - Timeout patterns: [src/shared/lib/apiClient.ts](../../src/shared/lib/apiClient.ts) (lines 116-138), [src/shared/hooks/useConversationTransport.ts](../../src/shared/hooks/useConversationTransport.ts) (lines 157-161)
  - ESLint config: [eslint.config.js](../../eslint.config.js) (lines 192-218 for `no-restricted-syntax` examples)
  - Vitest config to fix: [config/vitest/vitest.config.ts](../../config/vitest/vitest.config.ts) (lines 43-56)
  - E2E to extend: [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts), [tests/e2e/fixtures.auth.ts](../../tests/e2e/fixtures.auth.ts), [tests/e2e/helpers/authState.ts](../../tests/e2e/helpers/authState.ts)
