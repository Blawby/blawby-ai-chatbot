import { useEffect, useState } from 'preact/hooks';
import type { LocalOnboardingProgress } from '@/shared/utils/onboardingStorage';
import {
  getLocalOnboardingProgress,
  ONBOARDING_STORAGE_EVENT
} from '@/shared/utils/onboardingStorage';

export const useLocalOnboardingProgress = (
  organizationId: string | null
): LocalOnboardingProgress => {
  const [progress, setProgress] = useState<LocalOnboardingProgress>(null);

  useEffect(() => {
    if (!organizationId || typeof window === 'undefined') {
      setProgress(null);
      return;
    }

    const loadProgress = () => {
      setProgress(getLocalOnboardingProgress(organizationId));
    };

    loadProgress();

    const handleUpdate = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        loadProgress();
        return;
      }
      const detail = event.detail as { organizationId?: string } | undefined;
      if (!detail?.organizationId || detail.organizationId === organizationId) {
        loadProgress();
      }
    };

    window.addEventListener(ONBOARDING_STORAGE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(ONBOARDING_STORAGE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [organizationId]);

  return progress;
};
