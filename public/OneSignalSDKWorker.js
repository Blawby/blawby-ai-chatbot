try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (error) {
  console.error('[OneSignal] Failed to load service worker SDK', error);
}
