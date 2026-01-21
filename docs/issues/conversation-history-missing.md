Title: Conversation history not fully visible on refresh and lacks shareable URLs

Summary
Public, client, and practice views do not reliably show full conversation history after refresh. Public chats also lack a stable URL for sharing or deep linking.

Symptoms
- Refreshing a chat in public or practice views shows only partial history (often just the contact info message).
- Guests cannot share or return to a specific conversation via URL (public workspace has no conversation route).
- Practice members may open a conversation but see no history until they send a message.

Root causes (code refs)
1) No pagination for full history
   - UI only requests the most recent 50 messages and never loads older pages.
   - Worker supports cursor/seq pagination, but the UI never uses it.
   - Files: src/shared/hooks/useMessageHandling.ts, worker/services/ConversationService.ts

2) Practice members blocked from reading unless they are participants
   - GET /api/chat/messages enforces validateParticipantAccess, which only checks conversation_participants.
   - Practice members are added as participants only when they send a message via /api/inbox/conversations/:id/messages.
   - Result: viewing history without replying returns 403 and no messages.
   - Files: worker/routes/chat.ts, worker/services/ConversationService.ts, worker/routes/inbox.ts

3) Public workspace has no conversation URL
   - MainApp only derives conversationId from /client or /practice routes.
   - Public workspace never encodes conversationId in the URL, so refresh loses context and cannot deep link/share.
   - Files: src/app/MainApp.tsx

4) Anonymous return path only restores "active" conversations
   - getOrCreateCurrentConversation filters status = 'active'. Closed/archived conversations are skipped and a new one is created.
   - Result: guests returning after a close/archival do not see prior history.
   - File: worker/services/ConversationService.ts

5) Potential practiceId mismatch in public flows (verify)
   - Public routes use practice slug as practiceId; conversation records may store slug instead of UUID.
   - Practice inbox uses UUID practiceId; if records were created with slug, history access can break.
   - Files: src/shared/hooks/usePracticeConfig.ts, src/app/MainApp.tsx, worker/services/ConversationService.ts

Proposed fixes
- Add cursor-based message loading in the UI (initial fetch + "load older" on scroll).
- Add a practice-member read path for messages (or auto-add member on view).
- Introduce a public conversation route like /p/:slug/chats/:conversationId and wire it in MainApp.
- Decide desired behavior for anonymous users when conversation is closed (restore or create new).
- Verify public flow uses UUID practiceId once it is available; update if needed.

Acceptance criteria
- Refreshing any conversation (public/client/practice) shows full persisted history.
- Practice members can read conversation history without sending a message.
- Public conversations have shareable URLs that restore the same conversation.
- Long threads load older messages on scroll or via an explicit "load more" action.
