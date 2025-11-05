/**
 * Normalizes subscription tier for display.
 * Strips -annual suffix, title-cases, defaults to Free.
 * 
 * @param tier - The subscription tier (e.g., 'business-annual', 'business', 'free')
 * @returns Normalized tier name for display (e.g., 'Business', 'Free')
 */
export function displayPlan(tier?: string | null): string {
  if (!tier || tier === 'free') return 'Free';
  const normalized = tier.replace(/-annual$/i, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) || 'Free';
}

/**
 * Safely extracts seats count with defensive default.
 * Returns 1 if seats is null, undefined, 0, or not a finite number.
 * 
 * @param seats - The number of seats
 * @returns Normalized seats count (minimum 1)
 */
export function normalizeSeats(seats?: number | null): number {
  return Number.isFinite(seats) && seats! > 0 ? seats! : 1;
}
export type SubscriptionKind = 'personal' | 'business';
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

export function resolveOrganizationKind(kind?: string | null, isPersonal?: boolean | null): SubscriptionKind {
  if (kind === 'business') return 'business';
  if (kind === 'personal') return 'personal';
  if (isPersonal === false) return 'business';
  return 'personal';
}

export function normalizeSubscriptionStatus(
  status?: string | null,
  fallbackKind: SubscriptionKind = 'personal'
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

export function isBusinessOrganization(kind?: string | null, isPersonal?: boolean | null): boolean {
  return resolveOrganizationKind(kind, isPersonal) === 'business';
}

export function hasActiveSubscriptionStatus(status?: string | null): boolean {
  const normalized = normalizeSubscriptionStatus(status);
  return ACTIVE_STATUSES.has(normalized);
}

export function hasManagedSubscription(
  kind?: string | null,
  status?: string | null,
  isPersonal?: boolean | null
): boolean {
  const resolvedKind = resolveOrganizationKind(kind, isPersonal);
  const normalizedStatus = normalizeSubscriptionStatus(status, resolvedKind);
  return resolvedKind === 'business' && MANAGED_STATUSES.has(normalizedStatus);
}

export function describeSubscriptionPlan(
  kind?: string | null,
  status?: string | null,
  tier?: string | null,
  isPersonal?: boolean | null
): string {
  const resolvedKind = resolveOrganizationKind(kind, isPersonal);
  if (resolvedKind === 'personal') {
    return 'Personal';
  }

  const normalizedStatus = normalizeSubscriptionStatus(status, resolvedKind);
  const normalizedTier = typeof tier === 'string' ? tier.toLowerCase() : '';

  if (normalizedTier.includes('enterprise')) {
    if (normalizedStatus === 'paused') return 'Enterprise (Paused)';
    if (normalizedStatus === 'trialing') return 'Enterprise Trial';
    if (normalizedStatus === 'past_due') return 'Enterprise (Past Due)';
    if (normalizedStatus === 'unpaid') return 'Enterprise (Unpaid)';
    return 'Enterprise';
  }

  switch (normalizedStatus) {
    case 'trialing':
      return 'Business Trial';
    case 'paused':
      return 'Business (Paused)';
    case 'past_due':
      return 'Business (Past Due)';
    case 'unpaid':
      return 'Business (Unpaid)';
    default:
      return 'Business';
  }
}
