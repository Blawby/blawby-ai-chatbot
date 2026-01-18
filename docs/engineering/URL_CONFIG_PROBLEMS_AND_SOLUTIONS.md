# URL & Environment Configuration: Problems and Solutions

> **Purpose**: This document summarizes URL/environment configuration and the plan to keep it consistent.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Current Configuration](#current-configuration)
3. [Solution Plan](#solution-plan)
4. [Implementation Checklist](#implementation-checklist)

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
│  • /api/status                  │   │  • /api/practice/client-intakes │
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

## Current Configuration

Use `src/config/urls.ts` as the single source of truth for URL routing and fallbacks.

Frontend environment variables:
- `VITE_WORKER_API_URL` (optional): Worker base URL (no `/api` suffix).
- `VITE_BACKEND_API_URL` (required in production): Remote backend base URL.

Worker environment variables:
- `REMOTE_API_URL`: Remote backend base URL used by the Worker (must match frontend backend base).

Routing rules:
- Worker handles `/api/*` endpoints for chat, conversations, inbox, notifications, files, PDFs, and intake-related worker routes.
- Remote backend handles auth, practice management, subscriptions, onboarding, preferences, and other non-worker endpoints (see `https://staging-api.blawby.com/llms.txt`).

## Solution Plan

- Keep all URL logic centralized in `src/config/urls.ts`.
- Use only `VITE_WORKER_API_URL` (worker base, no `/api` suffix) and `VITE_BACKEND_API_URL` (remote backend base) in frontend configuration.
- Ensure worker `REMOTE_API_URL` matches the frontend backend base URL.

---

## Implementation Checklist

- [ ] Keep `.env.example`, `README.md`, and `AGENTS.md` aligned with current env vars.
- [ ] Confirm Cloudflare Pages env vars: `VITE_BACKEND_API_URL`, `VITE_WORKER_API_URL` (optional), `VITE_APP_BASE_URL`.
- [ ] Confirm Worker env var `REMOTE_API_URL` matches the backend base URL.

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
