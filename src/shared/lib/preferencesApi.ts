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

const unwrapData = <T>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export async function getAllPreferences(): Promise<PreferencesResponse['data']> {
  const response = await apiClient.get('/api/preferences');
  return unwrapData<PreferencesResponse['data']>(response.data);
}

export async function getPreferencesCategory<T>(
  category: PreferenceCategory
): Promise<T | null> {
  const response = await apiClient.get(`/api/preferences/${category}`);
  return unwrapData<T | null>(response.data);
}

export async function updatePreferencesCategory<T extends object>(
  category: PreferenceCategory,
  data: T
): Promise<T> {
  const response = await apiClient.put(`/api/preferences/${category}`, data);
  const result = unwrapData<T | null | undefined>(response.data);
  if (result === null || result === undefined) {
    throw new Error(`Preferences update for '${category}' returned no data`);
  }
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
