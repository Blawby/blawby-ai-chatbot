# Better Auth Client Setup Guide

This guide explains how the Better Auth client library is configured in this application, including Bearer token authentication, IndexedDB token storage, and organization management.

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

**Note**: If `VITE_AUTH_SERVER_URL` is not set, the client will not work. Always provide this variable.

### Auth Client Configuration

The auth client is configured in `src/lib/authClient.ts`:

```typescript
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { setToken, getTokenAsync } from './tokenStorage';

const AUTH_BASE_URL = import.meta.env.VITE_AUTH_SERVER_URL;

export const authClient = createAuthClient({
  plugins: [organizationClient()],
  baseURL: AUTH_BASE_URL,
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: async () => {
        const token = await getTokenAsync();
        return token || "";
      }
    },
    onSuccess: async (ctx) => {
      const authToken = ctx.response.headers.get("Set-Auth-Token");
      if (authToken) {
        await setToken(authToken);
      }
    }
  }
});
```

### Key Configuration Points

1. **Import from `better-auth/react`**: Required for React/Preact hooks like `useSession()`
2. **Organization Plugin**: `organizationClient()` enables organization management features
3. **Bearer Token Type**: Uses Bearer token authentication instead of cookies
4. **Token Storage**: Tokens are automatically captured from `Set-Auth-Token` response header
5. **Async Token Function**: The token function is async to wait for IndexedDB initialization

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

1. **Always set `VITE_AUTH_SERVER_URL`**: The client will not work without this environment variable
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

This section shows how to configure axios to automatically include the Bearer token in all API requests.

## Environment Variables

Set your API base URL in `.env`:

```bash
VITE_API_BASE_URL=https://your-api-server.com
```

## Axios Configuration File

Create `src/lib/apiClient.ts` to configure axios with automatic token inclusion:

```typescript
// src/lib/apiClient.ts
import axios from 'axios';
import { getTokenAsync } from '@/lib/tokenStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add Bearer token to all requests
apiClient.interceptors.request.use(
  async (config) => {
    const token = await getTokenAsync();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login or refresh token
      console.error('Unauthorized - please log in again');
    }
    return Promise.reject(error);
  }
);
```

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

# Practice Management APIs

This section covers the Practice Management APIs for creating, managing, and switching between law practices.

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
const { practices } = response.data;
```

**Response**:

```typescript
{
  practices: [
    {
      id: "org-uuid",
      name: "Smith & Associates Law Firm",
      slug: "smith-associates",
      logo: "https://example.com/logo.png",
      metadata: {
        industry: "Legal"
      },
      business_phone: "+1-555-0123",
      business_email: "contact@smithlaw.com",
      consultation_fee: 250.00,
      payment_url: "https://payment.example.com",
      calendly_url: "https://calendly.com/smith-law",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T12:00:00Z"
    }
  ]
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

const { practice } = response.data;
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
const { practice } = response.data;
```

**Response**: Returns a single practice object.

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

const { practice } = response.data;
```

**Response**: Returns the updated practice object.

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

This section covers the Onboarding APIs for Stripe Connect integration and practice setup.

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

## Using the Client Secret for Stripe Connect Onboarding

The `client_secret` returned from creating a connected account is used to initialize the Stripe Connect embedded onboarding component. Use it with Stripe's `@stripe/react-connect-js` library and the `ConnectAccountOnboarding` component.

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

