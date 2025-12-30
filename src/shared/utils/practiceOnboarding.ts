import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';

export type OnboardingStatusValue = 'pending' | 'completed' | 'skipped';

export type PersistedOnboardingSnapshot<
  T extends object = Record<string, unknown>
> = T & {
  __meta?: {
    resumeStep?: OnboardingStep;
    // Supports both number (timestamp) and string (ISO date) for backward compatibility
    savedAt?: number | string;
  };
};

export interface PracticeOnboardingMetadata<
  T extends object = Record<string, unknown>
> {
  status: OnboardingStatusValue;
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  lastSavedAt: number | null;
  resumeStep?: OnboardingStep;
  data: PersistedOnboardingSnapshot<T> | null;
}

export interface PracticeOnboardingProgress<
  T extends object = Record<string, unknown>
> {
  status: OnboardingStatusValue;
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  lastSavedAt: number | null;
  hasDraft: boolean;
  data: PersistedOnboardingSnapshot<T> | null;
}

export const ONBOARDING_STEP_SEQUENCE: OnboardingStep[] = [
  'welcome',
  'firm-basics',
  'trust-account-intro',
  'stripe-onboarding',
  'business-details',
  'services',
  'review-and-launch'
];

const ONBOARDING_STEP_SET = new Set<string>(ONBOARDING_STEP_SEQUENCE);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const coerceTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const ONBOARDING_STATUS_VALUES = new Set<OnboardingStatusValue>([
  'pending',
  'completed',
  'skipped'
]);

export const isValidOnboardingStep = (value: unknown): value is OnboardingStep =>
  typeof value === 'string' && ONBOARDING_STEP_SET.has(value);

export const extractPracticeOnboardingMetadata = <
  T extends object = Record<string, unknown>
>(
  metadata: unknown
): PracticeOnboardingMetadata<T> | null => {
  if (!isPlainObject(metadata)) {
    return null;
  }

  const onboarding = (metadata as Record<string, unknown>).onboarding;
  if (!isPlainObject(onboarding)) {
    return null;
  }

  const statusCandidate = typeof onboarding.status === 'string'
    ? (onboarding.status.toLowerCase() as OnboardingStatusValue)
    : undefined;
  const status = statusCandidate && ONBOARDING_STATUS_VALUES.has(statusCandidate)
    ? statusCandidate
    : 'pending';

  const resumeCandidate = (onboarding as Record<string, unknown>).resumeStep;
  const resumeStep = isValidOnboardingStep(resumeCandidate)
    ? (resumeCandidate as OnboardingStep)
    : undefined;

  const dataCandidate = (onboarding as Record<string, unknown>).data;
  const data = isPlainObject(dataCandidate)
    ? (dataCandidate as PersistedOnboardingSnapshot<T>)
    : null;

  return {
    status,
    completed: status === 'completed',
    skipped: status === 'skipped',
    completedAt: coerceTimestamp((onboarding as Record<string, unknown>).completedAt),
    lastSavedAt: coerceTimestamp((onboarding as Record<string, unknown>).lastSavedAt),
    resumeStep,
    data
  };
};

export const extractProgressFromPracticeMetadata = <
  T extends object = Record<string, unknown>
>(
  metadata: unknown
): PracticeOnboardingProgress<T> | null => {
  const extracted = extractPracticeOnboardingMetadata<T>(metadata);
  if (!extracted) {
    return null;
  }

  return {
    status: extracted.status,
    completed: extracted.completed,
    skipped: extracted.skipped,
    completedAt: extracted.completedAt ?? null,
    lastSavedAt: extracted.lastSavedAt ?? null,
    hasDraft: Boolean(extracted.data),
    data: extracted.data
  };
};

export const buildPracticeOnboardingMetadata = <
  T extends object = Record<string, unknown>
>(
  currentMetadata: unknown,
  options?: {
    snapshot?: PersistedOnboardingSnapshot<T> | null;
    resumeStep?: OnboardingStep;
    status?: OnboardingStatusValue;
    savedAt?: number;
  }
): Record<string, unknown> => {
  const base: Record<string, unknown> = isPlainObject(currentMetadata) ? { ...currentMetadata } : {};
  const onboardingSource = isPlainObject(base.onboarding) ? base.onboarding : null;
  const existing: Record<string, unknown> = onboardingSource ? { ...onboardingSource } : {};

  const timestamp = options?.savedAt ?? Date.now();
  const priorStatus = typeof existing.status === 'string' && ONBOARDING_STATUS_VALUES.has(existing.status as OnboardingStatusValue)
    ? (existing.status as OnboardingStatusValue)
    : 'pending';
  const status = options?.status ?? priorStatus;

  const nextResumeStep = options?.resumeStep
    ? options.resumeStep
    : (isValidOnboardingStep(existing.resumeStep) ? (existing.resumeStep as OnboardingStep) : undefined);

  const nextSnapshot = options?.snapshot === undefined
    ? (isPlainObject(existing.data) ? (existing.data as PersistedOnboardingSnapshot<T>) : null)
    : options.snapshot;

  const previousCompletedAt = coerceTimestamp(existing.completedAt);
  const completedAt = status === 'completed'
    ? previousCompletedAt ?? timestamp
    : status === 'pending'
      ? null
      : previousCompletedAt;

  const onboarding: Record<string, unknown> = {
    ...existing,
    status,
    resumeStep: nextResumeStep,
    lastSavedAt: timestamp,
    completedAt,
    data: nextSnapshot,
    hasDraft: status !== 'completed' && nextSnapshot != null
  };

  if (status === 'skipped') {
    onboarding.skippedAt = existing.skippedAt ?? timestamp;
  } else if ('skippedAt' in onboarding) {
    delete onboarding.skippedAt;
  }

  base.onboarding = onboarding;
  return base;
};
