import type { OnboardingFormData } from './hooks/useOnboardingState';
import type { OnboardingStep } from './hooks/useStepValidation';
import type { StripeConnectStatus } from './types';

export type PersistedOnboardingSnapshot = OnboardingFormData & {
  __meta?: {
    resumeStep?: OnboardingStep;
    savedAt?: string;
  };
};

export interface BusinessOnboardingStatusResponse {
  status: 'completed' | 'skipped' | 'pending' | 'not_required';
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  lastSavedAt: number | null;
  hasDraft: boolean;
  data: PersistedOnboardingSnapshot | null;
}

const unwrapOnboardingPayload = (payload: unknown): unknown => {
  let current = payload;
  const visited = new Set<unknown>();

  while (
    current &&
    typeof current === 'object' &&
    'data' in (current as Record<string, unknown>) &&
    (current as Record<string, unknown>).data !== undefined &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = (current as Record<string, unknown>).data;
  }

  return current;
};

export const extractProgressFromPayload = (
  payload: unknown
): BusinessOnboardingStatusResponse | null => {
  const STATUS_VALUES = new Set(['completed', 'skipped', 'pending', 'not_required']);
  const normalized = unwrapOnboardingPayload(payload);
  if (!normalized || typeof normalized !== 'object') {
    return null;
  }

  const candidate = normalized as Partial<BusinessOnboardingStatusResponse>;
  const hasRequiredFields =
    typeof candidate.status === 'string' &&
    STATUS_VALUES.has(candidate.status) &&
    typeof candidate.completed === 'boolean' &&
    typeof candidate.skipped === 'boolean' &&
    (typeof candidate.completedAt === 'number' || candidate.completedAt === null) &&
    (typeof candidate.lastSavedAt === 'number' || candidate.lastSavedAt === null) &&
    typeof candidate.hasDraft === 'boolean' &&
    'data' in candidate;

  if (hasRequiredFields && candidate.data !== undefined) {
    return candidate as BusinessOnboardingStatusResponse;
  }

  return null;
};

export const extractStripeStatusFromPayload = (
  payload: unknown
): StripeConnectStatus | null => {
  const normalized = unwrapOnboardingPayload(payload);
  if (!normalized || typeof normalized !== 'object') {
    return null;
  }

  const candidate = normalized as Record<string, unknown>;

  if (
    typeof candidate.charges_enabled === 'boolean' &&
    typeof candidate.payouts_enabled === 'boolean' &&
    typeof candidate.details_submitted === 'boolean'
  ) {
    return {
      practice_uuid:
        typeof candidate.practice_uuid === 'string' ? candidate.practice_uuid : undefined,
      stripe_account_id:
        typeof candidate.stripe_account_id === 'string' ? candidate.stripe_account_id : undefined,
      charges_enabled: candidate.charges_enabled,
      payouts_enabled: candidate.payouts_enabled,
      details_submitted: candidate.details_submitted,
    };
  }

  return null;
};
