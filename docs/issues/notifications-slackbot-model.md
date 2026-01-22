Title: Replace notifications center with Slackbot model (Blawby bot + system conversation)

Summary
We want notifications to behave like Slack/Discord: no per-category pages. Notifications should show up as chat messages from a Blawby bot. If a notification is relevant to a specific conversation, it appears in that conversation for the parties involved. If it is not tied to a specific conversation, it appears in a dedicated "Blawby System" conversation. We are greenfield, so remove the current notifications center and all related routes/UI without backward compatibility or fallbacks.

Context/Background
- Aligns UX with Slack/Discord where notifications are conversation-scoped.
- Reduces UI surface area (no separate notifications center).
- Simplifies mobile navigation (one list, one mental model).
- Keeps system events discoverable inside chat history.

Current behavior (code refs)
- Note: current behavior is code-only reference; there are no existing users or production data.
- Left sidebar exposes notification categories and unread dots. `src/shared/ui/sidebar/organisms/SidebarContent.tsx`
- Notifications live on dedicated routes (`/notifications/:category`) with a category header and list. `src/app/MainApp.tsx`, `src/app/AppLayout.tsx`, `src/features/notifications/pages/NotificationCenterPage.tsx`
- Unread counts and per-conversation counts are derived from the notifications store. `src/features/notifications/hooks/useNotifications.ts`, `src/features/notifications/hooks/useNotificationCounts.ts`
- Worker provides notifications endpoints and stores notifications in D1 + WS hub. `worker/routes/notifications.ts`, `worker/services/NotificationStore.ts`, `worker/durable-objects/NotificationHub.ts`, `worker/queues/notificationProcessor.ts`

Goals
- Notifications surface only as chat messages from a Blawby bot.
- Conversation-relevant notifications appear inside that conversation for its participants.
- Non-conversation notifications appear in a dedicated "Blawby System" conversation (1:1 bot chat).
- Remove the notifications center UI and routing entirely.
- Conversation list is the sole in-app notifications surface (unread counts per conversation).

Non-goals
- Backward compatibility with the current notifications center.
- Maintaining per-category notification pages or filters.
- Any fallback routes or UI for `/notifications`.

Proposed changes
Frontend
- Remove notification tab state, routing, and pages. Delete or retire `src/features/notifications/*`.
- Remove the notifications section from the left sidebar and the bell entry points on mobile.
- Keep conversation list visible as the primary navigation surface for unread indicators.
- Add a special label/avatar treatment for the Blawby bot and the system conversation using existing assets (no per-message avatar field).
- Replace `useNotificationCounts` usage with conversation-level unread data from the conversations API or a new unread-count field.

Worker/API
- Introduce a "Blawby bot" identity and a dedicated "Blawby System" conversation per user (or per user+practice workspace).
- Add validation enforcement to `ConversationService.sendSystemMessage`: verify `practiceId` + `conversationId`, enforce membership (reject if recipient lacks access), schema-validate metadata and cap sizes (content <= 4,000 chars; metadata <= 8 KB), and record creation in `session_audit_events` with caller context.
- When a system notification is tied to a conversation, create a bot message in that conversation instead of a notification record.
- When a system notification is not tied to a conversation, create a bot message in the Blawby System conversation.
- Remove notifications endpoints and D1 storage used solely for the UI (see Endpoint retention below).
- Ensure conversation list data includes unread counts (server-calculated) so the UI no longer depends on the notifications store.

Design details
Bot identity
- Represent bot messages as `role: system` (not `assistant`) with `user_id: null`.
- Default display name: "Blawby" for in-conversation notifications; "Blawby System" for the system conversation.
- Bot is not searchable as a participant; bot messages are searchable within conversation content.
- Bot messages respect conversation membership; the system conversation is private to the user.
- Avatar source: use existing `public/blawby-favicon-iframe.png` in the UI; do not add a message-level avatar field.
- For in-conversation bot messages, always show the Blawby logo; practice logo (`practiceConfig.profileImage`) continues for normal assistant/system visuals where applicable.

Avatar rules (conversations)
- User avatar: Better Auth `user.image` when available; fallback to initials/default.
- Practice avatar: `practiceConfig.profileImage`; fallback to practice initials/default.
- Client <-> practice threads:
  - Client messages show the client avatar.
  - Practice/system/bot messages show the practice logo (or Blawby logo for the system conversation).

Message format
- Messages are read-only system entries; no inline composer actions required.
- Include optional `metadata.link` for a single CTA when needed (open link in app).
- Include `metadata.notificationType`, `metadata.severity`, and `metadata.context` for analytics/debugging.
- Metadata shape:
  - link?: string
  - notificationType: string
  - severity?: "info" | "warning" | "error"
  - context?: Record<string, unknown>
- Examples:
  - "You were added to this conversation." (metadata.link -> conversation URL)
  - "Payment failed. Update billing in Settings." (metadata.link -> billing page)
  - "Matter summary PDF is ready." (metadata.link -> file download)

Notification preferences
- Keep existing notification settings UI and preferences storage. `src/features/settings/pages/NotificationsPage.tsx`, `src/features/settings/hooks/useNotificationSettings.ts`, `src/shared/lib/preferencesApi.ts`
- Add in-app controls for bot messages while keeping the core Slack/Discord model.
- In-app controls apply only to bot messages (not user-to-user chat messages).
- New preferences (stored in existing `notifications` payload):
  - `in_app_messages`, `in_app_system`, `in_app_payments`, `in_app_intakes`, `in_app_matters` (boolean; default true; system locked on).
  - `in_app_frequency` for system conversation: `all` | `summaries_only` (default `all`).
- Push/email/desktop delivery continues to be governed by existing channel settings (OneSignal + email).
- Mentions-only still applies to push/email for message category.
- Practice-level notification policy enforcement remains (system notifications required for all members). `worker/services/NotificationPublisher.ts`, `src/features/settings/utils/notificationPolicy.ts`

Notification deduplication
- Use a deterministic `dedupeKey` (practiceId + conversationId + notificationType + entityId).
- Deduplication window:
  - Permanent for state-change events (e.g., status accepted/rejected).
  - 24 hours for transient events (e.g., payment failed, export ready).

Rate limiting
- Per conversation: max 5 bot messages per 5 minutes; additional events in the window are coalesced into a single summary message.
- System conversation: max 3 bot messages per 5 minutes per user; excess events are summarized.
- Per user (global): max 20 bot messages per hour for the system conversation. Conversation-scoped bot messages rely on per-conversation limits to avoid suppressing shared messages.
- Enforce in `worker/queues/notificationProcessor.ts` before calling `ConversationService.sendSystemMessage`.

Coalescing and summarization
- Group excess events by `notificationType` within the rate-limit window.
- If `in_app_frequency = summaries_only`, always emit summaries for the system conversation (even if under the rate limit).
- Precedence/duplication rule: emit a single summary per window for the system conversation when either condition applies (summaries_only OR rate-limit exceeded). Do not emit separate summaries.
- Summary format:
  - Title: "X updates in the last 5 minutes"
  - Body: list top 3 types with counts (e.g., "Payments failed (3), Exports ready (2), Matter updates (1)") and "View conversation for details."
- Include metadata: `notificationType = "summary"`, `context = { windowStart, windowEnd, totalCount, byType, sampleLinks, reason: "rate_limit" | "preference" | "both" }`.
- Link: use the most recent event link (if any) or omit.

Security and abuse prevention
- Bot messages can only be created server-side via the queue processor; no client-exposed endpoints.
- Use `ConversationService.sendSystemMessage` to post server-side messages; no shared secret required.
- Do not introduce `INTERNAL_SECRET`; rely on the existing Worker -> ChatRoom internal call path.
- Internal routes are `ChatRoom` Durable Object endpoints (`/internal/message`, `/internal/membership-revoked`) and should only be reachable via Worker-side `stub.fetch` (current routing only proxies `/api/conversations/:id/ws` to `/ws/:id`, not `/internal/*`). `worker/durable-objects/ChatRoom.ts`, `worker/routes/conversations.ts`
- Define "arbitrary input" as any payload that is not validated against server-side identifiers and membership rules. `sendSystemMessage` calls must validate `practiceId`, `conversationId`, and membership; message content/metadata must be schema-validated and size-capped.
- Findings from review (must change):
  - Public HTTP handlers call `sendSystemMessage` (`worker/routes/aiChat.ts`, `worker/routes/practices.ts`, `worker/routes/intakes.ts`), which violates the "queue processor only" rule.
  - `sendSystemMessage` validates practice + conversation existence but does not enforce membership, metadata schema, or payload size caps. `worker/services/ConversationService.ts`
  - `ChatRoom` internal auth currently depends on `INTERNAL_SECRET` (or `NODE_ENV` fallback), which conflicts with "no shared secret required." `worker/durable-objects/ChatRoom.ts`
- Validate practice existence and conversation membership before posting; never post to conversations the recipient cannot access.
- Reject oversized or malformed metadata; cap payload sizes to prevent abuse.
- Record bot message creation in `session_audit_events` for auditability.

System conversation creation
- Create lazily on first system-only notification for a given user+practice workspace.
- Store a stable conversation title (e.g., "Blawby System"); avatar comes from the Blawby logo asset.

Unread semantics
- Bot messages increment unread counts like normal messages.
- Reading the conversation marks bot messages as read using existing conversation read logic.
- Muting/archiving is at the conversation level (no per-message dismiss).

Performance and storage
- Chat message queries already use indexed access (`idx_chat_messages_conversation`, `uq_chat_messages_conv_seq`). Keep pagination/cursor usage for long threads. `worker/schema.sql`
- Conversation list ordering continues to rely on `conversations.last_message_at` updates.
- Retention:
  - Conversation-scoped bot messages: retained with the conversation history.
  - System conversation: apply both constraints:
    - Drop messages older than 180 days.
    - If more than 1,000 remain, keep the most recent 1,000.

Migration/data handling
- No migration of existing notification records into conversations (greenfield, no existing users).
- Drop notification UI data at cutover (remove tables/endpoints in the same release).
- Any dev/staging notification records are discarded (no preservation or backfill).
- User communication: internal release note only; no end-user migration messaging required.

Implementation approach
- Single atomic change: remove notifications UI/routes and switch to bot messages in the same release.
- No dual-write or phased rollout.
- No rollback plan (forward-only change) because the app is greenfield with no existing users.

Endpoint retention
- Keep for push/email device registration:
  - `POST /api/notifications/destinations`
  - `DELETE /api/notifications/destinations/:id`
  - Client integration: `src/shared/notifications/oneSignalClient.ts`
- Keep remote preferences endpoint: `PUT /api/preferences/notifications` (backend).
- Remove entirely:
  - `GET /api/notifications`
  - `GET /api/notifications/ws`
  - `GET /api/notifications/unread-count`
  - `POST /api/notifications/read-all`
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/:id/unread`
- Remove NotificationHub DO and NotificationStore D1 usage for in-app UI; queue remains for push/email.

Queue processor flow (post-change)
1) Event triggers -> notification processor
2) Processor creates a bot message in the target conversation (or system conversation)
3) Optional: processor also sends push/email notification
4) No D1 notification record for in-app UI

Chatbot flow coverage (current + changes)
- Current: guest/anonymous AI chat uses `POST /api/ai/chat` and stores the AI reply via `ConversationService.sendSystemMessage` (role: system, user_id null, metadata source/model). `worker/routes/aiChat.ts`
- Current: intake submission creates a matter and posts a confirmation system message into the conversation via `sendSystemMessage` (anonymous until linked). `worker/routes/intakes.ts`
- Current: intake accept/reject posts a system message; accept also attaches the matter and adds the practice participant. `worker/routes/practices.ts`
- Decision: queue processor only applies to notification bot messages. AI replies and intake decision system messages continue to call `sendSystemMessage` directly (with membership + metadata validation).

Operational safeguards
- Monitor queue processing errors and bot message creation failures (log + alert).
- Track bot message volume per practice/user to validate rate limiting.
- Surface failures in logs with eventId + conversationId for triage.

Acceptance criteria
- There is no notifications tab, category list, or `/notifications` routes in the UI.
- All in-app notifications appear as chat messages from the Blawby bot.
- Conversation-relevant notifications appear in the correct conversation for its parties.
- Non-conversation notifications appear in the Blawby System conversation.
- The conversation list shows unread counts per conversation without the notifications store.
- In-app bot message controls work (per-category mute except system, summaries-only mode for system conversation).

Decision
- Use a per-user, per-practice workspace Blawby System conversation (Slackbot-style 1:1).

Visual direction (sidebar)
- Remove the notifications section; the conversation list is the primary left-rail content.
- Add a "Find or start a conversation" search input above the list.
- Conversation rows show only avatar + display name/title (no preview, no timestamp, no unread pill).
- Unread state is a left-side dot plus bolded name.
- Active selection has a distinct highlight state.
- Pin the Blawby System conversation at the top with the Blawby logo avatar/badge (client-side ordering, not persisted).

Edge cases
- User removed from a conversation after a bot message: keep message history visible but stop future bot posts.
- Bot entity is not searchable; bot messages are included in conversation content search (filterable by `notificationType` if needed later).
- Conversation exports: include bot messages unless explicitly excluded in export settings.

Testing checklist
- UI regression: sidebar only shows conversation list + search; no notifications category UI.
- System convo: Blawby System conversation appears pinned with bot avatar/badge across refreshes/sessions.
- Unread behavior: dot + bold name for bot/human messages; active selection highlight correct.
- Error handling: system conversation creation failures, bot message delivery failures, concurrent creation races.
- Performance: conversation list with 100+ bot messages; high-frequency bot message creation; query latency.
- Security: authorization checks on bot message creation; cross-workspace leakage; privilege escalation attempts.
- Security: attempt to call any `ChatRoom` internal routes via HTTP; expect `404`/`403`.
- Security: if all system/bot messages move to the queue processor, remove `sendSystemMessage` usage from public HTTP routes (currently `worker/routes/aiChat.ts`, `worker/routes/practices.ts`, `worker/routes/intakes.ts`); if AI/intake flows are exempted, verify those routes enforce membership, metadata schema, and size caps before calling `sendSystemMessage`.
- Cross-device: client-side pinning order consistent on multiple devices/sessions.
- Integration: push/email notifications still work (OneSignal destinations + preferences). `tests/e2e/notifications.spec.ts`
- Data integrity: dedupe window enforcement; metadata validation; membership enforcement.
- UX: settings page still works and saves preferences (including in-app controls + summaries-only mode). `tests/e2e/notifications.spec.ts`, `src/features/settings/__tests__/SettingsPage.integration.test.tsx`
- Chat flows remain intact; if AI replies move to the queue processor, verify acceptable response latency. `tests/e2e/chat-messages.spec.ts`, `tests/e2e/lead-flow.spec.ts`, `tests/e2e/auth-modes.spec.ts`
