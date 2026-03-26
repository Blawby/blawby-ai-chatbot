
/**
 * Safely extracts seats count with defensive default.
 * Returns 1 if seats is null, undefined, 0, or not a finite number.
 * 
 * @param seats - The number of seats
 * @returns Normalized seats count (minimum 1)
 */
export function normalizeSeats(seats?: number | null): number {
  const seatsValue = seats ?? 0;
  return Number.isFinite(seatsValue) && seatsValue > 0 ? seatsValue : 1;
}

export type SubscriptionLifecycleStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

const VALID_STATUSES: SubscriptionLifecycleStatus[] = [
  'none',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
];

const ACTIVE_STATUSES = new Set<SubscriptionLifecycleStatus>(['active', 'trialing']);
const MANAGED_STATUSES = new Set<SubscriptionLifecycleStatus>([
  'active',
  'trialing',
  'paused',
  'past_due',
  'unpaid',
]);

export function normalizeSubscriptionStatus(
  status?: string | null
): SubscriptionLifecycleStatus {
  if (typeof status !== 'string' || status.trim().length === 0) {
    return 'none';
  }

  const lowered = status.toLowerCase();
  if ((VALID_STATUSES as ReadonlyArray<string>).includes(lowered)) {
    return lowered as SubscriptionLifecycleStatus;
  }

  return 'none';
}

export function hasActiveSubscriptionStatus(status?: string | null): boolean {
  const normalized = normalizeSubscriptionStatus(status);
  return ACTIVE_STATUSES.has(normalized);
}

export function hasManagedSubscription(status?: string | null): boolean {
  const normalizedStatus = normalizeSubscriptionStatus(status);
  return MANAGED_STATUSES.has(normalizedStatus);
}
