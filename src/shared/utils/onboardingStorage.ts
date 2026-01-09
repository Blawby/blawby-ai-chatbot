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

const VALID_STATUSES: OnboardingStatusValue[] = ['pending', 'completed', 'skipped'];

const isValidStatus = (value: unknown): value is OnboardingStatusValue =>
  typeof value === 'string' && VALID_STATUSES.includes(value as OnboardingStatusValue);

export const loadLocalOnboardingState = (organizationId: string): LocalOnboardingState | null => {
  if (typeof window === 'undefined') return null;

  const key = getOnboardingStorageKey(organizationId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalOnboardingState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isValidStatus(parsed.status)) return null;
    if (parsed.savedAt !== undefined && typeof parsed.savedAt !== 'number') return null;
    if (parsed.completedAt !== undefined && parsed.completedAt !== null && typeof parsed.completedAt !== 'number') return null;
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
  try {
    localStorage.setItem(key, JSON.stringify(state));
    dispatchOnboardingEvent(organizationId);
  } catch (error) {
    console.error('[ONBOARDING][STORAGE] Failed to save state:', error);
  }
};

export const updateLocalOnboardingState = (
  organizationId: string,
  updater: (prev: LocalOnboardingState | null) => LocalOnboardingState
): LocalOnboardingState => {
  try {
    const previous = loadLocalOnboardingState(organizationId);
    const next = updater(previous);
    saveLocalOnboardingState(organizationId, next);
    return next;
  } catch (error) {
    console.error('[ONBOARDING][STORAGE] Failed to update state:', error);
    throw error;
  }
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
  switch (step) {
    case 'firm-basics':
      return hasValue(data.firmName) && hasValue(data.contactEmail);
    case 'business-details':
      return Boolean(
        hasValue(data.website) ||
        hasValue(data.contactPhone) ||
        (typeof data.consultationFee === 'number' && Number.isFinite(data.consultationFee)) ||
        hasValue(data.addressLine1) ||
        hasValue(data.addressLine2) ||
        hasValue(data.city) ||
        hasValue(data.state) ||
        hasValue(data.postalCode) ||
        hasValue(data.country) ||
        hasValue(data.description) ||
        hasValue(data.introMessage)
      );
    case 'services':
      return Array.isArray(data.services)
        ? data.services.some((service) => hasValue(service.title))
        : false;
    default:
      // Default to true so generic/no-data steps remain accessible; adjust if new steps require validation.
      return true;
  }
};
