# Testing Strategy

## Test Pyramid

- **Unit** (`npm run test:unit`)
  - Location: `tests/unit/**`, `src/**/__tests__/**`
  - Environment: Node
  - Goal: Pure business logic and small helpers with mocks/stubs.

- **Worker Integration** (`npm run test:worker`)
  - Location: `tests/integration/**`
  - Environment: Cloudflare Workers via `@cloudflare/vitest-pool-workers`
  - Goal: Exercise route handlers, middleware, and services against D1/KV.
  - Use per-spec fixtures to seed D1/KV, no external Wrangler process.

- **Component/UI** (`npm run test:component`)
  - Location: `src/**/__tests__/**`, `tests/component/**`
  - Environment: JSDOM with Testing Library
  - Goal: Verify Preact components and hooks with minimal mocking.

- **End-to-End** (`npm run test:e2e`)
  - Tooling: Playwright (`tests/e2e/**`)
  - Goal: Full happy-path flows in the browser. Keep the suite small and tag smoke cases.
  - **Backend API Integration**: Tests include authentication flows with external Blawby Backend API

## Running Tests

| Layer            | Command                     | Notes                                           |
|------------------|-----------------------------|-------------------------------------------------|
| Unit             | `npm run test:unit`         | Fast feedback, no Cloudflare worker spin-up.    |
| Worker           | `npm run test:worker`       | Uses Miniflare pool with fresh D1/KV per spec.  |
| Component        | `npm run test:component`    | JSDOM + Testing Library.                        |
| All (unit→worker→component) | `npm run test` | Sequential execution to keep output readable.   |
| End-to-end       | `npm run test:e2e`          | Playwright; requires Vite + Worker dev servers. |

Watch / UI modes:

- `npm run test:watch` → unit tests in watch mode.
- `npm run test:ui` → component tests via Vitest UI.
- `npm run test:coverage` → coverage report for the unit layer.

## Conventions

- Place worker fixtures under `tests/helpers/worker/**`.
- Seed D1 via helper utilities instead of hitting live APIs.
- Prefer feature-focused directories (e.g., `tests/integration/usage/`).
- Keep shell scripts for local smoke checks only; migrate flows into Vitest/Playwright for CI.

## Railway Backend API Testing

### External API Integration
- **Authentication Tests**: E2E tests verify signup/signin flows with Railway Backend API
- **Token Management**: Tests validate JWT token storage and retrieval from IndexedDB
- **API Client**: Unit tests for `backendClient.ts` with real Railway API calls and mocked storage
- **Error Handling**: Tests cover network failures, token expiry, and API errors

### Test Data Management
- **User Accounts**: E2E tests create temporary user accounts via Railway backend API
- **Cleanup**: Tests clean up test data after completion using `tests/helpers/auth-cleanup.ts`
- **Isolation**: Each test uses unique email addresses with pattern `test-{timestamp}-{random}@blawby-test.com`
- **Real API**: Unit tests use real Railway API calls, not mocks (following user preference)

### Test Patterns by Layer

#### Unit Tests (Node Environment)
- **Location**: `tests/unit/lib/backendClient.test.ts`
- **Pattern**: Real Railway API + Mocked IndexedDB storage
- **Mocking**: Only IndexedDB functions are mocked using `vi.mock()`
- **Cleanup**: Automatic cleanup via `afterEach` hooks

#### Integration Tests (JSDOM Environment)  
- **Location**: `tests/integration/auth/AuthContext.integration.test.ts`
- **Pattern**: Real Railway API + Mocked IndexedDB + Real AuthContext
- **Testing**: Full auth flow with context state management
- **Cleanup**: Automatic cleanup via `afterEach` hooks

#### E2E Tests (Real Browser)
- **Location**: `tests/e2e/auth.spec.ts`, `tests/e2e/indexeddb-storage.spec.ts`
- **Pattern**: Real Railway API + Real IndexedDB in browser
- **Testing**: Full user flows with real browser storage
- **Cleanup**: Automatic cleanup via `afterEach` hooks

### IndexedDB Testing Strategy
- **Unit Tests**: Mock IndexedDB functions (no real browser APIs in Node)
- **E2E Tests**: Use `page.evaluate()` to access real IndexedDB in browser
- **Integration Tests**: Mock IndexedDB for faster execution

### Authentication Flow Testing
```typescript
// Example E2E test structure
test('should store JWT token in IndexedDB after signup', async ({ page }) => {
  // 1. Navigate to auth page
  // 2. Fill signup form with unique email
  // 3. Submit and verify Railway API call
  // 4. Check token storage in IndexedDB via page.evaluate()
  // 5. Verify user profile display
  // 6. Clean up test data automatically
});
```

### Cleanup Strategy
- **Test Email Pattern**: `test-{timestamp}-{random}@blawby-test.com`
- **Cleanup Helper**: `tests/helpers/auth-cleanup.ts` handles user deletion
- **Manual Cleanup**: May be required if Railway backend lacks user deletion endpoint
- **Batch Cleanup**: Support for cleaning multiple users at once

### Railway API Configuration
- **Production URL**: `https://blawby-backend-production.up.railway.app/api`
- **Development Override**: `VITE_BACKEND_API_URL` environment variable
- **Test Timeouts**: Increased to 15 seconds for real API calls
- **Error Handling**: Tests cover 400, 401, 500 responses from Railway API
