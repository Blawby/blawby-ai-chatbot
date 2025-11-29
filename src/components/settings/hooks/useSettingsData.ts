import { useState, useEffect, useCallback } from 'preact/hooks';
import {
  getUserPreferences,
  updateUserPreferences,
  type UserPreferences
} from '../../../lib/apiClient';


export interface UseSettingsDataReturn {
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<void>;
  refetch: () => Promise<void>;
}

export const useSettingsData = (): UseSettingsDataReturn => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const prefs = await getUserPreferences();
      setPreferences(prefs ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch preferences';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePreferences = useCallback(async (data: Partial<UserPreferences>) => {
    try {
      setLoading(true);
      setError(null);

      const updated = await updateUserPreferences(data);
      setPreferences(updated ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences';
      setError(errorMessage);
      throw err; // Re-throw so the caller can handle it
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    loading,
    error,
    updatePreferences,
    refetch
  };
};
