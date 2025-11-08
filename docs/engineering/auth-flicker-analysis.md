# Authentication Flicker Issue Analysis

## Problem Summary

After sign-up/sign-in, there is significant UI flickering caused by multiple simultaneous API calls and race conditions between different context providers. Users sometimes need to log in twice to appear logged in.

## Root Causes

### 1. Multiple Session Fetches (Race Condition)

After sign-up/sign-in, **three different sources** are fetching session data simultaneously:

1. **`AuthPage.tsx` (lines 128-186)**: Polls `/api/auth/get-session` in a loop after sign-up
   - Polls up to 10 times with 500ms intervals
   - Waits for organization to be ready
   - This is **redundant** since contexts already fetch

2. **`ActiveOrganizationContext.tsx` (line 97)**: Fetches `/api/auth/get-session` on mount
   - Called during `initializeActiveOrg()` 
   - Runs immediately when context mounts

3. **`authClient.useSession()` (Better Auth hook)**: Automatically fetches sessions
   - Used by `AuthContext.tsx` (line 15)
   - Used by `SessionContext.tsx` (line 58)
   - Better Auth's reactive hook that polls/fetches automatically

**Result**: 3+ simultaneous session fetches causing state updates at different times → flickering

### 2. Multiple Organization Fetches (Race Condition)

After sign-up/sign-in, **three different sources** are fetching organization data:

1. **`AuthPage.tsx` (line 162)**: Polls `/api/organizations/default` after sign-up
   - Part of the polling loop waiting for org to be ready
   - **Redundant** since contexts already fetch

2. **`ActiveOrganizationContext.tsx` (line 111)**: Fetches `/api/organizations/default` on mount
   - Called during `initializeActiveOrg()`
   - Runs immediately when context mounts

3. **`useOrganizationConfig.ts` (line 193)**: Fetches `/api/organizations` (list) when orgId changes
   - Triggered when `organizationId` state changes
   - Fetches full organization list to find config

**Result**: 3+ simultaneous organization fetches causing state updates at different times → flickering

### 3. Context Initialization Order Issues

The contexts mount in this order (from `index.tsx`):
1. `AuthProvider` → uses `authClient.useSession()` → fetches session
2. `ActiveOrganizationProvider` → calls `initializeActiveOrg()` → fetches session + org
3. `OrganizationProvider` → uses `useOrganizationConfig()` → fetches org config
4. `SessionProvider` → uses `authClient.useSession()` again → fetches session again

**Result**: Each context updates independently, causing UI to flicker between:
- Loading states
- Authenticated/unauthenticated states  
- Organization loaded/not loaded states
- Anonymous/authenticated user states

### 4. Redundant Polling in AuthPage

The polling logic in `AuthPage.tsx` (lines 128-186) is **completely redundant**:
- It polls for session and organization readiness
- But contexts already fetch this data on mount
- The polling adds unnecessary API calls and delays
- It doesn't prevent the flickering because contexts mount before polling completes

## Network Request Pattern Observed

After sign-up, the following requests fire almost simultaneously:

```
POST /api/auth/sign-up/email => [200] OK
GET /api/auth/get-session => [200] OK  (AuthPage polling)
GET /api/auth/get-session => [200] OK  (ActiveOrganizationContext)
GET /api/auth/get-session => [200] OK  (authClient.useSession - Better Auth)
GET /api/organizations/default => [200] OK  (AuthPage polling)
GET /api/organizations/default => [200] OK  (ActiveOrganizationContext)
GET /api/organizations => [200] OK  (useOrganizationConfig)
GET /api/organizations/me => [401] Unauthorized  (ActiveOrganizationContext - fails initially)
GET /api/organizations/public => [404] Not Found  (ActiveOrganizationContext fallback)
```

## Why "Sometimes Need to Log In Twice"

This happens because:
1. Session may not be fully established when contexts mount
2. Organization may not exist yet when contexts try to fetch it
3. Race conditions cause some contexts to see "not authenticated" state
4. User sees the "Sign In" button even though they just signed in
5. Second sign-in works because session is now fully established

## Files Involved

- `src/components/AuthPage.tsx` - Redundant polling logic (lines 128-186)
- `src/contexts/AuthContext.tsx` - Uses `authClient.useSession()`
- `src/contexts/ActiveOrganizationContext.tsx` - Fetches session + org on mount
- `src/contexts/OrganizationContext.tsx` - Uses `useOrganizationConfig()`
- `src/contexts/SessionContext.tsx` - Uses `authClient.useSession()` again
- `src/hooks/useOrganizationConfig.ts` - Fetches org config when orgId changes
- `src/lib/authClient.ts` - Better Auth client with `useSession()` hook

## Recommended Solutions

### Option 1: Remove Redundant Polling (Quick Fix)
Remove the polling logic from `AuthPage.tsx` and let contexts handle initialization:
- Remove lines 128-186 (polling loop)
- Trust that contexts will fetch data correctly
- Add a simple delay before redirect if needed

### Option 2: Coordinate Context Initialization (Better Fix)
Create a single initialization flow:
- Have `AuthPage` wait for session to be established
- Only redirect after contexts have initialized
- Use a shared loading state across contexts

### Option 3: Consolidate Session Fetching (Best Fix)
- Use only `authClient.useSession()` for session data (remove manual fetches)
- Have contexts depend on session state from `AuthContext`
- Remove duplicate session fetches from `ActiveOrganizationContext`
- Coordinate organization fetching to happen after session is ready

### Option 4: Add Loading States (UX Fix)
- Show a unified loading state during initialization
- Prevent UI flickering by not rendering until all contexts are ready
- Use Suspense boundaries or a global loading state

## Next Steps

1. **Immediate**: Remove redundant polling from `AuthPage.tsx`
2. **Short-term**: Consolidate session fetching to use only `authClient.useSession()`
3. **Medium-term**: Coordinate context initialization order
4. **Long-term**: Add proper loading states to prevent flickering

