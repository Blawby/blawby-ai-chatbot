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

## Backend API Testing

### External API Integration
- **Authentication Tests**: E2E tests verify signup/signin flows with Blawby Backend API
- **Token Management**: Tests validate JWT token storage and retrieval from IndexedDB
- **API Client**: Unit tests for `backendClient.ts` with mocked API responses
- **Error Handling**: Tests cover network failures, token expiry, and API errors

### Test Data Management
- **User Accounts**: E2E tests create temporary user accounts via backend API
- **Cleanup**: Tests clean up test data after completion
- **Isolation**: Each test uses unique email addresses to avoid conflicts
- **Mocking**: Unit tests mock external API calls for faster execution

### Authentication Flow Testing
```typescript
// Example E2E test structure
test('user profile update after signup', async ({ page }) => {
  // 1. Navigate to auth page
  // 2. Fill signup form with unique email
  // 3. Submit and verify backend API call
  // 4. Check token storage in IndexedDB
  // 5. Verify user profile display
  // 6. Clean up test data
});
```
