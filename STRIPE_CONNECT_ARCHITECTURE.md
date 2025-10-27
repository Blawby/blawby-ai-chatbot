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

## Proposed Architecture

```
Frontend (Preact)
    ↓
    → Cloudflare Worker (Auth & Main App)
        - Better Auth (D1)
        - Existing API routes
        - Standard Stripe subscriptions
        
    → Railway Hono Backend (Stripe Connect)
        - Connect account onboarding (Custom accounts)
        - Platform fee management
        - Connected account webhooks
        - Auth via Worker API
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

## Authentication Strategy

Railway authenticates with Worker using:
- Session token from user request (forwarded from frontend)
- Worker validates via `/api/auth/verify-session`
- Worker returns user + organization context
- Railway makes authorization decisions based on response

## Data Access Pattern

Railway reads from Worker's D1 via API endpoints:
- `GET /api/organizations/{id}` - org details
- `GET /api/auth/verify-session` - validate user session
- `POST /api/organizations/{id}/stripe-connect` - store Connect account ID

No direct D1 access from Railway (not possible anyway).

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

### Worker (new endpoints)
- `POST /api/auth/verify-session` - validate session token, return user/org
- `PUT /api/organizations/{id}/stripe-connect` - store Connect account ID

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
```sql
ALTER TABLE organizations ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_connect_status TEXT; -- 'pending', 'active', 'disabled'
ALTER TABLE organizations ADD COLUMN platform_fee_percent REAL DEFAULT 10.0;
```

## Security Considerations

1. **API Key Authentication**: Use unique keys for Worker ↔ Railway communication
2. **Session Validation**: Always validate user sessions through Worker
3. **Webhook Signature Verification**: Verify all Stripe webhook signatures
4. **Organization Ownership**: Railway must verify user owns org before operations
5. **Rate Limiting**: Implement rate limits on Railway endpoints

## Implementation Phases

### Phase 1: Worker API Endpoints
- Add session verification endpoint
- Add Connect account storage endpoints
- Update organization schema

### Phase 2: Railway Setup
- Initialize Hono project
- Configure Stripe Connect SDK
- Implement auth middleware (calls Worker)

### Phase 3: Connect Onboarding
- Create onboarding API endpoints
- Implement Custom Connect account creation
- Build onboarding status tracking

### Phase 4: Frontend Integration
- Create onboarding UI components
- Add Connect status to settings
- Implement onboarding flow

### Phase 5: Webhooks & Transfers
- Configure Connect webhooks in Stripe
- Implement webhook handlers
- Build platform fee transfer logic

## Open Questions for Kaze

1. **Onboarding Complexity**: Custom accounts require hosting the full onboarding experience. Express accounts are simpler but less customizable. Confirm Custom is the right choice?

2. **Platform Fee Model**: What percentage? Fixed per transaction or configurable per organization?

3. **Payout Schedule**: Automatic daily/weekly payouts or manual trigger by organization?

4. **Railway Database**: Does Railway need its own database for Connect-specific data, or is API-only access to Worker sufficient?

5. **Authentication Preference**: Session token forwarding (user-scoped) or API key (server-to-server)? Or both?

6. **Error Handling**: How should Railway communicate Connect errors back to frontend? Direct response or via Worker?

## Next Steps

1. Review this architecture doc
2. Answer open questions
3. Decide on implementation timeline
4. Kaze sets up Railway project structure
5. Begin Phase 1 (Worker API endpoints)

## References

- [Stripe Connect Custom Accounts](https://stripe.com/docs/connect/custom-accounts)
- [Stripe Connect Webhooks](https://stripe.com/docs/connect/webhooks)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
