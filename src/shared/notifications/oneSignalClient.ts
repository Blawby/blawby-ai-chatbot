import { getWorkerApiUrl } from '@/config/urls';

type OneSignalInitOptions = {
  appId: string;
  allowLocalhostAsSecureOrigin?: boolean;
  serviceWorkerPath?: string;
  serviceWorkerUpdaterPath?: string;
  serviceWorkerParam?: { scope?: string };
};

type OneSignalPushSubscription = {
  id?: string | null;
  optedIn?: boolean | null;
  optIn?: () => Promise<void> | void;
  optOut?: () => Promise<void> | void;
};

type OneSignalNotifications = {
  requestPermission?: () => Promise<void> | void;
};

type OneSignalUser = {
  id?: string | null;
  PushSubscription?: OneSignalPushSubscription | null;
};

export type OneSignalSDK = {
  init: (options: OneSignalInitOptions) => Promise<void> | void;
  User?: OneSignalUser | null;
  Notifications?: OneSignalNotifications | null;
  getUserId?: () => Promise<string | null> | string | null;
};

const DESTINATIONS_ENDPOINT = '/api/notifications/destinations';
const ONESIGNAL_WORKER_PATH = 'OneSignalSDKWorker.js';
const ONESIGNAL_UPDATER_PATH = 'OneSignalSDKUpdaterWorker.js';

let initStarted = false;
let pendingOneSignalId: string | null = null;
let inFlightRegistration: Promise<void> | null = null;
let lastRegistrationKey: string | null = null;

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function initOneSignal(): void {
  if (initStarted || typeof window === 'undefined') {
    return;
  }

  initStarted = true;
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;

  if (!appId) {
    if (import.meta.env.DEV) {
      console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID not set; skipping SDK init.');
    }
    return;
  }

  const boot = (sdk: OneSignalSDK) => {
    void initializeSdk(sdk, appId);
  };

  const maybeSdk = window.OneSignal as OneSignalSDK | undefined;
  if (maybeSdk && typeof maybeSdk.init === 'function') {
    boot(maybeSdk);
  } else {
    const deferred = window.OneSignalDeferred ?? [];
    deferred.push(boot);
    window.OneSignalDeferred = deferred;
  }

  window.addEventListener('auth:session-updated', handleSessionUpdated);
  window.addEventListener('auth:session-cleared', handleSessionCleared);
}

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

export async function optInDesktopNotifications(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  initOneSignal();

  const sdk = await waitForOneSignalSdk();
  if (sdk?.Notifications?.requestPermission && Notification.permission !== 'granted') {
    await sdk.Notifications.requestPermission();
  } else if (Notification.permission !== 'granted' && Notification.requestPermission) {
    await Notification.requestPermission();
  }

  const permission = Notification.permission as NotificationPermissionState;
  if (permission !== 'granted') {
    return permission;
  }

  if (sdk?.User?.PushSubscription?.optIn) {
    await sdk.User.PushSubscription.optIn();
  }

  const onesignalId = sdk ? await waitForOneSignalId(sdk) : null;
  if (!onesignalId) {
    throw new Error('OneSignal subscription not available');
  }

  pendingOneSignalId = onesignalId;
  await registerDestination(onesignalId);

  return permission;
}

export async function optOutDesktopNotifications(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  initOneSignal();

  const sdk = await waitForOneSignalSdk();
  if (!sdk?.User?.PushSubscription) {
    return false;
  }

  const onesignalId = await waitForOneSignalId(sdk);
  if (!onesignalId) {
    return false;
  }

  let success = true;

  try {
    if (sdk.User.PushSubscription.optOut) {
      await sdk.User.PushSubscription.optOut();
    } else {
      success = false;
    }
  } catch (error) {
    success = false;
    if (import.meta.env.DEV) {
      console.warn('[OneSignal] opt-out failed', error);
    }
  }

  try {
    await disableDestination(onesignalId);
  } catch (error) {
    success = false;
    if (import.meta.env.DEV) {
      console.warn('[OneSignal] Destination disable failed', error);
    }
  }

  return success;
}

function handleSessionUpdated(): void {
  if (!pendingOneSignalId) {
    return;
  }
  void registerDestination(pendingOneSignalId);
}

function handleSessionCleared(): void {
  lastRegistrationKey = null;
}

async function initializeSdk(OneSignal: OneSignalSDK, appId: string): Promise<void> {
  try {
    const initOptions: OneSignalInitOptions = {
      appId,
      serviceWorkerPath: ONESIGNAL_WORKER_PATH,
      serviceWorkerUpdaterPath: ONESIGNAL_UPDATER_PATH,
      serviceWorkerParam: { scope: '/' }
    };

    if (import.meta.env.DEV) {
      initOptions.allowLocalhostAsSecureOrigin = true;
    }

    await OneSignal.init(initOptions);
  } catch (error) {
    console.warn('[OneSignal] SDK init failed', error);
    return;
  }

  const onesignalId = await waitForOneSignalId(OneSignal);
  if (!onesignalId) {
    if (import.meta.env.DEV) {
      console.warn('[OneSignal] User id not available; skipping destination registration.');
    }
    return;
  }

  pendingOneSignalId = onesignalId;
  await registerDestination(onesignalId);
}

async function waitForOneSignalId(OneSignal: OneSignalSDK): Promise<string | null> {
  const attempts = 10;
  const delayMs = 1000;

  for (let i = 0; i < attempts; i += 1) {
    const id = await resolveOneSignalId(OneSignal);
    if (id) {
      return id;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

async function resolveOneSignalId(OneSignal: OneSignalSDK): Promise<string | null> {
  const userId = normalizeId(OneSignal.User?.id);
  if (userId) {
    return userId;
  }

  if (OneSignal.getUserId) {
    const legacyId = await Promise.resolve(OneSignal.getUserId());
    const normalized = normalizeId(legacyId);
    if (normalized) {
      return normalized;
    }
  }

  const subscriptionId = normalizeId(OneSignal.User?.PushSubscription?.id);
  if (subscriptionId) {
    return subscriptionId;
  }

  return null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function waitForOneSignalSdk(timeoutMs = 3000): Promise<OneSignalSDK | undefined> {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const maybeSdk = window.OneSignal as OneSignalSDK | undefined;
  if (maybeSdk?.init) {
    return maybeSdk;
  }

  return new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (sdk?: OneSignalSDK) => {
      if (settled) return;
      settled = true;
      resolve(sdk);
    };

    const deferred = window.OneSignalDeferred ?? [];
    deferred.push((sdk: OneSignalSDK) => resolveOnce(sdk));
    window.OneSignalDeferred = deferred;

    setTimeout(() => resolveOnce(window.OneSignal as OneSignalSDK | undefined), timeoutMs);
  });
}

async function registerDestination(onesignalId: string): Promise<void> {
  const registrationKey = onesignalId;
  if (lastRegistrationKey === registrationKey) {
    return;
  }

  while (inFlightRegistration) {
    await inFlightRegistration;
    if (lastRegistrationKey === registrationKey) {
      return;
    }
  }

  const baseUrl = getWorkerApiUrl();

  const send = async () => {
    const response = await fetch(`${baseUrl}${DESTINATIONS_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        onesignalId,
        platform: 'web'
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Destination registration failed (${response.status}): ${text}`);
    }
  };

  inFlightRegistration = send();

  try {
    await inFlightRegistration;
    lastRegistrationKey = registrationKey;
  } catch (error) {
    lastRegistrationKey = null;
    if (import.meta.env.DEV) {
      console.warn('[OneSignal] Destination registration failed', error);
    }
  } finally {
    inFlightRegistration = null;
  }
}

async function disableDestination(onesignalId: string): Promise<void> {
  const baseUrl = getWorkerApiUrl();
  const response = await fetch(`${baseUrl}${DESTINATIONS_ENDPOINT}/${onesignalId}`, {
    method: 'DELETE',
    credentials: 'include'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Destination disable failed (${response.status}): ${text}`);
  }
}
