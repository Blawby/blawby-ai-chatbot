import { apiClient, unwrapApiResponse } from '@/shared/lib/apiClient';
import { queryCache } from '@/shared/lib/queryCache';
import { policyTtl } from '@/shared/lib/cachePolicy';
import type {
  PreferenceCategory,
  PreferencesResponse,
  GeneralPreferences,
  NotificationPreferences,
  SecurityPreferences,
  AccountPreferences,
  OnboardingPreferences
} from '@/shared/types/preferences';

const preferenceKey = (category: PreferenceCategory) => `preferences:${category}`;

// `auth:session-cleared` is handled by queryCache itself (clears everything).
// `auth:session-updated` means the user/session changed — preferences belong
// to the previous user, so we drop just that prefix.
let sessionUpdatedListenerRegistered = false;
const ensureSessionUpdatedListener = () => {
  if (sessionUpdatedListenerRegistered || typeof window === 'undefined') return;
  window.addEventListener('auth:session-updated', () => {
    queryCache.invalidate('preferences:', /* prefix */ true);
  });
  sessionUpdatedListenerRegistered = true;
};

const primePreferencesCache = (payload: PreferencesResponse['data'] | null | undefined) => {
  if (!payload) return;
  const ttl = policyTtl('preferences:');
  queryCache.set(preferenceKey('general'), payload.general ?? null, ttl);
  queryCache.set(preferenceKey('notifications'), payload.notifications ?? null, ttl);
  queryCache.set(preferenceKey('security'), payload.security ?? null, ttl);
  queryCache.set(preferenceKey('account'), payload.account ?? null, ttl);
  queryCache.set(preferenceKey('onboarding'), payload.onboarding ?? null, ttl);
};

export async function getAllPreferences(): Promise<PreferencesResponse['data']> {
  ensureSessionUpdatedListener();
  const response = await apiClient.get('/api/preferences');
  const data = unwrapApiResponse<PreferencesResponse['data']>(response.data);
  primePreferencesCache(data);
  return data;
}

export async function getPreferencesCategory<T>(
  category: PreferenceCategory,
  options: { force?: boolean } = {}
): Promise<T | null> {
  ensureSessionUpdatedListener();
  const key = preferenceKey(category);
  if (options.force) queryCache.invalidate(key);
  return queryCache.coalesceGet<T | null>(
    key,
    async () => {
      const response = await apiClient.get(`/api/preferences/${category}`);
      return unwrapApiResponse<T | null>(response.data) ?? null;
    },
    { ttl: policyTtl(key) }
  );
}

export async function updatePreferencesCategory<T extends object>(
  category: PreferenceCategory,
  data: T
): Promise<T> {
  ensureSessionUpdatedListener();
  const response = await apiClient.put(`/api/preferences/${category}`, data);
  const result = unwrapApiResponse<T | null | undefined>(response.data);
  if (result === null || result === undefined) {
    throw new Error(`Preferences update for '${category}' returned no data`);
  }
  queryCache.set(preferenceKey(category), result, policyTtl(preferenceKey(category)));
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
