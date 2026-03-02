import type { OnboardingStatus as ApiOnboardingStatus } from '@/shared/lib/apiClient';

export type PracticeOnboardingStatus = {
  practice_uuid: string;
  stripe_account_id: string | null;
  connected_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  url?: string;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value || null;
  return null;
};

const toBoolean = (value: unknown): boolean => Boolean(value);

export const normalizePracticeOnboardingStatus = (
  status: ApiOnboardingStatus | Record<string, unknown> | null | undefined
): PracticeOnboardingStatus => {
  const source = status ?? {};
  const record = source as Record<string, unknown>;

  const practiceUuid =
    toStringOrNull((source as ApiOnboardingStatus).practiceUuid) ??
    toStringOrNull(record.practice_uuid) ??
    '';

  const stripeAccountId =
    toStringOrNull((source as ApiOnboardingStatus).stripeAccountId) ??
    toStringOrNull(record.stripe_account_id);

  const connectedAccountId =
    toStringOrNull((source as ApiOnboardingStatus).connectedAccountId) ??
    toStringOrNull(record.connected_account_id);

  const chargesEnabled =
    toBoolean((source as ApiOnboardingStatus).chargesEnabled) ||
    toBoolean(record.charges_enabled);

  const payoutsEnabled =
    toBoolean((source as ApiOnboardingStatus).payoutsEnabled) ||
    toBoolean(record.payouts_enabled);

  const detailsSubmitted =
    toBoolean((source as ApiOnboardingStatus).detailsSubmitted) ||
    toBoolean(record.details_submitted);

  const url = toStringOrNull(record.url);

  return {
    practice_uuid: practiceUuid,
    stripe_account_id: stripeAccountId,
    connected_account_id: connectedAccountId,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    details_submitted: detailsSubmitted,
    url: url ?? undefined
  };
};
