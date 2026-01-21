Title: Desktop notifications toggle should unsubscribe OneSignal push

Summary
Toggling desktop notifications off currently only updates user preferences. It does not unsubscribe the browser from OneSignal, so the device remains subscribed even though our system stops sending push. We will make the toggle opt-out the current device in OneSignal and disable its destination record, while keeping preferences as the global gate for push delivery.

OneSignal behavior (facts)
- Web subscriptions are per browser/device and have a unique subscription id.
- A single user can have multiple subscriptions mapped via external_user_id.
- The web SDK can only opt-in/opt-out the current browser subscription; it cannot revoke other devices or browser permissions.

Current behavior (audit)
- Settings toggle lives in `src/features/settings/pages/NotificationsPage.tsx` and uses `handleDesktopToggle`.
- When enabling, it calls `requestNotificationPermission()` in `src/shared/notifications/oneSignalClient.ts`, which:
  - Initializes OneSignal SDK.
  - Requests browser permission.
  - Resolves OneSignal subscription id.
  - Registers destination via POST `/api/notifications/destinations`.
- When disabling, it only calls `updateDesktopPushEnabled(false)` (preferences update). No OneSignal opt-out.
- Worker route `worker/routes/notifications.ts` only supports destination registration (POST).
- `worker/services/OneSignalService.ts` has send + setExternalUserId, no unsubscribe API.
- Destination store has `disableDestinationsForUser`, but it is not tied to the settings toggle and does not affect send logic.
- Push sending is gated by `desktop_push_enabled` in `worker/services/NotificationPublisher.ts` and `worker/queues/notificationProcessor.ts`, so delivery stops, but subscription remains.

Decision
- Toggle OFF unsubscribes the current device via OneSignal SDK, disables the destination record for that subscription id, and sets `desktop_push_enabled=false` to stop server-side sending for all devices.
- Toggle ON requests permission, opts in the current device, registers the destination, and sets `desktop_push_enabled=true`.
- We will not attempt to unsubscribe all other devices server-side; global suppression is handled by preferences, and other devices must opt-out from their own browsers.

Plan (no implementation)
1) Worker API
   - Add DELETE `/api/notifications/destinations/:onesignalId` (auth required).
   - Add `NotificationDestinationStore.disableDestination(onesignalId, userId)` to mark `disabled_at` for that specific subscription.

2) Client
   - Add `optOutDesktopNotifications()` in `src/shared/notifications/oneSignalClient.ts`:
     - Wait for SDK and resolve the current OneSignal subscription id.
     - Call `OneSignal.User.PushSubscription.optOut()` (Web SDK v16).
     - Call the new DELETE endpoint to disable the destination record.
   - Add `optInDesktopNotifications()` to call `OneSignal.User.PushSubscription.optIn()` before registering the destination when permission is already granted.
   - Update `handleDesktopToggle(false)` in `src/features/settings/pages/NotificationsPage.tsx` to invoke opt-out (best-effort) and still update preferences.
   - Update `handleDesktopToggle(true)` to invoke opt-in + permission request + destination registration.

3) UX
   - If opt-out fails, show a toast explaining the browser is still subscribed and must be disabled in browser settings if needed.
   - If opt-in fails or permission is denied, keep `desktop_push_enabled=false` and show the existing error copy.

Acceptance criteria
- Toggle OFF unsubscribes the current browser subscription and disables its destination record; preferences update persists and server-side sending stops globally.
- Toggle ON requests permission, opts in the current device, registers destination, and updates preferences.
- No OneSignal auto prompt; only the settings toggle triggers permission and subscription changes.
