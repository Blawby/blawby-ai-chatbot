# Notification System Implementation Plan

## Current State Analysis

### ✅ Existing Infrastructure

**Email Notifications (OneSignal Integration)**
- **File**: `worker/services/OneSignalService.ts`
- **File**: `worker/services/NotificationService.ts` (lines 1-128)
- **Current Types**: `lawyer_review`, `matter_created`, `matter_update`
- **Integration**: Used in `worker/services/ContactIntakeOrchestrator.ts` (lines 186-235)

**Real-time Communication (SSE)**
- **File**: `worker/routes/agent.ts` (lines 40-389)
- **Implementation**: Server-Sent Events for chat streaming
- **Headers**: `Content-Type: text/event-stream` (line 48)
- **Client**: `src/hooks/useMessageHandling.ts` (lines 55-582)
- **Authentication**: Bearer token authentication via `src/lib/authClient.ts`

**PWA & Service Worker**
- **File**: `public/sw.js` (lines 1-18) - Basic implementation
- **File**: `vite.config.ts` (lines 98-143) - PWA configuration
- **Manifest**: Auto-generated with VitePWA plugin

**Toast System**
- **File**: `src/contexts/ToastContext.tsx` - Basic in-app notifications
- **File**: `src/components/Toast.tsx` - Toast UI component
- **File**: `src/components/ToastContainer.tsx` - Toast container

**Notification Backend (Worker)**
- **File**: `worker/queues/notificationProcessor.ts` - Queue consumer (email/SSE/push)
- **File**: `worker/services/NotificationPublisher.ts` - Enqueue + recipient resolution
- **File**: `worker/services/NotificationStore.ts` - D1 access
- **File**: `worker/services/OneSignalService.ts` - OneSignal REST API client
- **File**: `worker/durable-objects/NotificationHub.ts` - SSE hub
- **File**: `worker/routes/notifications.ts` - Notifications API + SSE stream

**Settings Infrastructure**
- **File**: `src/components/settings/SettingsPage.tsx` (lines 1-189)
- **File**: `src/components/settings/hooks/useSettingsData.ts` (lines 1-118)
- **File**: `src/components/settings/hooks/useSettingsNavigation.ts` (lines 1-91)

### 🔧 Cloudflare Workers Environment

**Available Resources** (`worker/types.ts` lines 4-37):
- `ONESIGNAL_APP_ID` - OneSignal app id
- `ONESIGNAL_REST_API_KEY` - OneSignal REST API key
- `CHAT_SESSIONS: KVNamespace` - Session storage
- `DB: D1Database` - Database
- `DOC_EVENTS: Queue` - Background processing (currently used for file analysis)
- `PARALEGAL_TASKS: Queue` - Task processing
- `NOTIFICATION_EVENTS: Queue` - Notification fanout queue
- `NOTIFICATION_HUB: DurableObjectNamespace` - SSE hub

**Existing Queue Infrastructure**:
- **Producer**: `worker/routes/files.ts` (lines 120-126) - Enqueues file processing
- **Consumer**: `worker/consumers/doc-processor.ts` (lines 20-71) - Processes document events
- **Queue Binding**: `DOC_EVENTS` in `worker/index.ts` (line 119)
- **Configuration**: `wrangler.toml` lines 76-83

**Current Queue Pattern**:
```typescript
// Producer (files.ts)
await env.DOC_EVENTS.send({
  key: storageKey,
  organizationId,
  sessionId,
  mime: file.type,
  size: file.size
});

// Consumer (doc-processor.ts)
export default {
  async queue(batch: MessageBatch<DocumentEvent>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      // Process each message
    }
  }
}
```

## Direction Update (OneSignal for Push + Email)

This section is the current direction and supersedes older plan details below.

### Goals
- One Workers backend handles in-app, email, and push notifications.
- Push + email delivery via OneSignal; in-app via SSE + D1.
- Bake in operational safety: queues, retries, DLQ, rate limits, secrets, observability.

### Channel split
- In-app: D1 + SSE (ours).
- Email: OneSignal.
- Push (web + iOS + Android): OneSignal.

### Recommended architecture
1. Client registers with OneSignal SDK.
   - Web: OneSignal Web SDK + service worker integration.
   - Mobile: OneSignal SDK for iOS/Android.
2. Link OneSignal subscription to our user.
   - Set `external_user_id` to our user id.
   - Store OneSignal subscription ids in D1 for audit and opt-out control.
3. Event happens in app -> enqueue a notification job.
4. Queue consumer calls OneSignal REST API to deliver push and records status.
5. In-app notifications continue via SSE/D1.

### Operational practices
- Do not send pushes inline in request handlers.
- Store OneSignal REST API key + App ID in Workers secrets.
- Keep APNs/FCM credentials inside OneSignal console (not in Worker env vars).
- Minimize push payload content for privacy; use deep links + ids.
- Add rate limiting at the edge plus app-level quotas.

### Provider choice guidance
- OneSignal is the push provider for web + native; we are not implementing VAPID/APNs/FCM directly.

### References to keep open while building
- OneSignal Web SDK docs
- OneSignal Mobile SDK docs (iOS/Android)
- OneSignal REST API docs
- Cloudflare Queues + D1 + Logs

## Authentication Integration

### Bearer Token Authentication for Notifications

All notification endpoints and SSE connections must use the new Bearer token authentication:

**SSE Authentication**:

Option A: Fetch-based streaming (recommended - no polyfill needed):
```typescript
// Client: src/hooks/useMessageHandling.ts
async function createAuthenticatedStream(endpoint: string, token: string) {
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  return {
    async *[Symbol.asyncIterator]() {
      if (!reader) return;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') return;
              try {
                yield JSON.parse(data);
              } catch (e) {
                console.warn('Failed to parse SSE data:', data);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    
    // Abort support
    abort() {
      reader?.cancel();
    }
  };
}

// Usage
const token = await getTokenAsync();
const stream = createAuthenticatedStream('/api/agent/stream', token);

for await (const event of stream) {
  if (event.type === 'notification') {
    // Handle notification
  }
}
```

Option B: EventSource with polyfill (if you prefer EventSource API):
```typescript
// Requires: npm install eventsource-polyfill
import { EventSourcePolyfill } from 'eventsource-polyfill';

// Client: src/hooks/useMessageHandling.ts
const eventSource = new EventSourcePolyfill('/api/agent/stream', {
  headers: {
    'Authorization': `Bearer ${await getTokenAsync()}`
  },
  withCredentials: false // Not needed with Bearer token
});

// Worker: worker/routes/agent.ts
// Verify Bearer token before establishing SSE
const token = request.headers.get('Authorization')?.replace('Bearer ', '');
const session = await verifyToken(token);
```

**API Notification Endpoints**:
```typescript
// All notification API calls use the configured apiClient
import { apiClient } from '@/lib/apiClient';

// Get notifications
const notifications = await apiClient.get('/api/notifications');

// Mark as read
await apiClient.post(`/api/notifications/${id}/read`);
```

**Queue Events Include Organization Context**:
```typescript
// Queue messages must include organizationId for proper routing
await env.NOTIFICATION_EVENTS.send({
  type: 'email',
  notificationType: 'matter_created',
  recipient: ownerEmail,
  organizationId, // Required for multi-tenant isolation
  userId, // Required for user-specific notifications
  data: { matterInfo, clientInfo }
});
```

## Implementation Strategy

This section reflects the updated OneSignal direction.

### ✅ Status Update (Verified in codebase)
- [x] OneSignal REST API client in `worker/services/OneSignalService.ts`.
- [x] Notification queue consumer sends email + push via OneSignal in `worker/queues/notificationProcessor.ts`.
- [x] Notification publishing + enqueue flow in `worker/services/NotificationPublisher.ts`.
- [x] Notifications API + SSE streaming in `worker/routes/notifications.ts` and `worker/durable-objects/NotificationHub.ts`.
- [x] D1 notifications + destination tables in `worker/migrations/20260201_add_notifications.sql` and `worker/schema.sql`.
- [x] OneSignal managed service worker configured (no local `public/sw.js` file required).

### Phase 0: Foundation (done)
- [x] D1 notifications table
- [x] NotificationStore for D1 reads/writes
- [x] NotificationPublisher to enqueue jobs + resolve recipients
- [x] Queue consumer: `worker/queues/notificationProcessor.ts` (email + SSE)
- [x] NotificationHub Durable Object + `/api/notifications/stream`
- [x] `/api/notifications` endpoints (list/read/unread)
- [x] Service worker placeholder in place (OneSignal Web SDK still pending)
- [x] Remove custom VAPID web push path (OneSignal integration)

### Phase 1: OneSignal registration + mapping
- [x] Decide OneSignal Web SDK approach (managed service worker vs custom).
- [x] Add endpoint to associate OneSignal subscription id to our user.
- [x] Add D1 table for OneSignal destinations (user_id, onesignal_id, platform, created_at, last_seen_at, disabled_at).
- [x] Store `external_user_id` in OneSignal as our user id for targeting.

**Decision**: Use the OneSignal managed service worker for initial web push rollout to minimize maintenance and keep integration lightweight. A custom worker can be revisited later if advanced push handling or offline/PWA logic is required.

### Phase 2: Delivery + queue
- [x] Add OneSignal REST API client.
- [x] Update queue consumer to call OneSignal for push + email delivery.
- [x] Configure DLQ + retry policy for `notification-events`.
- [x] Record delivery results and disable invalid subscriptions.

### Phase 3: User-facing UI
- UI is intentionally deferred to Phase 3; focus for Phase 1/2 is wiring + delivery.
- [x] Notification center with tabs (messages, system, payments, intakes, matters).
- [x] Settings panel for per-user preferences (email, push, desktop).
- [x] OS notification permission UX.
- [x] Org-wide defaults (admin-only) + per-user overrides; system notifications are mandatory.
- [x] Slack/Discord-style UX: no numeric badges on tabs, per-thread counts only, activity cards grouped by day.
- [x] Mentions-only option for message notifications (user preference).

**Phase 3 notes**
- Org defaults live in `practice.metadata.notificationPolicy` with `defaults` + `allowed` per category; system is enforced on.
- Message mentions-only uses `messages_mentions_only` in preferences; delivery skips non-mentions.

### Phase 4: Ops hardening
- [ ] Edge rate limiting for register/send endpoints.
- [ ] App-level quotas (per user/day, per practice/min).
- [ ] Structured logs + dashboards for delivery outcomes.

## OneSignal Alignment (Status)

- [x] Remove `worker/services/WebPushService.ts` and related VAPID logic.
- [x] Remove `notification_push_subscriptions` table and related routes.
- [x] Remove `/api/notifications/push/*` endpoints.
- [x] Update queue consumer to call OneSignal REST API for push + email delivery.
- [x] Implement OneSignal managed service worker (removed `public/sw.js` placeholder).

## File Structure Overview

### Files to Extend (Existing)
```
worker/
├── services/
│   ├── OneSignalService.ts (push + email delivery)
│   ├── NotificationPublisher.ts (enqueue + recipient resolution)
│   ├── NotificationStore.ts (D1 access)
│   ├── NotificationService.ts (transactional emails via OneSignal)
├── routes/
│   ├── notifications.ts (list/read/unread/stream; push registration to be revised)
│   └── practices.ts (enqueue status notifications)
├── queues/
│   └── notificationProcessor.ts (fanout delivery)
├── durable-objects/
│   └── NotificationHub.ts (SSE)
├── schema.sql (tables)
└── types.ts (notification types + Env)

public/
└── (managed by OneSignal; no service worker file required)
```

### Files Added (Phase 3)
```
worker/
├── services/
│   └── NotificationDestinationStore.ts
├── migrations/
│   └── (none - destinations added to `20260201_add_notifications.sql`)

src/
├── features/
│   └── notifications/
│       ├── pages/NotificationCenterPage.tsx
│       ├── components/NotificationList.tsx
│       ├── components/NotificationItem.tsx
│       ├── components/NotificationHeader.tsx
│       ├── components/NotificationEmptyState.tsx
│       ├── hooks/useNotifications.ts
│       ├── hooks/useNotificationStream.ts
│       ├── hooks/useNotificationCounts.ts
│       ├── utils/groupNotifications.ts
│       └── types.ts
├── features/settings/hooks/useNotificationSettings.ts
├── features/settings/utils/notificationPolicy.ts
└── shared/notifications/oneSignalClient.ts
```

## Cloudflare Best Practices Integration

### 1. Edge + Async
- Use Workers for request handling and queue producers.
- Use Queues for delivery fanout with retries and a DLQ.

### 2. Data
- Use D1 for notifications and destination storage.
- Optional KV for caching read-heavy preferences or templates.

### 3. Security
- Store OneSignal REST API key + App ID in Workers secrets.
- Rate limit registration/send endpoints and enforce app-level quotas.

### 4. Observability
- Log request id, user id, destination type, provider status/error.
- Use Workers Logs and Tail for debugging.

## Preact Integration Strategy

### 1. **Component Architecture**
- Extend existing settings components
- Create reusable notification components
- Use Preact's lightweight nature for performance

### 2. **State Management**
- Extend existing hooks pattern
- Use context for global notification state
- Implement optimistic updates

### 3. **Real-time Updates**
- Extend existing SSE handling
- Use Preact's efficient re-rendering
- Implement proper cleanup for subscriptions

## Queue Integration Strategy Summary

### Current Queue Pattern
- Producer: `NotificationPublisher` -> `env.NOTIFICATION_EVENTS.send`
- Consumer: `worker/queues/notificationProcessor.ts`
- Queue binding: `NOTIFICATION_EVENTS` in `worker/index.ts`
- Error handling: built-in retries; add DLQ for poison messages

### Notification Queue Flow
1. Event -> enqueue `notification-events` with recipients and metadata.
2. Consumer writes to D1, publishes SSE, and sends email/push.
3. Provider failures are logged; invalid destinations are disabled.

### Benefits of Queue-based Processing
- Async processing: non-blocking delivery.
- Retry logic: automatic backoff with DLQ safety net.
- Batch processing: efficient fanout.
- Scalability: auto-scaling with Cloudflare infrastructure.

## Implementation Priority

1. **High Priority**: OneSignal push integration (web + native) with queue delivery
2. **High Priority**: Live in-app notifications with queue + SSE (foundation in place)
3. **Medium Priority**: Notification settings UI + preferences
4. **Low Priority**: Advanced features (analytics, smart notifications)

## Dependencies

### Existing Dependencies (package.json)
- `better-auth` - User authentication
- `framer-motion` - Animations for notifications
- `@heroicons/react` - Notification icons

### New Dependencies to Add
- OneSignal Web SDK (script/SDK integration in frontend)
- Optional: OneSignal SDKs for native apps (iOS/Android)
- `zod` - Notification schema validation (already exists)

### Queue Configuration Updates

**`wrangler.toml` additions:**
```toml
# Queue binding for notifications
[[queues.producers]]
queue = "notification-events"
binding = "NOTIFICATION_EVENTS"

# Queue consumers
[[queues.consumers]]
queue = "notification-events"
max_batch_size = 10
max_batch_timeout = 30
```

**`worker/types.ts` additions:**
```typescript
export interface Env {
  // ... existing properties
  NOTIFICATION_EVENTS: Queue<NotificationQueueMessage>;
  NOTIFICATION_HUB: DurableObjectNamespace;
}
```

**`worker/index.ts` queue consumer registration:**

Use the single notification queue handler directly:
```typescript
import { handleNotificationQueue } from './queues/notificationProcessor.js';

export default {
  fetch: handleRequest,
  queue: handleNotificationQueue
};
```

**Key Implementation Details:**
- **Async queue handler**: The queue function is async and handles batches.
- **ExecutionContext usage**: Use `ctx.waitUntil()` for background work in the queue handler.
- **Single queue**: `notification-events` is the only notification queue at this stage.

**Queue Consumer Interface:**
Each consumer handler must follow this interface:
```typescript
export default {
  async queue(batch: MessageBatch<EventType>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      try {
        // Process message
        // Use ctx.waitUntil() for any background work
      } catch (error) {
        console.error('Queue processing error:', error);
        // Handle retry logic or dead letter queue
      }
    }
  }
}
```

**Wrangler.toml Queue Bindings:**
Bind the existing doc queue plus the notification queue:
```toml
# Queue producers
[[queues.producers]]
queue = "doc-events"
binding = "DOC_EVENTS"

[[queues.producers]]
queue = "notification-events"
binding = "NOTIFICATION_EVENTS"

# Queue consumers - all routes to centralized handler
[[queues.consumers]]
queue = "doc-events"

[[queues.consumers]]
queue = "notification-events"
max_batch_size = 10
max_batch_timeout = 30
```

This centralized approach provides better error handling and centralized queue management for notification delivery.

## Environment Variables

### Required (Workers secrets)
- `ONESIGNAL_APP_ID` - OneSignal application id (non-sensitive)
- `ONESIGNAL_REST_API_KEY` - OneSignal REST API key (sensitive - use dev vars)
- `ONESIGNAL_API_BASE` - Optional override (default `https://onesignal.com/api/v1`)

### Configuration in wrangler.toml (non-sensitive)
- `ENABLE_EMAIL_NOTIFICATIONS` - Toggle email sending (default: false for dev, true for prod)
- `ENABLE_PUSH_NOTIFICATIONS` - Toggle push notifications (default: false for dev, true for prod)

## Email Toggle for Testing

### Problem
During development and testing, notification systems can generate excessive emails, causing:
- Spam to test accounts
- Hitting email service rate limits
- Cluttering inboxes with test data
- Potential costs from email service usage

### Solution: Environment-Based Email Toggles

**Environment Variables:**
```bash
# Development (default)
ENABLE_EMAIL_NOTIFICATIONS=false
ENABLE_PUSH_NOTIFICATIONS=false

# Production
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_PUSH_NOTIFICATIONS=true
```

**Implementation in notification delivery (example):**

```typescript
// worker/queues/notificationProcessor.ts
function parseEnvBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

const emailEnabled = parseEnvBoolean(env.ENABLE_EMAIL_NOTIFICATIONS, false);
const pushEnabled = parseEnvBoolean(env.ENABLE_PUSH_NOTIFICATIONS, false);

if (!emailEnabled) {
  Logger.info('Email notifications disabled');
}

if (!pushEnabled) {
  Logger.info('Push notifications disabled');
}
```

**Configuration in wrangler.toml:**

```toml
# Default configuration (development)
ENABLE_EMAIL_NOTIFICATIONS = false
ENABLE_PUSH_NOTIFICATIONS = false

# Production environment
[env.production]
ENABLE_EMAIL_NOTIFICATIONS = true
ENABLE_PUSH_NOTIFICATIONS = true
```

**Sensitive variables in dev.vars (local development):**
```bash
# dev.vars file (not committed to git)
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_rest_api_key
ONESIGNAL_API_BASE=https://onesignal.com/api/v1
```

**Alternative: organization-Level Testing Mode**

For more granular control, implement organization-level testing flags:

```typescript
// Check if organization is in test mode
const practiceConfig = await this.getPracticeConfig(organizationId);
if (practiceConfig.testMode) {
  console.log('🧪 organization in test mode - logging notification instead of sending');
  return;
}
```

**Benefits:**
- Prevents email spam during development
- Allows testing notification logic without side effects
- Provides clear logging of what would be sent
- Simple two-flag system (no redundant test mode)
- Easy to toggle for different environments
- Maintains production functionality

## Architecture Decisions & Considerations

### Queue Strategy: Single vs Multiple Queues

**Decision: Use a single queue (`NOTIFICATION_EVENTS`) with fanout in the consumer**

**Rationale:**
- **Simpler ops**: One binding, one consumer, one DLQ.
- **Consistent delivery path**: Email/SSE/push share the same event envelope.
- **Easier debugging**: One place to inspect and replay failures.
- **Future-proof**: We can split queues later if volume or retry policies diverge.

**Implementation:**
```typescript
// Single queue and per-channel handling in the consumer
await env.NOTIFICATION_EVENTS.send(notificationMessage);

// notificationProcessor.ts fanout:
// - write to D1
// - publish SSE
// - send email
// - send push (web, then mobile adapters later)
```

### Offline User Strategy

**Decision: Hybrid approach with KV + DB persistence**

**For Live Notifications (SSE):**
- **Online users**: Direct SSE delivery
- **Offline users**: Store in KV with TTL (24 hours)
- **Reconnect**: Replay missed notifications from KV
- **Cleanup**: KV auto-expires, no manual cleanup needed

**For Email/Push:**
- **Always persisted**: Queue ensures delivery when user comes online
- **No special offline handling**: Standard queue retry logic

**Implementation:**
```typescript
// Live notification with offline fallback
async sendLiveNotification(notification: LiveNotification) {
  const onlineUsers = await this.getOnlineUsers(notification.organizationId);
  
  // Send to online users via SSE
  for (const user of onlineUsers) {
    await this.sendSSE(user.id, notification);
  }
  
  // Store for offline users in KV
  const offlineUsers = await this.getOfflineUsers(notification.organizationId);
  for (const user of offlineUsers) {
    await this.env.CHAT_SESSIONS.put(
      `live_notification:${user.id}:${Date.now()}`,
      JSON.stringify(notification),
      { expirationTtl: 86400 } // 24 hours
    );
  }
}
```

### OneSignal Subscription Management

**Decision: Proactive cleanup with delivery-time validation**

**Strategy:**
- **Delivery-time validation**: Check OneSignal response on each send.
- **Cleanup on failure**: Disable invalid subscriptions when delivery fails.
- **Periodic cleanup**: Weekly job to remove long-expired subscriptions.
- **User-initiated cleanup**: Remove on logout/device change.

**Implementation (conceptual):**
```typescript
async sendPushNotification(destination: OneSignalDestination, payload: OneSignalPayload) {
  try {
    await oneSignal.sendNotification(payload);
  } catch (error) {
    if (error instanceof OneSignalDeliveryError && error.isInvalidSubscription) {
      await store.disableDestination(destination.id);
    }
    throw error;
  }
}
```

### Notification Preference Granularity

**Decision: Multi-level granularity (user + organization + global)**

**Schema Design:**
```sql
-- User-level preferences (highest priority)
CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  notification_type TEXT NOT NULL, -- 'matter_update', 'payment_received', etc.
  channel TEXT NOT NULL, -- 'email', 'push', 'live'
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, organization_id, notification_type, channel)
);

-- Organization-level preferences (fallback)
CREATE TABLE organization_notification_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, notification_type, channel)
);

-- Global defaults (lowest priority)
-- Stored in application config
```

**Preference Resolution Logic:**
```typescript
async getNotificationPreference(userId: string, organizationId: string, type: string, channel: string): Promise<boolean> {
  // 1. Check user preference
  const userPref = await this.getUserPreference(userId, organizationId, type, channel);
  if (userPref !== null) return userPref;
  
  // 2. Check organization preference
  const organizationPref = await this.getOrganizationPreference(organizationId, type, channel);
  if (organizationPref !== null) return organizationPref;
  
  // 3. Return global default
  return this.getGlobalDefault(type, channel);
}
```

### Security & Sensitive Data Handling

**Decision: Minimal data in push notifications, IDs only**

**Push Notification Payload Strategy:**
```typescript
// ❌ Never include sensitive data
{
  title: "New Matter Update",
  body: "Client John Smith's divorce case has new documents", // SENSITIVE!
  data: { matterId: "123", documentId: "456" }
}

// ✅ Use generic messages with IDs
{
  title: "New Matter Update",
  body: "You have a new update on one of your matters",
  data: { 
    matterId: "123", 
    action: "document_added",
    notificationId: "notif_789"
  }
}
```

**Email Strategy:**
- **Transactional emails**: Can include more detail (user is authenticated)
- **Marketing emails**: Generic content only
- **Sensitive matters**: Always use generic language

### Read/Unread Tracking & Persistence

**Decision: Persistent across devices with clear read state**

**Schema:**
```sql
CREATE TABLE notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSON,
  read_at DATETIME NULL, -- NULL = unread
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX(user_id, read_at), -- For unread count queries
  INDEX(user_id, created_at) -- For notification history
);
```

**Read State Management:**
```typescript
// Mark as read
async markNotificationRead(notificationId: string, userId: string) {
  await this.db.prepare(`
    UPDATE notification_logs 
    SET read_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND user_id = ?
  `).bind(notificationId, userId).run();
}

// Get unread count
async getUnreadCount(userId: string): Promise<number> {
  const result = await this.db.prepare(`
    SELECT COUNT(*) as count 
    FROM notification_logs 
    WHERE user_id = ? AND read_at IS NULL
  `).bind(userId).first();
  
  return result?.count || 0;
}
```

### Notification Grouping & Batching

**Decision: Smart batching with user preference**

**Batching Strategy:**
```typescript
interface NotificationBatch {
  userId: string;
  organizationId: string;
  notifications: Notification[];
  batchKey: string; // e.g., "matter_123", "organization_updates"
  maxBatchSize: number;
  batchWindowMs: number;
}

// Batch similar notifications
async batchNotifications(notifications: Notification[]): Promise<NotificationBatch[]> {
  const batches = new Map<string, Notification[]>();
  
  for (const notification of notifications) {
    const batchKey = `${notification.userId}_${notification.organizationId}_${notification.type}`;
    if (!batches.has(batchKey)) {
      batches.set(batchKey, []);
    }
    batches.get(batchKey)!.push(notification);
  }
  
  return Array.from(batches.entries()).map(([key, notifs]) => ({
    userId: notifs[0].userId,
    organizationId: notifs[0].organizationId,
    notifications: notifs,
    batchKey: key,
    maxBatchSize: 5,
    batchWindowMs: 30000 // 30 seconds
  }));
}
```

### Testing & Dry Run Mode

**Decision: Add dry run mode for CI/CD**

**Implementation:**
```typescript
// Add to wrangler.toml
DRY_RUN_MODE = false

// In notification service
async sendNotification(notification: Notification) {
  if (this.env.DRY_RUN_MODE === 'true') {
    console.log('🧪 DRY RUN - would send notification:', {
      type: notification.type,
      channel: notification.channel,
      userId: notification.userId,
      payload: notification.payload
    });
    return { success: true, dryRun: true };
  }
  
  // Actual sending logic
  return await this.actualSend(notification);
}
```

### Deduplication Strategy

**Decision: Content-based deduplication with time window**

**Content Hash Generation:**
```typescript
import { createHash } from 'crypto';

function generateContentHash(notification: Notification): string {
  // Include fields that define notification uniqueness
  // Exclude timestamps, IDs, and other non-semantic fields
  const content = JSON.stringify({
    type: notification.type,
    title: notification.title,
    body: notification.body,
    matterId: notification.matterId,
    // Include relevant data fields, but exclude timestamps/IDs
    relevantData: notification.data ? {
      // Only include fields that affect semantic equivalence
      matterStatus: notification.data.matterStatus,
      clientName: notification.data.clientName,
      amount: notification.data.amount,
      // Exclude: timestamps, notification IDs, user IDs
    } : null
  });
  
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
```

**Deduplication Key:**
```typescript
function generateDeduplicationKey(notification: Notification): string {
  const { userId, organizationId, type, matterId } = notification;
  const contentHash = generateContentHash(notification);
  return `${userId}_${organizationId}_${type}_${matterId}_${contentHash}`;
}

// Check for duplicates within time window
async checkForDuplicates(key: string, windowMs: number = 300000): Promise<boolean> {
  const recent = await this.env.CHAT_SESSIONS.get(`dup:${key}`);
  if (recent) {
    const timestamp = parseInt(recent);
    if (Date.now() - timestamp < windowMs) {
      return true; // Duplicate found
    }
  }
  
  // Store this notification
  await this.env.CHAT_SESSIONS.put(
    `dup:${key}`, 
    Date.now().toString(), 
    { expirationTtl: Math.ceil(windowMs / 1000) }
  );
  
  return false; // Not a duplicate
}
```

## Better Auth Integration

### Better Auth Plugin API Usage

**Important**: The notification system uses Better Auth's organization plugin API methods. The following non-existent methods have been replaced with proper plugin API calls:

**Replaced Methods:**
- ❌ `betterAuth.userHasorganizationAccess(userId, organizationId)` 
- ❌ `betterAuth.userHasRole(userId, organizationId, role)`
- ❌ `session.user.organizationId` (not provided by getSession)

**Correct Plugin API Usage:**
- ✅ `authClient.organization.listMembers({ query: { organizationId, limit, offset, filters } })` - Get all organization members
- ✅ `authClient.organization.getActiveMemberRole()` (client) or `auth.api.getActiveMemberRole({ headers })` (server) - Get user's role in organization
- ✅ Retrieve organization IDs via client-side hook `authClient.useListOrganizations()` or server-side DB query

**organization Access Verification Pattern:**
```typescript
// Server-side: Verify user has access to the organization using organization plugin
const { data: memberships } = await auth.api.listMembers({
  headers: await headers(),
  query: { organizationId }
});
const hasAccess = memberships.some(member => member.userId === session.user.id);
if (!hasAccess) {
  return new Response('Forbidden', { status: 403 });
}

// Client-side alternative:
const { data: memberships } = await authClient.organization.listMembers({
  query: { organizationId }
});
const hasAccess = memberships.some(member => member.userId === session.user.id);
```

**Role Checking Pattern:**
```typescript
// Server-side: Check if user is organization admin using organization plugin
const { data: { role } } = await auth.api.getActiveMemberRole({
  headers: await headers()
});
const isAdmin = role === 'admin' || role === 'owner';
if (!isAdmin) {
  return new Response('Forbidden - Admin role required', { status: 403 });
}

// Client-side alternative:
const { data: { role } } = await authClient.organization.getActiveMemberRole();
const isAdmin = role === 'admin' || role === 'owner';
```

**Getting User's Organizations:**
```typescript
// Client-side: Get user's organizations using reactive hook
const { data: organizations } = authClient.useListOrganizations();
const organizationIds = organizations.map(org => org.id);

// Server-side: Implement custom DB query to retrieve user's organizations
const userOrgs = await env.DB.prepare(`
  SELECT o.id, o.name 
  FROM organizations o
  JOIN members m ON m.organization_id = o.id
  WHERE m.user_id = ?
`).bind(session.user.id).all();
const organizationIds = userOrgs.results.map(org => org.id);
```

### Prerequisites
- Better Auth organizations/organizations must be configured before implementing notifications
- User identity and organization membership must be established
- Role-based permissions system must be in place

### Core Integration Points

#### 1. User Identity & Notification Targeting

**Better Auth as Source of Truth:**
```typescript
// All notification targeting uses Better Auth IDs
interface NotificationTarget {
  userId: string;        // Better Auth user.id
  organizationId: string; // Better Auth organization.id
  email: string;         // Better Auth verified email
  roles: string[];       // Better Auth user roles
}

// Notification service validates against Better Auth
class NotificationService {
  async validateNotificationTarget(userId: string, organizationId: string): Promise<boolean> {
    const { data: user } = await auth.api.getUser({ headers: await headers() });
    const { data: memberships } = await auth.api.listMembers({
      headers: await headers(),
      query: { organizationId }
    });
    const organizationMembership = memberships.find(m => m.userId === userId);
    
    return user && organizationMembership && user.verified;
  }
}
```

#### 2. Permission-Based Notification Filtering

**Role-Based Notification Rules:**
```typescript
// Define notification permissions by role
const NOTIFICATION_PERMISSIONS = {
  'organization:admin': ['system_alert', 'organization_update', 'matter_update', 'payment_received'],
  'organization:member': ['matter_update', 'payment_received'],
  'organization:viewer': ['matter_update'],
  'client': ['matter_update', 'payment_received']
};

// Check permissions before enqueueing
async enqueueNotification(notification: Notification) {
  const { data: user } = await auth.api.getUser({ headers: await headers() });
  const { data: { role } } = await auth.api.getActiveMemberRole({
    headers: await headers()
  });
  
  // Check if user has permission for this notification type
  const hasPermission = NOTIFICATION_PERMISSIONS[role]?.includes(notification.type);
  
  if (!hasPermission) {
    console.log(`User ${notification.userId} lacks permission for ${notification.type}`);
    return;
  }
  
  // Proceed with notification
  await this.queueNotification(notification);
}
```

#### 3. Database Schema with Better Auth Integration

**Updated Schema with Better Auth References:**
```sql
-- Notification preferences tied to Better Auth users
CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Better Auth user.id
  organization_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, organization_id, notification_type, channel)
);

-- OneSignal destinations tied to Better Auth users
CREATE TABLE notification_destinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'onesignal',
  onesignal_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_user_id TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  disabled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_destinations_provider_id ON notification_destinations(provider, onesignal_id);
CREATE INDEX IF NOT EXISTS idx_notification_destinations_user ON notification_destinations(user_id, updated_at DESC);

-- Notification logs with Better Auth references
CREATE TABLE notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Better Auth user.id
  organization_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSON,
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  INDEX(user_id, read_at),
  INDEX(user_id, created_at)
);

-- organization-level notification settings
CREATE TABLE organization_notification_settings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, notification_type, channel)
);
```

#### 4. Session-Aware Live Notifications

**SSE with Session-Scoped Primary Organization Strategy:**
```typescript
// Live notification endpoint with session-scoped organization validation
export async function handleLiveNotifications(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = session.user.id;
  
  // STRATEGY: Session-Scoped Primary Organization
  // 1. Read organization context from session's active_organization_id
  // 2. Validate user's role/permissions for that organization
  // 3. Reject ambiguous requests with clear error messages
  // 4. One organization per SSE connection for security and simplicity
  
  let organizationId: string;
  try {
    // First, check if session has an active organization set
    const sessionData = await env.DB.prepare(`
      SELECT active_organization_id FROM sessions 
      WHERE user_id = ? AND expires_at > ? 
      ORDER BY created_at DESC LIMIT 1
    `).bind(userId, Date.now()).first<{ active_organization_id: string | null }>();
    
    if (sessionData?.active_organization_id) {
      organizationId = sessionData.active_organization_id;
    } else {
      // Fallback: Get user's organizations and use personal org or first available
      const { data: userOrgs } = await auth.api.organization.list();
      
      if (!userOrgs || userOrgs.length === 0) {
        return new Response('No organizations found for user', { status: 403 });
      }
      
      // Prefer personal organization, otherwise use first available
      const personalOrg = userOrgs.find(org => org.organization.isPersonal);
      organizationId = personalOrg?.organizationId || userOrgs[0].organizationId;
      
      // Update session with the selected organization for future requests
      await env.DB.prepare(`
        UPDATE sessions SET active_organization_id = ?, updated_at = ? 
        WHERE user_id = ? AND expires_at > ?
      `).bind(organizationId, Date.now(), userId, Date.now()).run();
    }
    
    // Validate user has access to this organization
    const membership = await env.DB.prepare(`
      SELECT role FROM members 
      WHERE user_id = ? AND organization_id = ?
    `).bind(userId, organizationId).first<{ role: string }>();
    
    if (!membership) {
      return new Response('Access denied: User not member of organization', { status: 403 });
    }
    
    // Additional validation: Check if organization exists and is active
    const organization = await env.DB.prepare(`
      SELECT id, name FROM organizations WHERE id = ?
    `).bind(organizationId).first<{ id: string; name: string }>();
    
    if (!organization) {
      return new Response('Organization not found', { status: 404 });
    }
    
  } catch (error) {
    console.error('Failed to retrieve organization context:', error);
    return new Response('Failed to retrieve organization context', { status: 500 });
  }
  
  // Create SSE connection scoped to authenticated user and organization
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to user-specific notification stream for the validated organization
      const subscription = notificationStream.subscribe(userId, organizationId, (notification) => {
        controller.enqueue(`data: ${JSON.stringify(notification)}\n\n`);
      });
      
      // Cleanup on disconnect
      request.signal?.addEventListener('abort', () => {
        subscription.unsubscribe();
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Organization-ID': organizationId // Include org ID in headers for debugging
    }
  });
}

// Organization switching endpoint for SSE connections
export async function handleOrganizationSwitch(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = session.user.id;
  const { organizationId } = await request.json();
  
  if (!organizationId) {
    return new Response('Organization ID required', { status: 400 });
  }
  
  try {
    // Validate user has access to the requested organization
    const membership = await env.DB.prepare(`
      SELECT role FROM members 
      WHERE user_id = ? AND organization_id = ?
    `).bind(userId, organizationId).first<{ role: string }>();
    
    if (!membership) {
      return new Response('Access denied: User not member of organization', { status: 403 });
    }
    
    // Update session with new active organization
    await env.DB.prepare(`
      UPDATE sessions SET active_organization_id = ?, updated_at = ? 
      WHERE user_id = ? AND expires_at > ?
    `).bind(organizationId, Date.now(), userId, Date.now()).run();
    
    return new Response(JSON.stringify({ 
      success: true, 
      organizationId,
      message: 'Organization switched successfully. Reconnect SSE for new notifications.'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Failed to switch organization:', error);
    return new Response('Failed to switch organization', { status: 500 });
  }
}
```

#### 5. Push Subscription Management with Better Auth

**Secure Push Subscription Registration with Organization Context:**
```typescript
// Push subscription endpoint with session-scoped organization validation
export async function handlePushSubscription(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = session.user.id;
  const { destination, organizationId } = await request.json();
  
  // Use same organization strategy as SSE: session-scoped primary organization
  let targetOrganizationId: string;
  
  if (organizationId) {
    // Validate user has access to the requested organization
    const membership = await env.DB.prepare(`
      SELECT role FROM members 
      WHERE user_id = ? AND organization_id = ?
    `).bind(userId, organizationId).first<{ role: string }>();
    
    if (!membership) {
      return new Response('Access denied: User not member of organization', { status: 403 });
    }
    targetOrganizationId = organizationId;
  } else {
    // Use session's active organization
    const sessionData = await env.DB.prepare(`
      SELECT active_organization_id FROM sessions 
      WHERE user_id = ? AND expires_at > ? 
      ORDER BY created_at DESC LIMIT 1
    `).bind(userId, Date.now()).first<{ active_organization_id: string | null }>();
    
    if (!sessionData?.active_organization_id) {
      return new Response('No active organization found. Please select an organization.', { status: 400 });
    }
    targetOrganizationId = sessionData.active_organization_id;
  }
  
  // Check for existing destination to preserve created_at
  const existingDestination = await env.DB.prepare(`
    SELECT created_at FROM notification_destinations
    WHERE user_id = ? AND onesignal_id = ?
  `).bind(userId, destination.onesignalId).first<{ created_at: number }>();
  
  const createdAt = existingDestination?.created_at || Date.now();
  const updatedAt = Date.now();
  
  // Store OneSignal destination with organization context, preserving original created_at
  await env.DB.prepare(`
    INSERT OR REPLACE INTO notification_destinations (
      user_id, organization_id, provider, onesignal_id, platform, external_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    targetOrganizationId,
    'onesignal',
    destination.onesignalId,
    destination.platform,
    destination.externalUserId,
    createdAt,
    updatedAt
  ).run();
  
  return new Response(JSON.stringify({ 
    success: true, 
    organizationId: targetOrganizationId,
    message: 'Push subscription registered successfully'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

#### 6. Notification Preferences with Better Auth Context

**User-Scoped Preference Management:**
```typescript
// Get user's notification preferences with Better Auth context
export async function getUserNotificationPreferences(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { organizationId } = await request.json();
  
  // Verify user has access to the organization using organization plugin
  const { data: memberships } = await auth.api.listMembers({
    headers: await headers(),
    query: { organizationId }
  });
  const hasAccess = memberships.some(member => member.userId === session.user.id);
  if (!hasAccess) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Get user's preferences for this organization
  const preferences = await env.DB.prepare(`
    SELECT notification_type, channel, enabled
    FROM notification_preferences
    WHERE user_id = ? AND organization_id = ?
  `).bind(session.user.id, organizationId).all();
  
  return new Response(JSON.stringify({ preferences }));
}

// Update user's notification preferences
export async function updateNotificationPreferences(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { organizationId, preferences } = await request.json();
  
  // Verify user has access to the organization using organization plugin
  const { data: memberships } = await auth.api.listMembers({
    headers: await headers(),
    query: { organizationId }
  });
  const hasAccess = memberships.some(member => member.userId === session.user.id);
  if (!hasAccess) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Update preferences (user can only update their own)
  for (const pref of preferences) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO notification_preferences
      (id, user_id, organization_id, notification_type, channel, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      session.user.id,        // Better Auth user ID
      organizationId,                 // Better Auth organization ID
      pref.notification_type,
      pref.channel,
      pref.enabled
    ).run();
  }
  
  return new Response(JSON.stringify({ success: true }));
}
```

#### 7. Admin Override Capabilities

**organization Admin Notification Management:**
```typescript
// organization admin can manage organization-wide notification settings
export async function updateorganizationNotificationSettings(request: Request, env: Env) {
  const session = await auth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { organizationId, settings } = await request.json();
  
  // Check if user is organization admin using organization plugin
  const { data: { role } } = await auth.api.getActiveMemberRole({
    headers: await headers()
  });
  const isAdmin = role === 'admin' || role === 'owner';
  if (!isAdmin) {
    return new Response('Forbidden - Admin role required', { status: 403 });
  }
  
  // Update organization-wide settings
  for (const setting of settings) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO organization_notification_settings
      (id, organization_id, notification_type, channel, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      organizationId,
      setting.notification_type,
      setting.channel,
      setting.enabled
    ).run();
  }
  
  return new Response(JSON.stringify({ success: true }));
}
```

### Implementation Order with Better Auth

1. **Setup Better Auth Organizations** (Prerequisite)
   - Configure organizations/organizations
   - Set up role-based permissions
   - Establish user-organization relationships

2. **Update Database Schema**
   - Add Better Auth foreign key constraints
   - Ensure proper cascade deletes
   - Add indexes for Better Auth queries

3. **Implement Authentication Middleware**
   - Session validation for all notification endpoints
   - Permission checks before notification operations
   - organization access verification

4. **Build Notification Services**
   - Integrate Better Auth user/organization resolution
   - Implement role-based notification filtering
   - Add permission validation to queue consumers

5. **Create Frontend Components**
   - Use Better Auth session for user context
   - Implement organization-scoped preference management
   - Add admin override capabilities

### Security Benefits

- **Identity Verification**: All notifications tied to verified Better Auth users
- **Permission Enforcement**: Role-based access control for notification types
- **organization Isolation**: Users can only access notifications for their organizations
- **Session Security**: Live notifications scoped to authenticated sessions
- **Admin Controls**: organization admins can manage notification policies
- **Data Integrity**: Foreign key constraints prevent orphaned notifications

## Testing Strategy

### Unit Tests
- Extend existing test structure in `tests/`
- Test notification services
- Test notification components

### Integration Tests
- Test email delivery
- Test push notification delivery
- Test notification preferences

### E2E Tests
- Test notification flow end-to-end
- Test notification settings
- Test notification delivery

## Monitoring & Analytics

### Metrics to Track
- Email delivery rates
- Push notification delivery rates
- Notification click-through rates
- User notification preferences

### Logging
- Extend existing Logger in `worker/utils/logger.js`
- Add notification-specific logging
- Track notification performance

## Security Considerations

### Data Protection
- Encrypt sensitive notification data
- Implement proper access controls
- Validate notification permissions

### Rate Limiting
- Extend existing rate limiting in `worker/middleware/rateLimit.ts`
- Implement notification-specific rate limits
- Prevent notification spam

### Privacy
- Respect user notification preferences
- Implement notification opt-out
- Comply with email regulations (CAN-SPAM, GDPR)

---

## Multi-Organization Routing Strategy: Session-Scoped Primary Organization

### 🎯 Chosen Strategy: Session-Scoped Primary Organization

**Decision**: Implement a **session-scoped primary organization** approach for SSE notifications and push subscriptions.

### 📋 Strategy Overview

The system uses the session's `active_organization_id` field to determine which organization's notifications a user receives. This approach provides:

1. **Single Organization Per Connection**: Each SSE connection is scoped to one organization
2. **Session Persistence**: Organization context persists across requests within a session
3. **Security**: Users can only access organizations they're members of
4. **Simplicity**: Clear, predictable behavior without ambiguity

### 🔧 Implementation Details

#### 1. Organization Context Resolution

```typescript
// Priority order for organization selection:
// 1. Session's active_organization_id (preferred)
// 2. User's personal organization (fallback)
// 3. First available organization (last resort)
```

#### 2. Permission Validation

Every notification request validates:
- ✅ User authentication (Better Auth session)
- ✅ Organization membership (members table)
- ✅ Organization existence (organizations table)
- ✅ Session validity (not expired)

#### 3. Multi-Organization Handling

**For users in multiple organizations:**
- **SSE Connections**: One organization per connection (session-scoped)
- **Organization Switching**: Via dedicated endpoint (`POST /api/notifications/switch-org`)
- **Push Subscriptions**: Scoped to specific organization or session's active org
- **Security**: All requests validated against user's actual memberships

### 🛡️ Security Implications

#### ✅ Security Benefits

1. **Principle of Least Privilege**: Users only receive notifications for organizations they belong to
2. **Session Isolation**: Each session maintains its own organization context
3. **Explicit Validation**: Every request validates membership before granting access
4. **No Ambiguity**: Clear error messages for invalid access attempts

#### ⚠️ Security Considerations

1. **Session Hijacking**: If session is compromised, attacker gets access to that organization's notifications
2. **Organization Switching**: Users can switch organizations within their session (by design)
3. **Permission Changes**: If user is removed from organization, they need to reconnect SSE
4. **Session Expiry**: Organization context is lost when session expires

#### 🔒 Mitigation Strategies

1. **Session Security**: 
   - Short session expiry (7 days max)
   - Secure session tokens
   - IP/User-Agent validation (optional)

2. **Permission Validation**:
   - Real-time membership checks
   - No caching of permission decisions
   - Immediate revocation on membership changes

3. **Audit Logging**:
   - Log all organization switches
   - Track notification access attempts
   - Monitor for suspicious patterns

### 📊 Behavior Documentation

#### SSE Connection Behavior

```typescript
// Connection establishment flow:
1. Authenticate user (Better Auth session)
2. Resolve organization context (session → personal → first)
3. Validate membership (members table)
4. Create SSE stream for that organization
5. Return connection with X-Organization-ID header
```

#### Organization Switching Behavior

```typescript
// Organization switch flow:
1. Authenticate user
2. Validate membership in target organization
3. Update session's active_organization_id
4. Return success with instruction to reconnect SSE
5. Client must reconnect SSE to receive new org notifications
```

#### Error Handling

| Scenario | HTTP Status | Response | Action Required |
|----------|-------------|----------|-----------------|
| No session | 401 | "Unauthorized" | User must sign in |
| No organizations | 403 | "No organizations found" | User needs organization |
| Invalid org access | 403 | "Access denied: User not member" | User needs membership |
| Organization not found | 404 | "Organization not found" | Invalid organization ID |
| No active org | 400 | "No active organization found" | User must select organization |

### 🔄 Alternative Strategies Considered

#### 1. Request Parameter Strategy
```typescript
// Rejected: Security concerns
GET /api/notifications/stream?organizationId=xyz
```
**Issues**: 
- Users could potentially access any organization ID
- Requires extensive validation on every request
- Complex error handling for invalid parameters

#### 2. Fan-Out Strategy
```typescript
// Rejected: Complexity and resource usage
// Send notifications to all user's organizations
```
**Issues**:
- Resource intensive (multiple streams per user)
- Complex client-side filtering
- Potential for notification spam
- Difficult to manage organization-specific preferences

#### 3. Session-Scoped Primary Organization ✅
```typescript
// Chosen: Balanced approach
// One organization per session, explicit switching
```
**Benefits**:
- Simple and secure
- Leverages existing session infrastructure
- Clear user experience
- Efficient resource usage

### 🚀 Usage Examples

#### Frontend Implementation

```typescript
// Connect to notifications for current organization
const eventSource = new EventSource('/api/notifications/stream');

// Switch organization and reconnect
async function switchOrganization(orgId: string) {
  await fetch('/api/notifications/switch-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId: orgId })
  });
  
  // Reconnect SSE for new organization
  eventSource.close();
  eventSource = new EventSource('/api/notifications/stream');
}
```

#### Backend Route Implementation

```typescript
// routes/notifications.ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/api/notifications/stream':
        return handleLiveNotifications(request, env);
      case '/api/notifications/switch-org':
        return handleOrganizationSwitch(request, env);
      case '/api/notifications/push-subscribe':
        return handlePushSubscription(request, env);
      default:
        return new Response('Not found', { status: 404 });
    }
  }
};
```

### 📈 Performance Characteristics

#### Resource Usage
- **SSE Connections**: 1 per user (not per organization)
- **Database Queries**: 2-3 queries per connection establishment
- **Memory Usage**: Minimal (session-scoped context)
- **Network**: Efficient (single stream per user)

#### Scalability
- **Horizontal**: Scales with user count, not organization count
- **Vertical**: Minimal memory overhead per connection
- **Database**: Efficient queries with proper indexing

### 🔮 Future Enhancements

#### Potential Improvements
1. **Organization Preferences**: Per-organization notification settings
2. **Role-Based Filtering**: Different notifications based on user role
3. **Bulk Operations**: Efficient organization switching for admin users
4. **Caching**: Organization context caching for performance
5. **Webhooks**: Organization-specific webhook endpoints

#### Migration Path
The current implementation provides a solid foundation for future enhancements:
- Session-scoped approach can be extended with additional context
- Permission validation can be enhanced with role-based filtering
- Organization switching can be optimized with bulk operations
- SSE streams can be enhanced with organization-specific filtering
