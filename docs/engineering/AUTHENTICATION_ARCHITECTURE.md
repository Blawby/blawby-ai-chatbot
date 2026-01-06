# Authentication Architecture & Environment Configuration

## Overview

This document explains the authentication architecture, recent changes, and how to configure environment variables for local development and production.

## Architecture

### Authentication Flow

```
┌─────────────┐     1. Sign in      ┌─────────────────┐
│   Frontend  │ ──────────────────> │   Better Auth   │
│  (Preact)   │ <────────────────── │  (Node.js API)  │
└─────────────┘     2. Get token    └─────────────────┘
       │                                    │
       │ 3. Store token in IndexedDB       │
       │                                    │
       │ 4. Send token with API requests   │
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

1. **Better Auth handles authentication** - Sign-in, sign-up, OAuth, token generation
2. **Frontend stores token** - Bearer token stored in IndexedDB after successful auth
3. **Worker validates token** - Makes server-to-server call to Better Auth API to validate
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
2. Worker was using `staging-api.blawby.com` (staging backend)
3. Tokens from local backend don't exist in staging database

### Solution

1. **Removed hardcoded URL from `wrangler.toml`**
   - Previously: `REMOTE_API_URL = "https://staging-api.blawby.com"` was hardcoded
   - Now: Uses `worker/.dev.vars` for local development

2. **Created `worker/.dev.vars` for local development**
   - Contains `REMOTE_API_URL=http://localhost:3000`
   - Overrides `wrangler.toml` values when running `wrangler dev`

3. **Improved token validation**
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
# Backend API URL (Better Auth server)
# - Development: http://localhost:3000 or https://staging-api.blawby.com
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

**Location**: `worker/.dev.vars` (for local development)

**Required Variables**:
```bash
# Backend API URL (Better Auth server)
# Must match VITE_BACKEND_API_URL in frontend
REMOTE_API_URL=http://localhost:3000
```

**Production Configuration**:
- Set via Cloudflare Dashboard: Workers & Pages → Settings → Variables
- Or use `wrangler secret put REMOTE_API_URL` for sensitive values
- Or set in `wrangler.toml` under `[env.production.vars]` for non-sensitive values

**Note**: `worker/.dev.vars` is git-ignored and only used for local development.

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
   # Create or update .dev.vars
   echo "REMOTE_API_URL=http://localhost:3000" > .dev.vars
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
     REMOTE_API_URL = "https://production-api.blawby.com"
     ```
   - Option 2: Use Cloudflare Dashboard → Workers & Pages → Settings → Variables
   - Option 3: Use `wrangler secret put REMOTE_API_URL` (for sensitive values)

### Important Notes

1. **URL Consistency**: `VITE_BACKEND_API_URL` (frontend) and `REMOTE_API_URL` (worker) must point to the **same backend** in the same environment
   - Local dev: Both should be `http://localhost:3000`
   - Staging: Both should be `https://staging-api.blawby.com`
   - Production: Both should be `https://production-api.blawby.com`

2. **Token Validity**: Tokens are only valid for the backend that issued them. A token from `localhost:3000` won't work with `staging-api.blawby.com` because they have different databases.

3. **File Locations**:
   - Frontend: `.env` (root directory)
   - Worker: `worker/.dev.vars` (worker directory, git-ignored)

## Code Structure

### Frontend Authentication

**File**: `src/shared/lib/authClient.ts`

- Creates Better Auth client with Bearer token plugin
- Stores token in IndexedDB after sign-in/sign-up
- Retrieves token from IndexedDB for API requests
- Uses `getBackendApiUrl()` from `src/config/urls.ts` for base URL

### Worker Authentication

**File**: `worker/middleware/auth.ts`

- `requireAuth()`: Validates Bearer token, throws 401 if invalid
- `optionalAuth()`: Validates Bearer token, returns null if missing/invalid
- `validateTokenWithRemoteServer()`: Makes HTTP call to Better Auth API
- Uses `env.REMOTE_API_URL` to determine which backend to call

### Token Validation Flow

1. Frontend sends request with `Authorization: Bearer <token>` header
2. Worker extracts token from header
3. Worker calls `${REMOTE_API_URL}/api/auth/get-session` with token
4. Better Auth validates token and returns user data
5. Worker extracts `user.id` and passes to business logic

## Troubleshooting

### "Authentication required" (401) Error

**Symptoms**: API calls return 401 even with valid token

**Possible Causes**:
1. **URL Mismatch**: Frontend and Worker pointing to different backends
   - Check: `VITE_BACKEND_API_URL` vs `REMOTE_API_URL`
   - Fix: Ensure both point to same backend

2. **Token from Wrong Backend**: Token issued by different backend than Worker is calling
   - Check: Sign in to correct backend
   - Fix: Clear IndexedDB and sign in again

3. **Backend Not Running**: Better Auth server not accessible
   - Check: Can you access `http://localhost:3000/api/auth/get-session`?
   - Fix: Start backend server

### "Auth validation timeout" Error

**Symptoms**: Worker logs show timeout after 3 seconds

**Possible Causes**:
1. **Backend Slow**: Better Auth API taking >3 seconds to respond
   - Check: Backend server logs
   - Fix: Optimize backend or increase timeout in `validateTokenWithRemoteServer()`

2. **Network Issues**: Worker can't reach backend
   - Check: `REMOTE_API_URL` is correct and accessible
   - Fix: Verify network connectivity

### Token Not Saving in Frontend

**Symptoms**: Token not stored in IndexedDB after sign-in

**Possible Causes**:
1. **Better Auth Not Sending Token**: `Set-Auth-Token` header missing
   - Check: Backend Better Auth configuration (bearer plugin)
   - Fix: Ensure bearer plugin is configured correctly

2. **IndexedDB Issues**: Browser blocking IndexedDB access
   - Check: Browser console for errors
   - Fix: Check browser permissions

## Migration Notes

### Before This Change

- `REMOTE_API_URL` was hardcoded in `wrangler.toml`
- No way to override for local development
- Frontend and Worker could point to different backends
- Verbose debug logs in production

### After This Change

- `REMOTE_API_URL` can be overridden via `worker/.dev.vars`
- Frontend and Worker use centralized URL configuration
- Production-ready code with minimal logging
- Clear separation between dev and production configs

## Related Files

- `worker/middleware/auth.ts` - Worker authentication middleware
- `src/shared/lib/authClient.ts` - Frontend Better Auth client
- `src/config/urls.ts` - Centralized URL configuration
- `worker/wrangler.toml` - Worker configuration
- `worker/.dev.vars` - Worker local development variables (git-ignored)
- `.env` - Frontend environment variables (git-ignored)

## References

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Cloudflare Workers Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

