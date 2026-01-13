import { getWorkerApiUrl } from '@/config/urls';
import { getTokenAsync } from '@/shared/lib/tokenStorage';

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
};

type OneSignalUser = {
  id?: string | null;
  PushSubscription?: OneSignalPushSubscription | null;
};

export type OneSignalSDK = {
  init: (options: OneSignalInitOptions) => Promise<void> | void;
  User?: OneSignalUser | null;
  getUserId?: () => Promise<string | null> | string | null;
};

const DESTINATIONS_ENDPOINT = '/api/notifications/destinations';
const ONESIGNAL_WORKER_PATH = 'OneSignalSDKWorker.js';
const ONESIGNAL_UPDATER_PATH = 'OneSignalSDKUpdaterWorker.js';

let initStarted = false;
let pendingOneSignalId: string | null = null;
let inFlightRegistration: Promise<void> | null = null;
let lastRegistrationKey: string | null = null;

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

  window.addEventListener('auth:token-updated', handleTokenUpdated);
}

function handleTokenUpdated(event: Event): void {
  const detail = (event as CustomEvent<{ token?: string }>).detail;
  if (!detail?.token || !pendingOneSignalId) {
    return;
  }

  void registerDestination(pendingOneSignalId, detail.token);
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

  const token = await getTokenAsync();
  if (!token) {
    return;
  }

  await registerDestination(onesignalId, token);
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

async function registerDestination(onesignalId: string, token: string): Promise<void> {
  const registrationKey = `${token}:${onesignalId}`;
  if (lastRegistrationKey === registrationKey) {
    return;
  }

  if (inFlightRegistration) {
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
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
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
