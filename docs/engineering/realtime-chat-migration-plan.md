# Realtime Chat Migration Plan (Durable Objects + WebSockets)

Goal: Replace all polling/SSE chat behavior with WebSockets anchored by Durable Objects.
This is a hard cutover (greenfield, no users). No fallbacks, no backward compatibility.

## Scope
- User-to-user chat realtime delivery (messages, typing, presence, read receipts).
- Replace notification streaming (SSE) with WebSockets.
- Keep D1 as the source of truth for message history.

## Explicit Removals (Legacy)
- Remove polling in `src/shared/hooks/useConversation.ts` (interval + `since` fetches).
- Remove polling/refresh timers used as realtime substitutes in inbox/chat flows.
- Remove SSE stream for notifications (`/api/notifications/stream`, `NotificationHub` SSE code).
- Remove `since`-based message fetch in `worker/services/ConversationService.ts`.
- Remove any UI flags that assume "no streaming for user-to-user chat".

## Target Architecture
- Durable Object per conversation (room):
  - Handles WebSocket connections and broadcast fanout.
  - Persists messages to D1 via `ConversationService` (or direct D1 writes).
  - Assigns canonical `message_id`, `seq`, and `server_ts` before broadcast.
  - Emits events: `message.new`, `typing`, `presence`, `read`.
- Connection topology:
  - One WebSocket per open conversation (ChatRoom DO).
  - Optional separate notifications WebSocket per user (NotificationHub DO).
- HTTP remains for:
  - Initial history load and pagination.
  - File upload and attachment metadata.
  - Conversation creation and membership changes.

## WebSocket Protocol (v1)
All WS frames are JSON objects with `{ type, data }`.

### Versioning
- Include `protocol_version: 1` inside `data` for `auth`.
- After `auth.ok`, the protocol version is pinned for the session.
- Server rejects mismatched versions with `auth.error` code `protocol_version_unsupported`.

### Authentication
- Auth is validated during the WS upgrade using session cookies (Better Auth).
- Invalid auth rejects the upgrade (HTTP 401/403); no WS is established.
- Do not pass bearer tokens via headers, query params, or subprotocols.
- WS upgrade routes must be same-site with the app origin, or the session cookie must be `SameSite=None; Secure`.
- For cross-subdomain use, set cookie `Domain=.example.com`; otherwise forbid cross-subdomain WS.
- Enforce an `Origin` allowlist on WS upgrades and reject mismatches.
- Allowlist configured via env (e.g., `ALLOWED_WS_ORIGINS`) and includes preview/staging origins.
- Upgrade rejection codes: `401` for missing/expired session, `403` for bad origin or membership forbidden.
- After upgrade, client must send `auth` within 5 seconds for protocol negotiation and client metadata; server closes if missing.
- Any non-`auth` frame before successful negotiation results in immediate close.
- `auth.error` is reserved for protocol negotiation failures; auth failures are rejected at upgrade.
- Negotiation rules apply to both conversation WS and notifications WS routes.

### Envelope (All Frames)
- `type`: required string.
- `data`: required object.
- `request_id`: optional string (client-generated, echoed by server on success/error).

### Common Fields
- `conversation_id`: required for conversation-scoped events.
- `client_id`: required on `message.send` (UUID for idempotency).
- `seq`: server-assigned monotonically increasing integer per conversation.
- `server_ts`: server-assigned ISO timestamp.
- Notification events are user-scoped and omit `conversation_id`.

### Client -> Server
- `auth`
  - Required: `protocol_version`
  - Optional: `client_info` (e.g., `{ platform, version }`)
  - Example: `{ type: "auth", data: { protocol_version: 1, client_info: { platform: "web" } } }`
- `resume`
  - Required: `conversation_id`, `last_seq`
  - Use `last_seq: 0` to indicate no local state.
  - Example: `{ type: "resume", data: { conversation_id, last_seq: 42 } }`
- `message.send`
  - Required: `conversation_id`, `client_id`, `content`
  - Optional: `attachments` (array of uploaded file ids), `metadata`
  - Recommended: set `request_id` to correlate with `message.ack`.
  - Example: `{ type: "message.send", data: { conversation_id, client_id, content, attachments: [] } }`
- `typing.start` / `typing.stop`
  - Required: `conversation_id`
- `read.update`
  - Required: `conversation_id`, `last_read_seq`

### Server -> Client
- `auth.ok` / `auth.error`
  - `auth.ok` required: `user_id`
  - `auth.error` required: `code`, `message`
  - `auth.ok` confirms protocol negotiation; authentication already occurred at upgrade.
  - Use `negotiation_*` codes for `auth.error`; `protocol_version_unsupported` is also returned via `auth.error`.
- `resume.ok` / `resume.gap`
  - `resume.ok` required: `conversation_id`, `latest_seq`
  - `resume.gap` required: `conversation_id`, `from_seq`, `latest_seq`
- `message.ack`
  - Required: `conversation_id`, `client_id`, `message_id`, `seq`, `server_ts`
  - Sent to the sender; echoes `request_id` and confirms persistence.
- `message.new`
  - Required: `conversation_id`, `message_id`, `client_id`, `seq`, `server_ts`, `user_id`, `role`, `content`
  - `role` allowed values: `user` | `system` (reserve `assistant` for AI only).
  - For user-to-user chat, `role` must be `user`; `system` is server-generated only.
  - Optional: `attachments`, `metadata`
  - Sender also receives `message.new`; clients reconcile using `client_id` and `message_id`.
- `typing`
  - Required: `conversation_id`, `user_id`, `is_typing`
- `presence`
  - Required: `conversation_id`, `user_id`, `status`
  - Optional: `last_seen`
  - `status` allowed values: `online` | `offline`.
  - Disconnect emits `status=offline` with `last_seen = server_ts` only on offline events.
- `membership.changed`
  - Required: `conversation_id`, `membership_version`
  - Indicates membership roster changed; clients must re-validate their membership.
  - Clients should re-fetch membership and continue if still a member.
  - Removed users will receive a 4403 close (targeted or after broadcast fallback).
  - Clients may optionally reconnect to force a fresh membership check at upgrade.
- `read`
  - Required: `conversation_id`, `user_id`, `last_read_seq`
- `error`
  - Required: `code`, `message`
  - Optional: `details`

### Notification Events (User WS)
- Notifications WS uses `auth` only; no `resume`.
- Notifications WS authenticates at upgrade and negotiates via `auth` within 5 seconds.
- Notifications WS is scoped to the current user; no user id is accepted via path/query.
- `notification.new`
  - Required: `notification_id`, `category`, `created_at`, `title`
  - Optional: `body`, `link`, `metadata`
- `notification.read` (optional)
  - Required: `notification_id`, `read_at`

### Error Codes
- `negotiation_required`
- `negotiation_invalid`
- `protocol_version_unsupported`
- `conversation_not_found`
- `conversation_forbidden`
- `invalid_payload`
- `rate_limited`
- `internal_error`
- `auth.error.code` is restricted to `{negotiation_required, negotiation_invalid, protocol_version_unsupported}`; other failures use `error`.

### Resume/Gap State Machine
- On connect: client sends `auth`, then `resume`.
- Server checks continuity (in this order):
  - Atomically register the connection and read `latest_seq`:
    - Subscribe the connection to new messages before reading `latest_seq`.
    - Use a single DO storage transaction or ordered operation to avoid the registration/read gap.
  - Read `latest_seq` from D1 (or `conversations.latest_seq`) with read-after-write consistency.
  - If `last_seq == latest_seq`: send `resume.ok` with `latest_seq`.
  - If `last_seq < latest_seq`: send `resume.gap` with `from_seq = last_seq + 1` and `latest_seq`.
  - If `last_seq == 0` and `latest_seq == 0`: send `resume.ok` with `latest_seq = 0`.
  - If `last_seq > latest_seq`: send `error` with `invalid_payload`, then close `4400`.
- Any message committed after registration must be delivered over WS to this connection.
- Client behavior:
  - On `resume.ok`: continue; apply live `message.new` events only.
  - On `resume.gap`: HTTP-fetch history from `from_seq`, de-dupe by `message_id`, then continue WS.
  - Fetch until `seq >= latest_seq` from `resume.gap` or the HTTP response returns empty.
  - For large gaps, paginate using `next_from_seq` until the target `latest_seq` is reached.
  - If HTTP fetch fails (>=500/timeout), retry with backoff; if retries exhausted, close WS and reconnect.
- No replay from WS; history recovery is HTTP-only to keep WS stream lightweight.

### Presence/Typing Semantics
- Presence is derived from active WS connections in the room.
- Maintain per-user connection counts; emit presence only on 0->1 and 1->0 transitions.
- Server emits presence on connect/disconnect and closes idle sockets per policy.
- Do not use app-level ping/pong frames; rely on protocol-level ping or auto-response if needed.
- No app-level ping interval; close idle sockets per policy.
- Server should not initiate periodic pings (hibernation-safe).
- Typing events are ephemeral, rate-limited, and coalesced; server can auto-stop after a short TTL.

### Idle Timeout Policy
- Close connections idle for >30 minutes with close code `4410`.
- "Idle" means no client->server frames received (any type resets the timer).
- Use platform idle timeout if available; otherwise implement manual tracking in the DO.
- Clients should reconnect on `4410` without treating it as an error.

### Read Receipt Semantics
- Only the authenticated user may advance their own `last_read_seq`.
- Server clamps `last_read_seq` to `<= latest_seq`.
- Advance only if `new_last_read_seq > stored_last_read_seq`; ignore regressions.
- Persist read state before broadcast; then emit `read` to the room.
- Snapshot `last_read_seq` and WS `read.update` use the same `conversation_read_state` table.

### Message Limits (Hard)
- `content` max length: 4000 chars.
- `attachments` max count: 10.
- `metadata` max size: 8 KB (JSON-encoded).
- Total WS frame size max: 64 KB.
- Validate limits before pending/seq allocation.
- Violations return `error` with `invalid_payload`, then close `4400`.

## API/Route Changes (Hard Cutover)
- Add `GET /api/conversations/:id/ws` to upgrade to WebSocket.
- Add `GET /api/notifications/ws` (user-level notifications WS) to replace `/api/notifications/stream`.
- Do not expose a generic WS upgrade route without a `conversation_id` in the path or query.
- Keep `GET /api/chat/messages` for history and pagination only.
- Add `from_seq` query param to fetch history forward (`seq >= from_seq`):
  - `limit` required for forward fetch; `order=asc` when using `from_seq`.
  - `from_seq` is inclusive.
  - Response includes `latest_seq` and `next_from_seq`:
    - If messages returned: `next_from_seq = last.seq + 1`.
    - If empty and `from_seq <= latest_seq`: `next_from_seq = from_seq`.
    - If `from_seq > latest_seq`: `next_from_seq = null`.
- Remove `since` polling support from server and client.
- Remove `POST /api/chat/messages` (all message writes go through ChatRoom DO).
- Use "attachment uploaded -> message.send" flow for files.
- Remove `/api/notifications/stream` endpoint.
- Add `GET /api/notifications?unread=true&limit=...` for reconciliation.
- Add a lightweight "conversation snapshot" endpoint for latest `seq` and unread counts:
  - Response fields: `latest_seq`, `last_read_seq`, `unread_count`, optional `last_message_preview`.
  - `unread_count = max(latest_seq - last_read_seq, 0)`.
  - Default `last_read_seq = 0` when no read state exists.

## Durable Objects
- Add `ChatRoom` DO:
  - Keyed by `conversationId` (`idFromName(conversationId)`).
  - On WS upgrade:
    - Validate auth + membership; reject upgrade if invalid (cache membership with expiry).
    - Register connection with user metadata.
    - Cache `membership_version` and revalidate on incoming frames when stale.
  - On WS `message.send`:
    - Require `client_id` (UUID) for idempotency.
    - Persist a pending record in DO durable storage keyed by `(conversation_id, client_id)` containing:
      - `content_hash`, `attachments_hash`, `allocated_seq`, `allocated_at`.
    - Hashes are computed from normalized content and stable-ordered attachments.
    - If a pending record exists with mismatched hashes, close with `4400`.
    - Allocate `seq` in DO (durable storage counter) only for new inserts.
    - Persist pending record + allocated seq in a single DO storage transaction before D1 writes.
      - Use `state.storage.transaction()` so counter + pending record updates are atomic across multiple keys.
      - Alternatively, store the pending record (including `allocated_seq`) as a single compound value under a single key for single-write atomicity.
    - Attempt insert with `(conversation_id, client_id)` unique constraint (authoritative):
      - On conflict, fetch existing row and return idempotent `message.ack`.
    - Pre-checks are optional optimizations only; do not rely on them for correctness.
    - Persist in a single D1 transaction: insert message + update `conversations.latest_seq` (use `DB.batch()` so both statements commit/rollback together).
    - Assign `message_id`, `seq`, `server_ts`.
    - Broadcast after commit to avoid ghost messages.
    - Enforce uniqueness in D1 on `(conversation_id, client_id)`.
    - If `client_id` already exists, return idempotent `message.ack` with existing metadata.
    - Retry transient D1 failures with the same `client_id`; reuse pending `allocated_seq` to avoid gaps.
    - Clear pending record after commit or idempotent ack (hashes match).
    - If conflict fetch fails/transient, keep pending and retry.
    - Expire pending records after 2 minutes; sweep up to 20 per `message.send`.
  - On reconnect:
    - Handle `resume` with last seen `seq`.
    - Reply `resume.ok` only when `last_seq == latest_seq`; otherwise `resume.gap` to HTTP-fetch history.
  - Optional hibernation support for long-lived connections.
    - Use hibernatable websockets; keep minimal connection metadata and recompute counts on wake.
- Update `NotificationHub` DO (if kept separate):
  - Replace SSE with WebSocket support.
  - Broadcast notification payloads to connected clients.
  - Notification delivery path:
    - Producer writes to D1 `notifications`.
    - Producer (or queue consumer) publishes to NotificationHub for `notification.new` push.

## Frontend Changes
- Replace polling in `useConversation` with a WebSocket client hook:
  - Connect on conversation open.
  - Dispatch incoming messages to state keyed by `message_id`.
  - Send messages over WS (after file upload completes).
  - Send `resume` on reconnect with last seen `seq`.
  - Handle reconnect with backoff (no long polling fallback).
- Validate message limits client-side before send (content length, attachments, metadata).
- If `message.send` fails after attachment upload, retry with the same `client_id` and attachment ids.
- Update notifications store to use WebSocket events instead of SSE parsing.
- Remove any UI logic that hard-codes non-streaming chat behavior.
- Add client de-dupe by `message_id` to prevent reconnect duplicates.

## Worker Changes
- Add DO bindings in `worker/wrangler.toml` for `ChatRoom`.
- Add routing in `worker/index.ts` and new handler file:
  - Route WS upgrades to DO stub fetch.
  - Ensure WS upgrade routes are not cached.
  - Forward `Cookie` header unchanged into DO fetch.
- Ensure caching middleware never runs before WS upgrade handling.
- Ensure auth middleware does not consume request body/streams before upgrade.
- Do not strip/normalize `Cookie` or `Origin` headers on WS routes.
- Update `worker/middleware/cors.ts` to allow WS upgrade responses for new routes.
- Remove `SSE_POLL_INTERVAL` and any SSE-specific logic from `worker/types.ts` and `StatusService`.
- Remove `/api/notifications/stream` route and SSE logic in `NotificationHub`.
- Session revalidation: validate on upgrade; close connections on auth expiry/revocation (client reconnects).
- Kick members removed mid-session.
- On membership changes, notify the `ChatRoom` DO (internal route/queue) to close sockets for the removed user.
- Membership change notification mechanism:
  - Triggered by the membership update handler.
  - Send a direct DO stub `fetch` to `ChatRoom` with `{ conversation_id, removed_user_id, membership_version }`.
  - DO closes sockets for removed_user_id and updates cached membership_version.
  - On failure, enqueue to dedicated `membership_revocation` queue with max 3 retries (1s, 5s, 15s backoff).
  - After retries exhausted, broadcast `membership.changed` to all room connections to force revalidation.
  - Target SLA: removed users disconnected within 30 seconds.
- Track `membership_version` per conversation; cache in DO and revalidate on mismatch.
  - On any incoming frame: if cached version != current (from D1 or internal event), re-check membership.
  - If removed, close with `4403`; if still member, update cached version.
  - Cache `membership_version` with max TTL of 5 minutes; revalidate on expiry regardless of incoming frames.
- Add rate limits per connection (and optionally per user):
  - `message.send`: 5 per 10s per connection.
  - `typing`: 20 per 10s per connection.
  - On exceed: send `error` with `rate_limited`; drop excess frames. If sustained, close `4429`.

## Data/Schema
- No new tables required for basic realtime.
- Add unique constraint for idempotency:
  - Unique index on `(conversation_id, client_id)`.
- Add `seq` column (monotonic per conversation) if not already present.
- Track `latest_seq`:
  - Prefer `conversations.latest_seq` updated transactionally per insert.
  - Greenfield fallback: `MAX(seq)` query per resume (revisit for scale).
- Canonical sources:
  - Allocation uses DO durable storage counter.
  - Resume checks use `conversations.latest_seq` in D1.
- Membership versioning:
  - `membership_version` (monotonic) per conversation, incremented on membership change.
- Read receipts (required for unread counts/read receipts in scope):
  - Use `conversation_read_state(conversation_id, user_id, last_read_seq, updated_at)`.
  - Avoid per-message read flags for large rooms.
  - Default `last_read_seq = 0` when no row exists.
- Notifications persistence contract (D1 via `NotificationStore`):
  - `notifications(id, user_id, category, payload, created_at, read_at)`.
  - If generated from events, add `source_event_id` with unique `(user_id, source_event_id)` to prevent duplicates.

## Implementation Steps (Order)
1. Add `ChatRoom` DO and route handler for WS upgrade.
2. Implement WS message protocol (JSON events, versioned).
3. Add idempotency + `seq`/timestamp assignment in D1 writes.
4. Add resume protocol (`resume`/`resume.ok`/`resume.gap`).
5. Replace frontend polling with WS hook for conversation messages.
6. Replace notification SSE with WS (update DO + frontend store).
7. Remove legacy polling/SSE endpoints, parameters, and UI assumptions.
8. Clean up env vars, types, and docs referencing polling/SSE.

## Testing (No Legacy Paths)
- WS connect/auth: valid/invalid session, unauthorized conversation.
- Message fanout: sender sees message, other participants receive it.
- Reconnect behavior: client resubscribes, no duplicate delivery.
- History load: HTTP pagination still works without `since`.
- Notifications: queue -> DO -> WS client delivery.
- Multi-tab: two connections for same user; presence/read receipts remain correct.
- Failure injection: D1 write failure, DO restart, network flaps; verify idempotency and resync.
- Backpressure: large rooms, message size limits, broadcast throughput.
- Security: attempt to join arbitrary conversationId; membership enforced in DO.

## Delivery Semantics (Explicit)
- If recipient not connected:
  - Messages are still persisted in D1; delivery happens on next connection via history.
  - Notification events are persisted in D1 (via `NotificationStore`); WS push is best-effort.
- Clients reconcile unread notifications via HTTP on next session.

## WebSocket Close Codes
- `4400` invalid payload (negotiation or message schema).
- `4401` missing negotiation frame.
- `4403` membership revoked or forbidden.
- `4408` negotiation timeout.
- `4410` idle timeout.
- `4429` rate limit exceeded.
- `4500` internal error.
- Standard WS close codes (1000/1008/1011) may be used by the platform; clients must handle both.
- Close codes apply to both conversation WS and notifications WS.
- Server may send an `error` frame before closing; clients must handle either ordering.
- Negotiation failures:
  - `negotiation_invalid` or `protocol_version_unsupported`: send `auth.error`, then close `4400`.
  - Missing negotiation frame: close `4401`.
  - Negotiation timeout: close `4408`.

## Cloudflare References
- DO WebSockets + Hibernation guidance: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Hibernation API (acceptWebSocket, auto-response): https://developers.cloudflare.com/durable-objects/api/state/
- DO WebSocket examples:
  - https://developers.cloudflare.com/durable-objects/examples/websocket-server/
  - https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
- DO examples index: https://developers.cloudflare.com/durable-objects/examples/
- Chat tutorial (DO per room, WS fanout, durable history): https://developers.cloudflare.com/workers/tutorials/deploy-a-realtime-chat-app/
- Workers WebSockets guidance (DOs as single coordination point): https://developers.cloudflare.com/workers/examples/websockets/

## Definition of Done
- No polling intervals for chat or notifications in the app.
- No SSE endpoints or SSE-specific code paths remain.
- WebSocket is the only realtime transport for chat and notifications.
- No `since` parameter used for realtime anywhere; only pagination cursors.
- Instrumentation added: connection counts, upgrade failures by code, messages/sec per room, fanout size, broadcast latency, D1 write latency, reconnect rate, resume.gap rate.
- All message writes flow through ChatRoom DO only.
- Docs and READMEs updated to reflect the new WS/DO architecture.
