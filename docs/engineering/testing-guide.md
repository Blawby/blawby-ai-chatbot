# Testing Strategy

## Philosophy

Our testing strategy follows a pragmatic approach that maximizes confidence while minimizing maintenance burden:

- **E2E tests are our integration tests for HTTP endpoints** - They test real user workflows with actual Wrangler environment
- **Integration tests focus on internal logic** - Business rules, webhooks, and components not exposed via HTTP
- **Unit tests verify pure logic** - Fast feedback for utilities and algorithms with no external dependencies

## Test Pyramid

### End-to-End Tests (`npm run test:e2e`) 🎯 **PRIMARY**

**Purpose**: Full user workflows through the browser with real Wrangler environment

**Location**: `tests/e2e/**`

**Environment**: Playwright + Wrangler Dev

**What to test**:
- ✅ User-facing workflows (signup, login, chat, etc.)
- ✅ HTTP API endpoints (authentication, organizations, messages)
- ✅ Critical user paths (onboarding, subscription, feature access)
- ✅ UI interactions and state management
- ✅ Session management and cookie handling
- ✅ Real Better Auth integration with D1

**What NOT to test**:
- ❌ Internal functions not exposed via HTTP (use integration tests)
- ❌ Edge cases that are slow to set up (use integration tests)
- ❌ Pure utility functions (use unit tests)

**Setup Requirements**:
- `BETTER_AUTH_SECRET` must be set in `.dev.vars` (minimum 32 characters)
- Worker must be running on `http://localhost:8787`
- Frontend must be running on `http://localhost:5173`

**Key Patterns**:
- Use relative URLs (`/api/*`) to leverage Vite proxy (maintains cookies/session state)
- Use `credentials: 'include'` in fetch calls to ensure cookies are sent
- Include `Content-Type: application/json` header for POST requests to Better Auth
- Use `waitForSessionState` helper to poll for async session changes
- Verify outcomes through API endpoints (`/api/organizations/me`), not direct DB queries
- For Bearer token tests, test token storage in IndexedDB and automatic inclusion in headers

**Personal Organization Validation**:
After signup or authentication, tests must verify personal org metadata:
- Call remote API endpoint for organizations (organization management is handled by remote API)
- Assert exactly one organization exists with `kind: 'personal'` and `subscriptionStatus: 'none'`
- Note: Auth/organization management E2E tests removed (handled by remote API)
- Use remote API test helpers for reusable test user creation

**Examples**:
```typescript
// Good: E2E test for user workflow
test('user can sign up and create account', async ({ page }) => {
  await page.goto('/auth');
  await page.fill('[data-testid="signup-email-input"]', 'test@example.com');
  await page.fill('[data-testid="signup-password-input"]', 'password123');
  await page.click('[data-testid="signup-submit-button"]');
  
  // Verify personal org was created
  const orgs = await page.evaluate(async () => {
    const res = await fetch('/api/organizations/me', { credentials: 'include' });
    return res.json();
  });
  
  expect(orgs).toHaveLength(1);
  expect(orgs[0].kind).toBe('personal');
});
```

### Testing Better Auth Client & API Configuration

**Purpose**: Test the new Bearer token authentication and automatic API client setup

**Location**: `tests/e2e/auth-client.test.ts`

**Environment**: Playwright with IndexedDB access

**What to test**:
- ✅ Token storage in IndexedDB after successful authentication
- ✅ Automatic Bearer token inclusion in API requests via axios interceptors
- ✅ Token retrieval and refresh mechanisms
- ✅ Organization switching with token updates
- ✅ Session management with `useSession()` hook
- ✅ Error handling for expired/invalid tokens

**Key Patterns**:
```typescript
// Test token storage in IndexedDB
test('auth token is stored in IndexedDB after login', async ({ page }) => {
  await page.goto('/auth');
  // ... login actions
  
  // Verify token in IndexedDB
  const token = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('blawby_auth');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const token = await new Promise((resolve) => {
      const transaction = db.transaction(['tokens'], 'readonly');
      const store = transaction.objectStore('tokens');
      const request = store.get('bearer_token');
      request.onsuccess = () => resolve(request.result);
    });
    
    return token;
  });
  
  expect(token).toBeTruthy();
});

// Test automatic Bearer token inclusion
test('API calls include Bearer token automatically', async ({ page }) => {
  await page.goto('/auth');
  // ... login actions
  
  // Capture outgoing request and verify Authorization header
  let capturedRequest: Request | undefined;
  page.on('request', request => {
    if (request.url().includes('/api/practice/list')) {
      capturedRequest = request;
    }
  });
  
  // Trigger API call
  await page.evaluate(async () => {
    await fetch('/api/practice/list', {
      headers: { 'Content-Type': 'application/json' }
    });
  });
  
  // Wait for request to be captured
  await page.waitForTimeout(100);
  
  // Verify the Authorization header on the outgoing request
  expect(capturedRequest).toBeDefined();
  expect(capturedRequest?.headers()['authorization']).toMatch(/^Bearer /);
});
```

---

### Integration Tests (`npm run test:worker`) 🔧 **SECONDARY**

**Purpose**: Test internal business logic, webhooks, and middleware not exposed via HTTP

**Location**: `tests/integration/**`

**Environment**: Cloudflare Workers via `@cloudflare/vitest-pool-workers` with Miniflare

**What to test**:
- ✅ Quota enforcement middleware (feature guards)
- ✅ Internal service functions using D1/KV (not called via HTTP)
- ✅ Background jobs or scheduled workers
- ✅ Edge cases too slow to test in E2E
- ✅ Database operations not covered by user workflows
- ✅ Chatbot functionality (agent, sessions, files, analyze)

**What NOT to test**:
- ❌ HTTP endpoints with user workflows (use E2E tests)
- ❌ Authentication flows (handled by remote API)
- ❌ Organization/subscription management (handled by remote API)
- ❌ Stripe webhooks (handled by remote API)
- ❌ Features already fully covered by E2E
- ❌ Pure functions with no dependencies (use unit tests)

**Setup**:
- Environment variables configured via `vitest.config.worker.ts` bindings
- Per-spec fixtures seed D1/KV with test data
- No external Wrangler process required (uses Miniflare)

**Personal Organization Validation**:
After testing Better Auth signup, verify personal organization metadata:
- `is_personal = 1` in organizations table
- `subscription_tier = 'free'`
- `subscription_status = NULL` (maps to `'none'`)
- `kind = 'personal'` (computed via `deriveKind`)
- Owner membership exists with `role = 'owner'`

**Examples**:
```typescript
// Good: Integration test for internal middleware
test('requireFeature blocks request when quota exceeded', async () => {
  const db = env.DB;
  
  // Setup: User with exceeded quota
  await db.exec(`
    INSERT INTO users (id, email) VALUES ('user-1', 'test@example.com');
    INSERT INTO organizations (id, subscription_tier) VALUES ('org-1', 'free');
    INSERT INTO usage_tracking (organization_id, messages_count) 
    VALUES ('org-1', 1000); -- Free tier limit
  `);
  
  // Test: Request should be blocked
  const response = await handleRequest(
    new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-token' },
      body: JSON.stringify({ message: 'test' })
    }),
    env,
    ctx
  );
  
  expect(response.status).toBe(402);
});

// Good: Integration test for webhook handler
test('stripe webhook updates subscription tier', async () => {
  const webhookEvent = {
    type: 'customer.subscription.updated',
    data: { object: { /* subscription data */ } }
  };
  
  const response = await handleStripeWebhook(webhookEvent, env);
  
  // Verify DB was updated
  const org = await env.DB.prepare(
    'SELECT subscription_tier FROM organizations WHERE id = ?'
  ).bind('org-1').first();
  
  expect(org.subscription_tier).toBe('business');
});
```

---

### Unit Tests (`npm run test:unit`) ⚡ **TERTIARY**

**Purpose**: Fast feedback for pure business logic and utilities

**Location**: `tests/unit/**`, `src/**/__tests__/**`

**Environment**: Node.js (no Cloudflare bindings)

**What to test**:
- ✅ Pure functions and utilities
- ✅ Validation logic (email, passwords, etc.)
- ✅ Data transformations and formatting
- ✅ Business logic with no external dependencies
- ✅ Complex algorithms or calculations

**What NOT to test**:
- ❌ Functions that use D1/KV/R2 (use integration tests)
- ❌ HTTP endpoints (use E2E tests)
- ❌ Anything requiring Cloudflare environment

**Examples**:
```typescript
// Good: Unit test for pure function
import { validateEmail } from '@/utils/validation';

test('validateEmail accepts valid email', () => {
  expect(validateEmail('test@example.com')).toBe(true);
});

test('validateEmail rejects invalid email', () => {
  expect(validateEmail('invalid')).toBe(false);
});

// Good: Unit test for utility
import { formatCurrency } from '@/utils/formatting';

test('formatCurrency formats USD correctly', () => {
  expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
});
```

---

### Component Tests (`npm run test:component`) 🧩 **AS NEEDED**

**Purpose**: Verify Preact components and hooks in isolation

**Location**: `src/**/__tests__/**`, `tests/component/**`

**Environment**: JSDOM with Testing Library

**What to test**:
- ✅ Component rendering with props
- ✅ User interactions (clicks, form inputs)
- ✅ Hook behavior and state management
- ✅ Component integration without full E2E

**Examples**:
```typescript
import { render, fireEvent } from '@testing-library/preact';
import { SignupForm } from '@/components/SignupForm';

test('signup form validates email', async () => {
  const { getByLabelText, getByText } = render(<SignupForm />);
  
  const emailInput = getByLabelText('Email');
  fireEvent.change(emailInput, { target: { value: 'invalid' } });
  
  expect(getByText('Invalid email')).toBeInTheDocument();
});
```

---

## Decision Matrix

### Should I write this test?

```
┌─────────────────────────────────────────────┐
│ What am I testing?                          │
├─────────────────────────────────────────────┤
│                                             │
│ User workflow or HTTP endpoint?             │
│ └─→ E2E Test (Playwright) ✅               │
│                                             │
│ Internal function with D1/KV?               │
│ Webhook handler?                            │
│ Middleware/guard logic?                     │
│ └─→ Integration Test (Vitest) ✅           │
│                                             │
│ Pure function or utility?                   │
│ Validation logic?                           │
│ Data transformation?                        │
│ └─→ Unit Test (Vitest) ✅                  │
│                                             │
│ Component rendering or interaction?         │
│ └─→ Component Test (Testing Library) ✅    │
│                                             │
│ Already covered by E2E?                     │
│ └─→ Don't duplicate! ❌                    │
│                                             │
└─────────────────────────────────────────────┘
```

### Is this test redundant?

**Delete if**:
- ❌ E2E test already covers the same HTTP endpoint
- ❌ Integration test duplicates E2E user workflow
- ❌ Test provides no unique value over existing coverage

**Keep if**:
- ✅ Tests internal function not exposed via HTTP
- ✅ Tests edge cases too slow for E2E
- ✅ Tests webhook or background job
- ✅ Provides unique coverage E2E can't reach

---

## Running Tests

| Layer            | Command                     | Notes                                           |
|------------------|-----------------------------|-------------------------------------------------|
| E2E              | `npm run test:e2e`          | **Start here** - Primary test suite             |
| Integration      | `npm run test:worker`       | Uses Miniflare with fresh D1/KV per spec        |
| Unit             | `npm run test:unit`         | Fast feedback, no Cloudflare worker spin-up     |
| Component        | `npm run test:component`    | JSDOM + Testing Library                         |
| All (unit→worker→component) | `npm run test` | Sequential execution for readable output        |

**Watch / UI modes**:
- `npm run test:watch` → unit tests in watch mode
- `npm run test:ui` → component tests via Vitest UI
- `npm run test:coverage` → coverage report for unit layer
- `npm run test:e2e:ui` → Playwright UI mode for E2E debugging

---

## Setup for E2E Tests

### Required Configuration

1. **Better Auth Secret**: E2E tests require `BETTER_AUTH_SECRET` in `.dev.vars`:
   ```bash
   # .dev.vars (required for D1 adapter, minimum 32 characters)
   BETTER_AUTH_SECRET=your-secret-key-here-minimum-32-characters
   BETTER_AUTH_URL=http://localhost:8787
   ```

   Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. **CI Setup**: Set environment variable in CI:
   ```yaml
   # GitHub Actions example
   env:
     BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
   ```

3. **Global Setup**: Playwright's global setup (`tests/e2e/global-setup.ts`) verifies:
   - Worker health endpoint is accessible
   - Better Auth secret is configured
   - Default organization is seeded (if needed)

### Test Helpers

**User Management**:
- `tests/e2e/helpers/createTestUser.ts` - Create authenticated test users
- `tests/e2e/helpers/resetTestUsers.ts` - Clean up test accounts

**Session Verification**:
- `waitForSessionState(page, predicate)` - Poll `/api/auth/get-session` until condition met
- Handles async session state changes (sign-in, sign-out)
- Example: Wait for session to be authenticated after sign-in

**Organization Verification**:
- `verifyPersonalOrg(page)` - Verify personal organization exists with correct metadata
- Use after signup or authentication flows

---

## Conventions

### File Organization

- **E2E tests**: `tests/e2e/**` - User workflows, organized by feature
- **Integration tests**: `tests/integration/**` - Internal logic, organized by component
- **Unit tests**: `tests/unit/**` or `src/**/__tests__/**` - Utilities and pure functions
- **Helpers**: `tests/helpers/**` - Shared fixtures and utilities

### Test Data

- **E2E**: Use helper functions to create test users (e.g., `createTestUser()`)
- **Integration**: Seed D1/KV via helper utilities, not live APIs
- **Unit**: Mock all external dependencies

### Assertions

- **E2E**: Assert through API endpoints (`/api/organizations/me`), not direct DB queries
- **Integration**: Can query DB directly for internal logic verification
- **Unit**: Assert on return values and function behavior

### Naming

- **E2E**: Describe user actions - "user can sign up and create account"
- **Integration**: Describe component behavior - "requireFeature blocks request when quota exceeded"
- **Unit**: Describe function behavior - "validateEmail accepts valid email"

### Anti-Patterns

❌ **Don't duplicate E2E coverage with integration tests**:
```typescript
// Bad: Integration test for HTTP endpoint
test('POST /api/auth/sign-up creates user', async () => {
  const response = await handleRequest(...);
  expect(response.status).toBe(200);
});

// Good: E2E test for same functionality
test('user can sign up', async ({ page }) => {
  await page.goto('/auth');
  // ... fill form and submit
});
```

❌ **Don't use E2E for internal logic**:
```typescript
// Bad: E2E test for internal function
test('quota calculation is correct', async ({ page }) => {
  // Complex setup to trigger internal calculation
});

// Good: Integration test for internal function
test('calculateQuotaUsage returns correct count', async () => {
  const usage = await calculateQuotaUsage(env, orgId);
  expect(usage).toBe(42);
});
```

❌ **Don't use unit tests for D1/KV integration**:
```typescript
// Bad: Unit test that requires D1
test('getUserById queries database', async () => {
  const user = await getUserById(db, 'user-1'); // db is undefined!
});

// Good: Integration test with D1
test('getUserById queries database', async () => {
  const db = env.DB; // Real D1 binding
  const user = await getUserById(db, 'user-1');
  expect(user).toBeDefined();
});
```

---

## Test Coverage Strategy

### Primary Coverage: E2E Tests

Focus E2E tests on:
1. **Critical user paths** - Signup, login, core features
2. **Happy paths** - Main workflows users take
3. **Common error cases** - Invalid input, auth errors
4. **Integration points** - Auth, subscriptions, organizations

### Secondary Coverage: Integration Tests

Add integration tests for:
1. **Quota enforcement** - Feature guards, usage limits
2. **Webhooks** - Stripe events, external triggers
3. **Background jobs** - Scheduled tasks, cleanup
4. **Edge cases** - Scenarios too slow for E2E

### Tertiary Coverage: Unit Tests

Add unit tests for:
1. **Utilities** - Validation, formatting, calculations
2. **Business logic** - Complex algorithms, transformations
3. **Edge cases** - Many scenarios to verify quickly

---

## Troubleshooting

### E2E Tests Failing

**Symptom**: Connection errors or timeout

**Solutions**:
1. Ensure `wrangler dev` is running on `http://localhost:8787`
2. Ensure frontend dev server is running on `http://localhost:5173`
3. Check `.dev.vars` contains `BETTER_AUTH_SECRET` (32+ characters)
4. Verify worker health: `curl http://localhost:8787/health`

### Integration Tests Failing

**Symptom**: Module resolution errors (Better Auth, jose, etc.)

**Solutions**:
1. Check if test should be E2E instead (tests HTTP endpoint?)
2. If testing internal function, ensure using Miniflare bindings correctly
3. Verify environment variables in `vitest.config.worker.ts`
4. Consider moving to E2E if testing auth-related functionality

### Unit Tests Failing

**Symptom**: Import errors or undefined bindings

**Solutions**:
1. Verify no Cloudflare bindings (D1, KV, R2) are used
2. Mock all external dependencies
3. Check test setup file (`tests/setup-unit.ts`)

---

## Migration Guide

### From Integration to E2E

If an integration test covers an HTTP endpoint:

**Before** (Integration):
```typescript
test('signup creates user', async () => {
  const response = await handleRequest(
    new Request('http://localhost/api/auth/sign-up/email', { ... }),
    env,
    ctx
  );
  expect(response.status).toBe(200);
});
```

**After** (E2E):
```typescript
test('user can sign up', async ({ page }) => {
  await page.goto('/auth');
  await page.fill('[data-testid="signup-email"]', 'test@example.com');
  await page.click('[data-testid="signup-submit"]');
  await expect(page.locator('text=/Account created/')).toBeVisible();
});
```

### From E2E to Integration

If an E2E test is slow due to internal logic:

**Before** (E2E):
```typescript
test('user hits quota limit', async ({ page }) => {
  // Complex setup: Create user, set quota, send many messages...
  // This is slow in E2E
});
```

**After** (Integration + E2E):
```typescript
// Integration: Test the logic
test('requireFeature blocks when quota exceeded', async () => {
  // Fast: Direct DB setup and function call
});

// E2E: Test user experience
test('user sees quota exceeded message', async ({ page }) => {
  // Simple: Navigate, see error message
});
```

---

## Summary

- **E2E tests are your integration tests for HTTP endpoints** - Use Playwright + Wrangler for user workflows
- **Integration tests focus on internal logic** - Use Miniflare for business rules, webhooks, middleware
- **Unit tests verify pure logic** - Fast feedback for utilities and algorithms
- **Don't duplicate coverage** - If E2E covers it, don't write an integration test
- **Test at the right level** - User workflows → E2E, Internal logic → Integration, Pure functions → Unit

**Remember**: Your E2E test with Playwright + Wrangler IS your integration test for HTTP endpoints. Integration tests are for internal components that E2E can't reach.