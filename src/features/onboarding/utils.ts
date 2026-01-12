import type { StripeConnectStatus } from './types';

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
