/**
 * useAutoSave - Custom Hook
 * 
 * Provides debounced auto-save functionality for onboarding form data.
 * Handles save operations with debouncing to avoid excessive API calls.
 */

import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import type { OnboardingFormData } from './useOnboardingState';

interface UseAutoSaveOptions {
  organizationId: string;
  onSave: (data: OnboardingFormData) => Promise<void>;
  debounceMs?: number;
}

export const useAutoSave = ({
  organizationId,
  onSave,
  debounceMs = 500
}: UseAutoSaveOptions) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<OnboardingFormData | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const performSave = useCallback(async (data: OnboardingFormData) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(data);
      pendingSaveRef.current = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save onboarding progress';
      setSaveError(errorMessage);
      // Keep pending save so it can be retried
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  const save = useCallback((data: OnboardingFormData) => {
    // Store the latest data to save
    pendingSaveRef.current = data;

    // Clear existing timer
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    // Set new debounced save
    debounceTimerRef.current = window.setTimeout(() => {
      if (pendingSaveRef.current !== null) {
        void performSave(pendingSaveRef.current);
      }
    }, debounceMs);
  }, [debounceMs, performSave]);

  return {
    save,
    isSaving,
    saveError
  };
};

