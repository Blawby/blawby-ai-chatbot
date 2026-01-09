import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';
import type { OnboardingFormData } from '@/features/onboarding/hooks/useOnboardingState';
import type {
  OnboardingStatusValue,
  PersistedOnboardingSnapshot,
  PracticeOnboardingProgress
} from '@/shared/utils/practiceOnboarding';

export const ONBOARDING_STORAGE_EVENT = 'blawby:onboarding-updated';

const STORAGE_PREFIX = 'blawby:onboarding';

export interface LocalOnboardingState {
  status: OnboardingStatusValue;
  resumeStep?: OnboardingStep;
  savedAt?: number;
  completedAt?: number | null;
  data?: PersistedOnboardingSnapshot<OnboardingFormData> | null;
}

export type LocalOnboardingProgress = PracticeOnboardingProgress<OnboardingFormData> | null;

export const getOnboardingStorageKey = (organizationId: string): string =>
  `${STORAGE_PREFIX}:${organizationId}`;

export const loadLocalOnboardingState = (organizationId: string): LocalOnboardingState | null => {
  if (typeof window === 'undefined') return null;

  const key = getOnboardingStorageKey(organizationId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalOnboardingState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.status !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

const dispatchOnboardingEvent = (organizationId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_STORAGE_EVENT, { detail: { organizationId } })
  );
};

export const saveLocalOnboardingState = (
  organizationId: string,
  state: LocalOnboardingState
): void => {
  if (typeof window === 'undefined') return;
  const key = getOnboardingStorageKey(organizationId);
  localStorage.setItem(key, JSON.stringify(state));
  dispatchOnboardingEvent(organizationId);
};

export const updateLocalOnboardingState = (
  organizationId: string,
  updater: (prev: LocalOnboardingState | null) => LocalOnboardingState
): LocalOnboardingState => {
  const previous = loadLocalOnboardingState(organizationId);
  const next = updater(previous);
  saveLocalOnboardingState(organizationId, next);
  return next;
};

export const getLocalOnboardingProgress = (organizationId: string): LocalOnboardingProgress => {
  const state = loadLocalOnboardingState(organizationId);
  if (!state) return null;

  const status = state.status ?? 'pending';
  const completed = status === 'completed';
  const skipped = status === 'skipped';

  return {
    status,
    completed,
    skipped,
    completedAt: state.completedAt ?? null,
    lastSavedAt: state.savedAt ?? null,
    hasDraft: Boolean(state.data),
    data: state.data ?? null
  };
};

export const buildLocalSnapshot = (
  data: OnboardingFormData,
  resumeStep: OnboardingStep
): PersistedOnboardingSnapshot<OnboardingFormData> => ({
  ...data,
  __meta: {
    resumeStep,
    savedAt: Date.now()
  }
});

const hasValue = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const hasOnboardingStepData = (
  step: OnboardingStep,
  data?: PersistedOnboardingSnapshot<OnboardingFormData> | null
): boolean => {
  if (!data) return false;
  const snapshot = data as OnboardingFormData;

  switch (step) {
    case 'firm-basics':
      return hasValue(snapshot.firmName) && hasValue(snapshot.contactEmail);
    case 'business-details':
      return Boolean(
        hasValue(snapshot.website) ||
        hasValue(snapshot.contactPhone) ||
        (typeof snapshot.consultationFee === 'number' && Number.isFinite(snapshot.consultationFee)) ||
        hasValue(snapshot.addressLine1) ||
        hasValue(snapshot.addressLine2) ||
        hasValue(snapshot.city) ||
        hasValue(snapshot.state) ||
        hasValue(snapshot.postalCode) ||
        hasValue(snapshot.country) ||
        hasValue(snapshot.description) ||
        hasValue(snapshot.introMessage)
      );
    case 'services':
      return Array.isArray(snapshot.services)
        ? snapshot.services.some((service) => hasValue(service.title))
        : false;
    default:
      return true;
  }
};
