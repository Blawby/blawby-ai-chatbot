# Blawby Backend API Integration

> **⚠️ CRITICAL WARNING**: **NEVER USE STAGING URLs FOR PRODUCTION DEPLOYMENTS**
> 
> - Staging URLs (`staging-api.blawby.com`, `staging.blawby.com`) are for development/testing ONLY
> - Production deployments MUST use `production-api.blawby.com`
> - Using staging URLs in production will route live user traffic to staging environment
> - This can cause data corruption, security issues, and service disruption
> - Always verify production URLs before deployment

## Overview

This application integrates with the external **Blawby Backend API** for user authentication and organization (practice) management. The backend API handles all user-related operations while the local Cloudflare Workers handle AI chat functionality.

## API Endpoints

### Base URL
- **Production**: `https://production-api.blawby.com/api` ✅ **CORRECT PRODUCTION URL**
- **Development**: Can be overridden with `VITE_BACKEND_API_URL` environment variable
- **Legacy Railway**: `https://blawby-backend-production.up.railway.app/api` (Currently returning 404)

### Authentication Endpoints

#### Sign Up
```http
POST /auth/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Headers Set:**
- `set-auth-token`: JWT token (for backwards compatibility)
- `set-cookie`: `better-auth.session_token=<token>; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax`

**Note:** The backend uses Better Auth and sets an HTTP-only session cookie in addition to returning the JWT token. The cookie enables cookie-based session management.

#### Sign In
```http
POST /auth/sign-in/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Headers Set:**
- `set-auth-token`: JWT token (for backwards compatibility)
- `set-cookie`: `better-auth.session_token=<token>; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax`

**Note:** The backend uses Better Auth and sets an HTTP-only session cookie in addition to returning the JWT token.

### Internal Endpoints (Used by Better Auth Library)

> **⚠️ Note for Developers**: The following endpoint is called automatically by the Better Auth client library. You do not need to call it directly in your application code.

#### Get Session (Internal - Better Auth Library)
```http
GET /auth/get-session
Cookie: better-auth.session_token=<session_token>
```

**Response:**
```json
{
  "session": {
    "id": "session_id",
    "userId": "user_id",
    "token": "session_token",
    "expiresAt": "2024-01-02T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "activeOrganizationId": null
  },
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": false,
    "image": null,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Headers returned:**
- `set-auth-token`: JWT token for Bearer auth (optional, for backwards compatibility)

**Note:** This endpoint is used internally by the Better Auth client library to validate sessions. The frontend uses `authClient.useSession()` hook instead of calling this endpoint directly.

#### Get Current User Details
```http
GET /user-details/me
Cookie: better-auth.session_token=<session_token>
```

**Preferred authentication method**: Cookie-based session (requests should be made with credentials included and no Authorization header)

**Legacy/optional**: Bearer token authentication remains accepted for backward compatibility:
```http
GET /user-details/me
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "details": {
    "phone": "+1234567890",
    "dob": "1990-01-15",
    "productUsage": ["others"]
  }
}
```

#### Sign Out
```http
POST /auth/sign-out
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true
}
```

### User Details Management

#### Get User Details
```http
GET /user-details/me
Cookie: better-auth.session_token=<session_token>
```

**Preferred authentication method**: Cookie-based session (requests should be made with credentials included and no Authorization header)

**Legacy/optional**: Bearer token authentication remains accepted for backward compatibility:
```http
GET /user-details/me
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "details": {
    "id": "7b5dd9fe-a64d-4142-a4c1-e0aa56b20c65",
    "user_id": "63969657-abe3-4a86-aa89-01ae437d2f68",
    "stripe_customer_id": "cus_TItnnqvYZTGXUW",
    "phone": "+1234567890",
    "dob": "1990-01-15 00:00:00",
    "product_usage": ["others"],
    "created_at": "2025-10-26T00:39:54.764Z",
    "updated_at": "2025-10-26T02:37:02.599Z"
  }
}
```

#### Update User Details
```http
PUT /user-details/me
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "phone": "+1234567890",
  "dob": "1990-01-15",
  "productUsage": ["others"]
}
```

**Response:**
```json
{
  "id": "7b5dd9fe-a64d-4142-a4c1-e0aa56b20c65",
  "user_id": "63969657-abe3-4a86-aa89-01ae437d2f68",
  "stripe_customer_id": "cus_TItnnqvYZTGXUW",
  "phone": "+1234567890",
  "dob": "1990-01-15 00:00:00",
  "product_usage": ["others"],
  "created_at": "2025-10-26T00:39:54.764Z",
  "updated_at": "2025-10-26T02:37:02.599Z"
}
```

### Practice (Organization) Management

#### List Practices
```http
GET /practice/list
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "practices": [
    {
      "id": "practice_id",
      "name": "My Law Practice",
      "slug": "my-law-practice",
      "logo": null,
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "business_phone": "+1-555-123-4567",
      "business_email": "contact@example.com",
      "consultation_fee": 25000,
      "payment_url": "https://example.com/payment",
      "calendly_url": "https://calendly.com/example"
    }
  ]
}
```

#### Create Practice
```http
POST /practice
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My Law Practice",
  "slug": "my-law-practice",
  "logo": "https://example.com/logo.png",
  "metadata": {
    "description": "A law practice description"
  },
  "business_phone": "+1-555-123-4567",
  "business_email": "contact@example.com",
  "consultation_fee": 25000,
  "payment_url": "https://example.com/payment",
  "calendly_url": "https://calendly.com/example"
}
```

**Response:**
```json
{
  "practice": {
    "id": "practice_id",
    "name": "My Law Practice",
    "slug": "my-law-practice",
    "logo": "https://example.com/logo.png",
    "metadata": {
      "description": "A law practice description"
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "business_phone": "+1-555-123-4567",
    "business_email": "contact@example.com",
    "consultation_fee": 25000,
    "payment_url": "https://example.com/payment",
    "calendly_url": "https://calendly.com/example"
  }
}
```

#### Get Practice
```http
GET /practice/{practice_id}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "practice": {
    "id": "practice_id",
    "name": "My Law Practice",
    "slug": "my-law-practice",
    "logo": "https://example.com/logo.png",
    "metadata": {
      "description": "A law practice description"
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "business_phone": "+1-555-123-4567",
    "business_email": "contact@example.com",
    "consultation_fee": 25000,
    "payment_url": "https://example.com/payment",
    "calendly_url": "https://calendly.com/example"
  }
}
```

#### Update Practice
```http
PUT /practice/{practice_id}
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Practice Name",
  "business_phone": "+1-555-987-6543",
  "consultation_fee": 30000
}
```

#### Delete Practice
```http
DELETE /practice/{practice_id}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Practice deleted successfully"
}
```

## Data Types

### User
```typescript
interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Practice
```typescript
interface Practice {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  business_phone: string | null;
  business_email: string | null;
  consultation_fee: number | null; // Amount in cents
  payment_url: string | null;
  calendly_url: string | null;
}
```

## Authentication Flow

1. **Client Library**: Frontend uses `createAuthClient` from Better Auth (see `src/lib/authClient.ts`) with `baseURL` pointing to `/api/auth`.
2. **User Registration/Login**: UI calls `authClient.signUp.email` and `authClient.signIn.email` helpers. The Better Auth client manages CSRF and redirects.
3. **Session Cookie**: Backend automatically sets `better-auth.session_token` (HttpOnly, SameSite=Lax) on successful auth. No JWT or local storage token management required.
4. **Automatic Session Management**:
   - `authClient.useSession()` provides reactive session data within `AuthContext` - **no manual session checking needed**
   - `AuthContext` fetches `/user-details/me` after session hydration for enriched profile details
   - Sessions expire after 24 hours; the Better Auth client automatically handles session validation
   - **Important**: You don't need to call `/auth/get-session` - this is handled internally by the Better Auth library
5. **API Requests**: SPA calls backend APIs (e.g., practices, onboarding) with `credentials: 'include'` so the Better Auth cookie is sent automatically.
6. **Sign Out**: `authClient.signOut()` clears the session on the server and the cookie; UI utility `src/utils/auth.ts` delegates to this client.
7. **Session State**: Components listen to `useSession()` from Better Auth for reactive session state - all session management is automatic!

## Error Handling

### Common Error Responses
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "validation": [
    {
      "field": "email",
      "message": "Email is required",
      "code": "required"
    }
  ]
}
```

### Network Errors
- **Connection Issues**: Frontend handles network failures gracefully
- **Token Expiry**: Automatic redirect to login page
- **Rate Limiting**: Backend implements rate limiting for API endpoints

## Integration Notes

### Frontend Implementation
- **Auth Client**: `src/lib/authClient.ts` wraps Better Auth's client for the SPA.
- **API Client**: `src/lib/backendClient.ts` handles non-auth endpoints (practices, onboarding, etc.) using cookie-based auth.
- **Context**: `src/contexts/AuthContext.tsx` bridges Better Auth's hooks with legacy consumers and merges `/user-details/me`.
- **Types**: `src/types/backend.ts` defines TypeScript interfaces.

### Security Considerations
- **Cookie Sessions**: All auth relies on the `better-auth.session_token` HttpOnly cookie.
- **HTTPS Only**: All API communication over HTTPS.
- **Session Expiry**: 24-hour session lifetime with automatic refresh managed by Better Auth.
- **CORS**: Backend configured for cross-origin requests with credentials.
- **Browser Storage**: No tokens are persisted in localStorage/IndexedDB; avoid logging cookie metadata.
- **Session Validation**: Backend validates session cookies on every request.

### Development vs Production
- **Production**: Requires `VITE_BACKEND_API_URL` to be explicitly set
- **Development**: Allows fallback to localhost for convenience
- **Environment Variable Configuration**: 
  - Development: `VITE_BACKEND_API_URL=http://localhost:3000/api` (include /api prefix)
  - Production: `VITE_BACKEND_API_URL=https://your-production-api.com/api` (required)
  - Testing: Backend API integration tested via Playwright e2e tests with `BLAWBY_API_BASE_URL`

## Future Enhancements

### Planned Features
- **Google OAuth**: Social authentication integration
- **User Profile Updates**: Backend support for user profile modifications
- **Multi-tenant**: Enhanced organization management features
- **Webhooks**: Real-time updates for organization changes

### API Versioning
- Current version: v1 (implicit)
- Future versions will include version headers
- Backward compatibility maintained for major versions

## Testing with Curl Commands

### Developer-Facing Endpoints (For Application Integration)

#### 1. Create Account
```bash
curl --location --request POST 'https://production-api.blawby.com/api/auth/sign-up/email' \
--header 'Content-Type: application/json' \
--data-raw '{"email": "test@example.com", "password": "testpassword123", "name": "Test User"}'
```

#### 2. Sign In (Sets Session Cookie Automatically)
```bash
curl --location --request POST 'https://production-api.blawby.com/api/auth/sign-in/email' \
--header 'Content-Type: application/json' \
--data-raw '{"email": "test@example.com", "password": "testpassword123"}' \
-c cookies.txt -b cookies.txt \
-v
```

**Expected Response Headers:**
```http
< set-cookie: better-auth.session_token=<TOKEN>; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400
< set-auth-token: <JWT_TOKEN>
```

**Note**: After calling these endpoints, the session cookie is automatically set and will be included in subsequent requests by the Better Auth client library. Cookies are persisted using cookies.txt for subsequent requests.

### Internal Endpoint Testing (For Debugging/Verification Only)

> **⚠️ Debugging Only**: The following endpoint is used internally by the Better Auth library. In your application, use `authClient.useSession()` instead of calling this directly.

#### Get Session (Internal - For Debugging)
```bash
curl --location --request GET 'https://production-api.blawby.com/api/auth/get-session' \
--cookie 'better-auth.session_token=YOUR_SESSION_TOKEN_HERE' \
-c cookies.txt -b cookies.txt
```

**Note**: The session token is in the `set-cookie` header from signin response. This is only for debugging - your app should use the Better Auth client library instead.

### Session Cookie Test Results (Verified ✅)

**Test Date**: October 26, 2025,  
**Backend URL**: `https://production-api.blawby.com/api`

#### ✅ Sign-In Test
- **Status**: 200 OK
- **Cookie Set**: `better-auth.session_token=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
- **Security Attributes**: All correct (HttpOnly, SameSite=Lax, Path=/, 24-hour expiry)
- **User Data**: Returns complete user object with ID

#### ✅ Get-Session Test (With Cookie)
- **Status**: 200 OK
- **Session Object**: Contains `id`, `userId`, `token`, `expiresAt`, `createdAt`, `ipAddress`, `userAgent`
- **User Object**: Matches signed-in user data
- **User ID Consistency**: Verified across both endpoints

#### ✅ Get-Session Test (Without Cookie)
- **Status**: 200 OK
- **Response**: `null` (correctly indicates no active session)

#### ✅ Cookie-Mechanism Verification
- **Cookie Extraction**: Successfully extracts token from `set-cookie` header
- **Cookie Validation**: Backend properly validates session cookies
- **Session Persistence**: Sessions persist for 24 hours as configured
- **Security**: All security attributes properly set

#### 4. Get User Details (Token-based)
```bash
curl --location --request GET 'https://production-api.blawby.com/api/user-details/me' \
--header 'Authorization: Bearer YOUR_TOKEN_HERE'
```

#### 5. Update User Details
```bash
curl --location --request PUT 'https://production-api.blawby.com/api/user-details/me' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_TOKEN_HERE' \
--data-raw '{"phone": "+1234567890", "dob": "1990-01-15", "productUsage": ["others"]}'
```

#### 6. Verify Updated Details
```bash
curl --location --request GET 'https://production-api.blawby.com/api/user-details/me' \
--header 'Authorization: Bearer YOUR_TOKEN_HERE'
```

**Note**: Replace `YOUR_TOKEN_HERE` with the token from the sign-in response (step 2). The token is returned in the `set-auth-token` header.

## Troubleshooting

### Common Issues
1. **CORS Errors**: Ensure backend allows frontend domain
2. **Token Expiry**: Check token validity and refresh logic
3. **Network Timeouts**: Verify backend API availability
4. **Authentication Failures**: Validate credentials and token format

### Debug Information
- Frontend logs authentication flow with `🔍` prefixed messages
- Backend API responses include detailed error information
- Network requests visible in browser developer tools

---

**Last Updated**: October 2025  
**API Version**: v1  
**Backend URL**: https://production-api.blawby.com/api  
**Status**: ✅ Session cookies verified and working
