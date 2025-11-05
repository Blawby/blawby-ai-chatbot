# Test Coverage Gap Analysis

## Broken Miniflare Integration Tests

### 1. `tests/integration/usage/featureGuard.test.ts` ❌ **NOT COVERED**

**What it tests:**
- Quota enforcement middleware (`requireFeature`)
- Blocks requests when usage exceeds limit (402 error)
- Blocks file requests when file usage exceeds limit (402 error)
- Blocks personal organizations when `requireNonPersonal` is true (403 error)
- Enforces minimum tier requirements (402 error for free tier trying to use business features)
- Allows requests when usage is below limit

**E2E Coverage:**
- ❌ **NO E2E TESTS** - No tests for quota limits, 402/403 errors, or tier restrictions

**Recommendation:** 
- ⚠️ **DO NOT DELETE** - Critical functionality with no E2E coverage
- ✅ **ADD E2E TESTS** to cover:
  - User hitting message quota limit
  - User hitting file upload limit
  - Free tier trying to access business features
  - Personal org trying to access non-personal features

---

### 2. `tests/integration/api/subscription.sync.test.ts` ⚠️ **PARTIALLY COVERED**

**What it tests:**
- Subscription sync route (`/api/subscription/sync`)
- Updates organization tier after successful Stripe sync
- Updates organization seats
- Database persistence of subscription data

**E2E Coverage:**
- ✅ **PARTIAL** - `tests/e2e/onboarding.spec.ts` tests subscription sync but:
  - Only tests failure case (doesn't upgrade without Stripe)
  - Does NOT test successful sync with Stripe
  - Does NOT verify database updates
  - Does NOT verify tier/seats updates

**Recommendation:**
- ⚠️ **DO NOT DELETE** - Success case not covered
- ✅ **ENHANCE E2E TEST** to cover:
  - Successful subscription sync with Stripe mock
  - Organization tier/seats update after sync
  - Database verification

---

### 3. `tests/integration/api/stripe.webhook.test.ts` ❌ **NOT COVERED**

**What it tests:**
- Stripe webhook handler (`/api/stripe/webhook`)
- Webhook signature validation
- Subscription updated events
- Subscription paused events
- Subscription resumed events
- Subscription deleted events
- Trial ending events
- Database updates from webhooks

**E2E Coverage:**
- ❌ **NO E2E TESTS** - Webhooks are external events sent by Stripe
- E2E cannot test webhooks (they're POST requests from Stripe servers)

**Recommendation:**
- ⚠️ **DO NOT DELETE** - Webhooks cannot be tested via E2E
- ✅ **KEEP INTEGRATION TEST** - But need to fix Miniflare issues OR use real API test approach
- Alternative: Test webhook handler via HTTP (real API test) instead of Miniflare

---

### 4. `tests/integration/api/organization-context.test.ts` ❌ **NOT EXPLICITLY COVERED**

**What it tests:**
- Session creation with organization context from request body
- Session creation with organization context from URL parameter
- Default organization fallback when none provided
- Session retrieval with organization context

**E2E Coverage:**
- ⚠️ **IMPLICIT** - E2E tests create sessions but don't explicitly verify:
  - Organization context handling
  - URL parameter vs body parameter
  - Default organization fallback

**Recommendation:**
- ⚠️ **DO NOT DELETE** - Explicit coverage needed
- ✅ **ADD E2E TEST** to verify:
  - Session creation with specific organization
  - Organization context in session retrieval
  - Default organization fallback

---

## Summary

| Test | Status | E2E Coverage | Action |
|------|--------|--------------|--------|
| `featureGuard.test.ts` | ❌ Broken | ❌ None | Keep, add E2E coverage |
| `subscription.sync.test.ts` | ❌ Broken | ⚠️ Partial | Keep, enhance E2E |
| `stripe.webhook.test.ts` | ❌ Broken | ❌ None (can't E2E) | Keep, fix or use real API |
| `organization-context.test.ts` | ❌ Broken | ⚠️ Implicit | Keep, add explicit E2E |

## Action Plan

### Phase 1: Add Missing E2E Coverage

1. **Quota Enforcement E2E Tests** (`featureGuard.test.ts` coverage)
   - Test hitting message quota limit
   - Test hitting file upload limit
   - Test tier restrictions (free → business features)
   - Test personal org restrictions

2. **Subscription Sync E2E Tests** (`subscription.sync.test.ts` coverage)
   - Enhance existing test to verify successful sync
   - Test tier/seats update after sync
   - Test database updates

3. **Organization Context E2E Tests** (`organization-context.test.ts` coverage)
   - Test session creation with org context
   - Test organization context in session retrieval
   - Test default org fallback

### Phase 2: Fix or Replace Broken Tests

1. **Webhook Tests** (`stripe.webhook.test.ts`)
   - Option A: Convert to real API test (HTTP to wrangler dev)
   - Option B: Fix Miniflare module resolution (if possible)
   - Option C: Keep as integration test but mark as "requires wrangler dev"

2. **Other Miniflare Tests**
   - Once E2E coverage is complete, evaluate if Miniflare tests are still needed
   - If E2E covers everything, consider deleting Miniflare tests
   - If Miniflare tests provide unique value (edge cases, internal functions), keep them

### Phase 3: Cleanup

1. **After E2E coverage is complete:**
   - Review each broken Miniflare test
   - Determine if E2E coverage is sufficient
   - Delete only if E2E fully covers the functionality
   - Keep if test provides unique value (internal functions, edge cases)

---

## Current Status

✅ **DO NOT DELETE ANY TESTS YET** - Missing E2E coverage for critical functionality

## TODO Items

### ✅ Completed
- [x] E2E test for feature guard (quota enforcement) - `tests/e2e/feature-guard.spec.ts`

### 🔄 In Progress
- [ ] **Stripe Webhook Tests** - User will handle
  - Convert to real API test (HTTP to wrangler dev) OR fix Miniflare issues
  - Test webhook signature validation
  - Test subscription events (updated, paused, resumed, deleted, trial ending)

- [ ] **Subscription Sync Tests** - User will handle
  - Enhance `tests/e2e/onboarding.spec.ts` to test successful sync
  - Add test for tier/seats update after sync
  - Add database verification

- [ ] **Organization Context Tests** - User will handle
  - Add E2E test for session creation with org context
  - Test organization context in session retrieval
  - Test default org fallback

**Next Steps:**
1. ✅ Add E2E tests for quota enforcement - **DONE**
2. Enhance subscription sync E2E test - **TODO**
3. Add organization context E2E tests - **TODO**
4. Evaluate webhook testing strategy - **TODO**
5. Only then consider deleting broken Miniflare tests

