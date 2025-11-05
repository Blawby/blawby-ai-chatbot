import type { SubscriptionLifecycleStatus } from '../types';

const VALID_STATUSES: ReadonlySet<SubscriptionLifecycleStatus> = new Set<SubscriptionLifecycleStatus>([
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

export function normalizeSubscriptionStatus(status: unknown): SubscriptionLifecycleStatus {
  if (typeof status !== 'string' || status.trim().length === 0) return 'none';
  const lowered = status.trim().toLowerCase() as SubscriptionLifecycleStatus;
  return VALID_STATUSES.has(lowered) ? lowered : 'none';
}
