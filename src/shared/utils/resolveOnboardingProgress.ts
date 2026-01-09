import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import type { LocalOnboardingProgress } from '@/shared/utils/onboardingStorage';
import type { OnboardingStatusValue } from '@/shared/utils/practiceOnboarding';

interface PracticeProgressSource {
  businessOnboardingStatus?: BusinessOnboardingStatus;
  businessOnboardingCompletedAt?: number | null;
  businessOnboardingHasDraft?: boolean;
}

const mapPracticeStatusToOnboardingStatus = (
  status?: BusinessOnboardingStatus
): OnboardingStatusValue | null => {
  switch (status) {
    case 'completed':
    case 'not_required':
      return 'completed';
    case 'skipped':
      return 'skipped';
    case 'pending':
      return 'pending';
    default:
      return null;
  }
};

export const mergePracticeAndLocalProgress = (
  localProgress: LocalOnboardingProgress | null | undefined,
  practice?: PracticeProgressSource
): LocalOnboardingProgress => {
  if (localProgress) {
    return localProgress;
  }

  const status = mapPracticeStatusToOnboardingStatus(
    practice?.businessOnboardingStatus
  );
  if (!status) {
    return null;
  }

  const completed = status === 'completed';
  const skipped = status === 'skipped';

  return {
    status,
    completed,
    skipped,
    completedAt: practice?.businessOnboardingCompletedAt ?? null,
    lastSavedAt: null,
    hasDraft: Boolean(practice?.businessOnboardingHasDraft),
    data: null
  };
};
