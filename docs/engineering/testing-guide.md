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
  - **Personal Organization Validation**: After testing Better Auth signup, all tests must verify that a personal organization was created with correct metadata:
    - `is_personal = 1` in the organizations table
    - `subscription_tier = 'free'` in the organizations table
    - `subscription_status = NULL` (maps to `'none'` via `normalizeSubscriptionStatus`)
    - `kind = 'personal'` (computed via `deriveKind`)
    - Owner membership exists in the members table with `role = 'owner'`
    - `/api/organizations/me` returns the personal org with `kind: 'personal'` and `subscriptionStatus: 'none'`

- **Component/UI** (`npm run test:component`)
  - Location: `src/**/__tests__/**`, `tests/component/**`
  - Environment: JSDOM with Testing Library
  - Goal: Verify Preact components and hooks with minimal mocking.

- **End-to-End** (`npm run test:e2e`)
  - Tooling: Playwright (`tests/e2e/**`)
  - Goal: Full happy-path flows in the browser. Keep the suite small and tag smoke cases.
  - **Setup Requirements**:
    - `BETTER_AUTH_SECRET` must be set in `.dev.vars` (see setup below)
    - Worker must be running on `http://localhost:8787`
    - Frontend must be running on `http://localhost:5173`
  - **Personal Organization Validation**: After signup or authentication, tests must verify personal org metadata:
    - Call `/api/organizations/me` via `page.evaluate` to fetch organizations
    - Assert exactly one organization exists with `kind: 'personal'` and `subscriptionStatus: 'none'`
    - See `tests/e2e/auth.spec.ts` for examples of personal org validation after signup
    - See `tests/e2e/helpers/createTestUser.ts` for reusable test user creation
  - **Better Auth API Patterns**:
    - Use relative URLs (`/api/*`) to leverage Vite proxy (maintains cookies/session state)
    - Use `credentials: 'include'` in fetch calls to ensure cookies are sent
    - For POST requests to Better Auth endpoints, include `Content-Type: application/json` header and JSON body (even if empty `{}`)
    - Use `waitForSessionState` helper to poll `/api/auth/get-session` until session state matches expected condition
    - Sign-out requests must include `Content-Type: application/json` header and `body: JSON.stringify({})`

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

## Setup for E2E Tests

### Required Configuration

1. **Better Auth Secret**: E2E tests require `BETTER_AUTH_SECRET` to be configured in `.dev.vars`:
   ```bash
   # Add to .dev.vars (required for tests to use D1, not memory adapter)
   BETTER_AUTH_SECRET=your-secret-key-here-minimum-32-characters
   BETTER_AUTH_URL=http://localhost:8787
   ```

2. **CI Setup**: In CI, set `BETTER_AUTH_SECRET` as an environment variable:
   ```bash
   # GitHub Actions example
   wrangler secret put BETTER_AUTH_SECRET
   ```

3. **Global Setup**: Playwright's global setup (`tests/e2e/global-setup.ts`) verifies:
   - Worker health endpoint is accessible
   - Better Auth secret is configured
   - Default organization is seeded (if needed)

### Test User Helpers

Use `tests/e2e/helpers/createTestUser.ts` for stable test identities:
- `createTestUser(page)` - Creates authenticated test user
- `verifyPersonalOrg(page)` - Verifies personal organization exists

### Session State Helpers

Use `waitForSessionState` helper in `tests/e2e/auth.spec.ts` for reliable session verification:
- Polls `/api/auth/get-session` until a predicate function returns true
- Handles async session state changes (sign-in, sign-out)
- Configurable timeout and poll interval
- Example: Wait for session to be authenticated after sign-in, or wait for session to be cleared after sign-out

### Test Cleanup

Use `tests/e2e/helpers/resetTestUsers.ts` to clean up test accounts:
- Prevents test databases from accumulating test accounts
- Currently placeholder - implement admin endpoint for user deletion

## Conventions

- Place worker fixtures under `tests/helpers/worker/**`.
- Seed D1 via helper utilities instead of hitting live APIs.
- Prefer feature-focused directories (e.g., `tests/integration/usage/`).
- Keep shell scripts for local smoke checks only; migrate flows into Vitest/Playwright for CI.
- **E2E tests must assert through API endpoints** (`/api/organizations/me`, `/api/organizations/active`) rather than peeking at the database directly.
- **Session State Verification**: Use the `waitForSessionState` helper to poll for session state changes instead of fixed timeouts.
- **Active Organization**: The system automatically sets `active_organization_id` in sessions when organizations are fetched. Tests can verify this via `/api/organizations/active` endpoint.
- **Better Auth Endpoints**: The worker's `validateRequest` middleware skips Content-Type validation for `/api/auth/*` endpoints, allowing Better Auth to handle its own validation.
