# Notification System Implementation Plan

## Current State Analysis

### ✅ Existing Infrastructure

**Email Notifications (Resend Integration)**
- **File**: `worker/services/EmailService.ts` (lines 1-32)
- **File**: `worker/services/NotificationService.ts` (lines 1-128)
- **Current Types**: `lawyer_review`, `matter_created`, `payment_required`
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

**Settings Infrastructure**
- **File**: `src/components/settings/SettingsPage.tsx` (lines 1-189)
- **File**: `src/components/settings/hooks/useSettingsData.ts` (lines 1-118)
- **File**: `src/components/settings/hooks/useSettingsNavigation.ts` (lines 1-91)

### 🔧 Cloudflare Workers Environment

**Available Resources** (`worker/types.ts` lines 4-37):
- `RESEND_API_KEY` - Email service
- `CHAT_SESSIONS: KVNamespace` - Session storage
- `DB: D1Database` - Database
- `DOC_EVENTS: Queue` - Background processing (currently used for file analysis)
- `PARALEGAL_TASKS: Queue` - Task processing

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

## Authentication Integration

### Bearer Token Authentication for Notifications

All notification endpoints and SSE connections must use the new Bearer token authentication:

**SSE Authentication**:
```typescript
// Client: src/hooks/useMessageHandling.ts
const eventSource = new EventSource('/api/agent/stream', {
  headers: {
    'Authorization': `Bearer ${await getTokenAsync()}`
  }
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
await env.NOTIFICATION_QUEUE.send({
  type: 'email',
  notificationType: 'matter_created',
  recipient: ownerEmail,
  organizationId, // Required for multi-tenant isolation
  userId, // Required for user-specific notifications
  data: { matterInfo, clientInfo }
});
```

## Implementation Strategy

### Phase 1: Enhanced Email Notifications with Queue Processing

**Extend Existing Files:**

1. **`worker/services/EmailService.ts`**
   - Add HTML template support
   - Add email analytics tracking
   - Add attachment support
   - Add email preferences validation

2. **`worker/services/NotificationService.ts`**
   - Add new notification types: `system_alert`, `matter_update`, `payment_completed`, `document_ready`
   - Add HTML email templates
   - Add email preference checking
   - **Queue Integration**: Enqueue email notifications instead of sending immediately

3. **New Queue Consumer**: `worker/consumers/notification-processor.ts`
   - Process email notifications from queue
   - Handle retry logic with exponential backoff
   - Track delivery status and analytics
   - Follow existing pattern from `doc-processor.ts`

4. **Database Schema** (New migration)
   - Add `notification_preferences` table
   - Add `email_templates` table
   - Add `notification_logs` table

**Queue Integration Pattern**:
```typescript
// Producer (NotificationService.ts)
await env.NOTIFICATION_QUEUE.send({
  type: 'email',
  notificationType: 'matter_created',
  recipient: ownerEmail,
  template: 'matter_created',
  data: { matterInfo, clientInfo },
  organizationId,
  sessionId
});

// Consumer (notification-processor.ts)
export default {
  async queue(batch: MessageBatch<NotificationEvent>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      // Process email notifications
      // Handle retries, analytics, delivery tracking
    }
  }
}
```

### Phase 2: Live In-App Notifications with Queue Integration

**Extend Existing SSE Infrastructure:**

1. **`worker/routes/agent.ts`**
   - Add new SSE event types for notifications
   - Extend existing streaming response (lines 201-295)
   - Add notification-specific middleware

2. **`src/hooks/useMessageHandling.ts`**
   - Extend SSE event handling (lines 174-203)
   - Add notification state management
   - Add notification persistence

3. **Queue Integration for Live Notifications:**
   - **Producer**: Enqueue live notifications in `NotificationService.ts`
   - **Consumer**: `worker/consumers/live-notification-processor.ts`
   - **SSE Delivery**: Process queue and deliver via existing SSE infrastructure

4. **New Files to Create:**
   - `worker/services/LiveNotificationService.ts`
   - `worker/consumers/live-notification-processor.ts`
   - `src/hooks/useNotifications.ts`
   - `src/components/NotificationCenter.tsx`
   - `src/components/NotificationItem.tsx`

**Live Notification Queue Pattern**:
```typescript
// Producer (NotificationService.ts)
await env.LIVE_NOTIFICATION_QUEUE.send({
  type: 'live',
  notificationType: 'matter_update',
  userId: userId,
  organizationId: organizationId,
  sessionId: sessionId,
  data: { matterId, status, message },
  priority: 'high'
});

// Consumer (live-notification-processor.ts)
export default {
  async queue(batch: MessageBatch<LiveNotificationEvent>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      // Deliver via SSE to active sessions
      // Store in KV for offline users
      // Update notification preferences
    }
  }
}
```

### Phase 3: Browser Push Notifications with Queue Processing

**Extend Service Worker:**

1. **`public/sw.js`**
   - Add push event listeners
   - Add notification click handlers
   - Add background sync for offline notifications

2. **Queue Integration for Push Notifications:**
   - **Producer**: Enqueue push notifications in `NotificationService.ts`
   - **Consumer**: `worker/consumers/push-notification-processor.ts`
   - **Web Push API**: Process queue and send via Web Push API

3. **New Files to Create:**
   - `worker/routes/push.ts` - Push notification endpoint
   - `worker/consumers/push-notification-processor.ts`
   - `src/hooks/usePushNotifications.ts`
   - `src/utils/pushSubscription.ts`

4. **Database Schema** (New migration)
   - Add `push_subscriptions` table
   - Add `notification_delivery_logs` table

**Push Notification Queue Pattern**:
```typescript
// Producer (NotificationService.ts)
await env.PUSH_NOTIFICATION_QUEUE.send({
  type: 'push',
  notificationType: 'urgent_matter',
  subscription: pushSubscription,
  payload: {
    title: 'Urgent Legal Matter',
    body: 'New urgent matter requires attention',
    data: { matterId, organizationId, url: '/matters/123' }
  },
  organizationId,
  userId
});

// Consumer (push-notification-processor.ts)
export default {
  async queue(batch: MessageBatch<PushNotificationEvent>, env: Env, ctx: ExecutionContext) {
    for (const msg of batch.messages) {
      // Send via Web Push API
      // Handle delivery failures and retries
      // Track delivery analytics
    }
  }
}
```

### Phase 4: Notification Settings & Preferences

**Extend Settings Infrastructure:**

1. **`src/components/settings/SettingsPage.tsx`**
   - Add notification preferences section (line 510-514 in plan.md shows this was removed)
   - Add navigation to notification settings

2. **New Files to Create:**
   - `src/components/settings/pages/NotificationPage.tsx`
   - `src/components/settings/hooks/useNotificationPreferences.ts`
   - `src/components/settings/NotificationPreferenceItem.tsx`

3. **Backend Support:**
   - `worker/routes/notifications.ts` - CRUD for notification preferences
   - `worker/services/NotificationPreferencesService.ts`

### Phase 5: Advanced Features

**Real-time Updates:**
1. **WebSocket Support** (Optional)
   - New file: `worker/routes/websocket.ts`
   - Extend `worker/middleware/cors.ts` (lines 115-118 already handle WebSocket upgrades)

2. **Notification Analytics:**
   - Extend `worker/services/NotificationService.ts`
   - Add tracking for open rates, click rates, delivery status

3. **Smart Notifications:**
   - Add notification batching
   - Add notification scheduling
   - Add notification frequency limits

## File Structure Overview

### Files to Extend (Existing)
```
worker/
├── services/
│   ├── EmailService.ts (enhance)
│   └── NotificationService.ts (enhance)
├── routes/
│   └── agent.ts (extend SSE)
├── middleware/
│   └── cors.ts (WebSocket support)
└── types.ts (add notification types)

src/
├── hooks/
│   └── useMessageHandling.ts (extend SSE handling)
├── contexts/
│   └── ToastContext.tsx (extend for notifications)
├── components/
│   ├── settings/
│   │   ├── SettingsPage.tsx (add notification section)
│   │   └── hooks/
│   │       ├── useSettingsData.ts (extend)
│   │       └── useSettingsNavigation.ts (extend)
│   └── Toast.tsx (enhance for notifications)
└── config/
    └── features.ts (add notification feature flags)

public/
└── sw.js (enhance for push notifications)
```

### Files to Create (New)
```
worker/
├── services/
│   ├── LiveNotificationService.ts
│   ├── NotificationPreferencesService.ts
│   └── PushNotificationService.ts
├── routes/
│   ├── notifications.ts
│   └── push.ts
├── consumers/
│   ├── notification-processor.ts
│   ├── live-notification-processor.ts
│   └── push-notification-processor.ts
└── schemas/
    └── notificationSchemas.ts

src/
├── hooks/
│   ├── useNotifications.ts
│   ├── usePushNotifications.ts
│   └── useNotificationPreferences.ts
├── components/
│   ├── NotificationCenter.tsx
│   ├── NotificationItem.tsx
│   └── settings/
│       ├── pages/
│       │   └── NotificationPage.tsx
│       └── NotificationPreferenceItem.tsx
└── utils/
    └── pushSubscription.ts

migrations/
├── add_notification_preferences.sql
├── add_notification_logs.sql
└── add_push_subscriptions.sql
```

## Cloudflare Best Practices Integration

### 1. **Edge Computing**
- Use Cloudflare Workers for notification processing
- Leverage KV for notification preferences caching
- Use D1 for persistent notification data

### 2. **Performance**
- **Queue-based Processing**: Leverage existing Queue infrastructure for async notification processing
- **Batch Processing**: Process multiple notifications in queue consumers
- **KV Caching**: Cache notification templates and user preferences in KV
- **Global Edge**: Use Cloudflare's global network for fast delivery

### 3. **Security**
- Validate notification permissions
- Use Cloudflare's security headers
- Implement rate limiting for notification endpoints

### 4. **Scalability**
- **Existing Queue Infrastructure**: Extend current `DOC_EVENTS` and `PARALEGAL_TASKS` queues
- **New Queue Bindings**: Add `NOTIFICATION_QUEUE`, `LIVE_NOTIFICATION_QUEUE`, `PUSH_NOTIFICATION_QUEUE`
- **Queue Consumers**: Follow existing pattern from `doc-processor.ts`
- **Auto-scaling**: Leverage Cloudflare's auto-scaling for queue processing
- **Deduplication**: Implement notification deduplication in queue consumers

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

### ✅ **Leverage Existing Queue Infrastructure**

**Current Queue Pattern** (from `doc-processor.ts`):
- **Producer**: `worker/routes/files.ts` enqueues file processing
- **Consumer**: `worker/consumers/doc-processor.ts` processes in batches
- **Queue Binding**: `DOC_EVENTS` in `worker/index.ts`
- **Error Handling**: Retry logic and structured logging

**Notification Queue Extensions**:
1. **Email Notifications**: `NOTIFICATION_QUEUE` → `notification-processor.ts`
2. **Live Notifications**: `LIVE_NOTIFICATION_QUEUE` → `live-notification-processor.ts`  
3. **Push Notifications**: `PUSH_NOTIFICATION_QUEUE` → `push-notification-processor.ts`

**Benefits of Queue-based Processing**:
- **Async Processing**: Non-blocking notification delivery
- **Retry Logic**: Built-in retry with exponential backoff
- **Batch Processing**: Efficient handling of multiple notifications
- **Error Isolation**: Failed notifications don't affect other operations
- **Scalability**: Auto-scaling with Cloudflare's infrastructure

## Implementation Priority

1. **High Priority**: Enhanced email notifications with queue processing (extends existing)
2. **High Priority**: Live in-app notifications with queue + SSE (extends existing)
3. **Medium Priority**: Notification settings (extends existing settings)
4. **Medium Priority**: Browser push notifications with queue processing (extends existing PWA)
5. **Low Priority**: Advanced features (analytics, smart notifications)

## Dependencies

### Existing Dependencies (package.json)
- `better-auth` - User authentication
- `framer-motion` - Animations for notifications
- `@heroicons/react` - Notification icons

### New Dependencies to Add
- `web-push` - Push notification library
- `zod` - Notification schema validation (already exists)

### Queue Configuration Updates

**`wrangler.toml` additions:**
```toml
# New queue bindings for notifications
[[queues.producers]]
queue = "notification-events"
binding = "NOTIFICATION_QUEUE"

[[queues.producers]]
queue = "live-notification-events"
binding = "LIVE_NOTIFICATION_QUEUE"

[[queues.producers]]
queue = "push-notification-events"
binding = "PUSH_NOTIFICATION_QUEUE"

# Queue consumers
[[queues.consumers]]
queue = "notification-events"

[[queues.consumers]]
queue = "live-notification-events"

[[queues.consumers]]
queue = "push-notification-events"
```

**`worker/types.ts` additions:**
```typescript
export interface Env {
  // ... existing properties
  NOTIFICATION_QUEUE: Queue;
  LIVE_NOTIFICATION_QUEUE: Queue;
  PUSH_NOTIFICATION_QUEUE: Queue;
}
```

**`worker/index.ts` queue consumer registration:**

The worker's main entry point must be updated to implement centralized queue routing for all notification queues. This approach replaces separate named queue exports with a single centralized default export that routes based on `batch.queue`.

**Required changes to `worker/index.ts`:**

1. **Import all consumer handlers** (around line 23):
```typescript
import docProcessor from './consumers/doc-processor';
import notificationProcessor from './consumers/notification-processor';
import liveNotificationProcessor from './consumers/live-notification-processor';
import pushNotificationProcessor from './consumers/push-notification-processor';
```

2. **Replace the default export** (around lines 117-120) with centralized queue routing:
```typescript
export default { 
  fetch: handleRequest,
  queue: async (batch: MessageBatch, env: Env, ctx: ExecutionContext) => {
    // Route to appropriate consumer based on queue name
    switch (batch.queue) {
      case 'notification-events':
        return notificationProcessor.queue(batch, env, ctx);
      case 'live-notification-events':
        return liveNotificationProcessor.queue(batch, env, ctx);
      case 'push-notification-events':
        return pushNotificationProcessor.queue(batch, env, ctx);
      case 'doc-events':
        return docProcessor.queue(batch, env, ctx);
      default:
        console.error('Unknown queue:', batch.queue);
        throw new Error(`No handler for queue: ${batch.queue}`);
    }
  }
};
```

**Key Implementation Details:**

- **Async queue handler**: The queue function is marked as `async` to properly handle asynchronous consumer operations
- **ExecutionContext usage**: Each consumer receives the `ctx` parameter for background work management using `ctx.waitUntil()`
- **Error handling**: Clear error logging and throwing for unknown queues
- **Centralized routing**: Single point of control for all queue processing

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
All four queues must be bound in the `[queues]` section:
```toml
# Queue producers
[[queues.producers]]
queue = "doc-events"
binding = "DOC_EVENTS"

[[queues.producers]]
queue = "notification-events"
binding = "NOTIFICATION_QUEUE"

[[queues.producers]]
queue = "live-notification-events"
binding = "LIVE_NOTIFICATION_QUEUE"

[[queues.producers]]
queue = "push-notification-events"
binding = "PUSH_NOTIFICATION_QUEUE"

# Queue consumers - all routes to centralized handler
[[queues.consumers]]
queue = "doc-events"

[[queues.consumers]]
queue = "notification-events"

[[queues.consumers]]
queue = "live-notification-events"

[[queues.consumers]]
queue = "push-notification-events"
```

This centralized approach provides better error handling, centralized queue management, and ensures all queues are properly bound and routed through the single queue handler.

## Environment Variables

### Existing (wrangler.toml)
- `RESEND_API_KEY` - Email service

### New to Add
- `VAPID_PUBLIC_KEY` - Push notification public key (sensitive - use dev vars)
- `VAPID_PRIVATE_KEY` - Push notification private key (sensitive - use dev vars)
- `NOTIFICATION_WEBHOOK_SECRET` - Webhook validation (sensitive - use dev vars)

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

**Implementation in Notification Services:**

```typescript
// worker/services/notificationService.ts
export class NotificationService {
  constructor(private env: Env) {}

  // Robust boolean parsing helper
  private parseEnvBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  async sendEmail(notification: EmailNotification): Promise<void> {
    // Check if email notifications are enabled with robust parsing
    const isEmailEnabled = this.parseEnvBoolean(this.env.ENABLE_EMAIL_NOTIFICATIONS, false);
    if (!isEmailEnabled) {
      console.log('📧 Email notifications disabled - would send email:', {
        to: notification.to,
        subject: notification.subject,
        template: notification.template
      });
      return;
    }

    // Actual email sending logic
    await this.resendClient.emails.send(notification);
  }

  async sendPushNotification(notification: PushNotification): Promise<void> {
    // Check if push notifications are enabled with robust parsing
    const isPushEnabled = this.parseEnvBoolean(this.env.ENABLE_PUSH_NOTIFICATIONS, false);
    if (!isPushEnabled) {
      console.log('🔔 Push notifications disabled - would send push notification:', {
        userId: notification.userId,
        title: notification.title,
        body: notification.body
      });
      return;
    }

    // Actual push notification logic
    await this.webPushClient.sendNotification(notification);
  }
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
VAPID_PUBLIC_KEY=your_vapid_public_key_here
VAPID_PRIVATE_KEY=your_vapid_private_key_here
NOTIFICATION_WEBHOOK_SECRET=your_webhook_secret_here
```

**Alternative: organization-Level Testing Mode**

For more granular control, implement organization-level testing flags:

```typescript
// Check if organization is in test mode
const organizationConfig = await this.getOrganizationConfig(organizationId);
if (organizationConfig.testMode) {
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

**Decision: Use separate queues for isolation and reliability**

**Rationale:**
- **Isolation**: Email failures won't block push notifications
- **Different retry strategies**: Email can retry longer, push notifications need faster failure
- **Monitoring**: Easier to track delivery rates per channel
- **Scaling**: Can scale consumers independently

**Implementation:**
```typescript
// Three dedicated queues with different retry policies
NOTIFICATION_QUEUE: {
  retry: { maxRetries: 3, backoffMs: [1000, 5000, 15000] }
}
LIVE_NOTIFICATION_QUEUE: {
  retry: { maxRetries: 1, backoffMs: [500] } // Fast failure for real-time
}
PUSH_NOTIFICATION_QUEUE: {
  retry: { maxRetries: 2, backoffMs: [2000, 10000] }
}
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

### Push Subscription Management

**Decision: Proactive cleanup with delivery-time validation**

**Strategy:**
- **Delivery-time validation**: Check subscription validity on each send
- **Cleanup on failure**: Remove invalid subscriptions when delivery fails
- **Periodic cleanup**: Weekly job to remove expired subscriptions
- **User-initiated cleanup**: Remove on logout/device change

**Implementation:**
```typescript
async sendPushNotification(subscription: PushSubscription, payload: any) {
  try {
    await this.webPushClient.sendNotification(subscription, payload);
  } catch (error) {
    if (error.statusCode === 410) { // Gone - subscription expired
      await this.removePushSubscription(subscription.endpoint);
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

-- Push subscriptions tied to Better Auth users
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Better Auth user.id
  organization_id TEXT NOT NULL,           -- Better Auth organization.id
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, endpoint)
);

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
  const { subscription, organizationId } = await request.json();
  
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
  
  // Check for existing subscription to preserve created_at
  const existingSubscription = await env.DB.prepare(`
    SELECT created_at FROM push_subscriptions 
    WHERE user_id = ? AND endpoint = ?
  `).bind(userId, subscription.endpoint).first<{ created_at: number }>();
  
  const createdAt = existingSubscription?.created_at || Date.now();
  const updatedAt = Date.now();
  
  // Store push subscription with organization context, preserving original created_at
  await env.DB.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (
      user_id, organization_id, endpoint, p256dh_key, auth_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    targetOrganizationId,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
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
