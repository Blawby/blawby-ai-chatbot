# Better Auth Client Setup Guide

✅ **IMPLEMENTED** - This guide explains how the Better Auth client library is configured in this application, including Bearer token authentication, IndexedDB token storage, and organization management.

## Platform vs. Tenant Organizations

Blawby AI operates as the marketplace/product layer, while each law practice is a multi-tenant organization.

- `/api/practice/*` endpoints always refer to tenant organizations (law firms).
- `/api/onboarding/*`, `/api/subscription/*`, etc. manage tenant onboarding/billing.
- Platform defaults (branding, public experience) are defined in `src/config/platform.ts` and exposed as `PLATFORM_SETTINGS`.
- `DEFAULT_ORGANIZATION_ID` / `PLATFORM_ORGANIZATION_ID` represent the platform context and should not be treated as a tenant org.

Ensure new features distinguish between platform-level configuration and tenant-specific state so that “Blawby” remains the product shell, and individual orgs represent actual practices.

## Implementation Status

**All major components are implemented and working:**
- ✅ Better Auth Client with Proxy pattern for lazy initialization
- ✅ API Client with Axios and automatic Bearer token injection
- ✅ Development Practice Seeding script
- ✅ Practice Management APIs (all endpoints)
- ✅ Onboarding APIs (status, connected accounts, complete)

**Note**: The SSR handling in the actual implementation returns a placeholder URL during build/SSR instead of throwing an error, which is more robust than the original documentation suggested.

## Overview

The application uses Better Auth with a remote authentication server. Authentication is handled via Bearer tokens stored in IndexedDB, providing secure token management without using cookies or localStorage.

## Architecture

- **Remote Auth Server**: Better Auth backend runs on a separate server
- **Bearer Token Authentication**: Tokens are sent in the `Authorization` header
- **IndexedDB Storage**: Tokens are stored securely in IndexedDB (not localStorage)
- **Organization Plugin**: Multi-tenant organization support via Better Auth organization plugin

## Configuration

### Environment Variables

Set the following environment variable in your `.env` or `dev.vars`:

```bash
VITE_AUTH_SERVER_URL=https://your-auth-server.com
```

**Note**: `VITE_AUTH_SERVER_URL` is required in production. In development, the client falls back to `https://staging-api.blawby.com` if not set.

### Auth Client Configuration

The auth client is configured in `src/lib/authClient.ts` with lazy initialization using a Proxy pattern to avoid build-time errors:

```typescript
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { setToken, getTokenAsync } from './tokenStorage';
import { isDevelopment } from '../utils/environment';

// Remote better-auth server URL
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL;
const FALLBACK_AUTH_URL = "https://staging-api.blawby.com";

// Get auth URL - validate in browser context only
function getAuthBaseUrl(): string {
  if (typeof window === 'undefined') {
    // During SSR/build, return a placeholder that won't be used
    // The actual client creation is guarded in getAuthClient()
    return 'https://placeholder-auth-server.com';
  }
  
  // Browser runtime - validate and throw if missing
  const finalAuthUrl = AUTH_BASE_URL || (isDevelopment() ? FALLBACK_AUTH_URL : null);
  
  if (!finalAuthUrl) {
    throw new Error(
      'VITE_AUTH_SERVER_URL is required in production. Please set this environment variable in Cloudflare Pages (Settings > Environment Variables) to your Better Auth server URL.'
    );
  }
  
  return finalAuthUrl;
}

// Cached auth client instance (created lazily on first access)
let cachedAuthClient: AuthClientType | null = null;

function getAuthClient(): AuthClientType {
  if (cachedAuthClient) {
    return cachedAuthClient;
  }
  
  const baseURL = getAuthBaseUrl();
  
  cachedAuthClient = createAuthClient({
    plugins: [organizationClient()],
    baseURL,
    fetchOptions: {
      auth: {
        type: "Bearer",
        token: async () => {
          const token = await getTokenAsync();
          return token || "";
        }
      },
      onSuccess: async (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token");
        if (authToken) {
          await setToken(authToken);
        }
      }
    }
  });
  
  return cachedAuthClient;
}

// Export the auth client as a Proxy for lazy initialization
export const authClient = new Proxy({} as AuthClientType, {
  get(_target, prop) {
    const client = getAuthClient();
    const value = (client as any)[prop];
    // Handle functions, objects, and nested properties (e.g., signUp.email)
    if (typeof value === 'function') {
      return value.bind(client);
    }
    if (value && typeof value === 'object') {
      return new Proxy(value, {
        get(_target, subProp) {
          const subValue = value[subProp];
          if (typeof subValue === 'function') {
            return subValue.bind(value);
          }
          return subValue;
        }
      });
    }
    return value;
  }
}) as AuthClientType;
```

### Key Configuration Points

1. **Lazy Initialization with Proxy**: ✅ **IMPLEMENTED** - The `authClient` is exported as a Proxy that creates the actual client on first access. During SSR/build, `getAuthBaseUrl()` returns a placeholder URL, and a placeholder client is created to prevent build errors. The real client is only created in browser context.
2. **Import from `better-auth/react`**: ✅ **IMPLEMENTED** - Required for React/Preact hooks like `useSession()`
3. **Organization Plugin**: ✅ **IMPLEMENTED** - `organizationClient()` enables organization management features
4. **Bearer Token Type**: ✅ **IMPLEMENTED** - Uses Bearer token authentication instead of cookies
5. **Token Storage**: ✅ **IMPLEMENTED** - Tokens are automatically captured from `set-auth-token` response header (lowercase)
6. **Async Token Function**: ✅ **IMPLEMENTED** - The token function is async to wait for IndexedDB initialization
7. **Development Fallback**: ✅ **IMPLEMENTED** - In development, falls back to `https://staging-api.blawby.com` if `VITE_AUTH_SERVER_URL` is not set
8. **Nested Method Support**: ✅ **IMPLEMENTED** - The Proxy handles nested methods like `authClient.signUp.email()` correctly by recursively proxying objects
9. **SSR Safety**: ✅ **IMPLEMENTED** - The implementation handles SSR gracefully by creating placeholder clients during build/SSR, so no manual guards are needed in most cases

## Token Storage

Tokens are stored in IndexedDB for security. The storage is handled by `src/lib/tokenStorage.ts`.

### Token Storage Functions

- `getTokenAsync()`: Async function that waits for IndexedDB and returns the token
- `setToken(token: string)`: Stores a token in IndexedDB
- `clearToken()`: Removes the token from IndexedDB

### IndexedDB Details

- **Database Name**: `blawby_auth`
- **Store Name**: `tokens`
- **Key**: `bearer_token`

**Important**: The token function waits for IndexedDB to initialize, ensuring the token is available on the first call.

## Available Auth Methods

All Better Auth methods are exported from `authClient`:

```typescript
import { authClient } from '@/lib/authClient';

// Authentication
await authClient.signIn.email({ email, password });
await authClient.signUp.email({ email, password, name });
await authClient.signOut();

// Session Management
const { data: session } = authClient.useSession(); // React hook
const session = await authClient.getSession(); // One-time fetch

// User Management
await authClient.updateUser({ name: "New Name" });
await authClient.deleteUser();
```

## Organization Management

The organization plugin provides multi-tenant organization support:

### Available Organization Methods

```typescript
// Set active organization
await authClient.organization.setActive({ organizationId: "org-id" });

// Create organization
const { data } = await authClient.organization.create({
  name: "My Organization",
  slug: "my-org",
  logo: "https://example.com/logo.png",
  metadata: { industry: "Technology" }
});

// List user's organizations
const { data: orgs } = await authClient.organization.list();

// List organization members
const { data: members } = await authClient.organization.listMembers({
  organizationId: "org-id",
  limit: 100,
  offset: 0
});

// Get full organization details
const { data: org } = await authClient.organization.getFullOrganization({
  organizationId: "org-id"
});

// Get user's role in active organization
const { data: role } = await authClient.organization.getActiveMemberRole();

// React hook for active organization
const { data: activeOrg } = authClient.useActiveOrganization();
```

### Organization Switching

To switch the active organization:

```typescript
import { authClient } from '@/lib/authClient';

await authClient.organization.setActive({ organizationId: "new-org-id" });
```

After switching, the session will automatically update to reflect the new active organization.

## Usage Examples

### Sign In

```typescript
import { authClient } from '@/lib/authClient';

const result = await authClient.signIn.email({
  email: "user@example.com",
  password: "password123"
});

if (result.error) {
  console.error("Sign in failed:", result.error.message);
} else {
  // Token is automatically stored in IndexedDB
  console.log("Signed in successfully");
}
```

### Using Session Hook

```typescript
import { authClient } from '@/lib/authClient';

function MyComponent() {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!session) return <div>Not authenticated</div>;

  return <div>Welcome, {session.user.name}!</div>;
}
```

### Making Authenticated API Calls

For non-auth API calls to your backend, get the token from IndexedDB:

```typescript
import { getToken } from '@/lib/tokenStorage';

const token = await getToken();

const response = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## Sign Out

Sign out clears the token from IndexedDB:

```typescript
import { signOut } from '@/utils/auth';

await signOut();
```

This will:
1. Call Better Auth's `signOut()` method
2. Clear the token from IndexedDB
3. Clear other auth-related localStorage items
4. Reload the page (unless `skipReload: true` is passed)

## Error Handling

Better Auth methods return error objects:

```typescript
const result = await authClient.signIn.email({ email, password });

if (result.error) {
  // Handle error
  console.error(result.error.message);
  console.error(result.error.code); // Error code if available
}
```

## Important Notes

1. **Set `VITE_AUTH_SERVER_URL` for production**: Required in production; in development, the client falls back to `https://staging-api.blawby.com` if not set
2. **IndexedDB is async**: The token function waits for IndexedDB, so the first call may take a moment
3. **Use Better Auth methods only**: Don't make manual API calls for auth operations - use the provided methods
4. **Organization plugin required**: Organization features require the `organizationClient()` plugin
5. **Token is automatic**: Tokens are automatically captured from the `Set-Auth-Token` header and stored

## Troubleshooting

### Token not available on first call

This is expected behavior. The token function waits for IndexedDB to initialize. Subsequent calls will be faster as the token is cached.

### "authClient.useSession is not a function"

Make sure you're importing from `better-auth/react`, not `better-auth/client`:

```typescript
// ✅ Correct
import { createAuthClient } from 'better-auth/react';

// ❌ Wrong
import { createAuthClient } from 'better-auth/client';
```

### Organization methods not available

Ensure the `organizationClient()` plugin is included:

```typescript
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient()], // Required for org features
  // ...
});
```

### Token not being stored

Check that:
1. The auth server is returning the `Set-Auth-Token` header
2. IndexedDB is available in the browser
3. No errors in the console during token storage

## References

- [Better Auth Documentation](https://better-auth.com/docs)
- [Better Auth Organization Plugin](https://better-auth.com/docs/plugins/organization)
- [Better Auth Client API](https://better-auth.com/docs/concepts/client)

---

# API Configuration with Axios

✅ **IMPLEMENTED** - This section shows how to configure axios to automatically include the Bearer token in all API requests.

## Environment Variables

The API client supports two environment variables for flexibility:

- **`VITE_API_BASE_URL`**: Explicit API base URL (recommended for production)
- **`VITE_API_URL`**: Alternative variable name (automatically set in development)

### Variable Priority and Purpose

The client checks for environment variables in this order:
1. `VITE_API_BASE_URL` (checked first)
2. `VITE_API_URL` (checked second, fallback)

**Why two variables?**
- `VITE_API_URL` is automatically set by `vite.config.ts` in development mode to `http://localhost:8787`
- `VITE_API_BASE_URL` is the preferred variable name for explicit configuration
- This dual-variable approach allows automatic development setup while providing explicit control when needed

### Development Setup

In development, `VITE_API_URL` is automatically set to `http://localhost:8787` by `vite.config.ts`. You typically don't need to set either variable manually.

**Optional Override**: If you need to override the default development URL, set `VITE_API_BASE_URL` in your `.env` file:

```bash
VITE_API_BASE_URL=http://localhost:8787
```

### Production Setup

For production, set `VITE_API_BASE_URL` in your deployment environment (e.g., Cloudflare Pages):

```bash
VITE_API_BASE_URL=https://your-api-server.com
```

**Important**: If neither variable is set, the application will throw an error at runtime. Always ensure at least one is configured.

## Axios Configuration File

The actual implementation in `src/lib/apiClient.ts` uses dynamic base URL resolution:

```typescript
// src/lib/apiClient.ts
import axios from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';

let cachedBaseUrl: string | null = null;

function ensureApiBaseUrl(): string {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  // Check both VITE_API_BASE_URL and VITE_API_URL for flexibility
  const explicit = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (!explicit) {
    throw new Error('API base URL not configured. Please set VITE_API_BASE_URL or VITE_API_URL.');
  }
  cachedBaseUrl = explicit;
  return cachedBaseUrl;
}

// Create axios instance (baseURL set dynamically in interceptor)
export const apiClient = axios.create();

// Request interceptor to add Bearer token and set baseURL
apiClient.interceptors.request.use(
  async (config) => {
    // Set baseURL dynamically (allows override per-request if needed)
    config.baseURL = config.baseURL ?? ensureApiBaseUrl();
    const token = await getTokenAsync();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login on unauthorized
      await clearToken().catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

### Key Implementation Details

1. **Dynamic Base URL**: Base URL is resolved at request time, not at axios instance creation, allowing for environment-specific configuration
2. **Caching**: The resolved base URL is cached to avoid repeated environment variable lookups
3. **Automatic Token Injection**: Bearer token is automatically added to all requests from IndexedDB
4. **401 Handling**: Unauthorized responses automatically clear the token and redirect to login
5. **Flexible Variable Names**: Supports both `VITE_API_BASE_URL` and `VITE_API_URL` for compatibility

## Usage

Import and use the configured `apiClient` for all API calls:

```typescript
import { apiClient } from '@/lib/apiClient';

// GET request
const response = await apiClient.get('/api/practice/list');
const { practices } = response.data;

// POST request
const response = await apiClient.post('/api/practice', {
  name: "My Practice",
  slug: "my-practice"
});
const { practice } = response.data;

// PUT request
const response = await apiClient.put('/api/practice/uuid-here', {
  consultation_fee: 300.00
});

// DELETE request
await apiClient.delete('/api/practice/uuid-here');
```

The Bearer token is automatically included in all requests - no need to manually add it!

---

# Development Practice Seeding

✅ **IMPLEMENTED** - For local development, you can automatically create a default practice for your test account using the dev seed script.

## Setup

The script is located at `scripts/dev-seed-practice.ts` and can be run via:

```bash
npm run dev:seed
```

## Environment Variables

Set these environment variables before running the script:

```bash
# Required
DEV_SEED_USER_EMAIL=your-dev-email@example.com
DEV_SEED_USER_PASSWORD=your-dev-password

# Optional (with defaults)
DEV_SEED_BASE_URL=http://localhost:8787  # Worker URL for practice API calls
DEV_SEED_AUTH_URL=https://staging-api.blawby.com  # Remote auth server URL for sign-in
DEV_SEED_PRACTICE_NAME=Dev Practice  # Name for the practice (default: "Dev Practice")
DEV_SEED_PRACTICE_SLUG=dev-practice  # Slug for the practice (default: auto-generated)
```

## How It Works

1. **Sign In**: The script signs in to the remote auth server (`DEV_SEED_AUTH_URL`) using the provided credentials
2. **Check Existing**: Lists practices via `GET /api/practice/list` on the Worker (`DEV_SEED_BASE_URL`)
3. **Create if Needed**: If no practices exist, creates a default practice via `POST /api/practice` with:
   - Name: `DEV_SEED_PRACTICE_NAME` or "Dev Practice"
   - Slug: `DEV_SEED_PRACTICE_SLUG` or auto-generated
   - Business email: The user's email
   - Business phone: `+1-555-0100` (valid format required)
   - Consultation fee: `100.00` (must be > 0)

## Example Usage

```bash
DEV_SEED_USER_EMAIL=test@example.com \
DEV_SEED_USER_PASSWORD=TestPassword123! \
DEV_SEED_AUTH_URL=https://staging-api.blawby.com \
npm run dev:seed
```

## Output

The script will output:
- `🔐 Signing in as ...` - Sign-in attempt
- `✅ Auth token acquired` - Successful authentication
- `✅ Practice already exists (...)` - If practices are found
- `ℹ️  No practices found. Creating default practice...` - If creating new practice
- `🎉 Practice created: ...` - Success message with practice name/slug/id

## Notes

- The script is idempotent - it won't create duplicate practices if one already exists
- It uses the remote auth server for sign-in (not the local Worker proxy)
- It uses the local Worker for practice API calls (which proxies to the remote API)
- The created practice will be available immediately in the frontend after sign-in

---

# Practice Management APIs

✅ **IMPLEMENTED** - This section covers the Practice Management APIs for creating, managing, and switching between law practices. All endpoints are implemented and used throughout the codebase.

## Base URL

All practice endpoints are prefixed with:

```
/api/practice
```

**Authentication**: All practice endpoints require authentication via Bearer token.

## Available Endpoints

### List Practices

Get all practices for the authenticated user.

**Endpoint**: `GET /api/practice/list`

**Request**:

```typescript
import { apiClient } from '@/lib/apiClient';

const response = await apiClient.get('/api/practice/list');
```

**Response Format**:

The API may return practices in one of two formats:

1. **Array format** (direct array):
```typescript
[
  {
    id: "org-uuid",
    name: "Smith & Associates Law Firm",
    slug: "smith-associates",
    // ... other fields
  }
]
```

2. **Object format** (wrapped in `practices` property):
```typescript
{
  practices: [
    {
      id: "org-uuid",
      name: "Smith & Associates Law Firm",
      slug: "smith-associates",
      // ... other fields
    }
  ]
}
```

**Recommended Handling**:

```typescript
const response = await apiClient.get('/api/practice/list');
const practices = Array.isArray(response.data)
  ? response.data
  : Array.isArray(response.data?.practices)
    ? response.data.practices
    : [];
```

**Practice Object Structure**:

```typescript
{
  id: "org-uuid",                    // Practice/organization UUID
  name: "Smith & Associates Law Firm",
  slug: "smith-associates",
  logo: "https://example.com/logo.png",  // Optional
  metadata: {                        // Optional custom metadata
    industry: "Legal",
    practice_areas: ["Family Law"]
  },
  business_phone: "+1-555-0123",     // Optional
  business_email: "contact@smithlaw.com",  // Optional
  consultation_fee: 250.00,          // Optional, must be > 0 if provided
  payment_url: "https://payment.example.com",  // Optional
  calendly_url: "https://calendly.com/smith-law",  // Optional
  created_at: "2024-01-01T00:00:00Z",  // ISO 8601 timestamp
  updated_at: "2024-01-15T12:00:00Z"   // ISO 8601 timestamp
}
```

### Create Practice

Create a new law practice (organization).

**Endpoint**: `POST /api/practice`

**Request Body**:

```typescript
type CreatePracticeRequest = {
  // Required fields
  name: string;           // Practice name (3-100 chars)
  slug: string;           // URL-friendly slug (3-50 chars, lowercase, hyphens only)
  
  // Optional organization fields
  logo?: string;          // Logo URL or empty string
  metadata?: Record<string, any>;  // Custom metadata
  
  // Optional practice details
  business_phone?: string;        // Business phone number
  business_email?: string;        // Business email
  consultation_fee?: number;      // Consultation fee in dollars
  payment_url?: string;           // Payment link URL
  calendly_url?: string;          // Calendly scheduling URL
};
```

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const response = await apiClient.post('/api/practice', {
  name: "Smith & Associates Law Firm",
  slug: "smith-associates",
  logo: "https://example.com/logo.png",
  business_phone: "+1-555-0123",
  business_email: "contact@smithlaw.com",
  consultation_fee: 250.00,
  payment_url: "https://payment.example.com",
  calendly_url: "https://calendly.com/smith-law",
  metadata: {
    industry: "Legal",
    practice_areas: ["Family Law", "Estate Planning"]
  }
});
```

**Response Format**:

The API may return the created practice in one of two formats:

1. **Direct object**:
```typescript
{
  id: "practice-uuid-here",
  name: "Smith & Associates Law Firm",
  // ... other fields
}
```

2. **Wrapped in `practice` property**:
```typescript
{
  practice: {
    id: "practice-uuid-here",
    name: "Smith & Associates Law Firm",
    // ... other fields
  }
}
```

**Recommended Handling**:

```typescript
const response = await apiClient.post('/api/practice', { /* ... */ });
const practice = response.data?.practice || response.data;
```

**Response**: Returns the created practice with the same structure as List Practices.

### Get Practice by ID

Get details of a specific practice.

**Endpoint**: `GET /api/practice/:uuid`

**Parameters**:
- `uuid` (path): Practice UUID

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const practiceId = "practice-uuid-here";
const response = await apiClient.get(`/api/practice/${practiceId}`);
```

**Response Format**:

The API may return the practice in one of two formats:

1. **Direct object**:
```typescript
{
  id: "practice-uuid-here",
  name: "Smith & Associates Law Firm",
  // ... other fields
}
```

2. **Wrapped in `practice` property**:
```typescript
{
  practice: {
    id: "practice-uuid-here",
    name: "Smith & Associates Law Firm",
    // ... other fields
  }
}
```

**Recommended Handling**:

```typescript
const response = await apiClient.get(`/api/practice/${practiceId}`);
const practice = response.data?.practice || response.data;
```

**Response**: Returns a single practice object with the same structure as List Practices.

### Update Practice

Update practice information.

**Endpoint**: `PUT /api/practice/:uuid`

**Parameters**:
- `uuid` (path): Practice UUID

**Request Body** (all fields optional, at least one required):

```typescript
type UpdatePracticeRequest = {
  // Optional organization fields
  name?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, any>;
  
  // Optional practice details
  business_phone?: string;
  business_email?: string;
  consultation_fee?: number;
  payment_url?: string;
  calendly_url?: string;
};
```

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const practiceId = "practice-uuid-here";
const response = await apiClient.put(`/api/practice/${practiceId}`, {
  consultation_fee: 300.00,
  business_phone: "+1-555-0124"
});
```

**Response Format**:

Same as Create Practice - may return the practice directly or wrapped in a `practice` property:

```typescript
const practice = response.data?.practice || response.data;
```

**Response**: Returns the updated practice object with the same structure as List Practices.

### Delete Practice

Delete a practice (soft delete).

**Endpoint**: `DELETE /api/practice/:uuid`

**Parameters**:
- `uuid` (path): Practice UUID

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const practiceId = "practice-uuid-here";
await apiClient.delete(`/api/practice/${practiceId}`);
```

**Response**: `204 No Content` on success.

### Set Active Practice

Set a practice as the active practice for the current user session.

**Endpoint**: `PUT /api/practice/:uuid/active`

**Parameters**:
- `uuid` (path): Practice UUID to set as active

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const practiceId = "practice-uuid-here";
const response = await apiClient.put(`/api/practice/${practiceId}/active`);
const { result } = response.data;
```

**Response**:

```typescript
{
  result: {
    success: true,
    practice_id: "practice-uuid-here"
  }
}
```

## Validation Rules

### Practice Name
- **Required** for creation
- 3-100 characters
- Can contain letters, numbers, spaces, and common punctuation

### Practice Slug
- **Required** for creation
- 3-50 characters
- Lowercase letters, numbers, and hyphens only
- Must start and end with alphanumeric character
- Must be unique across all practices

### Business Email
- Must be a valid email format
- Optional

### Business Phone
- Must be a valid phone number format (E.164 recommended)
- Optional

### Consultation Fee
- Must be a positive number
- Represents amount in dollars
- Optional

### URLs (Logo, Payment, Calendly)
- Must be valid HTTPS URLs
- Optional (can be empty string)

## Error Handling

Practice API errors follow standard HTTP status codes:

```typescript
// 400 Bad Request - Validation error
{
  "error": "Invalid Practice Data",
  "details": {
    "slug": "Slug must be 3-50 characters"
  }
}

// 404 Not Found - Practice not found
{
  "error": "Practice not found"
}

// 401 Unauthorized - Missing or invalid token
{
  "error": "Unauthorized"
}

// 403 Forbidden - User doesn't have permission
{
  "error": "You don't have permission to access this practice"
}
```

---

# Onboarding APIs

✅ **IMPLEMENTED** - This section covers the Onboarding APIs for Stripe Connect integration and practice setup. All documented endpoints are implemented and used in the onboarding flow.

## Base URL

All onboarding endpoints are prefixed with:

```
/api/onboarding
```

**Authentication**: All onboarding endpoints require authentication via Bearer token.

**Rate Limiting**: Onboarding endpoints are rate-limited to prevent abuse.

## Available Endpoints

### Get Onboarding Status

Get the Stripe Connect onboarding status for a practice/organization.

**Endpoint**: `GET /api/onboarding/organization/:organizationId/status`

**Parameters**:
- `organizationId` (path): Organization/Practice UUID

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const organizationId = "practice-uuid-here";
const response = await apiClient.get(
  `/api/onboarding/organization/${organizationId}/status`
);
const status = response.data;
```

**Response**:

```typescript
{
  practice_uuid: "org-uuid",
  stripe_account_id: "acct_123456789",
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true
}
```

**Response Fields**:
- `practice_uuid`: The practice/organization UUID
- `stripe_account_id`: The Stripe Connect account ID
- `charges_enabled`: Whether the account can accept charges
- `payouts_enabled`: Whether the account can receive payouts
- `details_submitted`: Whether all required details have been submitted to Stripe

**Status Codes**:
- `200 OK`: Successfully retrieved status
- `404 Not Found`: No onboarding record found for this organization
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User doesn't have access to this organization

### Create Connected Account

✅ **IMPLEMENTED** - Used in `BusinessOnboardingModal.tsx`

Create a Stripe Connect account and onboarding session for a practice.

**Endpoint**: `POST /api/onboarding/connected-accounts`

**Request Body**:

```typescript
type CreateConnectedAccountRequest = {
  practice_email: string;  // Email for the Stripe account (required)
  practice_uuid: string;   // Practice/Organization UUID (required)
};
```

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

const response = await apiClient.post('/api/onboarding/connected-accounts', {
  practice_email: "admin@smithlaw.com",
  practice_uuid: "practice-uuid-here"
});

const result = response.data;
```

**Response**:

```typescript
{
  practice_uuid: "org-uuid",
  stripe_account_id: "acct_123456789",
  client_secret: "acct_123456789_secret_abc123xyz",
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false
}
```

**Response Fields**:
- `practice_uuid`: The practice/organization UUID
- `stripe_account_id`: The created Stripe Connect account ID
- `client_secret`: Secret for initializing Stripe Connect embedded onboarding UI
- `charges_enabled`: Initial state (false until onboarding complete)
- `payouts_enabled`: Initial state (false until onboarding complete)
- `details_submitted`: Initial state (false until onboarding complete)

**Status Codes**:
- `201 Created`: Successfully created connected account
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User doesn't have permission for this organization
- `500 Internal Server Error`: Failed to create Stripe account

### Complete Onboarding

✅ **IMPLEMENTED** - Mark onboarding as complete for a practice.

**Endpoint**: `POST /api/onboarding/complete`

**Request Body**:

```typescript
type CompleteOnboardingRequest = {
  organizationId: string;  // Practice/Organization UUID (required)
};
```

**Example**:

```typescript
import { apiClient } from '@/lib/apiClient';

await apiClient.post('/api/onboarding/complete', {
  organizationId: "practice-uuid-here"
});
```

**Response**: `200 OK` on success.

**Status Codes**:
- `200 OK`: Successfully marked onboarding as complete
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User doesn't have permission for this organization

**Note**: This endpoint is used in `BusinessOnboardingModal.tsx` and `BusinessOnboardingPage.tsx` to finalize the onboarding process.

## Using the Client Secret for Stripe Connect Onboarding

✅ **IMPLEMENTED** - The `client_secret` returned from creating a connected account is used to initialize the Stripe Connect embedded onboarding component. Use it with Stripe's `@stripe/react-connect-js` library and the `ConnectAccountOnboarding` component. See `StripeOnboardingStep.tsx` for implementation.

## Validation Rules

### Practice Email
- **Required**
- Must be a valid email format
- Used as the primary email for the Stripe Connect account

### Practice UUID
- **Required**
- Must be a valid UUID
- Must correspond to an existing practice/organization
- User must have appropriate permissions for the organization

## Onboarding Flow

1. **Create Practice**: First create a practice using the Practice API
2. **Create Connected Account**: Call the connected accounts endpoint with practice details
3. **Initialize Stripe UI**: Use the returned `client_secret` to show Stripe's embedded onboarding
4. **Complete Onboarding**: User completes Stripe's onboarding process
5. **Check Status**: Poll or check the onboarding status endpoint to verify completion
6. **Start Accepting Payments**: Once `charges_enabled` is true, the practice can accept payments

## Error Handling

Onboarding API errors follow standard HTTP status codes:

```typescript
// 400 Bad Request - Validation error
{
  "error": "Invalid Connected Account Data",
  "details": {
    "practice_email": "Valid email is required"
  }
}

// 404 Not Found - Organization not found or no onboarding status
{
  "error": "Onboarding status not found"
}

// 401 Unauthorized - Missing or invalid token
{
  "error": "Unauthorized"
}

// 403 Forbidden - User doesn't have permission
{
  "error": "You don't have permission to onboard this organization"
}

// 429 Too Many Requests - Rate limit exceeded
{
  "error": "Too many requests. Please try again later."
}

// 500 Internal Server Error - Stripe API error
{
  "error": "Failed to create connected account"
}
```

## Important Notes

1. **One Connected Account Per Practice**: Each practice can only have one Stripe Connect account
2. **Rate Limiting**: Onboarding endpoints are rate-limited. Don't spam the API.
3. **Client Secret Expiry**: The `client_secret` expires after a period. If expired, create a new session.
4. **Webhook Updates**: Onboarding status is automatically updated via Stripe webhooks
5. **Permission Required**: Only practice admins/owners can create connected accounts

---

# Backend API Improvement Suggestions

**Date**: November 29, 2025

This section contains suggestions for the backend API team to improve developer experience and reduce the need for proxy workarounds. These recommendations are based on pain points encountered during frontend implementation.

## Priority Summary

**Must Have:**
1. Response format consistency
2. CORS support for direct frontend access
3. OpenAPI/Schema documentation
4. Standardized error responses with error codes

**Should Have:**
5. Environment-aware configuration
6. Request ID/tracing support
7. Better pagination
8. Rate limiting headers

**Nice to Have:**
9. WebSocket/SSE for real-time
10. Field selection/filtering
11. Batch operations
12. Health check endpoints

---

## 1. Response Format Consistency (High Priority)

**Problem**: APIs return inconsistent formats, requiring defensive checks everywhere.

**Current Workaround**:
```typescript
const practices = Array.isArray(response.data)
  ? response.data
  : Array.isArray(response.data?.practices)
    ? response.data.practices
    : [];
```

**Recommendation**:
- Standardize on a consistent response wrapper:
```typescript
// Always return this format:
{
  success: boolean;
  data: T;  // Direct data, not wrapped
  error?: string;
  errorCode?: string;
  details?: unknown;
}
```
- For list endpoints, always return `data: T[]` (not `{ practices: T[] }`)
- For single-item endpoints, always return `data: T` (not `{ practice: T }`)

---

## 2. OpenAPI/Schema Documentation (High Priority)

**Problem**: No schema means manual type checking and guessing.

**Recommendations**:
- Provide OpenAPI 3.0 spec (Swagger)
- Include TypeScript types or JSON Schema
- Document all endpoints, request/response formats, error codes
- Add schema validation endpoint for dev/testing

---

## 3. CORS and Direct Frontend Access (High Priority)

**Problem**: Frontend needs a Worker proxy to handle CORS and auth.

**Current Workaround**: Proxy layer in `worker/index.ts` forwarding to `staging-api.blawby.com`

**Recommendations**:
- Add proper CORS headers to all endpoints
- Support direct frontend access (not just via Worker proxy)
- Add `Access-Control-Allow-Credentials: true` for auth requests
- Whitelist `ai.blawby.com` and `localhost:5173` for development

---

## 4. Error Response Standardization (High Priority)

**Problem**: Inconsistent error formats make handling difficult.

**Recommendations**:
- Always include `errorCode` in error responses:
```typescript
{
  success: false,
  error: "Human-readable message",
  errorCode: "PRACTICE_NOT_FOUND", // Machine-readable code
  details?: { /* field-specific errors */ }
}
```
- Use consistent HTTP status codes
- Provide error code enum/constants for frontend

---

## 5. Environment-Aware Base URLs

**Problem**: Hardcoded `staging-api.blawby.com` requires code changes per environment.

**Recommendations**:
- Provide environment detection endpoint: `GET /api/env` returning:
```typescript
{
  environment: "staging" | "production" | "development",
  apiVersion: "v1",
  features: { /* feature flags */ }
}
```
- Or use subdomain-based routing: `api-staging.blawby.com`, `api.blawby.com`

---

## 6. Missing or Incomplete Endpoints

Based on code review, these would help:

**Batch Operations**:
- `POST /api/practice/batch` - Create/update multiple practices
- `GET /api/practice/search?q=...` - Search practices

**Better Pagination**:
- All list endpoints should support `?limit=10&offset=0&cursor=...`
- Return pagination metadata:
```typescript
{
  data: T[],
  pagination: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean,
    nextCursor?: string
  }
}
```

**Webhooks/Events**:
- `GET /api/events` - Stream practice/organization changes
- Webhook support for real-time updates

---

## 7. Request ID and Tracing

**Problem**: Hard to debug issues across proxy → API.

**Recommendations**:
- Support `X-Request-ID` header (generate if missing)
- Return `X-Request-ID` in all responses
- Include request ID in error responses
- Add correlation logging

---

## 8. Rate Limiting Headers

**Recommendations**:
- Include rate limit info in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```
- Return `429 Too Many Requests` with retry-after

---

## 9. Health Check and Status Endpoints

**Recommendations**:
- `GET /api/health` - Basic health check
- `GET /api/status` - Detailed status with dependencies
- `GET /api/version` - API version info

---

## 10. Field Selection and Filtering

**Recommendations**:
- Support field selection: `GET /api/practice/list?fields=id,name,slug`
- Support filtering: `GET /api/practice/list?filter[status]=active`
- Support sorting: `GET /api/practice/list?sort=name&order=asc`

---

## 11. WebSocket/SSE for Real-Time Updates

**Problem**: Frontend polls for updates.

**Recommendations**:
- WebSocket endpoint for practice/organization updates
- Or Server-Sent Events (SSE) for simpler implementation

---

## 12. Request/Response Examples

**Recommendations**:
- Include example requests/responses in docs
- Provide Postman collection or curl examples
- Add example responses for all error codes

---

## 13. Development Mode Features

**Recommendations**:
- `X-Debug-Mode` header to return additional debug info
- Mock/test data endpoints for development
- Request/response logging endpoint (with auth)

---

## 14. Validation Error Details

**Problem**: Validation errors are hard to parse.

**Recommendations**:
- Return detailed validation errors:
```typescript
{
  success: false,
  error: "Validation failed",
  errorCode: "VALIDATION_ERROR",
  details: {
    fields: {
      "slug": ["Slug must be 3-50 characters", "Slug already exists"],
      "email": ["Invalid email format"]
    }
  }
}
```

---

## 15. API Versioning

**Recommendations**:
- Version all endpoints: `/api/v1/practice/...`
- Support multiple versions simultaneously
- Clear deprecation policy with migration guides

---

These improvements would significantly reduce proxy complexity, improve type safety, and simplify frontend development.
