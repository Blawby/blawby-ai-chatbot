# Authentication Architecture & Environment Configuration

## Scope

This document describes the current authentication architecture for `blawby-ai-chatbot`.

System boundaries:
- Frontend (Preact/Vite, Cloudflare Pages): `src/*`
- Worker API (Cloudflare Worker): `worker/*`
- Remote backend API (Better Auth + core APIs): configured via `VITE_BACKEND_API_URL` / `BACKEND_API_URL`

Source-of-truth contracts:
- Worker route ownership: `worker/index.ts` and `worker/routes/*.ts`
- Frontend URL resolution: `src/config/urls.ts`
- Remote backend API contract: `https://staging-api.blawby.com/llms.txt`

## High-Level Flow

1. Frontend calls auth and app endpoints on the same origin (`/api/*`).
2. Worker handles local routes (conversations, AI, widget bootstrap, files) and proxies remote routes.
3. Auth endpoints (`/api/auth/*`) are proxied by Worker to `${BACKEND_API_URL}/api/auth/*`.
4. Better Auth sets/reads the session cookie; Worker rewrites cookie domain for the current host when proxying auth responses.
5. Frontend session consumers use canonical session shape from `src/shared/lib/authClient.ts`.

## Routing Rules

Cloudflare Pages redirects (`public/_redirects`) must include:

```text
/api/*                  /api/:splat                         200
/__better-auth__/*      /__better-auth__/:splat             200
/*                      /index.html                         200
```

Notes:
- `/api/*` is always Worker-owned.
- `__better-auth__` is preserved for Better Auth compatibility paths.
- SPA fallback (`/* -> /index.html`) must remain last.

## Canonical Session Contract

Canonical frontend session type:
- `AuthSessionPayload = { session: BackendSession; user: BackendSessionUser } | null`
- Defined in `src/shared/types/user.ts`

Canonical session user contract is snake_case at the app boundary:
- `is_anonymous`
- `onboarding_complete`
- `primary_workspace`
- `practice_id`
- `active_practice_id`
- `active_organization_id`
- `stripe_customer_id`
- `last_login_method`
- `email_verified`

Rule:
- CamelCase fields from SDK/backends are normalization input only, not canonical app-facing session fields.

## Frontend Auth Boundary

File: `src/shared/lib/authClient.ts`

Key behavior:
- Uses Better Auth client with `credentials: 'include'`.
- Auth base URL is Worker same-origin (`getWorkerApiUrl()`), not direct backend calls from browser.
- `useSession()` and `getSession()` both return normalized `AuthSessionPayload`.
- `unwrapSessionData()` is the only place that tolerates raw response variance and maps camelCase to canonical snake_case.

Normalization examples currently handled:
- `isAnonymous -> is_anonymous`
- `onboardingComplete -> onboarding_complete`
- `primaryWorkspace -> primary_workspace`
- `practiceId -> practice_id`
- `activePracticeId -> active_practice_id`
- `activeOrganizationId -> active_organization_id`
- `stripeCustomerId -> stripe_customer_id`
- `emailVerified -> email_verified`
- `lastLoginMethod -> last_login_method`

## Session Consumption in App

File: `src/shared/contexts/SessionContext.tsx`

SessionContext reads canonical snake_case fields only and derives:
- `isAnonymous`
- `stripeCustomerId`
- `activePracticeId`

No session-shape probing is allowed outside the auth boundary.

## Worker Auth Validation

Files:
- `worker/middleware/auth.ts`
- `worker/routes/authProxy.ts`

Behavior:
- Protected Worker routes validate session server-to-server against `${BACKEND_API_URL}/api/auth/get-session`.
- Session validation timeout is 3000ms (`AUTH_TIMEOUT_MS`).
- Worker parses Better Auth session payload and extracts user/session context used by Worker business logic.
- Auth proxy rewrites `Set-Cookie` domain to the request host’s base domain where applicable.

## Widget Bootstrap Auth Path

Files:
- Worker: `worker/routes/widget.ts`
- Frontend hook: `src/shared/hooks/useWidgetBootstrap.ts`

Behavior:
1. Frontend calls `/api/widget/bootstrap?slug=...`.
2. Worker attempts to resolve existing session (`/api/auth/get-session`); if absent, it performs anonymous sign-in (`/api/auth/sign-in/anonymous`).
3. Worker returns bootstrap payload with canonical `session` envelope (`{ user, session }`) and widget auth tokens.
4. Frontend stores widget token state, then calls `getSession()` to sync Better Auth client state, then dispatches `auth:session-updated`.

Contract expectations:
- Widget bootstrap session is typed as `AuthSessionPayload`.
- Anonymous checks use `user.is_anonymous === true` (strict, no fallback guessing).

## Environment Configuration

### Frontend (Pages / Vite)

Required:

```bash
VITE_BACKEND_API_URL=https://staging-api.blawby.com
```

Optional overrides:

```bash
VITE_WORKER_API_URL=http://localhost:8787
VITE_APP_BASE_URL=http://localhost:5173
VITE_PUBLIC_APP_URL=http://localhost:5173
VITE_APP_URL=http://localhost:5173
```

Notes:
- In browser runtime, Worker base URL defaults to `window.location.origin`.
- `VITE_BACKEND_API_URL` is required for backend-origin operations and validations.

### Worker (Cloudflare Worker)

Required:

```bash
BACKEND_API_URL=https://staging-api.blawby.com
```

Notes:
- Set non-secret vars in `worker/wrangler.toml` env blocks.
- Store secrets in `worker/.dev.vars` (local) or Cloudflare secrets.

## Operational Rules

- Frontend and Worker must point at the same backend environment for session validity.
- Do not add legacy session aliases in app code.
- Do not add fallback session shape parsing outside `authClient.ts`.
- Surface backend auth errors; do not silently mask auth failures.

## Primary Files

- `src/shared/lib/authClient.ts`
- `src/shared/types/user.ts`
- `src/shared/contexts/SessionContext.tsx`
- `src/shared/hooks/useWidgetBootstrap.ts`
- `src/config/urls.ts`
- `worker/index.ts`
- `worker/middleware/auth.ts`
- `worker/routes/authProxy.ts`
- `worker/routes/widget.ts`
- `public/_redirects`
