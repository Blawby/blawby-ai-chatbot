import { apiClient } from '@/shared/lib/apiClient';
import type {
  PreferenceCategory,
  PreferencesResponse,
  GeneralPreferences,
  NotificationPreferences,
  SecurityPreferences,
  AccountPreferences,
  OnboardingPreferences
} from '@/shared/types/preferences';

const preferencesCache = new Map<PreferenceCategory, unknown | null>();
const preferencesInFlight = new Map<PreferenceCategory, Promise<unknown | null>>();
let preferencesCacheInitialized = false;

const resetPreferencesCache = () => {
  preferencesCache.clear();
  preferencesInFlight.clear();
};

const ensurePreferencesCacheListeners = () => {
  if (preferencesCacheInitialized) return;
  preferencesCacheInitialized = true;
  if (typeof window === 'undefined') return;
  const handler = () => resetPreferencesCache();
  window.addEventListener('auth:session-updated', handler);
  window.addEventListener('auth:session-cleared', handler);
};

const primePreferencesCache = (payload: PreferencesResponse['data'] | null | undefined) => {
  if (!payload) return;
  preferencesCache.set('general', payload.general ?? null);
  preferencesCache.set('notifications', payload.notifications ?? null);
  preferencesCache.set('security', payload.security ?? null);
  preferencesCache.set('account', payload.account ?? null);
  preferencesCache.set('onboarding', payload.onboarding ?? null);
};

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export async function getAllPreferences(): Promise<PreferencesResponse['data']> {
  ensurePreferencesCacheListeners();
  const response = await apiClient.get('/api/preferences');
  const data = unwrapData<PreferencesResponse['data']>(response.data);
  primePreferencesCache(data);
  return data;
}

export async function getPreferencesCategory<T>(
  category: PreferenceCategory,
  options: { force?: boolean } = {}
): Promise<T | null> {
  ensurePreferencesCacheListeners();
  const force = options.force ?? false;

  if (!force && preferencesCache.has(category)) {
    return preferencesCache.get(category) as T | null;
  }

  const inFlight = preferencesInFlight.get(category);
  if (!force && inFlight) {
    return (await inFlight) as T | null;
  }

  const promise = (async () => {
    const response = await apiClient.get(`/api/preferences/${category}`);
    const result = unwrapData<T | null>(response.data);
    preferencesCache.set(category, result ?? null);
    return result;
  })();

  preferencesInFlight.set(category, promise as Promise<unknown | null>);
  try {
    return await promise;
  } finally {
    preferencesInFlight.delete(category);
  }
}

export async function updatePreferencesCategory<T extends object>(
  category: PreferenceCategory,
  data: T
): Promise<T> {
  ensurePreferencesCacheListeners();
  const response = await apiClient.put(`/api/preferences/${category}`, data);
  const result = unwrapData<T | null | undefined>(response.data);
  if (result === null || result === undefined) {
    throw new Error(`Preferences update for '${category}' returned no data`);
  }
  preferencesCache.set(category, result);
  return result;
}

export const preferencesApi = {
  updateGeneral: (data: GeneralPreferences) =>
    updatePreferencesCategory('general', data),
  updateNotifications: (data: NotificationPreferences) =>
    updatePreferencesCategory('notifications', data),
  updateSecurity: (data: SecurityPreferences) =>
    updatePreferencesCategory('security', data),
  updateAccount: (data: AccountPreferences) =>
    updatePreferencesCategory('account', data),
  updateOnboarding: (data: OnboardingPreferences) =>
    updatePreferencesCategory('onboarding', data)
};
