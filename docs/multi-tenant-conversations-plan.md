# Multi-Tenant Conversations — Full Implementation Plan (Upwork-style)

## 0) Goals & Scope (v1)

* **Linear 1:1 chats** between client and assigned lawyer; optional org members can be invited later.
* **AI → lead creation → handoff:** Client starts with AI; when ready, AI creates a `matter(status='lead')`, links it to a conversation, notifies assigned lawyer; lawyer accepts → joins chat; or rejects → locks chat.
* **No full threads** (Discord-style) in v1; allow lightweight quote (`reply_to_message_id`).
* **Realtime** via SSE + Durable Object (fan-out to all participants).
* **Notifications**: email + in-app (no push yet).
* **Strict multi-tenant isolation** and participant-level authz.

**Non-goals (v1)**: emoji reactions, per-message read receipts, push notifications, deep search, webhooks.

---

## 1) Data Model (D1)

> Add as a migration: `worker/migrations/2025xxxx_conversations.sql` and merge into `worker/schema.sql`.

### 1.1 Tables

```sql
-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  matter_id TEXT, -- set on lead creation or later
  type TEXT NOT NULL CHECK (type IN ('ai','human','mixed')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','archived')),
  title TEXT,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_org_status
  ON conversations(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_matter
  ON conversations(matter_id);

-- participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client','paralegal','attorney','admin','owner')),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  is_muted INTEGER DEFAULT 0,
  last_read_message_id TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_participants_user_org
  ON conversation_participants(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_participants_conv
  ON conversation_participants(conversation_id);

-- messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sender_user_id TEXT, -- NULL for AI/system
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT, -- redacted to '' on soft delete
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','file','matter_update')),
  reply_to_message_id TEXT,
  metadata TEXT, -- JSON as TEXT
  is_edited INTEGER DEFAULT 0,
  edited_at DATETIME,
  is_deleted INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_org
  ON conversation_messages(sender_user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON conversation_messages(reply_to_message_id);

-- optional v1: files attached to messages (if not already covered by your files table)
CREATE TABLE IF NOT EXISTS conversation_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_files_conv ON conversation_files(conversation_id);
```

### 1.2 Existing tables/index fixes (add in same migration)

```sql
-- files table: strengthen multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_files_org_session ON files(organization_id, session_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);

-- chat_messages perf (org+session scanning)
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_session_created
  ON chat_messages(organization_id, session_id, created_at);
```

---

## 2) Auth & Tenancy

### 2.1 Middleware

**File:** `worker/middleware/auth.ts`

Add:

```ts
export async function requireConversationParticipant(env: Env, req: Request, conversationId: string, allowPrivileged = true) {
  const session = await requireAuth(env, req);
  const convo = await env.DB.prepare(`SELECT organization_id FROM conversations WHERE id = ?`)
    .bind(conversationId).first<{ organization_id: string }>();
  if (!convo) throw new Response('Not found', { status: 404 });

  // Admin/owner bypass (read-only if you prefer)
  if (allowPrivileged && await userIsAdminOrOwner(env, session.user.id, convo.organization_id)) {
    return { session, organizationId: convo.organization_id };
  }

  const isParticipant = await env.DB.prepare(
    `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
  ).bind(conversationId, session.user.id).first();

  if (!isParticipant) throw new Response('Forbidden', { status: 403 });
  return { session, organizationId: convo.organization_id };
}
```

**Fix gaps you flagged:**

* In `worker/routes/agent.ts (POST /api/agent/stream)`: **enforce org membership** before processing. Use `requireOrgMember(env, req, organizationId, 'paralegal' | 'attorney' | etc.)` or participant validation when linked to a conversation.

* In `worker/routes/sessions.ts`: tighten the “public org” fallback; rate-limit and require org existence; avoid cross-org leakage.

---

## 3) Services

Create:

* `worker/services/ConversationService.ts`
* `worker/services/ConversationMessageService.ts`

### 3.1 ConversationService

```ts
export class ConversationService {
  constructor(private env: Env) {}

  async createConversation(args: {
    organizationId: string;
    createdByUserId: string;
    type: 'ai'|'human'|'mixed';
    matterId?: string | null;
    title?: string | null;
    participantUserIds: Array<{ userId: string; role: 'client'|'paralegal'|'attorney'|'admin'|'owner' }>;
  }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO conversations (id, organization_id, matter_id, type, status, title, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `).bind(id, args.organizationId, args.matterId ?? null, args.type, args.title ?? null, args.createdByUserId, now, now),
      ...args.participantUserIds.map(p =>
        this.env.DB.prepare(`
          INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, organization_id, role)
          VALUES (?, ?, ?, ?)
        `).bind(id, p.userId, args.organizationId, p.role)
      )
    ]);

    return { id };
  }

  async addParticipant(conversationId: string, organizationId: string, userId: string, role: string) {
    await this.env.DB.prepare(`
      INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, organization_id, role)
      VALUES (?, ?, ?, ?)
    `).bind(conversationId, userId, organizationId, role).run();
  }

  async removeParticipant(conversationId: string, userId: string) {
    await this.env.DB.prepare(`DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`)
      .bind(conversationId, userId).run();
  }

  async linkMatter(conversationId: string, matterId: string) {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`UPDATE conversations SET matter_id = ?, updated_at = ? WHERE id = ?`)
      .bind(matterId, now, conversationId).run();
  }

  async setType(conversationId: string, type: 'ai'|'human'|'mixed') {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`UPDATE conversations SET type = ?, updated_at = ? WHERE id = ?`)
      .bind(type, now, conversationId).run();
  }

  async setStatus(conversationId: string, status: 'open'|'locked'|'archived') {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(status, now, conversationId).run();
  }
}
```

### 3.2 ConversationMessageService

```ts
export class ConversationMessageService {
  constructor(private env: Env) {}

  async sendUserMessage(args: {
    conversationId: string;
    organizationId: string;
    senderUserId: string;
    content: string;
    replyToMessageId?: string | null;
    messageType?: 'text'|'file'|'system'|'matter_update';
    clientNonce?: string;
  }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO conversation_messages
          (id, conversation_id, organization_id, sender_user_id, role, content, message_type, reply_to_message_id, metadata, created_at)
        VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)
      `).bind(id, args.conversationId, args.organizationId, args.senderUserId,
              args.content, args.messageType ?? 'text', args.replyToMessageId ?? null,
              JSON.stringify({ clientNonce: args.clientNonce ?? null }), now),
      this.env.DB.prepare(`UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`)
        .bind(now, now, args.conversationId)
    ]);

    return { id, createdAt: now };
  }

  async sendSystemMessage(args: {
    conversationId: string;
    organizationId: string;
    content: string;
    messageType?: 'system'|'matter_update';
    metadata?: any;
  }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO conversation_messages
          (id, conversation_id, organization_id, sender_user_id, role, content, message_type, metadata, created_at)
        VALUES (?, ?, ?, NULL, 'system', ?, ?, ?, ?)
      `).bind(id, args.conversationId, args.organizationId, args.content, args.messageType ?? 'system', JSON.stringify(args.metadata ?? {}), now),
      this.env.DB.prepare(`UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`)
        .bind(now, now, args.conversationId)
    ]);
    return { id, createdAt: now };
  }

  async editMessage(messageId: string, editorUserId: string, newContent: string) {
    const now = new Date().toISOString();
    await this.env.DB.prepare(`
      UPDATE conversation_messages
      SET content = ?, is_edited = 1, edited_at = ?
      WHERE id = ? AND sender_user_id = ? AND julianday('now') - julianday(created_at) <= (10.0/1440.0)
    `).bind(newContent, now, messageId, editorUserId).run();
  }

  async softDeleteMessage(messageId: string, requesterUserId: string) {
    const now = new Date().toISOString();
    // Allow sender or privileged staff to soft delete; guard at route level
    await this.env.DB.prepare(`
      UPDATE conversation_messages
      SET content = '', is_deleted = 1, deleted_at = ?
      WHERE id = ?
    `).bind(now, messageId).run();
  }

  async markLastRead(conversationId: string, userId: string, lastMessageId: string) {
    await this.env.DB.prepare(`
      UPDATE conversation_participants SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).bind(lastMessageId, conversationId, userId).run();
  }
}
```

---

## 4) Routes (Workers)

Create: `worker/routes/conversations.ts` and register in `worker/index.ts`.

### 4.1 Endpoints

```
POST   /api/conversations
GET    /api/conversations?organizationId=&status=&cursor=&limit=
GET    /api/conversations/:id
POST   /api/conversations/:id/participants    { userId, role }
DELETE /api/conversations/:id/participants/:userId
POST   /api/conversations/:id/messages        { content, replyToMessageId?, messageType?, clientNonce? }
GET    /api/conversations/:id/messages?before=&limit=
PATCH  /api/conversations/:id/messages/:messageId  { action: 'edit'|'delete', content? }
POST   /api/conversations/:id/accept
POST   /api/conversations/:id/reject
POST   /api/conversations/:id/read            { lastMessageId }
GET    /api/conversations/:id/stream          (SSE)
```

### 4.2 Handlers (outline)

* All **GET/POST/PATCH** routes:

  * `requireAuth`
  * Load/validate org context
  * `requireConversationParticipant` OR `requireOrgMember` (admin/owner)

* **Create conversation** (system/AI or staff):

  * `requireOrgMember(organizationId, 'paralegal')`
  * Upsert participants (creator + client/assignee)
  * Return `conversationId`

* **Send message**:

  * `requireConversationParticipant`
  * Use `ConversationMessageService.sendUserMessage`
  * **Broadcast** via DO (see §5) and **notify** via `NotificationService` (see §6)

* **Accept / Reject**:

  * `requireOrgMember(organizationId, 'attorney')`
  * `MatterService.acceptLead()/rejectLead()`
  * `ConversationService.setType('human')` or `setStatus('locked')`
  * `sendSystemMessage("Accepted by X" | "Rejected by Y")`
  * Notify client

* **Read marker**:

  * `requireConversationParticipant`
  * Update `last_read_message_id`

* **Edit/Delete**:

  * Author-only edit within 10 minutes; soft delete by sender or privileged staff

* **List conversations**:

  * Admin/owner: all in org
  * Others: only where participant
  * Paginate by `updated_at DESC`

* **List messages**:

  * Paginate by `created_at DESC` with `before` cursor

---

## 5) Realtime (SSE + Durable Object)

Create DO: `worker/durable/ConversationRoom.ts`

### 5.1 Durable Object

```ts
export class ConversationRoom {
  state: DurableObjectState; env: Env;
  clients = new Map<string, WritableStreamDefaultWriter>();

  constructor(state: DurableObjectState, env: Env) { this.state = state; this.env = env; }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/stream')) {
      // Optionally carry signed token headers to re-validate here.
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const id = crypto.randomUUID();
      this.clients.set(id, writer);

      const heartbeat = setInterval(() => this.safeWrite(writer, { type: 'ping' }), 15000);
      req.signal.addEventListener('abort', () => { clearInterval(heartbeat); writer.close(); this.clients.delete(id); });

      return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }});
    }

    if (req.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const payload = await req.json(); // { event, data }
      await this.broadcast(payload);
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  }

  private async safeWrite(w: WritableStreamDefaultWriter, obj: any) {
    try { await w.write(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
  }

  private async broadcast(evt: any) {
    const drop: string[] = [];
    for (const [id, w] of this.clients) {
      try { await this.safeWrite(w, evt); } catch { drop.push(id); }
    }
    drop.forEach(id => this.clients.delete(id));
  }
}
```

### 5.2 Bindings & Router

* Add DO binding in `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "CONVERSATION_ROOM"
class_name = "ConversationRoom"
```

* In `worker/index.ts`, route:

  * `GET /api/conversations/:id/stream` → `env.CONVERSATION_ROOM.idFromName(conversationId)`; **verify participant**, then `room.fetch('/stream')`.
  * On message persisted, POST to `.../broadcast` with `{ event: 'message', data: {...} }`.

**Client:** Reuse SSE handler from `useMessageHandling`, subscribe per conversation.

---

## 6) Notifications

**File:** `worker/services/NotificationService.ts` — extend with 3 helpers:

```ts
async sendConversationMessageNotification(input: {
  organizationId: string;
  conversationId: string;
  senderName: string;
  messagePreview: string;
  recipientUserIds: string[];
}) { /* email + in-app */ }

async sendConversationAcceptedNotification(input: {
  organizationId: string; conversationId: string; matterNumber: string; clientUserId: string;
}) { /* email + in-app */ }

async sendConversationRejectedNotification(input: {
  organizationId: string; conversationId: string; clientUserId: string; reason?: string;
}) { /* email + in-app */ }
```

**Where to call:**

* After `sendUserMessage()` (only for recipients other than sender and currently offline).
* After accept/reject handlers.

**In-app (v1):**

* Reuse `StatusService` to push a `type: 'conversation_message'` payload keyed by userId; display with your Toast system and add a basic **badge** count (KV-backed) until you add persistent logs.

---

## 7) Matter Integration (AI → Lead → Handoff)

**File:** `worker/services/MatterService.ts`

* On **lead creation** (contact or AI intake):

  * Create (or upsert) a **conversation** with `type='ai'| 'mixed'`, `matter_id=leadId`.
  * Ensure **client** and **assigned member** are participants.
  * Post a **system message**: “Lead created #M-123”.
  * Call `sendMatterCreatedNotification` (existing) + **sendConversationMessageNotification** (new) to assigned user.

* On **accept**:

  * `acceptLead()` existing behavior.
  * `ConversationService.setType('human')`; ensure accepting lawyer is participant; system message “Accepted by …”; notify client.

* On **reject**:

  * `rejectLead()` existing behavior.
  * `ConversationService.setStatus('locked')`; system message “Rejected by …”; notify client.

---

## 8) Files & Security Hardening

**File:** `worker/routes/files.ts`

* **Validate MIME + size** in upload:

  * Allow list (PDF, images, docx, txt)
  * Size limit 25MB (align with agent cap or raise globally)
* **Virus scanning:** (optional v1) — if not feasible now, document risk and plan later.
* **Retrieval guard:** Add org + participant check on `GET /api/files/:fileId` (use `files.organization_id` and if `files.conversation_id` present, ensure participant).
* **Signed URLs:** (optional v1) — if you keep `/api/files/...` server-proxied, no R2 public URLs. If you move to signed URLs, generate short-lived URLs per participant request.

**Schema indexes:** already included in §1.2.

---

## 9) Frontend (Preact)

Create:

* `src/hooks/useConversations.ts`

  * `listConversations(organizationId)`
  * `getConversation(id)`
  * `addParticipant/removeParticipant`
  * `acceptConversation/rejectConversation`

* `src/hooks/useConversationMessages.ts`

  * `listMessages(conversationId, { before, limit })`
  * `sendMessage(content, opts?)` (include `clientNonce`)
  * `editMessage`, `deleteMessage`
  * `markRead(lastMessageId)`
  * `useConversationStream(conversationId)` (SSE)

Components:

* `src/components/conversations/ConversationList.tsx`
* `src/components/conversations/ConversationThread.tsx`
* `src/components/conversations/MessageComposer.tsx`
* Update `SidebarContent.tsx` to add a “Conversations” section (by matter or all).

**AI handoff UX:**

* In `ChatContainer.tsx`, when AI creates a lead:

  * Show banner “Lead created #M-123 — Awaiting lawyer acceptance”
  * If accepted, show “Your lawyer joined the conversation” and keep history continuous.

---

## 10) Fixes to Existing Routes

* `worker/routes/agent.ts`

  * **Before** streaming or persisting, check organization membership (for staff) or allowable public intake rules.
  * Enforce **size limits** for attachments consistently with `/files.ts`.
  * If agent posts into a conversation (mixed-type), write to `conversation_messages` via `ConversationMessageService.sendSystemMessage` or `role='assistant'`.

* `worker/routes/sessions.ts`

  * Remove or constrain “public org fallback”; attach API rate limiting; ensure org exists and caller is allowed.

---

## 11) Observability & Auditing

* Log **accept/reject/add/remove** into `matter_events` (existing) and plan a `conversation_events` table later.
* Add structured logs on broadcast failures and DO connection counts.
* Metrics: messages/sec, SSE connections count, accept/reject counts.

---

## 12) Testing Matrix

**Unit (services):**

* Create conversation, add/remove participant
* Send message, edit (<=10 min), delete (soft)
* Mark last read
* Accept/reject transitions mutate conversation as expected

**Integration (routes):**

* All endpoints with authz: participant vs admin/owner vs outsider
* SSE: open stream, post message, observe event
* Notifications: verify email sending is called (mock) + in-app status event

**Security:**

* Cross-org access attempts rejected
* File retrieval enforces org & participant
* Agent route checks org membership/session consistently

---

## 13) Deployment Steps

1. Apply migration `2025xxxx_conversations.sql`.
2. Bind DO `ConversationRoom` in `wrangler.toml`.
3. Deploy Worker with new routes registered.
4. Roll behind feature flag:

   * `FEATURE_CONVERSATIONS=true` (in `src/config/features.ts` and Worker env)
5. Smoke tests: create lead via AI → ensure conversation linked; accept → ensure lawyer joins and messaging works.

---

## 14) Timeline (suggested)

* **Day 1–2:** Schema + services + auth middleware + route stubs.
* **Day 3:** DO + SSE stream + broadcast path wired.
* **Day 4:** Matter integration (create/accept/reject) + notifications.
* **Day 5:** Frontend hooks/components + badge/unread.
* **Day 6:** Security/file hardening + tests.
* **Day 7:** Bake & deploy behind flag.

---

## 15) Drop-in TODOs for Codex (per file)

**Create**

* `worker/services/ConversationService.ts` (code above)
* `worker/services/ConversationMessageService.ts` (code above)
* `worker/routes/conversations.ts` (handlers per §4)
* `worker/durable/ConversationRoom.ts` (code above)
* `worker/migrations/2025xxxx_conversations.sql` (SQL §1)
* `src/hooks/useConversations.ts`, `src/hooks/useConversationMessages.ts`
* `src/components/conversations/*` (4 components listed)

**Modify**

* `worker/index.ts`: register routes + DO routing
* `worker/middleware/auth.ts`: add `requireConversationParticipant`, fix gaps
* `worker/services/MatterService.ts`: link conversation + handoff events
* `worker/services/NotificationService.ts`: add 3 methods (§6)
* `worker/routes/agent.ts`: org membership checks + optional write into `conversation_messages`
* `worker/routes/files.ts`: MIME/size validation; retrieval authz
* `worker/schema.sql`: append new tables/indexes (and keep migration as source of truth)
* `src/components/ui/sidebar/organisms/SidebarContent.tsx`: add Conversations section
* `src/components/ChatContainer.tsx`: handoff banners

---

## 16) Security Checklist (must pass)

* [ ] Every conversation/message query **filters by `organization_id`**.
* [ ] Every read/write checks **participant or admin/owner**.
* [ ] File GET checks **org AND participant** if `conversation_id` is set.
* [ ] Message edit time-boxed (<=10 minutes).
* [ ] Soft delete redacts `content` but keeps audit.
* [ ] Rate limit public & session endpoints; Turnstile on public forms.
* [ ] Idempotency key (`X-Idempotency-Key`) for `POST /messages` (store recent keys in KV with 5-minute TTL).

---

## 17) Upwork-style Flow Wiring (recap)

1. **Client ↔ AI** (`type='ai'`), conversation auto-created.
2. AI creates **lead** → **link conversation** → system message + notify assigned.
3. Lawyer **Accepts** → `type='human'`, becomes participant, system message + notify client; or **Rejects** → `status='locked'`, system message + notify client.
4. Optional: **invite** additional org members via participants endpoint.

---

This is everything your codegen needs. If you want, I can generate specific handler code for `worker/routes/conversations.ts` next (CRUD + SSE join) to make it fully turnkey.
