# Stripe Connect Integration Architecture Document

## Overview

This document outlines the proposed integration of Stripe Connect via Railway Hono backend while maintaining the existing Better Auth infrastructure in Cloudflare Workers.

## Current Architecture

### Existing Setup

**Cloudflare Worker (Single Application)**
- **Location**: `worker/index.ts` - Main entry point handling all API routes
- **Deployment**: Single Cloudflare Worker deployed to edge locations globally
- **Routing**: Handles all `/api/*` endpoints including auth, organizations, sessions, files, etc.
- **Environment**: Uses `wrangler.toml` for configuration with environment-specific variables

**Better Auth Integration**
- **Location**: `worker/auth/index.ts` - Better Auth server configuration
- **Database**: D1 (Cloudflare's SQLite database) with schema in `worker/db/auth.schema.ts`
- **Features**: Email/password auth, Google OAuth, organization management
- **Plugins**: Organization plugin, last login method tracking, Stripe integration
- **Session Management**: Cookie-based sessions with `better-auth.session_token`

**Current Stripe Integration**
- **Plugin**: `@better-auth/stripe` integrated directly in Better Auth
- **Configuration**: Located in `worker/auth/index.ts` lines 299-374
- **Features**:
  - User subscription management (business plans)
  - Subscription webhooks (`customer.subscription.*` events)
  - Organization-based subscription plans
  - Trial periods (configurable via `SUBSCRIPTION_TRIAL_DAYS`)
  - Annual discount pricing
  - Automatic customer creation on signup
- **Webhook Handling**: `worker/routes/subscription.ts` processes Stripe events
- **Database Storage**: Subscription data stored in D1 via Better Auth's schema

**Database Architecture (D1)**
- **Schema**: `worker/schema.sql` - Complete database schema
- **Tables**: 
  - `users` - User accounts and authentication data
  - `organizations` - Organization/practice management
  - `subscriptions` - Stripe subscription data
  - `sessions` - User session management
  - `payment_history` - Payment tracking
- **Access**: Only accessible from within Cloudflare Workers (no external access)

**Storage Systems**
- **KV Namespaces**:
  - `CHAT_SESSIONS` - Chat conversation storage
  - `USAGE_QUOTAS` - API usage tracking and limits
- **R2 Bucket**: `FILES_BUCKET` - File upload storage
- **Queues**: `DOC_EVENTS`, `PARALEGAL_TASKS` - Background job processing

**Frontend Integration**
- **Auth Client**: `src/lib/authClient.ts` - Better Auth React client
- **Configuration**: Points to Worker's auth endpoints (`/api/auth/*`)
- **Session Management**: Uses Better Auth's `useSession` hook
- **Organization Management**: Uses Better Auth's organization plugin

### Current Stripe Integration Details

**Subscription Management**
- **Plans**: Business monthly/annual with configurable trial periods
- **Pricing**: Managed via environment variables (`STRIPE_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`)
- **Webhooks**: Handled at `/api/subscription/sync` endpoint
- **Organization Integration**: Subscriptions tied to organizations, not individual users
- **Reference System**: Uses organization IDs as subscription reference IDs

**Payment Processing**
- **Customer Creation**: Automatic on user signup via Better Auth hooks
- **Subscription Lifecycle**: Create → Trial → Active → Cancelled/Expired
- **Webhook Events**: `customer.subscription.created`, `customer.subscription.updated`, etc.
- **Error Handling**: Comprehensive error handling in `worker/services/StripeSync.ts`

**Current Limitations**
- **No Connect**: Only handles direct subscriptions, no marketplace functionality
- **No Platform Fees**: No ability to collect fees from third-party transactions
- **No Connected Accounts**: Cannot onboard external service providers (lawyers/practices)
- **No Payouts**: No automated payout system for external parties

### Current Webhook Issues

**Why Webhooks Are Failing**

**1. Cross-Origin Cookie Issues**
- **Problem**: Frontend runs on `localhost:5173` (or production domain) but webhooks hit Worker at `localhost:8787` (or production Worker URL)
- **Impact**: Better Auth's session cookies (`better-auth.session_token`) are not sent cross-origin
- **Result**: Webhook handlers can't validate user sessions, causing authentication failures

**2. Better Auth Session Validation**
- **Current Flow**: Webhooks → Worker → Better Auth session validation → Database operations
- **Issue**: Better Auth expects session cookies, but webhooks don't have user context
- **Location**: `worker/middleware/auth.ts` - `extractSessionToken()` function
- **Problem**: Falls back to cookie-based auth which fails for cross-origin requests

**3. Webhook Authentication Mismatch**
- **Expected**: Session-based authentication via cookies
- **Reality**: Webhooks are server-to-server calls without user sessions
- **Code**: `worker/routes/subscription.ts` calls `requireAuth()` which expects user sessions
- **Conflict**: Webhooks are system events, not user-initiated requests

**4. Stripe Webhook Signature Verification**
- **Current**: Basic webhook signature verification in `worker/auth/index.ts`
- **Issue**: Better Auth's Stripe plugin expects webhooks to be user-scoped
- **Problem**: Connect webhooks are platform-scoped, not user-scoped
- **Result**: Authentication layer rejects valid Stripe webhooks

**5. Database Access Pattern**
- **Current**: All database access goes through Better Auth's session validation
- **Issue**: Webhooks need direct database access without user context
- **Problem**: Better Auth's D1 integration requires authenticated user context
- **Impact**: Webhook handlers can't directly update subscription/organization data

**Specific Failure Points**

**Subscription Webhooks** (`worker/routes/subscription.ts`)
```typescript
// This fails because webhooks don't have user sessions
await requireAuth(request, env);
await requireOrgOwner(request, env, organizationId);
```

**Better Auth Integration** (`worker/auth/index.ts`)
```typescript
// Stripe plugin expects user-scoped webhooks
stripeIntegration = stripePlugin({
  stripeClient,
  stripeWebhookSecret,
  // This assumes webhooks are tied to user sessions
});
```

**Session Extraction** (`worker/middleware/auth.ts`)
```typescript
// Falls back to cookies which don't exist for webhooks
const cookieHeader = request.headers.get('Cookie');
// Webhooks don't have user cookies
```

**Why This Matters for Connect**
- **Connect webhooks** are inherently platform-scoped, not user-scoped
- **Account events** (`account.updated`, `account.application.deauthorized`) affect the platform
- **Transfer events** (`transfer.created`, `transfer.updated`) are system-level operations
- **Current architecture** assumes all operations are user-scoped, which breaks Connect

### Why Current Architecture Works Well

**Technical Benefits**
- **Unified Deployment**: Single Worker handles all functionality, reducing complexity
- **Edge Performance**: All operations happen within Cloudflare's global edge network
- **Database Security**: D1 only accessible from Workers, no external attack surface
- **Cost Efficiency**: No external database or API costs beyond Cloudflare usage
- **Automatic Scaling**: Cloudflare handles traffic spikes and scaling automatically

**Development Benefits**
- **Single Codebase**: All backend logic in one repository
- **Consistent Environment**: Same runtime environment for all operations
- **Integrated Auth**: Better Auth handles all authentication seamlessly
- **Type Safety**: Full TypeScript support with generated types

**Operational Benefits**
- **Simple Monitoring**: Single deployment to monitor and debug
- **Unified Logging**: All logs in one place via Cloudflare dashboard
- **Easy Rollbacks**: Single deployment unit for rollbacks
- **Environment Management**: Simple environment variable management via `wrangler.toml`

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

### Architecture Benefits

**Clean Separation of Concerns**
- **Frontend**: Stays in Cloudflare Workers (no changes needed)
- **Better Auth**: Remains unchanged in Worker + D1
- **Connect Logic**: Isolated in Railway Hono
- **Database**: Single source of truth (D1) accessed via Worker proxy

**Simplified Authentication**
- **User Auth**: Existing Better Auth (unchanged)
- **Service Auth**: Simple API key between Railway → Worker
- **No Token Forwarding**: No complex session token forwarding needed
- **No User Context Loss**: Railway gets user context via Worker API calls

**Webhook Handling**
- **Direct to Railway**: Stripe webhooks go straight to Railway (no Worker complexity)
- **Railway Processes**: All Connect webhook logic in one place
- **Worker Updates**: Railway calls Worker to update D1 when needed

## Token Security Requirements

### HTTPS Enforcement
- **Mandatory HTTPS**: All Worker → Railway communication MUST use HTTPS/TLS 1.3
- **Certificate Validation**: Railway endpoints must present valid SSL certificates
- **HSTS Headers**: Railway must include `Strict-Transport-Security` headers
- **No HTTP Fallback**: HTTP connections are strictly prohibited for production

### Token Lifecycle Management
- **Short-lived Tokens**: All bearer/session tokens MUST have maximum lifetime of ≤1 hour
- **Explicit Expiry**: All tokens must include `exp` claim with Unix timestamp
- **Refresh Mechanism**: Implement token refresh flow with separate refresh tokens (max 7 days)
- **Revocation Support**: Tokens must be revocable via blacklist/denylist mechanism

### Token Security Semantics
- **Bearer Token Format**: Use JWT with RS256 signing for Worker ↔ Railway communication
- **Session Token Forwarding**: User session tokens forwarded to Railway MUST be validated within 5 minutes
- **Token Rotation**: Implement automatic token rotation every 30 minutes for long-running operations
- **Scope Limitation**: Tokens must include explicit scope claims limiting access to required endpoints only

### Logging Security
- **Token Sanitization**: All logs MUST exclude or mask sensitive token values
- **Pattern Matching**: Implement regex patterns to detect and redact tokens in log output
- **Audit Trail**: Log token creation, validation, and revocation events without exposing token values
- **Error Logging**: Failed authentication attempts logged with sanitized request details only

## Distributed Error Handling & Resilience

### Timeout Policies
- **Worker → Railway Calls**: Maximum 10 seconds timeout for all API calls
- **Railway → Stripe Calls**: Maximum 15 seconds timeout for Stripe API operations
- **Database Operations**: Maximum 5 seconds timeout for D1 queries
- **Webhook Processing**: Maximum 30 seconds timeout for webhook handling

### Retry & Backoff Strategy
- **Exponential Backoff**: Retry failed requests with exponential backoff (1s, 2s, 4s, 8s)
- **Maximum Retries**: 3 retry attempts for transient failures
- **Jitter**: Add random jitter (±25%) to prevent thundering herd
- **Circuit Breaker**: Open circuit after 5 consecutive failures, half-open after 30 seconds

### Circuit Breaker Thresholds
- **Failure Rate**: Open circuit when failure rate exceeds 50% over 2-minute window
- **Request Volume**: Minimum 10 requests required before circuit breaker activates
- **Recovery Time**: Circuit breaker remains open for 60 seconds before attempting recovery
- **Health Check**: Periodic health checks every 15 seconds when circuit is half-open

### Frontend Error Handling
- **Auth Verification Failures**: 
  - Retry `/api/auth/verify-session` up to 2 times with 1-second delay
  - On persistent failure: Redirect to login page with error message
  - Queue failed requests for retry after successful re-authentication
- **Network Timeouts**: 
  - Show user-friendly "Service temporarily unavailable" message
  - Implement automatic retry with exponential backoff
  - Provide manual retry button for user-initiated retries

### Worker Error Handling
- **Railway API Failures**:
  - Return HTTP 503 (Service Unavailable) for circuit breaker open
  - Return HTTP 502 (Bad Gateway) for Railway timeout/failure
  - Log all failures with correlation IDs for debugging
- **Database Failures**:
  - Return HTTP 500 (Internal Server Error) for D1 failures
  - Implement read-only mode when database is unavailable
  - Queue write operations for retry when database recovers

### Rollback & Compensating Actions
- **Expired Token Mid-Operation**:
  - Immediately halt operation and return HTTP 401 (Unauthorized)
  - Log operation state for potential recovery
  - Require user to re-authenticate before retry
  - Implement idempotent operations to prevent duplicate processing
- **Network Partitions**:
  - Implement graceful degradation: continue with cached data when possible
  - Queue operations for later processing when connectivity restored
  - Provide offline indicators to users
  - Maintain operation logs for eventual consistency

## Data Consistency & Resilience Model

### Data Consistency Model
- **Consistency Level**: Eventual consistency with at-least-once delivery guarantees
- **Webhook Delivery**: Stripe webhooks delivered with at-least-once semantics
- **Read Consistency**: Strong consistency for user-facing reads, eventual consistency for background operations
- **Write Consistency**: Immediate consistency for critical user actions, eventual consistency for webhook processing

### Reconciliation & Idempotency

#### Partial Failure Detection
- **Railway Success + Worker Failure**: Detect when Railway creates connected account but Worker persistence fails
- **Detection Methods**:
  - Webhook delivery failures (HTTP 5xx responses)
  - Database constraint violations
  - Missing account records after successful Railway response
  - Correlation ID mismatches between systems

#### Reconciliation Job
- **Frequency**: Every 15 minutes via scheduled Worker cron job
- **Scope**: Check all accounts created in last 2 hours
- **Process**:
  1. Query Railway for accounts missing in Worker database
  2. Re-sync account data from Railway API
  3. Retry failed webhook processing
  4. Log reconciliation actions for audit

#### Retry Window & Compensating Actions
- **Retry Window**: 24 hours for webhook processing failures
- **Compensating Actions**:
  - Delete orphaned Railway accounts if Worker creation fails
  - Rollback partial database transactions
  - Notify users of delayed account activation
  - Escalate to manual intervention after 24 hours

### Webhook Ordering & Conflict Resolution

#### Ordering Guarantees
- **No Ordering**: Stripe webhooks have no guaranteed delivery order
- **Concurrent Processing**: Multiple webhooks may arrive out-of-sequence
- **Race Conditions**: Account updates may arrive before account creation

#### Conflict Resolution Strategy
- **Version/Timestamp Checks**: Include `version` and `updated_at` fields in all webhook payloads
- **Last-Write-Wins**: Use `updated_at` timestamp for conflict resolution
- **Merge Rules**: 
  - Account creation always wins over updates
  - Latest timestamp wins for account updates
  - Preserve all webhook events for audit trail
- **Optimistic Concurrency**: Per-organization concurrency tokens prevent lost updates

#### Implementation Details
```typescript
interface WebhookPayload {
  account_id: string;
  event_type: string;
  version: number;
  updated_at: string;
  concurrency_token: string; // Per-org optimistic concurrency
}
```

### Resilience Behaviors

#### Railway Verify-Session Flow
- **Frontend Fallback UX**:
  - Show loading spinner during verification (max 10 seconds)
  - On timeout: Display "Session expired, please refresh" message
  - Provide manual retry button with exponential backoff
  - Fallback to cached user data when available

- **Retry/Backoff Policy**:
  - Initial retry: 1 second delay
  - Subsequent retries: 2s, 4s, 8s (exponential backoff)
  - Maximum 3 retry attempts
  - Jitter: ±25% to prevent thundering herd

#### Onboarding Flow Resilience
- **Queuing with DLQ**: Failed account creation writes queued for retry
- **Dead Letter Queue**: Messages failing after 3 retries moved to DLQ
- **DLQ Processing**: Manual review and reprocessing of DLQ messages
- **Monitoring/Alerts**: Real-time alerts for DLQ message accumulation

#### Monitoring & Alerts
- **SLA Targets**:
  - Account creation: 95% success rate within 30 seconds
  - Webhook processing: 99% success rate within 5 minutes
  - Reconciliation: Complete within 15 minutes
- **Alert Thresholds**:
  - DLQ messages > 10: Warning
  - DLQ messages > 50: Critical
  - Failed webhooks > 5%: Warning
  - Failed webhooks > 10%: Critical

### Data Flow & Ownership

#### System Ownership Matrix
| Field | Owner | Sync Direction | TTL |
|-------|-------|----------------|-----|
| `stripe_account_id` | Railway | Railway → Worker | N/A |
| `account_status` | Stripe | Stripe → Railway → Worker | 24h |
| `onboarding_complete` | Railway | Railway → Worker | 7d |
| `user_session_token` | Worker | Worker → Railway | 30m |
| `webhook_events` | Worker | Stripe → Worker | 30d |

#### Sync Directions
- **Railway → Worker**: Account creation, status updates, onboarding progress
- **Worker → Railway**: Session tokens, user preferences, audit logs
- **Stripe → Worker**: Webhook events, account status changes, payment events

#### Retry Parameters
- **Webhook Retry**: 3 attempts, exponential backoff (1s, 2s, 4s)
- **API Retry**: 3 attempts, exponential backoff (1s, 2s, 4s)
- **Database Retry**: 5 attempts, linear backoff (100ms intervals)
- **Reconciliation**: Every 15 minutes, max 24-hour window

#### TTL & Cleanup
- **Session Tokens**: 30 minutes TTL, auto-cleanup
- **Webhook Events**: 30 days TTL, archive to cold storage
- **Failed Operations**: 24 hours TTL, move to DLQ
- **Audit Logs**: 1 year TTL, archive to long-term storage

## Alternative Authentication Patterns

### Server-to-Server API Keys
**Implementation**: Railway uses dedicated API keys for Worker communication instead of forwarding user tokens.

**Pros**:
- **Reduced Attack Surface**: No user tokens exposed to Railway service
- **Simplified Security**: Single API key per service, easier to rotate/revoke
- **Better Performance**: No token validation overhead for each request
- **Clearer Separation**: Platform operations vs user operations clearly separated
- **Audit Trail**: Easier to track service-to-service operations

**Cons**:
- **Authorization Complexity**: Railway must implement its own authorization logic
- **User Context Loss**: No direct user context in Railway operations
- **Additional Endpoints**: Need separate endpoints to pass user context when required
- **Token Management**: Additional complexity in managing service API keys

**Recommended Pattern**:
```typescript
// Worker provides user context via separate endpoint
POST /api/connect/onboard
Headers: {
  "Authorization": "Bearer railway-service-key",
  "X-User-Context": "user-id:org-id:session-hash"
}

// Railway validates service key, then fetches user context
GET /api/auth/user-context/{session-hash}
Headers: {
  "Authorization": "Bearer railway-service-key"
}
```

### Mutual TLS (mTLS)
**Implementation**: Railway and Worker authenticate each other using client certificates.

**Pros**:
- **Strong Authentication**: Certificate-based authentication is highly secure
- **No Token Management**: No need to manage API keys or bearer tokens
- **Automatic Rotation**: Certificate rotation can be automated
- **Network Security**: Encrypts all communication with strong encryption

**Cons**:
- **Infrastructure Complexity**: Requires certificate management infrastructure
- **Deployment Complexity**: More complex deployment and configuration
- **Certificate Lifecycle**: Need robust certificate renewal and rotation process
- **Debugging Difficulty**: Harder to debug certificate-related issues

**Recommended Pattern**:
```typescript
// Railway makes requests with client certificate
const response = await fetch('https://worker-domain/api/auth/verify-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionToken }),
  // Client certificate automatically included
});
```

### Hybrid Approach (Recommended)
**Implementation**: Combine server-to-server API keys with user context forwarding for optimal security and functionality.

**Architecture**:
1. **Service Authentication**: Railway authenticates to Worker using API key
2. **User Context**: Worker provides user context via separate secure endpoint
3. **Operation Authorization**: Railway validates user permissions using provided context
4. **Audit Logging**: All operations logged with both service and user context

**Benefits**:
- **Security**: No user tokens exposed to Railway
- **Functionality**: Full user context available for authorization
- **Performance**: Efficient service-to-service communication
- **Maintainability**: Clear separation of concerns
- **Auditability**: Complete audit trail of all operations

**Implementation**:
```typescript
// Railway service authentication
const serviceAuth = {
  'Authorization': `Bearer ${RAILWAY_SERVICE_KEY}`,
  'X-Service-ID': 'railway-connect-service'
};

// User context retrieval
const userContext = await fetch(`${WORKER_API_URL}/api/auth/user-context`, {
  method: 'POST',
  headers: {
    ...serviceAuth,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ 
    sessionToken: userSessionToken,
    operation: 'stripe-connect-onboard'
  })
});
```

## Component Responsibilities

### Cloudflare Worker (Unchanged)
- All authentication via Better Auth + D1
- User/organization management
- Session handling
- Standard user subscriptions
- Main application API routes

### Railway Hono Backend (New)
- Stripe Connect Custom account creation
- Onboarding flow management
- Platform fee configuration
- Connected account webhooks
- Payout scheduling

## Authentication Strategy (Simplified)

### User Flow
1. **User Action**: Frontend calls Railway endpoint
2. **Railway Auth**: Railway validates user via Worker API key
3. **User Context**: Railway fetches user/org data from Worker
4. **Stripe Operations**: Railway handles all Stripe Connect operations
5. **Data Updates**: Railway updates D1 via Worker proxy

### Service Authentication
- **Railway → Worker**: Simple API key authentication
- **Worker → Railway**: No authentication needed (Railway initiates calls)
- **User Context**: Railway gets user context via Worker API calls
- **Authorization**: Railway validates user permissions using Worker-provided context

## Data Access Pattern (Simplified)

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

### Benefits
- **Single Source of Truth**: All data remains in D1
- **No Data Synchronization**: No complex sync between databases
- **Simple Access Pattern**: Railway gets data via Worker API calls
- **Consistent Auth**: All data access goes through Worker's auth layer

## Stripe Webhook Routing

Split webhooks by type:
- Worker: `customer.subscription.*` events (existing)
- Railway: `account.*`, `transfer.*`, `payout.*` events (new)

Both configured in Stripe dashboard with different webhook secrets.

## Environment Variables

### Worker (add these)
```
RAILWAY_API_URL=https://[railway-domain]
RAILWAY_API_KEY=[secure-key]
```

### Railway (new service)
```
STRIPE_SECRET_KEY=[platform-key]
STRIPE_CONNECT_WEBHOOK_SECRET=[connect-webhook-secret]
WORKER_API_URL=[worker-domain]
WORKER_API_KEY=[secure-key]
```

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

Add new pages/components:
- `StripeConnectOnboarding.tsx` - calls Railway API
- Settings page: "Connect Stripe Account" button
- Dashboard: Show connected account status

Update `src/config/backend-api.ts` to include Railway URL for Connect endpoints.

## Database Schema Updates

Add to Worker's D1 schema:

### Core Organization Updates
```sql
-- Add basic Stripe Connect fields to organizations table
ALTER TABLE organizations ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_connect_status TEXT; -- 'pending', 'active', 'disabled'
ALTER TABLE organizations ADD COLUMN platform_fee_percent REAL DEFAULT 10.0;

-- Add compliance and onboarding fields
ALTER TABLE organizations ADD COLUMN terms_accepted_at DATETIME;
ALTER TABLE organizations ADD COLUMN onboarding_step TEXT DEFAULT 'account_creation'; -- 'account_creation', 'stripe_setup', 'verification', 'active'
ALTER TABLE organizations ADD COLUMN onboarding_rejection_reason TEXT;
```

### Platform Fee Transactions Ledger
```sql
-- Track all platform fees for reconciliation and audit
CREATE TABLE platform_fee_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    amount INTEGER NOT NULL, -- Amount in cents
    currency TEXT NOT NULL DEFAULT 'usd',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
    stripe_transfer_id TEXT, -- Reference to Stripe transfer
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_platform_fee_transactions_org_id ON platform_fee_transactions(org_id);
CREATE INDEX idx_platform_fee_transactions_timestamp ON platform_fee_transactions(timestamp);
CREATE INDEX idx_platform_fee_transactions_status ON platform_fee_transactions(status);
```

### Connected Account Metadata & Verification
```sql
-- Track Stripe account verification, KYC, and risk status
CREATE TABLE connected_account_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL UNIQUE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    verification_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'rejected', 'restricted'
    verification_data_reference TEXT, -- Reference to verification documents/data
    bank_account_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'failed', 'not_provided'
    risk_level TEXT DEFAULT 'unknown', -- 'low', 'medium', 'high', 'unknown'
    dispute_history_reference TEXT, -- Reference to dispute tracking
    kyc_completed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_connected_account_metadata_org_id ON connected_account_metadata(org_id);
CREATE INDEX idx_connected_account_metadata_stripe_account_id ON connected_account_metadata(stripe_account_id);
CREATE INDEX idx_connected_account_metadata_verification_status ON connected_account_metadata(verification_status);
```

### Payouts and Transfers Tracking
```sql
-- Track all transfers and payouts to connected accounts
CREATE TABLE payouts_or_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    stripe_transfer_id TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL, -- Amount in cents
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'canceled'
    attempted_at DATETIME,
    completed_at DATETIME,
    failure_reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_payouts_or_transfers_org_id ON payouts_or_transfers(org_id);
CREATE INDEX idx_payouts_or_transfers_stripe_transfer_id ON payouts_or_transfers(stripe_transfer_id);
CREATE INDEX idx_payouts_or_transfers_status ON payouts_or_transfers(status);
CREATE INDEX idx_payouts_or_transfers_attempted_at ON payouts_or_transfers(attempted_at);
```

## Security Considerations

1. **Token Security**: Follow the comprehensive token security requirements outlined above
2. **HTTPS Enforcement**: All inter-service communication must use HTTPS/TLS 1.3
3. **API Key Authentication**: Use unique keys for Worker ↔ Railway communication (see Alternative Authentication Patterns)
4. **Session Validation**: Always validate user sessions through Worker with proper timeout handling
5. **Webhook Signature Verification**: Verify all Stripe webhook signatures
6. **Organization Ownership**: Railway must verify user owns org before operations
7. **Rate Limiting**: Implement rate limits on Railway endpoints
8. **Error Handling**: Follow distributed error handling patterns for resilience
9. **Logging Security**: Sanitize all sensitive data from logs per token security requirements

## Implementation Phases (Simplified Architecture)

### Phase 1: Worker Proxy Endpoints
- Add internal API endpoints for Railway to call
- Implement API key authentication
- Add Connect-related database fields
- Update organization schema

### Phase 2: Railway Service Setup
- Initialize Hono backend
- Configure Stripe Connect SDK
- Implement API key authentication to Worker
- Set up basic Connect account creation

### Phase 3: Connect Onboarding
- Implement onboarding API endpoints
- Add webhook handling (direct to Railway)
- Build onboarding status tracking
- Test end-to-end flow

### Phase 4: Frontend Integration
- Create onboarding UI components
- Add Connect status to settings
- Implement onboarding flow
- Call Railway endpoints directly

### Phase 5: Advanced Features
- Platform fee transfers
- Payout scheduling
- Advanced webhook handling
- Monitoring and alerting

## 🚨 BLOCKING DESIGN DECISIONS REQUIRED (Phase 1 Prerequisites)

**CRITICAL**: The following design decisions must be resolved before Phase 1 implementation can begin. A design review meeting with Kaze is required to make these decisions.

### Required Decisions (Simplified Architecture)

1. **Onboarding Type** ⚠️ **BLOCKING**
   - **Decision Required**: Custom accounts vs Express accounts
   - **Impact**: Railway handles onboarding, Worker just stores results
   - **Owner**: Kaze
   - **Acceptance Criteria**: Clear decision on account type with justification for choice
   - **Recommendation**: Start with Express (simpler), upgrade to Custom later

2. **Platform Fee Model** ⚠️ **BLOCKING**
   - **Decision Required**: Fee percentage and structure
   - **Options**: Fixed percentage per transaction vs configurable per organization
   - **Owner**: Kaze
   - **Acceptance Criteria**: Specific fee percentage(s) and implementation approach defined
   - **Recommendation**: Start with fixed percentage, make configurable later

3. **Payout Schedule** ⚠️ **BLOCKING**
   - **Decision Required**: Payout frequency and trigger mechanism
   - **Options**: Automatic daily/weekly vs manual trigger by organization
   - **Owner**: Kaze
   - **Acceptance Criteria**: Clear payout schedule and trigger mechanism specified
   - **Recommendation**: Start with manual triggers, add automation later

4. **Railway Database Requirement** ✅ **RESOLVED**
   - **Decision**: No Railway database needed!
   - **Impact**: All data stays in D1, accessed via Worker proxy
   - **Owner**: Kaze
   - **Acceptance Criteria**: This eliminates the biggest architectural decision
   - **Status**: ✅ **RESOLVED** - Single source of truth in D1

5. **Authentication Preference** ✅ **RESOLVED**
   - **Decision**: API key authentication (Railway → Worker)
   - **Impact**: Simple service-to-service auth
   - **Owner**: Kaze
   - **Acceptance Criteria**: This is the obvious choice with this architecture
   - **Status**: ✅ **RESOLVED** - Simple API key authentication

### Non-Blocking Questions

6. **Error Handling**: How should Railway communicate Connect errors back to frontend? Direct response or via Worker?
   - **Status**: Can be resolved during Phase 1 implementation
   - **Owner**: Development team

## Next Steps

### 🚨 IMMEDIATE PREREQUISITES (Must Complete Before Phase 1)

1. **Schedule Design Review Meeting with Kaze** ⚠️ **BLOCKING**
   - **Purpose**: Resolve all 5 blocking design decisions listed above
   - **Timeline**: Must be completed before Phase 1 begins
   - **Deliverables**: Signed-off decisions for each blocking question
   - **Owner**: Project Manager / Tech Lead

2. **Document Design Decisions** ⚠️ **BLOCKING**
   - Update this architecture document with final decisions
   - Create implementation specifications based on decisions
   - **Owner**: Development team
   - **Dependencies**: Design review meeting completion

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
