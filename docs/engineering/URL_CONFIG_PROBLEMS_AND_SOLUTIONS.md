# URL & Environment Configuration: Problems and Solutions

> **Purpose**: This document explains the current messy state of URL/environment configuration, why AI assistants get confused, and the plan to fix it.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Current Problems](#current-problems)
3. [Why AI Gets Confused](#why-ai-gets-confused)
4. [Solution Plan](#solution-plan)
5. [Implementation Checklist](#implementation-checklist)

---

## Architecture Overview

This application uses **TWO separate backends**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                         (Vite/Preact App)                               │
│                    localhost:5173 (dev) / ai.blawby.com (prod)          │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     CLOUDFLARE WORKER           │   │      REMOTE BACKEND             │
│  (localhost:8787 / ai.blawby.com│   │  (staging-api.blawby.com or     │
│                                 │   │   production-api.blawby.com)    │
│  Endpoints:                     │   │                                 │
│  • /api/chat                    │   │  Endpoints:                     │
│  • /api/conversations           │   │  • /api/auth/* (Better Auth)    │
│  • /api/inbox                   │   │  • /api/practices (CRUD)        │
│  • /api/files                   │   │  • /api/subscription/*          │
│  • /api/lawyers                 │   │  • /api/members/*               │
│  • /api/status                  │   │  • /api/practice-client-intakes │
│  • /api/health                  │   │                                 │
│                                 │   │  Source: blawby-ts repository   │
│  Storage: D1, KV, R2            │   │  (Separate Node.js server)      │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

### Key Insight

The frontend talks to **two different APIs**:
- **Worker API**: Same origin as frontend, handles conversations/chat/files
- **Backend API**: Different server entirely, handles auth/practices/subscriptions

---

## Current Problems

### Problem 1: Confusing Variable Names

| Variable | Where Defined | Actual Purpose | Why It's Confusing |
|----------|---------------|----------------|-------------------|
| `VITE_API_URL` | vite-env.d.ts | Worker API | "API" is ambiguous - which API? |
| `VITE_REMOTE_API_URL` | vite-env.d.ts | Backend API | "Remote" doesn't indicate purpose |
| `VITE_BETTER_AUTH_URL` | vite-env.d.ts | **NEVER USED** | Dead code that confuses |
| `REMOTE_API_URL` | worker/types.ts | Backend API | Different prefix than frontend |
| `getBaseUrl()` | api.ts | Worker URL | "Base" is meaningless |
| `getRemoteApiUrl()` | api.ts | Backend URL | Only slightly clearer |

**AI Confusion**: When an AI sees `VITE_API_URL`, `VITE_REMOTE_API_URL`, `VITE_BETTER_AUTH_URL`, and `REMOTE_API_URL`, it doesn't know which to use for what.

### Problem 2: Same Logic Copy-Pasted 4+ Times

The same environment detection logic exists in:

```
src/config/api.ts                    → getRemoteApiUrl()
src/shared/lib/authClient.ts         → getAuthBaseUrl()
src/shared/lib/apiClient.ts          → ensureApiBaseUrl()
src/shared/hooks/usePaymentUpgrade.ts → BILLING_CALLBACK_HOST
```

Each has **slightly different behavior**:
- Some check MSW first, some check env vars first
- Some throw errors, some silently use fallbacks
- Some cache results, some don't

**AI Confusion**: When asked to "fix the URL", AI doesn't know which of the 4 implementations to change, or if all need to be synchronized.

### Problem 3: Hidden Override in vite.config.ts

```typescript
// vite.config.ts line 286-290
define: {
  'import.meta.env.VITE_API_URL': JSON.stringify(
    process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : undefined
  )
}
```

This **secretly overrides** `VITE_API_URL` at build time!

**AI Confusion**: AI might suggest "set VITE_API_URL in your .env file" but that won't work because vite.config.ts overrides it. The AI has no way to know this without reading vite.config.ts.

### Problem 4: Hardcoded URLs Scattered Everywhere

Found in the codebase:
- `'https://staging-api.blawby.com'` - 15+ occurrences
- `'https://production-api.blawby.com'` - 5+ occurrences
- `'https://ai.blawby.com'` - 5+ occurrences
- `'http://localhost:8787'` - 3+ occurrences
- `'http://localhost:5173'` - 2 occurrences

**AI Confusion**: When user says "I changed the backend URL", AI has to hunt through 15+ files to update all hardcoded URLs.

### Problem 5: Inconsistent Fallback Strategies

| File | What Happens If Env Var Missing |
|------|--------------------------------|
| `authClient.ts` | Dev: uses fallback → Prod: throws error |
| `api.ts` | Always uses fallback (never throws) |
| `apiClient.ts` | Uses getRemoteApiUrl() (indirect fallback) |
| `usePaymentUpgrade.ts` | Throws error |
| `worker/auth.ts` | Uses fallback (never throws) |

**AI Confusion**: When asked "what happens if VITE_REMOTE_API_URL is not set?", the answer depends on which file you're asking about.

### Problem 6: Dead/Unused Variables

```typescript
// src/vite-env.d.ts
readonly VITE_BETTER_AUTH_URL?: string;  // DEFINED BUT NEVER USED
```

**AI Confusion**: AI might try to use `VITE_BETTER_AUTH_URL` thinking it's the auth server URL, but nothing actually reads it.

### Problem 7: No Central Documentation

- No `.env.example` for frontend variables
- `dev.vars.example` only covers Worker secrets
- Comments are scattered and sometimes contradictory
- README mentions `VITE_REMOTE_API_URL` but doesn't explain the two-backend architecture

**AI Confusion**: AI has to read multiple files to piece together which env vars are needed and what they do.

### Problem 8: MSW (Mock Service Worker) Logic Everywhere

```typescript
// This pattern appears in 4+ files:
if (import.meta.env.DEV) {
  const enableMocks = import.meta.env.VITE_ENABLE_MSW === 'true';
  if (enableMocks) {
    return window.location.origin;  // MSW intercepts same-origin
  } else {
    return 'https://staging-api.blawby.com';  // Direct to staging
  }
}
```

**AI Confusion**: AI doesn't understand why some URLs switch to `window.location.origin` when MSW is enabled, leading to suggestions that break mock testing.

---

## Why AI Gets Confused

### Confusion Pattern 1: "Which URL variable should I use?"

When AI is asked to fix an auth issue, it sees:
- `VITE_API_URL`
- `VITE_REMOTE_API_URL`
- `VITE_BETTER_AUTH_URL` (unused)
- `AUTH_BASE_URL` (local constant)
- `FALLBACK_AUTH_URL` (local constant)

Without documentation, AI picks randomly or uses the wrong one.

### Confusion Pattern 2: "I fixed it in one place but it's still broken"

AI fixes the URL logic in `authClient.ts`, but the same logic in `api.ts` or `apiClient.ts` still uses the old/broken approach. The duplication isn't obvious.

### Confusion Pattern 3: "My .env change isn't working"

User sets `VITE_API_URL=http://custom:3000` in `.env`, but:
1. `vite.config.ts` overrides it in dev mode
2. AI doesn't know about this hidden override
3. User and AI waste time debugging

### Confusion Pattern 4: "Which backend is this endpoint on?"

When AI sees `/api/auth/login` vs `/api/chat`, it needs to know:
- `/api/auth/*` → Backend (VITE_REMOTE_API_URL)
- `/api/chat` → Worker (VITE_API_URL)

But there's no clear documentation, so AI might route requests to the wrong server.

### Confusion Pattern 5: "What's the production URL?"

The codebase has:
- `staging-api.blawby.com` (hardcoded fallback)
- `production-api.blawby.com` (mentioned in wrangler.toml)
- `ai.blawby.com` (frontend/worker domain)

AI doesn't know which is "production" for which purpose.

---

## Solution Plan

### Solution 1: Create Single Source of Truth

Create `src/config/urls.ts` that:
- Exports `getWorkerApiUrl()` for Cloudflare Worker endpoints
- Exports `getBackendApiUrl()` for remote backend endpoints
- Contains ALL URL logic in ONE place
- Has clear JSDoc comments explaining each

```typescript
// src/config/urls.ts

/**
 * Get URL for Cloudflare Worker API
 * Used for: /api/chat, /api/conversations, /api/inbox, /api/files, /api/lawyers
 */
export function getWorkerApiUrl(): string { ... }

/**
 * Get URL for remote backend API  
 * Used for: /api/auth/*, /api/practices, /api/subscription/*
 */
export function getBackendApiUrl(): string { ... }
```

### Solution 2: Clear Variable Naming

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `VITE_API_URL` | `VITE_WORKER_API_URL` | Cloudflare Worker |
| `VITE_REMOTE_API_URL` | `VITE_BACKEND_API_URL` | Node.js backend |
| `VITE_BETTER_AUTH_URL` | **DELETE** | Unused |

### Solution 3: Remove Hidden Override

Delete from `vite.config.ts`:
```typescript
// DELETE THIS
define: {
  'import.meta.env.VITE_API_URL': JSON.stringify(...)
}
```

Let the centralized config handle defaults.

### Solution 4: Create .env.example

```bash
# .env.example

# ============================================
# BACKEND API (Required in production)
# ============================================
# The Node.js server that handles auth, practices, subscriptions
# Dev default: https://staging-api.blawby.com
# Prod example: https://production-api.blawby.com
VITE_BACKEND_API_URL=https://staging-api.blawby.com

# ============================================
# WORKER API (Optional - auto-detected)
# ============================================
# The Cloudflare Worker that handles chat, conversations, files
# Dev default: http://localhost:8787
# Prod default: same origin as frontend
# VITE_WORKER_API_URL=http://localhost:8787

# ============================================
# FEATURE FLAGS
# ============================================
# Enable Mock Service Worker for frontend testing
# VITE_ENABLE_MSW=true
```

### Solution 5: Update All Files to Import from urls.ts

Replace duplicated logic:

```typescript
// BEFORE (in 4 different files):
const url = import.meta.env.VITE_REMOTE_API_URL || 'https://staging-api.blawby.com';

// AFTER (in all files):
import { getBackendApiUrl } from '@/config/urls';
const url = getBackendApiUrl();
```

### Solution 6: Add Endpoint Mapping Documentation

Add to `urls.ts`:

```typescript
/**
 * ENDPOINT ROUTING GUIDE
 * 
 * WORKER API (getWorkerApiUrl):
 *   /api/chat/*           - AI chat
 *   /api/conversations/*  - Conversation management
 *   /api/inbox/*          - Inbox
 *   /api/files/*          - File uploads
 *   /api/lawyers/*        - Lawyer search
 *   /api/status           - Status check
 *   /api/health           - Health check
 * 
 * BACKEND API (getBackendApiUrl):
 *   /api/auth/*           - Better Auth endpoints
 *   /api/practices/*      - Practice CRUD
 *   /api/subscription/*   - Subscription management
 *   /api/members/*        - Member management
 *   /api/practice-client-intakes/* - Form submissions
 */
```

---

## Implementation Checklist

### Phase 1: Create New Config (Non-breaking)

- [ ] Create `src/config/urls.ts` with new functions
- [ ] Add JSDoc comments with endpoint routing guide
- [ ] Create `.env.example` file
- [ ] Update `src/vite-env.d.ts` with new variable names

### Phase 2: Migrate Files (One at a time)

- [ ] Update `src/config/api.ts` to use `urls.ts`
- [ ] Update `src/shared/lib/authClient.ts` to use `urls.ts`
- [ ] Update `src/shared/lib/apiClient.ts` to use `urls.ts`
- [ ] Update `src/shared/hooks/usePaymentUpgrade.ts` to use `urls.ts`

### Phase 3: Cleanup

- [ ] Remove `VITE_BETTER_AUTH_URL` from `vite-env.d.ts`
- [ ] Remove `define` block from `vite.config.ts`
- [ ] Remove all hardcoded fallback URLs from individual files
- [ ] Update README.md with new env var names

### Phase 4: Documentation

- [ ] Update this document with "COMPLETED" status
- [ ] Add inline comments in `urls.ts` for AI context
- [ ] Create architecture diagram in docs/

---

## Quick Reference for AI Assistants

When working on this codebase:

1. **URL Configuration**: All logic is in `src/config/urls.ts`
2. **Two APIs**: Worker (localhost:8787) and Backend (staging-api.blawby.com)
3. **Auth endpoints**: Use `getBackendApiUrl()` 
4. **Chat endpoints**: Use `getWorkerApiUrl()`
5. **Environment vars**: See `.env.example` for all options
6. **Never hardcode URLs**: Always use the functions from `urls.ts`

---

## Status

**Current Status**: IN PROGRESS

**Last Updated**: 2026-01-06

**Completed**:
- ✅ Created `src/config/urls.ts` with centralized URL configuration
- ✅ Updated `src/vite-env.d.ts` with new variable names
- ✅ Removed override from `vite.config.ts`
- ✅ Migrated `src/config/api.ts` to use centralized config
- ✅ Migrated `src/shared/lib/authClient.ts` to use centralized config
- ✅ Migrated `src/shared/lib/apiClient.ts` to use centralized config
- ✅ Migrated `src/shared/hooks/usePaymentUpgrade.ts` to use centralized config

**Remaining**:
- [ ] Create `.env.example` file (blocked by gitignore - needs manual creation)
- [ ] Test all endpoints work correctly
- [ ] Update README.md with new env var names
- [ ] Remove any remaining hardcoded URLs
- [ ] Update worker documentation if needed

