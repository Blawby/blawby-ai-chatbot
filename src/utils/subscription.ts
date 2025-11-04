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

