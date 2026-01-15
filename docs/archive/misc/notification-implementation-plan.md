# Notification System Implementation Plan

## Implemented ✅
- ✅ OneSignal delivery (email + push)
- ✅ Email/push delivery toggles (ENABLE_EMAIL_NOTIFICATIONS/ENABLE_PUSH_NOTIFICATIONS)
- ✅ Notification backend (D1 + queue + SSE + API)
- ✅ OneSignal web SDK + managed service workers + destination linking
- ✅ In-app notifications via SSE + OS notification support
- ✅ Notification UI (center, tabs, grouping, read/unread)
- ✅ Notification counts (category + per-conversation)
- ✅ Notification settings UI (channels, desktop permission, mentions-only)
- ✅ Org notification policy defaults + system always enabled
- ✅ Bearer token auth for notification APIs + stream

## Phase 3 (User-facing UI) ✅
- ✅ Notification center with category tabs
- ✅ Settings panel for per-user preferences
- ✅ Desktop/OS permission UX
- ✅ Org defaults + per-user overrides (system forced on)
- ✅ Slack/Discord-style UX (dot indicators, per-thread counts, grouped by day)
- ✅ Mentions-only preference for message notifications

## Phase 3 Remaining
- None (Phase 3 complete)

## Phase 4 (Ops hardening) TODO
- [ ] Edge rate limiting for notification endpoints
- [ ] App-level quotas (per user/day, per practice/min)
- [ ] Structured logs + dashboards for delivery outcomes

## Backlog / Deferred
- [ ] Mobile OneSignal SDK integration (iOS/Android)
- [ ] Notification analytics (delivery + click-through)
- [ ] Expanded test coverage (unit/integration/E2E)
- [ ] Deduplication/batching/offline replay strategy (if needed)

## Environment Variables
- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`
- `ONESIGNAL_API_BASE` (optional)
- `ENABLE_EMAIL_NOTIFICATIONS`
- `ENABLE_PUSH_NOTIFICATIONS`
