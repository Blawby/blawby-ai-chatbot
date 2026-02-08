# Build Plan Brief: Post-Refactor Practice Subscription & Conversation-Matter Linking

## 1. Executive Summary

- **Two payment domains**: (1) Practice subscription billing (practice-as-customer via Stripe subscriptions), (2) Client consultation payment (client-as-customer via intake checkout; practice receives payouts via Stripe Connect)
- **Greenfield constraints**: No backward compatibility; no fallbacks that mask backend failures; backend API is source of truth
- **Practice subscription flow** appears disconnected: need to trace Better Auth org creation → subscription purchase → Stripe webhook → active status
- **Client intake payment flow** partially implemented: checkout session creation exists, but post-payment claim/invite/linking flow needs verification
- **Conversation ↔ matter linking** exists in worker D1 (`conversations.matter_id`, verified in `worker/schema.sql` line 44) but cardinality and enforcement rules unknown
- **Evidence gaps**: subscription checkout UI location, Stripe Connect vs subscription separation, current conversation-matter cardinality in production

## 2. Current Architecture Boundaries & System of Record

### Frontend (Cloudflare Pages Preact)
- **Location**: `src/`
- **Build**: Vite
- **Config**: `src/config/urls.ts` (routing/env source of truth)
- **Responsibilities**: UI rendering, Better Auth React client, API orchestration
- **System of record**: None (renders remote state only)

### Worker API (Cloudflare Workers)
- **Location**: `worker/`
- **Entry**: `worker/index.ts`
- **Storage**: D1 database (`worker/schema.sql`)
- **Responsibilities**: Conversations, messages, files, worker-owned matter linkage
- **System of record**: Conversations (D1), conversation ↔ matter linkage (D1 `conversations.matter_id`)

### Remote Backend API (Node.js, blawby-ts)
- **Schema**: `https://staging-api.blawby.com/llms.txt` (retrieved 2026-02-08)
- **Env var**: `VITE_BACKEND_API_URL` (required)
- **Responsibilities**: Auth, practice CRUD, subscriptions, Stripe Connect onboarding, intake settings, user details
- **System of record**: Practice subscription status, Stripe Connect account state, practice metadata, user/org membership

## 3. Payment Domain Separation

### Domain 1: Practice Subscription Billing (Practice-as-Customer)
- **Customer**: Practice (Better Auth organization)
- **Payment method**: Stripe subscription objects
- **Flow**: Plan selection → Stripe Checkout → webhook → subscription active
- **Endpoints to confirm in llms.txt**:
  - `GET /api/subscriptions/plans` (list available plans)
  - `GET /api/subscription` (current subscription)
  - `POST /api/subscription` (create/update subscription)
  - `DELETE /api/subscription` (cancel subscription)
- **System of record**: Remote backend (subscription status, plan, period)
- **Worker role**: Proxy only (lines 96–97 in `worker/index.ts`)
- **Frontend role**: Render subscription state, initiate checkout, poll for activation

### Domain 2: Client Consultation Payment (Client-as-Customer)
- **Customer**: Client (anonymous or authenticated user)
- **Payment method**: Stripe Checkout Session (one-time payment)
- **Payout**: Practice receives funds via Stripe Connect
- **Flow**: Intake submit → checkout session → payment → claim/invite → org membership
- **Endpoints to confirm in llms.txt**:
  - `POST /api/practice/client-intakes` (create intake)
  - `POST /api/practice/client-intakes/{uuid}/checkout-session` (create Stripe Checkout Session)
  - `GET /api/practice/client-intakes/status?session_id={sessionId}` (post-pay status)
  - `POST /api/practice/client-intakes/claim` (claim paid intake, link to user)
  - `POST /api/practice/client-intakes/{uuid}/invite` (trigger intake invitation)
- **System of record**: Remote backend (intake status, payment status, Stripe session ID)
- **Worker role**: Creates matter after payment confirmed (`POST /api/intakes/confirm`, verified in `worker/index.ts` line 80)
- **Frontend role**: Initiate checkout, handle redirect, trigger claim/invite

### Domain 3: Practice Stripe Connect Onboarding (Payout Setup)
- **Purpose**: Enable practice to receive client consultation payments
- **Flow**: Subscription active → initiate onboarding → Stripe hosted flow → return → verify status
- **Endpoints to confirm in llms.txt**:
  - `POST /api/onboarding/connected-accounts` (create connected account, return hosted URL)
  - `GET /api/onboarding/status` (verify `charges_enabled`, `payouts_enabled`)
- **System of record**: Remote backend (Stripe account ID, onboarding status)
- **Worker role**: Proxy only (line 89 in `worker/index.ts`)
- **Frontend role**: Initiate onboarding, redirect to Stripe, verify completion

## 4. Responsibility Matrix

| Concern | Worker (D1) | Remote Backend | Frontend |
|---------|-------------|----------------|----------|
| **Practice subscription status** | Proxy only | Source of truth | Render only |
| **Stripe Connect account state** | Proxy only | Source of truth | Render only |
| **Conversation storage** | Source of truth | N/A | Render only |
| **Conversation ↔ matter linkage** | Source of truth (`conversations.matter_id`) | Matter metadata only | Render only |
| **Intake payment status** | N/A | Source of truth | Render only |
| **Matter CRUD** | Proxy + enrich | Source of truth | Render only |
| **Better Auth org membership** | N/A | Source of truth | Render only |

## 5. Known Routes/Endpoints Map

### Worker-Local Endpoints (Verified in worker/index.ts)
Enumerate from `worker/index.ts` router (lines 80–154, retrieved 2026-02-08):

- `/api/intakes` → `handleIntakes` (line 80)
- `/api/matters` → `handleMatters` (line 82)
- `/api/auth` → `handleAuthProxy` (line 84)
- `/api/conversations/:id/link` → `handleBackendProxy` (line 86)
- `/api/onboarding` → `handleBackendProxy` (line 89)
- `/api/practice/client-intakes` → `handleBackendProxy` (line 90)
- `/api/user-details` → `handleBackendProxy` (line 91)
- `/api/practice` (non-details, non-practices) → `handleBackendProxy` (lines 92–94)
- `/api/preferences` → `handleBackendProxy` (line 95)
- `/api/subscriptions` → `handleBackendProxy` (line 96)
- `/api/subscription` → `handleBackendProxy` (line 97)
- `/api/uploads` → `handleBackendProxy` (line 98)
- `/api/practices` → `handlePractices` (line 101)
- `/api/paralegal` → `handleParalegal` (line 103)
- `/api/activity` → `handleActivity` (line 105)
- `/api/files` → `handleFiles` (line 107)
- `/api/analyze` → `handleAnalyze` (line 109)
- `/api/pdf` → `handlePDF` (line 111)
- `/api/debug`, `/api/test` → `handleDebug` (line 113)
- `/api/status` → `handleStatus` (line 115)
- `/api/notifications` → `handleNotifications` (line 117)
- `/api/practice/details` → `handlePracticeDetails` (line 119)
- `/api/config` → `handleConfig` (line 121)
- `/api/geo/autocomplete` → `handleAutocompleteWithCORS` (line 123)
- `/api/conversations` → `handleConversations` (line 125)
- `/api/ai/intent` → `handleAiIntent` (line 127)
- `/api/ai/chat` → `handleAiChat` (line 129)
- `/api/health` → `handleHealth` (line 140)

### Remote Endpoints (Confirm in llms.txt)
Enumerate from `llms.txt` (retrieved 2026-02-08, positions 0–57):

**Subscription (to verify in positions 36–39)**:
- `GET /api/subscriptions/plans`
- `GET /api/subscription`
- `POST /api/subscription`
- `DELETE /api/subscription`

**Onboarding (verified in position 10)**:
- `POST /api/onboarding/connected-accounts` (requires `practice_uuid`, `practice_email`, `refresh_url`, `return_url`)
- `GET /api/onboarding/status` (to verify)

**Intake (verified in positions 27–31)**:
- `POST /api/practice/client-intakes`
- `GET /api/practice/client-intakes/{slug}/settings`
- `GET /api/practice/client-intakes/status?session_id={sessionId}`
- `POST /api/practice/client-intakes/{uuid}/checkout-session` (verified in position 28)
- `POST /api/practice/client-intakes/{uuid}/invite` (verified in position 27)
- `POST /api/practice/client-intakes/claim` (verified in position 27)

**Matter (to verify in position 47)**:
- Matter schema (check for `conversation_id` field)

**Auth (to verify)**:
- `/api/auth/*` (Better Auth endpoints)

**Practice (to verify)**:
- `/api/practices/*` (CRUD operations)

## 6. Problem 1: Practice Subscription/Admin Entry Flow

### State Machine Gates

Practice operators (non-embed users) must pass through these gates in order:

1. **Gate: Org Exists**
   - **Entry**: User signs up via Better Auth
   - **Check**: Does user have active org membership?
   - **Pass**: Org exists → proceed to Gate 2
   - **Fail**: No org → redirect to org creation flow
   - **To verify**: Org creation UI location, default org creation behavior

2. **Gate: Subscription Active**
   - **Entry**: Org exists
   - **Check**: Does org have active subscription?
   - **Pass**: Subscription status = `active` → proceed to Gate 3
   - **Fail**: No subscription or status ≠ `active` → redirect to subscription purchase flow
   - **To verify**: Subscription status field name, valid status values, free tier existence

3. **Gate: Payouts Enabled (Optional)**
   - **Entry**: Subscription active
   - **Check**: Does practice want to accept client payments?
   - **Pass**: Stripe Connect onboarding complete (`charges_enabled` + `payouts_enabled` = true) → proceed to Gate 4
   - **Fail**: Onboarding incomplete → redirect to Stripe Connect onboarding flow
   - **Optional**: Practice can skip this gate if not accepting client payments
   - **To verify**: UI for "skip" option, onboarding status polling logic

4. **Gate: Practice Settings Configured**
   - **Entry**: Subscription active (+ optionally payouts enabled)
   - **Check**: Has practice configured required settings (name, logo, etc.)?
   - **Pass**: Settings complete → grant full access
   - **Fail**: Settings incomplete → redirect to settings wizard
   - **To verify**: Required settings list, settings wizard UI

### Current State Investigation Checklist

#### Search-Based Evidence Tasks

1. **Search for subscription UI**
   - **Action**: `grep_search` for `subscription`, `plans`, `checkout`, `pricing modal`, `SubscriptionCart`, `PricingModal` in `src/`
   - **Record**: File paths, component names, API calls, state management

2. **Search for subscription API usage**
   - **Action**: `grep_search` for `/api/subscription`, `/api/subscriptions`, `getCurrentSubscription`, `createSubscription` in `src/`
   - **Record**: API client functions, endpoint construction, request/response handling, error surfacing

3. **Search for Stripe Connect UI**
   - **Action**: `grep_search` for `StripeConnect`, `connected-accounts`, `onboarding`, `ConnectedAccount` in `src/`
   - **Record**: File paths, flow steps, API calls

4. **Search for org creation flow**
   - **Action**: `grep_search` for `createOrganization`, `organization.create`, `org creation` in `src/`
   - **Record**: Entry points, required fields, default behavior

5. **Search for subscription state in session context**
   - **Action**: View `src/shared/contexts/SessionContext.tsx` or equivalent
   - **Record**: Does session include subscription info? Is it fetched separately? How is it updated?

#### Remote Backend Schema (llms.txt)

1. **Subscription endpoints (positions 37–39)**
   - **Action**: `view_content_chunk` positions 37–39
   - **Record**: Request/response schemas, required fields, error codes, status values

2. **Onboarding status endpoint**
   - **Action**: Search llms.txt for `GET /api/onboarding/status`
   - **Record**: Response schema, `charges_enabled`, `payouts_enabled` fields

### Target Flow (Greenfield)

#### Event Timeline: Practice Subscription Lifecycle

1. **Plan Fetch**
   - **Trigger**: User lands on subscription selection page
   - **Action**: Frontend calls `GET /api/subscriptions/plans`
   - **Success**: Display plans in UI
   - **Failure**: Display error, block flow (no fallback)

2. **Checkout Initiation**
   - **Trigger**: User selects plan, clicks "Subscribe"
   - **Action**: Frontend calls `POST /api/subscription` with plan ID
   - **Success**: Backend returns `{ session_id, url }`
   - **Failure**: Display backend error message, block flow

3. **Stripe Redirect**
   - **Trigger**: Checkout initiation success
   - **Action**: Frontend redirects to Stripe Checkout URL
   - **User action**: User completes payment on Stripe

4. **Webhook Processing**
   - **Trigger**: Stripe sends `checkout.session.completed` webhook to remote backend
   - **Action**: Backend updates practice subscription status to `active`
   - **Note**: Frontend has no visibility into this step

5. **Return Redirect**
   - **Trigger**: Stripe redirects to `success_url` (e.g., `/settings/practice?session_id={CHECKOUT_SESSION_ID}`)
   - **Action**: Frontend lands on return page

6. **Status Poll**
   - **Trigger**: Frontend lands on return page
   - **Action**: Frontend calls `GET /api/subscription` (poll until status = `active` or timeout)
   - **Success**: Subscription status = `active` → proceed to next gate
   - **Failure**: Timeout or status ≠ `active` → display error + support link (no auto-retry)

### Failure Visibility Rules

1. **No silent failures**: All API errors must be displayed to user
2. **No fallback UI**: If subscription endpoint fails, do not show "free tier" or "trial" UI unless explicitly returned by backend
3. **Visible retries**: Polling for subscription status is visible (show "Waiting for payment confirmation…" message); user can manually retry if timeout
4. **Backend errors surface**: Display backend error message verbatim (or sanitized if sensitive)

### UNKNOWN / Needs Proof (Problem 1)

1. **Where is the pricing modal/cart/checkout UI implemented?**
   - Binary: Does a subscription pricing modal exist in `src/`? If yes, what file path?
2. **What route do practice operators land on after signup?**
   - Binary: Is there a guard/redirect that checks subscription status? If yes, what file path?
3. **How is Better Auth org creation triggered?**
   - Binary: Is there a "Create Organization" component? If yes, what file path and what API does it call?
4. **Does `POST /api/subscription` return a Stripe Checkout URL?**
   - Binary: What does the response schema look like? (Confirm in llms.txt or test)
5. **Which Stripe integration is used for subscriptions?**
   - Binary: Stripe Checkout, Customer Portal, or Payment Links?
6. **What are the success/cancel URLs for subscription checkout?**
   - Binary: Are they hardcoded in frontend or returned by backend?
7. **How is webhook completion reflected in frontend?**
   - Binary: Polling `GET /api/subscription`, reloading session, or event-driven?
8. **Where is Stripe Connect onboarding initiated?**
   - Binary: Is there a "Connect Payouts" button in settings? If yes, what file path?
9. **Is Stripe Connect required before clients can pay?**
   - Binary: Business rule or optional?
10. **How are subscription API errors currently surfaced?**
    - Binary: Do any components swallow errors or show fallback UI?

### Current Implementation Evidence (Problem 1)

#### Evidence Block 1: Subscription API Client

**File**: `src/shared/lib/apiClient.ts` (retrieved 2026-02-08)

```typescript
// Lines 1482–1527
export async function getCurrentSubscription(
  config?: Pick<AxiosRequestConfig, 'signal'>
): Promise<CurrentSubscription | null> {
  const response = await apiClient.get('/api/subscriptions/current', {
    signal: config?.signal
  });
  // ... response parsing ...
  return {
    id: toNullableString(container.id),
    status: toNullableString(container.status),
    plan,
    cancelAtPeriodEnd: typeof container.cancelAtPeriodEnd === 'boolean'
      ? container.cancelAtPeriodEnd
      : typeof container.cancel_at_period_end === 'boolean'
        ? container.cancel_at_period_end
        : null,
    currentPeriodEnd: toNullableString(container.currentPeriodEnd ?? container.current_period_end)
  };
}
```

**CONFIRMED Identifiers**:
- Endpoint: `/api/subscriptions/current` (not `/api/subscription` as stated in llms.txt)
- Response fields: `id`, `status`, `plan`, `cancelAtPeriodEnd`, `currentPeriodEnd`

**CANDIDATE Identifiers** (need llms.txt confirmation):
- `status` values: `active`, `canceled`, `past_due`, etc. (Stripe standard values?)
- `plan.id`, `plan.name`, `plan.displayName`, `plan.isActive`

#### Evidence Block 2: Subscription Usage in Frontend

**File**: `src/features/settings/pages/AccountPage.tsx` (retrieved 2026-02-08, line 229)

```typescript
const subscription = await getCurrentSubscription({ signal });
setCurrentSubscription(subscription);
```

**CONFIRMED**:
- `AccountPage` fetches current subscription on mount
- Uses `getCurrentSubscription` from `apiClient`

**UNKNOWN**:
- Does `AccountPage` show subscription management UI (upgrade/downgrade/cancel)?
- Does it gate any features based on subscription status?

#### Evidence Block 3: Worker Proxy for Subscription Endpoints

**File**: `worker/index.ts` (retrieved 2026-02-08, lines 96–97)

```typescript
path.startsWith('/api/subscriptions') ||
path.startsWith('/api/subscription') ||
```

**CONFIRMED**:
- Worker proxies both `/api/subscriptions` and `/api/subscription` to remote backend
- No transformation or caching in worker

**UNKNOWN**:
- Does remote backend use `/api/subscription` (singular) or `/api/subscriptions` (plural)?
- Frontend uses `/api/subscriptions/current` — does this match llms.txt?

### Auth Context Table (Problem 1)

| Step | Actor | Auth Context | Endpoint | Source of Truth | Evidence |
|------|-------|--------------|----------|-----------------|----------|
| **Plan List** | Practice operator (candidate) | Logged-in operator (candidate) | `GET /api/subscriptions/plans` | Remote backend | UNKNOWN: Is this endpoint public or auth-required? |
| **Create Subscription** | Practice operator (candidate) | Logged-in operator (candidate) | `POST /api/subscription` | Remote backend | UNKNOWN: Auth requirement not confirmed |
| **Read Subscription** | Practice operator | Logged-in operator | `GET /api/subscriptions/current` | Remote backend | CONFIRMED: `AccountPage.tsx` line 229 |
| **Connect Onboarding** | Practice operator (candidate) | Logged-in operator (candidate) | `POST /api/onboarding/connected-accounts` | Remote backend | UNKNOWN: Auth requirement not confirmed |
| **Connect Status** | Practice operator (candidate) | Logged-in operator (candidate) | `GET /api/onboarding/status` | Remote backend | UNKNOWN: Endpoint existence not confirmed |

### Evidence to Collect (Problem 1)

1. **Pricing modal/cart UI**
   - **Search**: `grep -r "subscription" "pricing" "PricingModal" "SubscriptionCart" src/`
   - **Artifact**: File paths, component names, API calls (excerpt)

2. **Subscription creation flow**
   - **Search**: `grep -r "POST.*subscription" "createSubscription" src/`
   - **Artifact**: Endpoint construction, request body, response handling (excerpt)

3. **Org creation flow**
   - **Search**: `grep -r "createOrganization" "organization.create" src/`
   - **Artifact**: Component path, API call, state management (excerpt)

4. **Entry routing for practice operators**
   - **Search**: `grep -r "subscription.*status" "guard" "redirect" src/`
   - **Artifact**: Guard component path, condition logic (excerpt)

5. **Subscription endpoints in llms.txt**
   - **Action**: `view_content_chunk` positions 37–39
   - **Artifact**: Request/response schemas, auth requirements, status values

6. **Stripe Connect UI**
   - **Search**: `grep -r "StripeConnect" "connected-accounts" "onboarding" src/`
   - **Artifact**: Component path, initiation logic (excerpt)

7. **Error surfacing in subscription UI**
   - **Action**: View components found in step 1, trace error handling
   - **Artifact**: Error display logic, fallback UI (excerpt or screenshot)

## 7. Problem 2: Conversation ↔ Matter Linking

### Proven Data Model (Problem 2)

#### Evidence Block 4: Worker D1 Conversations Table

**File**: `worker/schema.sql` (retrieved 2026-02-08, lines 40–59)

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT, -- Optional: link to specific matter for tighter integration
  participants JSON, -- Array of user IDs: ["userId1", "userId2"]
  user_info JSON,
  status TEXT DEFAULT 'active',
  assigned_to TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  tags TEXT, -- JSON array
  internal_notes TEXT,
  last_message_at DATETIME,
  first_response_at DATETIME,
  closed_at DATETIME,
  latest_seq INTEGER NOT NULL DEFAULT 0,
  membership_version INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**CONFIRMED**:
- `matter_id TEXT` (nullable, no unique constraint)
- One conversation can link to one matter (or none)
- No constraint preventing multiple conversations from linking to same matter

#### Evidence Block 5: Worker D1 Conversations Index

**File**: `worker/schema.sql` (retrieved 2026-02-08, line 256)

```sql
CREATE INDEX IF NOT EXISTS idx_conversations_matter ON conversations(matter_id);
```

**CONFIRMED**:
- Index supports queries filtering/joining by `matter_id`
- No unique constraint on `matter_id`

#### Evidence Block 6: Worker D1 Matters Table

**File**: `worker/schema.sql` (retrieved 2026-02-08, lines 100–129)

```sql
CREATE TABLE IF NOT EXISTS matters (
  id TEXT PRIMARY KEY,
  practice_id TEXT NOT NULL,
  user_id TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  matter_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'lead',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_lawyer_id TEXT,
  lead_source TEXT,
  estimated_value INTEGER,
  billable_hours REAL DEFAULT 0,
  flat_fee INTEGER,
  retainer_amount INTEGER,
  retainer_balance INTEGER DEFAULT 0,
  statute_of_limitations DATE,
  court_jurisdiction TEXT,
  opposing_party TEXT,
  matter_number TEXT,
  tags JSON,
  internal_notes TEXT,
  custom_fields JSON, -- Flexible metadata storage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);
```

**CONFIRMED**:
- No `conversation_id` field in matters table
- `custom_fields JSON` exists — may store `sessionId` or `conversationId`

**UNKNOWN**:
- Does remote backend matter schema include `conversation_id`?

### Link Creation Points (Problem 2)

#### Evidence Block 7: Worker Intake Confirm Creates Matter

**File**: `worker/routes/intakes.ts` (retrieved 2026-02-08, lines 228–280)

```typescript
const customFields = {
  intakeUuid,
  sessionId: conversationId, // Line 230
  source: 'intake',
  payment: {
    status: status ?? null,
    amount: amount ?? null,
    currency: currency ?? null
  }
};

await env.DB.prepare(`
  INSERT INTO matters (
    id, practice_id, user_id, client_name, client_email, client_phone,
    matter_type, title, description, status, priority, lead_source,
    matter_number, custom_fields, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)
`).bind(
  matterId, resolvedPracticeId, null, clientName, clientEmail ?? null,
  clientPhone ?? null, matterType, title, description ?? null,
  'normal', 'intake', matterNumber, JSON.stringify(customFields),
  now, now
).run();

try {
  await conversationService.attachMatter(conversationId, resolvedPracticeId, matterId); // Line 277
} catch (error) {
  console.warn('[Intake] Failed to attach matter to conversation', error);
}
```

**CONFIRMED**:
- `POST /api/intakes/confirm` creates matter in worker D1
- Matter `custom_fields.sessionId` stores `conversationId`
- Calls `conversationService.attachMatter` to update `conversations.matter_id`

**UNKNOWN**:
- Who calls `POST /api/intakes/confirm`? (Frontend path and code excerpt)
- Does it also write to remote backend, or only local?

#### Evidence Block 8: Worker ConversationService.attachMatter

**File**: `worker/services/ConversationService.ts` (retrieved 2026-02-08, lines 518–536)

```typescript
async attachMatter(
  conversationId: string,
  practiceId: string,
  matterId: string
): Promise<Conversation> {
  const conversation = await this.getConversation(conversationId, practiceId);
  if (conversation.matter_id === matterId) {
    return conversation; // Already attached
  }

  const now = new Date().toISOString();
  await this.env.DB.prepare(`
    UPDATE conversations
    SET matter_id = ?, updated_at = ?
    WHERE id = ? AND practice_id = ?
  `).bind(matterId, now, conversationId, practiceId).run();

  return this.getConversation(conversationId, practiceId);
}
```

**CONFIRMED**:
- `attachMatter` updates `conversations.matter_id`
- **No uniqueness enforcement**: Does not check if `matter_id` is already set to a different value
- **No validation**: Does not verify `matterId` exists in matters table

**UNKNOWN**:
- Is this the only place `matter_id` is set?
- Can `matter_id` be changed after initial attachment?

#### Evidence Block 9: Frontend linkConversationToUser

**File**: `src/shared/lib/apiClient.ts` (retrieved 2026-02-08, lines 257–282)

```typescript
export async function linkConversationToUser(
  conversationId: string,
  practiceId: string,
  userId?: string | null
): Promise<Conversation> {
  if (!conversationId) {
    throw new Error('conversationId is required to link conversation');
  }
  if (!practiceId) {
    throw new Error('practiceId is required to link conversation');
  }

  const response = await apiClient.patch(
    `${getConversationLinkEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`,
    {
      userId: userId || undefined
    }
  );

  const conversation = unwrapApiData(response.data) as Conversation | null;
  if (!conversation) {
    throw new Error('Failed to link conversation');
  }

  return conversation;
}
```

**CONFIRMED**:
- `linkConversationToUser` calls `PATCH /api/conversations/:id/link?practiceId=...`
- Sends `{ userId }` in request body
- Returns updated `Conversation` object

**UNKNOWN**:
- Does this endpoint also create/link matter, or only link user?
- Is this endpoint worker-local or remote backend? (Check `worker/index.ts` line 86)

#### Evidence Block 10: Worker Proxy for Conversation Link

**File**: `worker/index.ts` (retrieved 2026-02-08, line 86)

```typescript
} else if (path.startsWith('/api/conversations/') && path.endsWith('/link')) {
  response = await handleBackendProxy(request, env);
```

**CONFIRMED**:
- `/api/conversations/:id/link` is proxied to remote backend
- Worker does not handle this endpoint locally

**UNKNOWN**:
- Does remote backend `/api/conversations/:id/link` create matter or only link user to conversation?

#### Evidence Block 11: Worker ConversationService.linkConversationToUser

**File**: `worker/services/ConversationService.ts` (retrieved 2026-02-08, lines 613–670)

```typescript
async linkConversationToUser(
  conversationId: string,
  practiceId: string,
  userId: string
): Promise<Conversation> {
  const conversation = await this.getConversation(conversationId, practiceId);

  if (conversation.practice_id !== practiceId) {
    throw HttpErrors.forbidden('Conversation does not belong to this practice');
  }

  if (conversation.user_id && conversation.user_id !== userId) {
    throw HttpErrors.conflict('Conversation already linked to a different user');
  }

  // If already linked to this user and participant list already contains them, return early
  const participantSet = new Set(conversation.participants);
  const alreadyLinkedToUser = conversation.user_id === userId;
  if (alreadyLinkedToUser && participantSet.has(userId)) {
    return conversation;
  }

  participantSet.add(userId);
  const updatedParticipants = Array.from(participantSet);
  const now = new Date().toISOString();

  const updateResult = await this.env.DB.prepare(`
    UPDATE conversations
    SET user_id = ?, participants = ?, updated_at = ?, membership_version = membership_version + 1
    WHERE id = ? AND practice_id = ? AND (user_id IS NULL OR user_id = ?)
  `).bind(
    userId,
    JSON.stringify(updatedParticipants),
    now,
    conversationId,
    practiceId,
    userId
  ).run();

  // ... conflict handling ...

  await this.env.DB.prepare(`
    INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id)
    VALUES (?, ?)
  `).bind(conversationId, userId).run();

  await this.notifyMembershipChanged(conversationId);

  return this.getConversation(conversationId, practiceId);
}
```

**CONFIRMED**:
- Worker `ConversationService.linkConversationToUser` updates `conversations.user_id` and `participants`
- Does NOT create or link matter
- Used internally by worker, not exposed as HTTP endpoint

**UNKNOWN**:
- Is this method called by any worker route handler?
- Does remote backend `/api/conversations/:id/link` call this method or have separate logic?

### UNKNOWN / Needs Proof (Problem 2)

1. **Where is the link created in the lifecycle?**
   - Binary: On intake creation, payment confirmation, claim/invite accept, or magic link acceptance?
2. **Who calls `POST /api/intakes/confirm`?**
   - Binary: What frontend component/page? What triggers it?
3. **Does `POST /api/intakes/confirm` write to remote backend?**
   - Binary: Only local D1, or also remote?
4. **Does remote backend matter schema include `conversation_id`?**
   - Binary: Confirm in llms.txt position 47
5. **Does remote `/api/conversations/:id/link` create/link matter?**
   - Binary: Confirm in llms.txt position 27
6. **Is matter source of truth remote or worker?**
   - Binary: Where is canonical matter data stored?
7. **Is linkage stored remote, local, or both?**
   - Binary: `conversations.matter_id` is local; does remote also store linkage?
8. **Is 1:1 required by product?**
   - Binary: Can a matter have multiple conversations (ongoing support)?
9. **Can `matter_id` be changed after initial attachment?**
   - Binary: Is there UI to unlink/relink conversations?
10. **What is current cardinality in production?**
    - Binary: Run D1 queries to count 1:1 vs 1:N vs 1:N relationships

### Cardinality Evidence Plan (Problem 2)

**Assumption**: Linkage is stored in worker D1 `conversations.matter_id` (confirmed in Evidence Block 4)

**Queries to run against production D1**:

```sql
-- Q1: How many conversations have no matter linked?
SELECT COUNT(*) as unlinked_conversations
FROM conversations
WHERE matter_id IS NULL;

-- Q2: How many conversations have a matter linked?
SELECT COUNT(*) as linked_conversations
FROM conversations
WHERE matter_id IS NOT NULL;

-- Q3: How many unique matters are linked to conversations?
SELECT COUNT(DISTINCT matter_id) as unique_matters_linked
FROM conversations
WHERE matter_id IS NOT NULL;

-- Q4: Distribution of conversations per matter (detect 1:N)
SELECT 
  matter_id,
  COUNT(*) as conversation_count
FROM conversations
WHERE matter_id IS NOT NULL
GROUP BY matter_id
HAVING COUNT(*) > 1
ORDER BY conversation_count DESC
LIMIT 20;

-- Q5: Distribution by practice (detect patterns)
SELECT 
  practice_id,
  COUNT(*) as total_conversations,
  COUNT(matter_id) as linked_conversations,
  COUNT(DISTINCT matter_id) as unique_matters
FROM conversations
GROUP BY practice_id
ORDER BY total_conversations DESC
LIMIT 20;

-- Q6: Orphaned linkage (matter_id in conversations but not in matters)
SELECT 
  c.matter_id,
  COUNT(*) as orphaned_conversation_count
FROM conversations c
LEFT JOIN matters m ON c.matter_id = m.id
WHERE c.matter_id IS NOT NULL AND m.id IS NULL
GROUP BY c.matter_id;

-- Q7: Matters with custom_fields.sessionId (reverse linkage)
SELECT 
  COUNT(*) as matters_with_session_id
FROM matters
WHERE json_extract(custom_fields, '$.sessionId') IS NOT NULL;
```

**Interpretation**:
- If Q4 returns 0 rows: Current cardinality is 1:1 (one conversation per matter)
- If Q4 returns >0 rows: Current cardinality includes 1:N (multiple conversations per matter)
- If Q6 returns >0 rows: Data integrity issue (orphaned linkage)
- If Q7 > Q3: Matters store `sessionId` but not all are linked via `conversations.matter_id`

### Decision Gates (Problem 2)

**Gate 1: Matter Source of Truth**
- **Question**: Is matter source of truth remote backend or worker D1?
- **Evidence needed**: 
  - Check llms.txt position 47 for remote matter schema
  - Check if `POST /api/intakes/confirm` writes to remote backend (trace code)
- **Decision impact**: 
  - If remote: Worker D1 matters table is cache/replica; linkage must sync to remote
  - If worker: Worker D1 is authoritative; no remote sync needed

**Gate 2: Linkage Storage Location**
- **Question**: Is linkage stored remote, local, or both?
- **Evidence needed**:
  - Check llms.txt position 47 for `conversation_id` field in remote matter schema
  - Check llms.txt position 27 for `/api/conversations/:id/link` behavior
- **Decision impact**:
  - If both: Must maintain consistency (sync on create/update)
  - If local only: Simpler; remote backend queries matters without conversation context
  - If remote only: Worker D1 `conversations.matter_id` is redundant

**Gate 3: Product Cardinality Requirement**
- **Question**: Is 1:1 required by product, or can a matter have multiple conversations?
- **Evidence needed**:
  - Run Q4 query above to check current production data
  - Interview product owner or check product spec
- **Decision impact**:
  - If 1:1 required: Add unique constraint on `conversations.matter_id` or validation logic
  - If 1:N allowed: Current schema is correct; document use case (e.g., ongoing support)

**Gate 4: Linkage Mutability**
- **Question**: Can `matter_id` be changed after initial attachment?
- **Evidence needed**:
  - Search for UI that unlinks/relinks conversations
  - Check `ConversationService.attachMatter` callers
- **Decision impact**:
  - If immutable: Add validation to prevent re-attachment
  - If mutable: Document business rules (e.g., audit trail, client notification)

### Evidence to Collect (Problem 2)

1. **Frontend caller of `POST /api/intakes/confirm`**
   - **Search**: `grep -r "intakes/confirm" src/`
   - **Artifact**: Component path, trigger event (button click, form submit), request body (excerpt)

2. **Remote backend matter schema**
   - **Action**: `view_content_chunk` llms.txt position 47
   - **Artifact**: Matter schema fields, including `conversation_id` if present

3. **Remote backend `/api/conversations/:id/link` behavior**
   - **Action**: `view_content_chunk` llms.txt position 27
   - **Artifact**: Request/response schema, side effects (matter creation/linking)

4. **Worker route handlers calling `ConversationService.attachMatter`**
   - **Search**: `grep -r "attachMatter" worker/routes/`
   - **Artifact**: Route paths, call sites (excerpt)

5. **Worker route handlers calling `ConversationService.linkConversationToUser`**
   - **Search**: `grep -r "linkConversationToUser" worker/routes/`
   - **Artifact**: Route paths, call sites (excerpt)

6. **Frontend UI for unlinking/relinking conversations**
   - **Search**: `grep -r "unlink" "detach" "reassign.*matter" src/`
   - **Artifact**: Component path, API calls (excerpt)

7. **Production D1 cardinality queries**
   - **Action**: Run Q1–Q7 queries above against production D1
   - **Artifact**: Query results (counts, distributions)

### Current State Investigation Checklist

#### Worker Files to Inspect

1. **`worker/services/ConversationService.ts`**
   - **Action**: View `attachMatter` method
   - **Record**: Does it enforce uniqueness? Does it update `conversations.matter_id`? Does it validate matter exists?

2. **`worker/routes/intakes.ts`**
   - **Action**: Already viewed (lines 1–372)
   - **Record**: Confirm `custom_fields.sessionId = conversationId` (line 230), confirm `attachMatter` call (line 277)

3. **`worker/routes/matters.ts`**
   - **Action**: Already viewed (lines 1–543)
   - **Record**: Does it read/write conversation linkage? Does it proxy matter creation to remote backend?

#### Remote Backend Schema (llms.txt)

1. **Matter schema (position 47)**
   - **Action**: `view_content_chunk` position 47
   - **Record**: Does matter schema include `conversation_id`? Is it unique? Is it required?

2. **Intake claim endpoint (position 27)**
   - **Action**: Already viewed
   - **Record**: Does `POST /api/practice/client-intakes/claim` create matter? Does it link conversation?

#### Frontend Files to Inspect

1. **`src/shared/lib/apiClient.ts`**
   - **Action**: Search for `linkConversationToUser`, `attachMatter`, `createMatter`
   - **Record**: What endpoints do they call? What data do they send/receive?

2. **Conversation detail UI**
   - **Action**: Search for conversation detail page component
   - **Record**: How is matter linkage displayed? Is there edit/unlink functionality?

3. **Matter creation UI**
   - **Action**: Search for matter creation form/modal
   - **Record**: Does it prompt for conversation linkage? Is it required or optional?

#### Data Cardinality Analysis

**Evidence queries by storage boundary**:

1. **If linkage is worker/D1** (confirmed: `conversations.matter_id` exists):
   - **Query D1 after confirming schema**:
     ```sql
     -- Conversations with multiple matters (impossible with current schema, but check custom_fields)
     SELECT conversation_id, COUNT(DISTINCT matter_id) as matter_count
     FROM conversations
     WHERE matter_id IS NOT NULL
     GROUP BY conversation_id
     HAVING matter_count > 1;
     
     -- Matters linked to multiple conversations
     SELECT matter_id, COUNT(DISTINCT id) as conversation_count
     FROM conversations
     WHERE matter_id IS NOT NULL
     GROUP BY matter_id
     HAVING conversation_count > 1;
     
     -- Conversations with no matter linkage
     SELECT COUNT(*) FROM conversations WHERE matter_id IS NULL;
     ```

2. **If linkage is remote** (to verify: does remote backend matter schema include `conversation_id`?):
   - **Use remote endpoints** (confirmed in llms.txt) to list matters/conversations and compute cardinality externally
   - **Query**: `GET /api/matters/{practiceId}` (to verify endpoint exists), parse response, group by `conversation_id` if present

### Candidate Linking Models

#### Model A: 1 Conversation = 1 Matter (Strict)
- **Current state**: Partially supported (`conversations.matter_id` exists, but no unique constraint)
- **Implementation**:
  - Add unique constraint on `conversations.matter_id` (worker D1)
  - Update `ConversationService.attachMatter` to enforce uniqueness (reject if `matter_id` already set)
  - Add `conversation_id` to remote backend matter schema (to verify if needed)
- **Tradeoffs**:
  - **Pro**: Simple, predictable, prevents duplicate matters
  - **Con**: Inflexible if client has multiple legal issues in one conversation
- **Migration**: Identify conversations with `matter_id` set, verify no duplicates; if duplicates exist, decide which matter to keep

#### Model B: 1 Conversation = N Matters (Flexible)
- **Current state**: Not supported (single `matter_id` field)
- **Implementation**:
  - Change `conversations.matter_id` to JSON array `matter_ids`
  - Update `ConversationService.attachMatter` to append to array
  - UI shows list of linked matters
- **Tradeoffs**:
  - **Pro**: Flexible for complex cases
  - **Con**: More complex UI, harder to reason about "primary" matter
- **Migration**: Convert existing `matter_id` to `matter_ids = [matter_id]`

#### Model C: 1 Matter = N Conversations (Reverse)
- **Current state**: Supported (multiple conversations can have same `matter_id`)
- **Implementation**:
  - No schema change needed
  - UI shows list of conversations for matter
- **Tradeoffs**:
  - **Pro**: Supports ongoing client communication after intake
  - **Con**: Requires UI to select which conversation to use for matter updates
- **Migration**: No migration needed

#### Model D: M:N via Join Table (Maximum Flexibility)
- **Current state**: Not supported
- **Implementation**:
  - Create `conversation_matters` join table in worker D1
  - Remove `conversations.matter_id` column
  - Update all linkage logic to use join table
- **Tradeoffs**:
  - **Pro**: Maximum flexibility
  - **Con**: Most complex to implement and query
- **Migration**: Populate join table from existing `conversations.matter_id`

### Decision Criteria (Do Not Propose Schema Changes as Default)

**First, verify current linkage mechanisms**:
1. Does `ConversationService.attachMatter` enforce uniqueness?
2. What is the current cardinality in production data?
3. Does remote backend matter schema include `conversation_id`?
4. Where is the link created (intake confirm, invite claim, admin action)?

**Then, decide based on evidence**:
- If production data shows 1:1 cardinality → consider Model A (strict enforcement)
- If production data shows 1:N (conversation → matters) → consider Model B
- If production data shows N:1 (conversations → matter) → Model C already supported
- If business requirements demand M:N → consider Model D

### Open Questions Gated on Evidence

1. **Does `ConversationService.attachMatter` enforce uniqueness?**
   - **Evidence needed**: View implementation
2. **What is the current cardinality in production data?**
   - **Evidence needed**: Run D1 queries above
3. **Does remote backend matter schema include `conversation_id`?**
   - **Evidence needed**: View llms.txt position 47
4. **Where is the link created?**
   - **Evidence needed**: Trace intake confirm, invite claim, admin matter creation flows
5. **How are matters displayed in conversation UI?**
   - **Evidence needed**: View conversation detail page component
6. **What happens if user creates matter manually (not via intake)?**
   - **Evidence needed**: View matter creation flow in frontend

## 8. Event Timelines

### Event Timeline: Practice Subscription Lifecycle

1. **Plan Fetch** → Frontend calls `GET /api/subscriptions/plans` → Display plans
2. **Checkout Initiation** → Frontend calls `POST /api/subscription` → Backend returns `{ session_id, url }`
3. **Stripe Redirect** → Frontend redirects to Stripe Checkout URL → User completes payment
4. **Webhook Processing** → Stripe sends webhook to remote backend → Backend updates subscription status to `active`
5. **Return Redirect** → Stripe redirects to `success_url` → Frontend lands on return page
6. **Status Poll** → Frontend calls `GET /api/subscription` → Poll until status = `active` or timeout

### Event Timeline: Client Intake Lifecycle

1. **Conversation Start** → Anonymous user starts conversation → Worker creates conversation record in D1
2. **Intake Submit** → User submits intake form → Frontend calls `POST /api/practice/client-intakes` → Backend creates intake record
3. **Checkout Session Creation** → Frontend calls `POST /api/practice/client-intakes/{uuid}/checkout-session` → Backend returns `{ url, session_id }`
4. **Stripe Redirect** → Frontend redirects to Stripe Checkout URL → User completes payment
5. **Webhook Processing** → Stripe sends webhook to remote backend → Backend updates intake status to `paid`
6. **Return Redirect** → Stripe redirects to `return_to` URL → Frontend lands on `PayRedirectPage`
7. **Status Check** → Frontend calls `GET /api/practice/client-intakes/status?session_id={sessionId}` → Verify payment status
8. **Invite Trigger** → Frontend calls `POST /api/practice/client-intakes/{uuid}/invite` → Backend sends magic link email
9. **Invite Accept** → User clicks magic link → Frontend lands on `AcceptInvitationPage`
10. **Claim Intake** → Frontend calls `POST /api/practice/client-intakes/claim` → Backend links intake to user, adds user to org
11. **Org Membership** → User now has org membership → Frontend calls `linkConversationToUser` (to verify endpoint)
12. **Matter Creation** → Frontend calls `POST /api/intakes/confirm` → Worker creates matter in D1, calls `conversationService.attachMatter`
13. **Conversation Linking** → Worker updates `conversations.matter_id` → Conversation now linked to matter

## 9. Concrete "Next Evidence to Gather" List

### Practice Subscription Flow

1. **Search for subscription UI**
   - **Pattern**: `subscription`, `plans`, `checkout`, `PricingModal`, `SubscriptionCart`
   - **Location**: `src/`
   - **Record**: File paths, component names, API calls

2. **Search for subscription API usage**
   - **Pattern**: `/api/subscription`, `getCurrentSubscription`, `createSubscription`
   - **Location**: `src/`
   - **Record**: API client functions, endpoint construction, error handling

3. **View subscription endpoints in llms.txt**
   - **Action**: `view_content_chunk` positions 37–39
   - **Record**: Request/response schemas, status values, error codes

4. **Search for org creation flow**
   - **Pattern**: `createOrganization`, `organization.create`
   - **Location**: `src/`
   - **Record**: Entry points, required fields, default behavior

5. **Test subscription plans endpoint**
   - **Action**: `curl GET /api/subscriptions/plans` or view mock data
   - **Record**: Available plans, pricing, features, free tier existence

### Client Intake Payment Flow

1. **Search for checkout session creation**
   - **Pattern**: `checkout-session`, `createCheckoutSession`
   - **Location**: `src/`
   - **Record**: Where is it called? What parameters are passed?

2. **View intake claim endpoint in llms.txt**
   - **Action**: Already viewed (position 27)
   - **Record**: Does it create matter? Does it link conversation?

3. **Search for `linkConversationToUser` implementation**
   - **Pattern**: `linkConversationToUser`
   - **Location**: `src/shared/lib/apiClient.ts`
   - **Record**: Endpoint, request/response, error handling

4. **Trace `PayRedirectPage` flow**
   - **Action**: Already viewed
   - **Record**: Confirm `triggerIntakeInvitation` call, confirm status check

5. **Trace `AcceptInvitationPage` flow**
   - **Action**: Already viewed
   - **Record**: Confirm `linkConversationToUser` call, confirm org membership check

### Stripe Connect Onboarding Flow

1. **Search for Stripe Connect UI**
   - **Pattern**: `StripeConnect`, `connected-accounts`, `onboarding`, `ConnectedAccount`
   - **Location**: `src/`
   - **Record**: File paths, flow steps, API calls

2. **View onboarding status endpoint in llms.txt**
   - **Action**: Search llms.txt for `GET /api/onboarding/status`
   - **Record**: Response schema, `charges_enabled`, `payouts_enabled` fields

3. **Search for onboarding completion handling**
   - **Pattern**: `return_url`, `onboarding/return`, `onboardingComplete`
   - **Location**: `src/`
   - **Record**: Status polling, error handling, next steps

### Conversation-Matter Linking

1. **View `ConversationService.attachMatter` implementation**
   - **Action**: View `worker/services/ConversationService.ts`
   - **Record**: Uniqueness enforcement, storage mechanism, error handling

2. **View matter schema in llms.txt**
   - **Action**: `view_content_chunk` position 47
   - **Record**: Does matter include `conversation_id`? Is it unique?

3. **Query D1 for conversation-matter cardinality**
   - **Action**: Run SQL queries in "Data Cardinality Analysis" section
   - **Record**: Number of conversations with multiple matters, matters with multiple conversations

4. **Search for matter creation UI**
   - **Pattern**: `createMatter`, `MatterForm`, `NewMatter`
   - **Location**: `src/`
   - **Record**: Does it prompt for conversation linkage? Is it required?

5. **View conversation detail UI**
   - **Pattern**: `ConversationDetail`, `ConversationPage`
   - **Location**: `src/`
   - **Record**: How is matter linkage displayed? Is there edit/unlink functionality?

## 10. Risks and Non-Goals

### Risks

1. **Incomplete subscription flow**: Pricing modal/cart may be UI-only prototype, not connected to backend
2. **Payment domain confusion**: Subscription vs intake payment vs Stripe Connect may be conflated in UI or backend
3. **Data migration complexity**: If production data has inconsistent conversation-matter linkage, migration may require manual intervention
4. **Webhook reliability**: Subscription and intake payment status updates depend on Stripe webhooks; if webhooks fail, state may be stale
5. **Onboarding abandonment**: If user abandons Stripe Connect onboarding, practice may be in incomplete state (cannot accept client payments)

### Non-Goals

1. **Greenfield**: No backward compatibility with legacy subscription models, intake flows, or data formats
2. **No fallbacks/shims**: Do not mask backend failures with fallback UI, cached data, or compatibility layers
3. **Backend API is source of truth**: Mismatches between frontend state and backend state must surface as errors (no silent reconciliation)
