# Stripe Connect Integration Architecture

## Current Architecture
- **Cloudflare Worker**: Single app handling all API routes
- **Better Auth**: Email/password auth, Google OAuth, organization management
- **D1 Database**: Users, organizations, subscriptions, sessions
- **Current Stripe**: Direct subscriptions only (no Connect)

## Proposed Architecture (Kaze's Design)

```
Frontend (Cloudflare Workers)
    ↓
    → Better Auth (D1)

Railway Hono Backend
    ↓
    → Calls Proxy Worker (API key authenticated)
    ↓
    → D1 Database

Stripe Webhooks
    ↓
    → Direct to Railway Hono
```

## Component Responsibilities

### Cloudflare Worker
- Better Auth + D1
- User/organization management
- Internal API endpoints for Railway

### Railway Hono Backend (Kaze's Domain)
- All Stripe Connect business logic
- Connect account onboarding
- Platform fee management
- Webhook handling

### Frontend
- **betterAuthClient**: User authentication
- **backendClient**: Simple API calls to Railway
- No business logic, just UI

## Authentication Strategy

### Frontend Client Pattern
- **betterAuthClient**: User authentication and session management
- **backendClient**: Simple API calls to Railway with user session tokens

### User Flow
1. **User Action**: Frontend calls Railway via backendClient
2. **Session Token**: Frontend includes user session token in headers
3. **Railway Validation**: Railway validates user via Worker API
4. **Stripe Operations**: Railway handles all Stripe Connect operations
5. **Data Updates**: Railway updates D1 via Worker proxy

### Service Authentication
- **Railway → Worker**: API key authentication
- **Frontend → Railway**: User session token in headers

### Security Practices

#### API Key Authentication (Railway → Worker)
- **Generation**: Generate a cryptographically secure random API key (minimum 32 characters, use secure random generator)
- **Storage**: Store API key in environment variables or secret manager:
  - **Worker**: Store in Cloudflare Workers secrets (`wrangler secret put INTERNAL_API_KEY`)
  - **Railway**: Store in Railway environment variables or secret manager
  - **Never** commit API keys to version control or include in code
- **Rotation Policy**: 
  - Rotate API keys at least quarterly or immediately upon suspected compromise
  - Implement key versioning to support zero-downtime rotation
  - Maintain a grace period where both old and new keys are accepted during rotation
- **Protection**:
  - Transmit API keys only over HTTPS/TLS
  - Include API key in request headers: `X-API-Key: <api-key>` or `Authorization: Bearer <api-key>`
  - Validate API key on all Worker internal endpoints before processing requests
  - Reject requests with invalid or missing API keys with 401 Unauthorized
  - Log API key validation failures (without logging the key value) for monitoring

#### Session Token Authentication (Frontend → Railway)
- **Format**: Session tokens are JWT tokens issued by Better Auth, containing user ID, session ID, and expiration timestamp
- **Validation**: Railway validates session tokens by:
  1. Calling Worker endpoint `POST /api/internal/verify-user-context` with the token
  2. Worker validates token signature and expiration using Better Auth session store
  3. Worker returns user context if valid, or error if invalid/expired
- **Expiration**: Session tokens expire based on Better Auth configuration (typically 7-30 days)
- **Refresh**: Frontend automatically refreshes tokens via Better Auth's session management when tokens approach expiration
- **Storage**: 
  - Frontend stores tokens in memory or secure HTTP-only cookies (managed by Better Auth)
  - Railway receives tokens in request headers: `Authorization: Bearer <session-token>`
  - Never store tokens in localStorage or expose in URLs

#### Endpoint Authentication Requirements
- **Worker Internal Endpoints** (require API key):
  - `POST /api/internal/verify-user-context`
  - `GET /api/internal/organization/{id}`
  - `POST /api/internal/update-organization`
  - `POST /api/internal/create-connect-account`
- **Railway User Endpoints** (require session token):
  - `POST /api/connect/onboard`
  - `GET /api/connect/status/{orgId}`
  - `POST /api/connect/transfer`
  - `GET /api/connect/balance/{orgId}`
- **Railway Webhook Endpoint** (requires Stripe webhook signature, not user authentication):
  - `POST /api/connect/webhook`

## Data Access Pattern

### Worker Proxy Endpoints
Railway calls Worker via internal API endpoints:
- `POST /api/internal/verify-user-context` - validate user and get context
- `GET /api/internal/organization/{id}` - get organization details
- `POST /api/internal/update-organization` - update organization data
- `POST /api/internal/create-connect-account` - store Connect account ID

### Webhook Flow
1. **Stripe Webhook**: Goes directly to Railway
2. **Railway Processing**: Handles Connect webhook logic
3. **Worker Update**: Railway calls Worker to update D1
4. **Data Sync**: D1 stays in sync with Stripe events

#### Webhook Security
- **Signature Verification**: Railway must verify Stripe webhook signatures using the Stripe webhook secret before processing any webhook events
- **Request Rejection**: Reject all webhook requests with invalid or missing signatures with an appropriate HTTP error response (e.g., 401 Unauthorized)
- **Validation Logging**: Log all webhook signature validation failures for monitoring and alerting, ensuring minimal sensitive data is included in logs (e.g., log event type, timestamp, and validation status, but avoid logging full request bodies or secrets)

## API Endpoints

### Worker (new internal endpoints)
- `POST /api/internal/verify-user-context` - validate user and get context
- `GET /api/internal/organization/{id}` - get organization details
- `POST /api/internal/update-organization` - update organization data
- `POST /api/internal/create-connect-account` - store Connect account ID

### Railway (new service)
- `POST /api/connect/onboard` - start onboarding flow
- `GET /api/connect/status/{orgId}` - check onboarding status
- `POST /api/connect/webhook` - handle Connect webhooks
- `POST /api/connect/transfer` - create platform fee transfer
- `GET /api/connect/balance/{orgId}` - get connected account balance

## Frontend Changes

### Client Architecture
- **betterAuthClient**: User authentication (existing)
- **backendClient**: Simple API calls to Railway (new)

### Usage Pattern
```typescript
// User authentication via Better Auth
const { user } = await betterAuthClient.getSession();

// Simple Stripe Connect operations via Railway
const connectStatus = await backendClient.get('/api/connect/status', {
  headers: {
    'Authorization': `Bearer ${user.sessionToken}`,
    'X-User-ID': user.id,
    'X-Org-ID': user.organizationId
  }
});
```

## Database Schema Updates

Add to Worker's D1 schema:
```sql
-- Add basic Stripe Connect fields to organizations table
ALTER TABLE organizations ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_connect_status TEXT; -- 'pending', 'active', 'disabled'
ALTER TABLE organizations ADD COLUMN platform_fee_percent REAL DEFAULT 10.0;
ALTER TABLE organizations ADD COLUMN onboarding_step TEXT DEFAULT 'account_creation';
ALTER TABLE organizations ADD COLUMN onboarding_rejection_reason TEXT;
```

## Implementation Phases

### Phase 1: Worker Proxy Endpoints
- Add internal API endpoints for Railway
- Implement API key authentication
- Add Connect-related database fields

### Phase 2: Railway Service Setup
- Initialize Hono backend
- Configure Stripe Connect SDK
- Implement API key authentication to Worker

### Phase 3: Connect Onboarding
- Implement onboarding API endpoints
- Add webhook handling (direct to Railway)
- Test end-to-end flow

### Phase 4: Frontend Integration
- Create onboarding UI components
- Add Connect status to settings
- Call Railway endpoints directly

### Phase 5: Advanced Features
- Platform fee transfers
- Payout scheduling
- Advanced webhook handling

## 🚨 BLOCKING DESIGN DECISIONS REQUIRED

**CRITICAL**: These decisions must be resolved before Phase 1 implementation begins.

### Required Decisions

1. **Onboarding Type** ⚠️ **BLOCKING**
   - **Decision**: Custom accounts vs Express accounts
   - **Owner**: Kaze
   - **Recommendation**: Start with Express (simpler), upgrade to Custom later

2. **Platform Fee Model** ⚠️ **BLOCKING**
   - **Decision**: Fee percentage and structure
   - **Owner**: Kaze
   - **Recommendation**: Start with fixed percentage, make configurable later

3. **Payout Schedule** ⚠️ **BLOCKING**
   - **Decision**: Payout frequency and trigger mechanism
   - **Owner**: Kaze
   - **Recommendation**: Start with manual triggers, add automation later

4. **Railway Database Requirement** ✅ **RESOLVED**
   - **Decision**: No Railway database needed!
   - **Status**: Single source of truth in D1

5. **Authentication Preference** ✅ **RESOLVED**
   - **Decision**: API key authentication (Railway → Worker)
   - **Status**: Simple API key authentication

## Next Steps

### 🚨 IMMEDIATE PREREQUISITES

1. **Schedule Design Review Meeting with Kaze** ⚠️ **BLOCKING**
   - **Purpose**: Resolve 3 remaining blocking design decisions
   - **Owner**: Project Manager / Tech Lead

2. **Document Design Decisions** ⚠️ **BLOCKING**
   - Update architecture document with final decisions
   - **Owner**: Development team

### Phase 1 Prerequisites Checklist

- [ ] **Onboarding Type Decision**: Custom vs Express accounts
- [ ] **Platform Fee Model Decision**: Percentage and structure defined
- [ ] **Payout Schedule Decision**: Frequency and trigger mechanism
- [x] **Railway Database Decision**: ✅ **RESOLVED** - Single source of truth in D1
- [x] **Authentication Preference Decision**: ✅ **RESOLVED** - API key authentication
- [ ] **Kaze Sign-off**: All decisions approved and documented

### Implementation Timeline (After Prerequisites Met)

3. Review updated architecture doc with resolved decisions
4. Kaze sets up Railway project structure
5. Begin Phase 1 (Worker API endpoints)

## References

- [Stripe Connect Custom Accounts](https://stripe.com/docs/connect/custom-accounts)
- [Stripe Connect Webhooks](https://stripe.com/docs/connect/webhooks)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
