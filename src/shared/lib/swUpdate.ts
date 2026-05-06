/**
 * Service worker update flow.
 *
 * `vite-plugin-pwa` is configured with `registerType: 'prompt'` so the new SW
 * waits in `installed` state instead of self-activating. This module:
 *
 *   1. Registers the SW (idempotent — `registerSW` is a no-op on re-call).
 *   2. Dispatches `app:update-available` when a waiting SW is detected so any
 *      mounted UI (UpdateAvailableToast) can prompt the user.
 *   3. Listens for `app:apply-update` (fired by the toast's Refresh button) to
 *      activate the waiting SW and reload — `updateSW(true)` calls
 *      `skipWaiting` on the new SW and triggers a `controllerchange` reload.
 *
 * Skipped entirely in dev: vite-plugin-pwa has `devOptions.enabled: false`, so
 * `virtual:pwa-register` is a no-op import in dev mode.
 */

import { registerSW } from 'virtual:pwa-register';

let registered = false;

export const APP_UPDATE_AVAILABLE_EVENT = 'app:update-available';
export const APP_APPLY_UPDATE_EVENT = 'app:apply-update';

export const registerSWWithUpdatePrompt = (): void => {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent(APP_UPDATE_AVAILABLE_EVENT));
    },
    // onOfflineReady fires the first time the SW caches the app shell.
    // No UI for now — the precache landing silently is the expected behavior.
    onOfflineReady() {},
  });

  window.addEventListener(APP_APPLY_UPDATE_EVENT, () => {
    void updateSW(true);
  });
};
