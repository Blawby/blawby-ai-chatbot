# Authentication Architecture & Environment Configuration

## Overview

This document explains the authentication architecture, recent changes, and how to configure environment variables for local development and production.

## Architecture

### Authentication Flow

```
┌─────────────┐     1. Sign in      ┌─────────────────┐
│   Frontend  │ ──────────────────> │   Better Auth   │
│  (Preact)   │ <────────────────── │  (Node.js API)  │
└─────────────┘     2. Set cookie  └─────────────────┘
       │                                    │
       │ 3. Browser stores session cookie  │
       │                                    │
       │ 4. Send cookie with API requests  │
       ▼                                    │
┌──────────────────────────────────────────┴──────────┐
│              Cloudflare Worker                       │
│  ┌──────────────┐     5. Validate    ┌───────────┐  │
│  │ Auth         │ ──────────────────>│ Better    │  │
│  │ Middleware   │ <──────────────────│ Auth API  │  │
│  └──────────────┘     6. Get user ID └───────────┘  │
│         │                                            │
│         │ 7. User ID (UUID)                         │
│         ▼                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ Worker Business Logic (conversations, etc.)   │   │
│  │ - Uses user.id for database queries           │   │
│  │ - Doesn't care HOW auth happened              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Key Principles

1. **Better Auth handles authentication** - Sign-in, sign-up, OAuth, session issuance
2. **Frontend stores session** - Session cookie stored by the browser after successful auth
3. **Worker validates session** - Makes server-to-server call to Better Auth API to validate
4. **Business logic is auth-agnostic** - Worker only needs `user.id` (UUID) from middleware

### Why This Architecture?

- **Separation of concerns**: Better Auth handles all auth complexity, Worker focuses on business logic
- **Security**: Tokens validated server-side, not trusted from client
- **Scalability**: Worker can scale independently of auth server
- **Flexibility**: Can swap auth providers without changing Worker code

## Recent Changes

### Problem

The Worker was failing to authenticate requests because:
1. Frontend was using `localhost:3000` (local backend)
2. Worker was defaulting to `staging-api.blawby.com` (staging backend) instead of following the configured remote API URL
3. Tokens from local backend don't exist in staging database

### Solution

1. **Removed hardcoded URL from `wrangler.toml`**
   - Previously: `BACKEND_API_URL = "https://staging-api.blawby.com"` forced every request to staging
   - Now: Worker reads `BACKEND_API_URL` from `worker/wrangler.toml` (env vars) or Cloudflare environment variables so the backend URL can match whatever the frontend is configured to use

2. **Use `worker/.dev.vars` for local secrets**
   - Keep secrets in `worker/.dev.vars` (git-ignored)
   - Non-secret config like `BACKEND_API_URL` lives in `worker/wrangler.toml`

3. **Improved session validation**
   - Better error handling for Better Auth API responses
   - Handles both wrapped (`{ data: { user, session } }`) and unwrapped (`{ user, session }`) formats
   - Removed verbose debug logs (production-ready)

4. **Code cleanup**
   - Removed unnecessary console.log statements
   - Kept only critical error logs
   - Fixed lint errors

## Environment Variables

### Frontend (Vite)

**Location**: `.env` (root directory)

**Required Variables**:
```bash
# Backend API URL (Better Auth/remote API server)
# - Development: http://localhost:3000 (custom backend) or https://staging-api.blawby.com
# - Production: https://production-api.blawby.com
VITE_BACKEND_API_URL=http://localhost:3000
```

**Optional Variables**:
```bash
# Worker API URL (usually auto-detected)
# Only set if you need to override the default
VITE_WORKER_API_URL=http://localhost:8787

# Enable Mock Service Worker (for frontend mocking)
VITE_ENABLE_MSW=true
```

### Worker (Cloudflare)

**Location**: `worker/wrangler.toml` ([env.dev.vars] for local development)

**Required Variables**:
```bash
# Backend API URL (Better Auth/remote API server)
# Must match VITE_BACKEND_API_URL in frontend for the same environment
BACKEND_API_URL=http://localhost:3000
```

**Production Configuration**:
- Set via Cloudflare Dashboard: Workers & Pages → Settings → Variables
- Or use `npx wrangler secret put BACKEND_API_URL` for sensitive values
- Or set in `wrangler.toml` under `[env.production.vars]` for non-sensitive values

**Note**: `worker/.dev.vars` is git-ignored and should contain secrets only. Non-sensitive config belongs in `worker/wrangler.toml`.

## Setup Instructions

### For Local Development

1. **Start the Backend API** (Better Auth server)
   ```bash
   # In blawby-ts directory
   npm run dev
   # Should be running on http://localhost:3000
   ```

2. **Configure Frontend Environment**
   ```bash
   # In blawby-ai-chatbot root directory
   # Create or update .env
   echo "VITE_BACKEND_API_URL=http://localhost:3000" > .env
   ```

3. **Configure Worker Environment**
   ```bash
   # In blawby-ai-chatbot/worker directory
   # Set BACKEND_API_URL in worker/wrangler.toml under [env.dev.vars]
   ```

4. **Start Development Servers**
   ```bash
   # In blawby-ai-chatbot root directory
   npm run dev:full
   # This starts both frontend (localhost:5173) and worker (localhost:8787)
   ```

### For Production

1. **Frontend (Cloudflare Pages)**
   - Go to Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables
   - Add: `VITE_BACKEND_API_URL=https://production-api.blawby.com`

2. **Worker (Cloudflare Workers)**
   - Option 1: Set in `wrangler.toml` under `[env.production.vars]`:
     ```toml
     [env.production.vars]
     BACKEND_API_URL = "https://production-api.blawby.com"
     ```
   - Option 2: Use Cloudflare Dashboard → Workers & Pages → Settings → Variables
- Option 3: Use `npx wrangler secret put BACKEND_API_URL` (for sensitive values)

### Important Notes

1. **URL Consistency**: `VITE_BACKEND_API_URL` (frontend) and `BACKEND_API_URL` (worker) must point to the **same backend** in the same environment so both sides hit the remote API that issued the session cookies
   - Local dev: Both should target `http://localhost:3000` (or another local backend you configure)
   - Staging: Both should target `https://staging-api.blawby.com`
   - Production: Both should target `https://production-api.blawby.com`

2. **Session Validity**: Sessions are only valid for the backend that issued them. Keep the configured remote API URL (via `VITE_BACKEND_API_URL`/`BACKEND_API_URL`) consistent across frontend and worker, otherwise the Worker will reject sessions issued by a different backend.

3. **File Locations**:
   - Frontend: `.env` (root directory)
   - Worker: `worker/wrangler.toml` ([env.dev.vars] for local dev)

## Code Structure

### Frontend Authentication

**File**: `src/shared/lib/authClient.ts`

- Creates Better Auth client configured for cookie-based sessions
- Relies on browser-managed session cookies after sign-in/sign-up
- Sends cookies with API requests via `credentials: 'include'`
- Uses `getBackendApiUrl()` from `src/config/urls.ts` for base URL

### Worker Authentication

**File**: `worker/middleware/auth.ts`

- `requireAuth()`: Validates session cookie, throws 401 if invalid
- `optionalAuth()`: Validates session cookie, returns null if missing/invalid
- `validateSessionWithRemoteServer()`: Makes HTTP call to Better Auth API
- Uses `env.BACKEND_API_URL` to determine which backend to call

### Session Validation Flow

1. Frontend sends request with session cookie
2. Worker forwards cookie to the auth server
3. Worker calls `${BACKEND_API_URL}/api/auth/get-session` with the cookie
4. Better Auth validates session and returns user data
5. Worker extracts `user.id` and passes to business logic

### Anonymous-to-Authenticated Conversation Linking

Better Auth anonymous sessions do not automatically link conversations to a real user account. The app must call the link endpoint after authentication.

**How it works**
1. Anonymous chat creates a conversation with `user_id = null` and the anonymous user in `participants`.
2. After sign-in, the frontend calls `PATCH /api/conversations/:id/link` with `conversationId` and `practiceId`.
3. The Worker updates `conversations.user_id` and ensures the authenticated user is in `participants`.

**When to call the link endpoint**
- After sign-in completion (email/password, OAuth callback, or account creation).
- Use the active chat route parameters so the correct conversation is linked.
- Repeat calls are safe; the service is idempotent for the same user.

**Relevant code paths**
- Frontend: `src/index.tsx`, `src/app/MainApp.tsx` (linking on authenticated routes), `src/shared/components/AuthForm.tsx`
- Worker: `worker/routes/conversations.ts`, `worker/services/ConversationService.ts`

### Internal Durable Object Endpoints

The ChatRoom Durable Object exposes `/internal/*` endpoints that are only meant to be called via `stub.fetch` from the Worker. These are not public HTTP routes.

**Do not** expose `/internal/*` via Worker routing, proxy rules, or Vite dev proxies. If a new route must forward to a Durable Object, explicitly block `/internal/*` to keep these endpoints internal-only.

## Troubleshooting

### "Authentication required" (401) Error

**Symptoms**: API calls return 401 even with a valid session

**Possible Causes**:
1. **URL Mismatch**: Frontend and Worker pointing to different backends
   - Check: `VITE_BACKEND_API_URL` vs `BACKEND_API_URL`
   - Fix: Ensure both point to same backend

2. **Session from Wrong Backend**: Session issued by different backend than Worker is calling
   - Check: Sign in to correct backend
   - Fix: Clear browser cookies and sign in again

3. **Backend Not Running**: Better Auth server not accessible
   - Check: Can you access `http://localhost:3000/api/auth/get-session`?
   - Fix: Start backend server

### "Forbidden" (403) on Practice Endpoints

**Symptoms**: `/api/practice/:id` returns 403 for signed-in users

**Possible Causes**:
1. **Member-gated endpoint**: The user is not a member of the practice
   - Check: Confirm the user is a member of the organization
   - Fix: Use public endpoints (e.g., `/api/practice/details/:slug`) for unauthenticated/public data, or ensure membership before calling member-only endpoints

### "Auth validation timeout" Error

**Symptoms**: Worker logs show timeout after 3 seconds

**Possible Causes**:
1. **Backend Slow**: Better Auth API taking >3 seconds to respond
   - Check: Backend server logs
   - Fix: Optimize backend or increase timeout in `validateTokenWithRemoteServer()`

2. **Network Issues**: Worker can't reach backend
   - Check: `BACKEND_API_URL` is correct and accessible
   - Fix: Verify network connectivity

### Session Cookie Not Set in Frontend

**Symptoms**: Session cookie missing after sign-in

**Possible Causes**:
1. **Cookie not set by auth server**: response missing `Set-Cookie`
   - Check: Backend Better Auth configuration (session/cookie settings)
   - Fix: Ensure cookie settings are configured correctly for the environment

2. **Cookie blocked by browser**: third-party or same-site restrictions
   - Check: Browser console + Application → Cookies
   - Fix: Confirm domain, SameSite, and Secure flags for the target environment

## Migration Notes

### Before This Change

- `BACKEND_API_URL` was hardcoded in `wrangler.toml`
- No way to override for local development
- Frontend and Worker could point to different backends
- Verbose debug logs in production

### After This Change

- `BACKEND_API_URL` lives in `worker/wrangler.toml` (env vars) with optional overrides via `worker/.dev.vars`
- Frontend and Worker use centralized URL configuration
- Production-ready code with minimal logging
- Clear separation between dev and production configs

## Related Files

- `worker/middleware/auth.ts` - Worker authentication middleware
- `src/shared/lib/authClient.ts` - Frontend Better Auth client
- `src/config/urls.ts` - Centralized URL configuration
- `worker/wrangler.toml` - Worker configuration
- `worker/.dev.vars` - Worker local secrets (git-ignored)
- `.env` - Frontend environment variables (git-ignored)

## References

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Cloudflare Workers Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
