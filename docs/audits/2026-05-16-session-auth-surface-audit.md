---
title: "Session & Auth Surface Audit"
type: audit
status: complete
date: 2026-05-16
updated: 2026-05-16
methodology: "Per-area code review of both repos for observed/reproducible issues only (CLAUDE.md-aligned — no defensive recommendations for theoretical failures), plus live Playwright verification of authenticated flows"
scope: "11 areas from the 'NOT touched' table after PR #580 (recovery-hook memoization fix) merged"
---

> **Playwright verification update (2026-05-16):** Items #3 and #11 were verified end-to-end against the running app. Item #16 (`/client/dashboard` flash) was verified absent during owner cold-login. **A NEW critical bug was discovered during live verification — see "Verified bug discovered during Playwright pass" at the end of this report.**

# Session & Auth Surface Audit — 2026-05-16

## Why this audit exists

After PR #580 landed the targeted recovery-hook fix (`d8835163`), the user asked for a verify-each-row audit across the rest of the session/auth surface that the cherry-pick didn't touch. The audit was deliberately scoped to find **observed, reproducible issues only** — no defensive hardening recommendations for theoretical failures (per the pinned `CLAUDE.md` rule against frontend fallbacks for backend behavior that isn't actually failing). The prior brainstorm + plan at [`docs/brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md`](../brainstorms/2026-05-15-active-org-recovery-hardening-requirements.md) was superseded for exactly that anti-pattern; this audit corrects course.

Four parallel investigation agents each examined a batch of related areas across the frontend (`blawby-ai-chatbot`) and backend (`blawby-backend`) repos. This document consolidates their findings into a single triage table.

---

## Triage table

| # | Area | Status | Repo | File:line evidence | Recommended action |
|---|---|---|---|---|---|
| 1 | Login / sign-up flows (email+password) | ✅ Verified working | both | `better-auth.ts:253-261`, `AuthPage.tsx:78-144`, `AuthForm.tsx:84-172` | None |
| 2 | OAuth (Google) | ✅ Verified working | both | `better-auth.ts:262-269,316-326`, `AuthForm.tsx:174-240` | None |
| 3 | Magic link | ⚠ Half-built | both | Backend has plugin registered (`better-auth.ts:131-138`), email template queued. Frontend has **no `magicLinkClient` plugin** in `authClient.ts:85,95`, **no `signIn.magicLink` call**, **no `/auth/magic-link` callback page** (zero grep hits across `src/`). | **User decision needed.** Either remove the backend `magicLink()` plugin + `magic-link` email template (if unintended), or wire the frontend: add `magicLinkClient()`, add a sign-in button, add a callback route. |
| 4 | Sign-out flow | ✅ Verified working | frontend | `src/shared/utils/auth.ts:1-71` (centralized signOut, localStorage purge, navigate to `/auth`) | None |
| 5 | Account deletion — password user | ✅ Verified working | both | `AccountPage.tsx:473-540`, `better-auth.ts:222-224` | None |
| 6 | Account deletion — OAuth-only user | ⚠ Needs reproduction; likely broken | backend | `better-auth.ts:222-224` sets `deleteUser: { enabled: true }` but is **missing the `sendDeleteAccountVerification` callback**. Per Better Auth's documented API, OAuth users (no password) need this callback to receive the verification link. The frontend (`AccountPage.tsx:477-483`) calls `deleteUser()` and toasts success unconditionally. | **Reproduce first:** sign in as a Google-only test user → Settings → Account → Delete. If verification email never arrives and UI shows success toast, **fix the backend API contract** (add `sendDeleteAccountVerification` async hook in `better-auth.ts:222-224` mirroring the existing `emailVerification.sendVerificationEmail` pattern at lines 199-204). No frontend change. |
| 7 | Session creation, expiry, refresh | ⚠ Backend race in one-session-per-user invariant | backend | `databaseHooks.ts:75-86` — `session.create.before` hook does `db.delete(...).where(userId=...)` **non-transactionally** before Better Auth's subsequent insert. Two concurrent sign-ins for the same user can interleave (delete₁ → delete₂ → insert₁ → insert₂), leaving both sessions alive and violating the one-session-per-user invariant. | **Backend PR** to wrap delete+insert in a single Drizzle transaction, OR add a `UNIQUE(user_id)` partial index on sessions + ON CONFLICT REPLACE. Per CLAUDE.md: fix the API contract in the backend, not a frontend workaround. |
| 8 | Cookie domain / sameSite / secure config | ✅ Verified working (config) / 🔍 prod cookie name needs inspection | backend | `better-auth.ts:163-186` — `crossSubDomainCookies.enabled: true`, `domain: '.blawby.com'`, `sameSite: 'none'`, `secure: true`. Worker accepts both `__Secure-better-auth.session_token` AND `better-auth.session_token` (`worker/middleware/auth.ts:52`) — suggests prior confusion about which prefix actually lands. | None now. If cross-subdomain auth issues are ever reported, inspect actual `Set-Cookie` headers in prod (`app.blawby.com` DevTools → Application → Cookies) to confirm which cookie name is used. |
| 9 | useSession() hook | ✅ Verified working | frontend | `authClient.ts:123-188` (thin wrapper + `unwrapSessionData` normalizer), `SessionContext.tsx:109-146` (event dispatch on userId/sessionId change) | None |
| 10 | Auth route handlers (worker proxy `/api/auth/*`) — pass-through | ✅ Verified working | frontend | `worker/routes/authProxy.ts:44-54`, `worker/middleware/auth.ts:116-203,205-289` | None |
| 11 | Auth route handlers — failing test `parses active organization id from root-level Better Auth payload fields` | ⚠ Stale test, not a real bug | frontend | `tests/unit/middleware/auth.test.ts:38-58` asserts a payload shape with `activeOrganizationId` at the **root level** (sibling of `data`). This is **not a documented Better Auth response shape** — `parseAuthSessionPayload` correctly reads from `session.activeOrganizationId` per the documented `{data: {session, user}}` envelope. The other three tests in the file (lines 14-36, 60-107, 109-162) use the documented shape and pass. | **Delete or rewrite the test** (lines 38-58) to assert the documented `data.session.activeOrganizationId` placement. Do NOT widen `parseAuthSessionPayload` to swallow undocumented shapes. This is a one-line PR that unblocks the staging baseline test failure that's been outstanding since PR #577. |
| 12 | Post-Stripe `?subscription=success` userId-null race (P0 #2) | 🔍 Theoretical, not observed | frontend | `src/index.tsx:659-690` (post-Stripe effect), `useEnsureActiveOrganization.ts:135-145` (forceResolve early-returns on `!userId`). Discarded brainstorm explicitly classified this as theoretical. Zero commits/logs/comments reference an observed instance. | **None.** Per CLAUDE.md, no fix without a real symptom. If `[Workspace] failed to auto-activate practice` or `[RootRoute] Failed to refresh session after Stripe checkout` log lines spike in production, OR a user reports landing on `/pricing` after successful Stripe payment, then reproduce → root-cause → one-line fix (add `userId` guard before `subscriptionSyncHandledRef.current = true`). |
| 13 | Subscription billing & Stripe webhooks | ✅ Verified working | backend | `stripe.config.ts:301-310` (webhook idempotency via `createIfNotExists`), `:73-160` (double-subscription race handling), `:494` (cancellation preserves `activeSubscriptionId` until period end), `:536-587` (idempotency-keyed metered-price attach). Recent commits (`b22b18e`, `8ecc98f`) show steady hardening. | None |
| 14 | Practice / organization / membership creation | ⚠ Backend type/contract defect | backend | `requireAuth.ts:37` — `c.set('activeOrganizationId', activeOrgId ?? primaryWorkspace ?? null)`. `primaryWorkspace` is a string literal `'public'\|'client'\|'practice'` (not a UUID), but downstream consumers (`requireOrgMembership.ts:36`, `inject-ability.ts:19`, `engagement-contracts/handlers.ts:7-60`, `service-context.ts:28`) all treat `activeOrganizationId` as a UUID for membership/permission queries. When session lacks `activeOrgId`, the literal `'practice'` is substituted and silently passed to org-scoped queries. | **Backend PR** to drop the `?? primaryWorkspace` fallback at `requireAuth.ts:37` so `activeOrganizationId` is either a real UUID or `null`. Downstream consumers already handle `null` correctly. Per CLAUDE.md: backend contract fix. |
| 15 | Practice creation — happy path | ✅ Verified working | both | `organization.service.ts` (createOrganization wraps Better Auth), `usePracticeManagement.ts:978-1004` (createPractice frontend) | None |
| 16 | `/client/dashboard` flash race | 🔍 Theoretical, not observed | frontend | `src/index.tsx:287` (gate suppression `if (ensuringActiveOrg \|\| practicesLoading) return`), `:694` (RootRoute equivalent), `:361,640` (belt-and-braces `!activeOrganizationId` guard in `needsFirstSubscription`), `usePracticeManagement.ts:1221-1234` (refetch reactive to active-org-id transitions). Race is fully gated by existing code. Zero commits, comments, or E2E assertions reference an observed instance. | **None.** Optionally add a one-line assertion to `tests/e2e/pricing-gate-membership.spec.ts:49-51` mirroring the `pricingHits` check against `/client/dashboard` to convert this from theoretical to actively verified — pure regression-guard, no production bug fix. |
| 17 | Logout — flow itself | ✅ Verified working | frontend | (covered above in #4) | None |
| 18 | Account deletion — listeners (`AuthAccountDeleted`) | 📋 Stub only | backend | `src/modules/auth/listeners.ts:87-90` — log-only, comment says `// Future: Data cleanup, compliance logging, etc.` | Backlog only; not currently broken. Surface only if compliance requirements force it. |

---

## Real findings summary

After 11 areas examined across both repos, **5 actionable findings** surfaced. Three are in the backend (require PR to `blawby-backend`); two are in the frontend.

### Backend (3) — require PRs to `blawby-backend`

1. **`requireAuth.ts:37` `primaryWorkspace` fallback defect** (#14). Wrong type substituted for `activeOrganizationId`. One-line fix.
2. **`databaseHooks.ts:75-86` one-session-per-user race** (#7). Non-transactional delete+insert. Fix with transaction or UNIQUE constraint.
3. **Missing `sendDeleteAccountVerification` callback for OAuth account deletion** (#6). Needs reproduction first; if confirmed, one-config-block fix mirroring existing `emailVerification.sendVerificationEmail` pattern.

### Frontend (2) — can land in `blawby-ai-chatbot`

4. **Delete or rewrite stale test at `tests/unit/middleware/auth.test.ts:38-58`** (#11). Asserts undocumented Better Auth response shape; **unblocks the staging baseline test failure**. Trivial PR.
5. **Magic link feature is half-built — user decision needed** (#3). Either remove backend plugin or wire frontend. Not a bug per se; it's an incomplete feature.

### Theoretical findings (no action)

- Post-Stripe userId-null race (#12) — no observed evidence
- `/client/dashboard` flash race (#16) — fully gated by existing code; no observed evidence
- Cookie name prefix in prod (#8) — needs prod inspection only if symptoms appear

### Backlog (📋)

- `primaryWorkspace` set best-effort in 3 places (duplication)
- `sessions.activeOrganizationId` schema column has no FK to `organizations` (no orphan risk today since orgs aren't deleted)
- `AuthAccountDeleted` listener is a log-only stub
- Initial-mount `auth:session-updated` event semantics (potential double-fetch on first paint)

---

## Recommended next moves

Three discrete pieces of work, ordered by leverage:

### A. Trivial frontend PR (unblocks staging baseline test failure)

**Scope:** Delete or rewrite `tests/unit/middleware/auth.test.ts:38-58`.

**Why first:** Zero-risk, 5-minute change, ends a test failure that's been chronic since PR #577. Removes noise from every future CI run.

### B. Backend PRs (3, separate scopes)

Each lands as its own PR to `blawby-backend`. Not in `blawby-ai-chatbot` scope but I can write them if you want.

**B1.** Fix `requireAuth.ts:37` `primaryWorkspace` fallback — drop the `?? primaryWorkspace` clause.

**B2.** Fix `databaseHooks.ts:75-86` one-session-per-user race — wrap delete+insert in a single transaction.

**B3.** Reproduce OAuth-user account deletion to confirm it's broken. If yes: add `sendDeleteAccountVerification` callback to `better-auth.ts:222-224`.

### C. Decision — magic link

Either:
- **C1 (remove):** drop `magicLink()` plugin from `better-auth.ts:131-138` and the `magic-link` email template registration.
- **C2 (wire up):** add `magicLinkClient()` to `authClient.ts:85,95` plugin list, add "Sign in with email link" button to `AuthForm`, add `/auth/magic-link` callback route calling `authClient.magicLink.verify({token})`.

Picking is a product call. Either way: one targeted change.

---

## What this audit did NOT plan against

Per CLAUDE.md and the user's explicit directives during the recovery-hardening session that produced this audit:

- No defensive retry loops, timeouts, fallback paths, or guards for any "this could theoretically fail" case
- No new typed modules, lint rules, or ESLint guards (the prior plan's R6/R7/R8/R9 ideas)
- No frontend workarounds for backend contract issues (per the pinned rule)
- No hardening of paths that aren't broken (e.g., session refresh, cookie config, OAuth callback)

If any of the items currently marked 🔍 (theoretical) or 📋 (backlog) develop observed production symptoms later, the right move is to re-open them with the symptom as the starting point — not to retroactively justify the discarded brainstorm's defensive plan.

---

## Verified bug discovered during Playwright pass (2026-05-16)

### ⚠ NEW (not previously catalogued) — `/pricing` flash for ~911ms during cold sign-in

**Reproducible 2/2.** Steps:

1. Clear cookies + localStorage; navigate to `https://local.blawby.com/auth`.
2. Sign in as `demo.owner.local@blawby.test`.
3. User lands at `/practice/demo-owner-local` (correct final destination).
4. **Navigation history during sign-in flow:**

   | T (since click) | `replaceState` URL | Δ ms |
   |---|---|---|
   | 0ms | initial: `/auth` | — |
   | ~25240ms | `/pricing` ← **flash starts** | (sign-in delay + first render) |
   | ~25530ms | console: `[Workspace] auto-activated first practice (no active_organization_id on session)` | +291ms after /pricing redirect |
   | ~26150ms | `/` | +911ms after /pricing (flash ends) |
   | ~26270ms | `/practice/demo-owner-local` | +120ms |

5. Total time `/pricing` is the URL: **~911ms** (long enough for a brief paint).

**Why this matters.** This is the EXACT user-visible symptom PR #577 was written to prevent. The original bug was "user gets permanently stuck at /pricing"; PR #577 fixed the permanent stuck by adding the recovery hook. But the **transient flash during the recovery window** was not fully closed — the gate fires before the recovery hook's state propagates.

**Root-cause analysis.**

Gate code at [src/index.tsx:694](../../src/index.tsx) (RootRoute):

```ts
if (isPending || ensuringActiveOrg || (shouldFetchRootPractices && practicesLoading)) return;
// ... computes needsFirstSubscription ...
if (needsFirstSubscription) {
  navigate('/pricing', true);
  return;
}
```

The suppression depends on three flags:
- `isPending` from `useSession()` — `false` after Better Auth client hydrates
- `ensuringActiveOrg` (alias of `isResolving`) from `useEnsureActiveOrganization` — initialized as `useState(false)` ([useEnsureActiveOrganization.ts:90](../../src/shared/hooks/useEnsureActiveOrganization.ts))
- `practicesLoading` (alias of `isLoading`) from `usePracticeManagement` — initialized lazily at [usePracticeManagement.ts:595-597](../../src/shared/hooks/usePracticeManagement.ts) based on conditions that may evaluate `false` at the very first render

```ts
const [isLoading, setIsLoading] = useState(() => isGloballyFetching || Boolean(
  autoFetchPractices && !sessionLoading && sessionUserId && !isAnonymous
  && !practicesLoaded && !practicesFetchForbidden
));
```

On the first render after sign-in, depending on how synchronously `sessionUserId` is available in this render cycle, both `ensuringActiveOrg` and `practicesLoading` can be `false`. The suppression check then passes through, and the gate fires `/pricing`.

The recovery hook's `setIsResolving(true)` and the practice-fetch's `setIsLoading(true)` only take effect on the NEXT render — but by then the gate has already navigated to `/pricing`.

**The console log timestamp confirms this:** `[Workspace] auto-activated first practice` fires 291ms AFTER the `/pricing` replaceState — i.e., the recovery hook hadn't even started its log-emitting code when the gate redirected.

**This is not a backend issue.** It's a pure frontend effect-ordering race. Per CLAUDE.md, the fix is in the frontend (not "fix the API contract" — the API contract is being used correctly by Better Auth's documented client-calls-setActive flow).

**Recommended fix direction (for a plan, not a defensive patch).**

Three candidate approaches, in order of preference:

1. **Initialize loading flags to `true` (loading-by-default) when an auto-fetch is configured.** This is the most React-idiomatic: a hook that *will* fetch on mount should report `loading: true` from render #1, not flip to `true` in a useEffect on render #2. Change [usePracticeManagement.ts:595-597](../../src/shared/hooks/usePracticeManagement.ts) so the lazy initializer returns `true` whenever `autoFetchPractices && sessionUserId`. Change [useEnsureActiveOrganization.ts:90](../../src/shared/hooks/useEnsureActiveOrganization.ts) so `isResolving` starts `true` when the eligibility conditions are met (the same conditions that gate `runRecovery` in the auto-fire effect).

2. **Add a "has had a chance to settle" sentinel** to the gate effect — skip the gate for the very first render after a session userId appears, giving the recovery hook one render cycle to flip its flags.

3. **Compute eligibility synchronously** in the gate: instead of relying on `ensuringActiveOrg` (state that lags by one render), reconstruct the same eligibility check the recovery hook does, and bail if it would be eligible — i.e., the gate's "wait for recovery" condition is checked against the same predicates the recovery hook uses, not against the hook's lagging state.

Approach 1 is cleanest and has the smallest surface area. Approach 3 is more defensive but duplicates the eligibility predicates.

**Note on the existing E2E test.** [tests/e2e/pricing-gate-membership.spec.ts](../../tests/e2e/pricing-gate-membership.spec.ts) asserts that `/pricing` does not appear in `framenavigated` history during cold sign-in. Either (a) Playwright's `framenavigated` event doesn't fire for `history.replaceState` (which is what the flash uses), or (b) the test isn't running in CI. Worth verifying which it is and ensuring the test would actually catch this regression. The verification observed `history.replaceState` to `/pricing` via a direct `replaceState` interceptor — explicit, not subject to Playwright event-detection limitations.

**Status:** ⚠ Verified broken (live reproduction 2/2, ~911ms flash); root cause located in code; recommended fix path identified. **Plan a targeted fix before next deploy.**
