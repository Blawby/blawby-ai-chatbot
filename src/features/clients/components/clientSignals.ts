import type { SignalPillSignal } from '@/design-system/primitives';

export const signalLabel = (signal: SignalPillSignal): string => {
  switch (signal) {
    case 'silent': return 'silent';
    case 'frustrated': return 'frustrated';
    case 'anxious': return 'anxious';
    case 'calm': return 'calm';
    case 'urgent': return 'urgent';
    case 'warn': return 'watch';
    case 'healthy': return 'healthy';
    case 'quiet': return 'quiet';
    default: return signal;
  }
};

/**
 * Format a relative-ish last-contact string for the row.
 *
 * 0 → "today", 1 → "1 day", 2–29 → "N days", ≥30 → "30+ days".
 */
export const formatLastContact = (days: number | null): string => {
  if (days === null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days >= 30) return '30+ days';
  return `${days} days`;
};

export type ContactFilterId = 'all' | 'needs_check_in' | 'on_retainer' | 'awaiting_docs' | 'closed';

export type ContactSortId = 'a_z' | 'recent_activity' | 'sentiment' | 'risk';

export const SENTIMENT_RANK: Record<SignalPillSignal, number> = {
  frustrated: 4,
  anxious: 3,
  silent: 2,
  calm: 1,
  warn: 3,
  urgent: 4,
  quiet: 2,
  healthy: 1,
};
