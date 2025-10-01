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
  teamId,
  sessionId,
  mime: file.type,
  size: file.size
});

// Consumer (doc-processor.ts)
export default {
  async queue(batch: MessageBatch<DocumentEvent>, env: Env) {
    for (const msg of batch.messages) {
      // Process each message
    }
  }
}
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
  teamId,
  sessionId
});

// Consumer (notification-processor.ts)
export default {
  async queue(batch: MessageBatch<NotificationEvent>, env: Env) {
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
  teamId: teamId,
  sessionId: sessionId,
  data: { matterId, status, message },
  priority: 'high'
});

// Consumer (live-notification-processor.ts)
export default {
  async queue(batch: MessageBatch<LiveNotificationEvent>, env: Env) {
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
    data: { matterId, teamId, url: '/matters/123' }
  },
  teamId,
  userId
});

// Consumer (push-notification-processor.ts)
export default {
  async queue(batch: MessageBatch<PushNotificationEvent>, env: Env) {
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
        return notificationProcessor(batch, env, ctx);
      case 'live-notification-events':
        return liveNotificationProcessor(batch, env, ctx);
      case 'push-notification-events':
        return pushNotificationProcessor(batch, env, ctx);
      case 'doc-events':
        return docProcessor(batch, env, ctx);
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
    // Check if push notifications are enabled
    if (this.env.ENABLE_PUSH_NOTIFICATIONS === 'false') {
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

**Alternative: Team-Level Testing Mode**

For more granular control, implement team-level testing flags:

```typescript
// Check if team is in test mode
const teamConfig = await this.getTeamConfig(teamId);
if (teamConfig.testMode) {
  console.log('🧪 Team in test mode - logging notification instead of sending');
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
  const onlineUsers = await this.getOnlineUsers(notification.teamId);
  
  // Send to online users via SSE
  for (const user of onlineUsers) {
    await this.sendSSE(user.id, notification);
  }
  
  // Store for offline users in KV
  const offlineUsers = await this.getOfflineUsers(notification.teamId);
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

**Decision: Multi-level granularity (user + team + global)**

**Schema Design:**
```sql
-- User-level preferences (highest priority)
CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  notification_type TEXT NOT NULL, -- 'matter_update', 'payment_received', etc.
  channel TEXT NOT NULL, -- 'email', 'push', 'live'
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, team_id, notification_type, channel)
);

-- Team-level preferences (fallback)
CREATE TABLE team_notification_settings (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, notification_type, channel)
);

-- Global defaults (lowest priority)
-- Stored in application config
```

**Preference Resolution Logic:**
```typescript
async getNotificationPreference(userId: string, teamId: string, type: string, channel: string): Promise<boolean> {
  // 1. Check user preference
  const userPref = await this.getUserPreference(userId, teamId, type, channel);
  if (userPref !== null) return userPref;
  
  // 2. Check team preference
  const teamPref = await this.getTeamPreference(teamId, type, channel);
  if (teamPref !== null) return teamPref;
  
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
  team_id TEXT NOT NULL,
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
  teamId: string;
  notifications: Notification[];
  batchKey: string; // e.g., "matter_123", "team_updates"
  maxBatchSize: number;
  batchWindowMs: number;
}

// Batch similar notifications
async batchNotifications(notifications: Notification[]): Promise<NotificationBatch[]> {
  const batches = new Map<string, Notification[]>();
  
  for (const notification of notifications) {
    const batchKey = `${notification.userId}_${notification.teamId}_${notification.type}`;
    if (!batches.has(batchKey)) {
      batches.set(batchKey, []);
    }
    batches.get(batchKey)!.push(notification);
  }
  
  return Array.from(batches.entries()).map(([key, notifs]) => ({
    userId: notifs[0].userId,
    teamId: notifs[0].teamId,
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
  const { userId, teamId, type, matterId } = notification;
  const contentHash = generateContentHash(notification);
  return `${userId}_${teamId}_${type}_${matterId}_${contentHash}`;
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
- ❌ `betterAuth.userHasTeamAccess(userId, teamId)` 
- ❌ `betterAuth.userHasRole(userId, teamId, role)`
- ❌ `session.user.teamId` (not provided by getSession)

**Correct Plugin API Usage:**
- ✅ `betterAuth.listMembers(teamId)` - Get all team members
- ✅ `betterAuth.getActiveMemberRole(userId, teamId)` - Get user's role in team
- ✅ Retrieve organization IDs via plugin methods instead of session.user.teamId

**Team Access Verification Pattern:**
```typescript
// Verify user has access to the team using organization plugin
const memberships = await betterAuth.listMembers(teamId);
const hasAccess = memberships.some(member => member.userId === session.user.id);
if (!hasAccess) {
  return new Response('Forbidden', { status: 403 });
}
```

**Role Checking Pattern:**
```typescript
// Check if user is team admin using organization plugin
const memberRole = await betterAuth.getActiveMemberRole(session.user.id, teamId);
const isAdmin = memberRole === 'admin' || memberRole === 'owner';
if (!isAdmin) {
  return new Response('Forbidden - Admin role required', { status: 403 });
}
```

**Getting User's Organizations:**
```typescript
// Get user's organizations (replaces session.user.teamId)
const userOrgs = await betterAuth.listUserOrganizations(session.user.id);
const teamIds = userOrgs.map(org => org.organizationId);
```

### Prerequisites
- Better Auth organizations/teams must be configured before implementing notifications
- User identity and team membership must be established
- Role-based permissions system must be in place

### Core Integration Points

#### 1. User Identity & Notification Targeting

**Better Auth as Source of Truth:**
```typescript
// All notification targeting uses Better Auth IDs
interface NotificationTarget {
  userId: string;        // Better Auth user.id
  teamId: string;        // Better Auth organization/team.id
  email: string;         // Better Auth verified email
  roles: string[];       // Better Auth user roles
}

// Notification service validates against Better Auth
class NotificationService {
  async validateNotificationTarget(userId: string, teamId: string): Promise<boolean> {
    const user = await this.betterAuth.getUser(userId);
    const teamMembership = await this.betterAuth.getTeamMembership(userId, teamId);
    
    return user && teamMembership && user.verified;
  }
}
```

#### 2. Permission-Based Notification Filtering

**Role-Based Notification Rules:**
```typescript
// Define notification permissions by role
const NOTIFICATION_PERMISSIONS = {
  'team:admin': ['system_alert', 'team_update', 'matter_update', 'payment_received'],
  'team:member': ['matter_update', 'payment_received'],
  'team:viewer': ['matter_update'],
  'client': ['matter_update', 'payment_received']
};

// Check permissions before enqueueing
async enqueueNotification(notification: Notification) {
  const user = await this.betterAuth.getUser(notification.userId);
  const userRoles = await this.betterAuth.getUserRoles(notification.userId, notification.teamId);
  
  // Check if user has permission for this notification type
  const hasPermission = userRoles.some(role => 
    NOTIFICATION_PERMISSIONS[role]?.includes(notification.type)
  );
  
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
  team_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES better_auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES better_auth_organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, team_id, notification_type, channel)
);

-- Push subscriptions tied to Better Auth users
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Better Auth user.id
  team_id TEXT NOT NULL,           -- Better Auth organization.id
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES better_auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES better_auth_organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, endpoint)
);

-- Notification logs with Better Auth references
CREATE TABLE notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- Better Auth user.id
  team_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSON,
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES better_auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES better_auth_organizations(id) ON DELETE CASCADE,
  INDEX(user_id, read_at),
  INDEX(user_id, created_at)
);

-- Team-level notification settings
CREATE TABLE team_notification_settings (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,           -- Better Auth organization.id
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES better_auth_organizations(id) ON DELETE CASCADE,
  UNIQUE(team_id, notification_type, channel)
);
```

#### 4. Session-Aware Live Notifications

**SSE with Better Auth Session Validation:**
```typescript
// Live notification endpoint with Better Auth validation
export async function handleLiveNotifications(request: Request, env: Env) {
  const session = await betterAuth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = session.user.id;
  const teamId = session.user.teamId; // From Better Auth context
  
  // Create SSE connection scoped to authenticated user
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to user-specific notification stream
      const subscription = notificationStream.subscribe(userId, teamId, (notification) => {
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
      'Connection': 'keep-alive'
    }
  });
}
```

#### 5. Push Subscription Management with Better Auth

**Secure Push Subscription Registration:**
```typescript
// Push subscription endpoint with Better Auth validation
export async function handlePushSubscription(request: Request, env: Env) {
  const session = await betterAuth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { subscription, teamId } = await request.json();
  
  // Verify user has access to the team using organization plugin
  const memberships = await betterAuth.listMembers(teamId);
  const hasAccess = memberships.some(member => member.userId === session.user.id);
  if (!hasAccess) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Store subscription with Better Auth user ID
  await env.DB.prepare(`
    INSERT OR REPLACE INTO push_subscriptions 
    (id, user_id, team_id, endpoint, p256dh_key, auth_key, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    session.user.id,        // Better Auth user ID
    teamId,                 // Better Auth team ID
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    request.headers.get('User-Agent')
  ).run();
  
  return new Response(JSON.stringify({ success: true }));
}
```

#### 6. Notification Preferences with Better Auth Context

**User-Scoped Preference Management:**
```typescript
// Get user's notification preferences with Better Auth context
export async function getUserNotificationPreferences(request: Request, env: Env) {
  const session = await betterAuth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { teamId } = await request.json();
  
  // Verify user has access to the team using organization plugin
  const memberships = await betterAuth.listMembers(teamId);
  const hasAccess = memberships.some(member => member.userId === session.user.id);
  if (!hasAccess) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Get user's preferences for this team
  const preferences = await env.DB.prepare(`
    SELECT notification_type, channel, enabled
    FROM notification_preferences
    WHERE user_id = ? AND team_id = ?
  `).bind(session.user.id, teamId).all();
  
  return new Response(JSON.stringify({ preferences }));
}

// Update user's notification preferences
export async function updateNotificationPreferences(request: Request, env: Env) {
  const session = await betterAuth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { teamId, preferences } = await request.json();
  
  // Verify user has access to the team using organization plugin
  const memberships = await betterAuth.listMembers(teamId);
  const hasAccess = memberships.some(member => member.userId === session.user.id);
  if (!hasAccess) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Update preferences (user can only update their own)
  for (const pref of preferences) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO notification_preferences
      (id, user_id, team_id, notification_type, channel, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      session.user.id,        // Better Auth user ID
      teamId,                 // Better Auth team ID
      pref.notification_type,
      pref.channel,
      pref.enabled
    ).run();
  }
  
  return new Response(JSON.stringify({ success: true }));
}
```

#### 7. Admin Override Capabilities

**Team Admin Notification Management:**
```typescript
// Team admin can manage team-wide notification settings
export async function updateTeamNotificationSettings(request: Request, env: Env) {
  const session = await betterAuth.getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { teamId, settings } = await request.json();
  
  // Check if user is team admin using organization plugin
  const memberRole = await betterAuth.getActiveMemberRole(session.user.id, teamId);
  const isAdmin = memberRole === 'admin' || memberRole === 'owner';
  if (!isAdmin) {
    return new Response('Forbidden - Admin role required', { status: 403 });
  }
  
  // Update team-wide settings
  for (const setting of settings) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO team_notification_settings
      (id, team_id, notification_type, channel, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      teamId,
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
   - Configure teams/organizations
   - Set up role-based permissions
   - Establish user-team relationships

2. **Update Database Schema**
   - Add Better Auth foreign key constraints
   - Ensure proper cascade deletes
   - Add indexes for Better Auth queries

3. **Implement Authentication Middleware**
   - Session validation for all notification endpoints
   - Permission checks before notification operations
   - Team access verification

4. **Build Notification Services**
   - Integrate Better Auth user/team resolution
   - Implement role-based notification filtering
   - Add permission validation to queue consumers

5. **Create Frontend Components**
   - Use Better Auth session for user context
   - Implement team-scoped preference management
   - Add admin override capabilities

### Security Benefits

- **Identity Verification**: All notifications tied to verified Better Auth users
- **Permission Enforcement**: Role-based access control for notification types
- **Team Isolation**: Users can only access notifications for their teams
- **Session Security**: Live notifications scoped to authenticated sessions
- **Admin Controls**: Team admins can manage notification policies
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
