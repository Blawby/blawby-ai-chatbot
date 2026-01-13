import type { OneSignalSDK } from '@/shared/notifications/oneSignalClient';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(sdk: OneSignalSDK) => void>;
    OneSignal?: OneSignalSDK;
  }
}

export {};
