import type { SignalPillSignal } from '@/design-system/primitives';
import type { ContactRecord } from '@/shared/domain/contacts';
import type { BackendMatter } from '@/features/matters/services/mattersApi';

export const DAY_MS = 24 * 60 * 60 * 1000;

const URGENCY_EMERGENCY = 'emergency';

/**
 * Derive a sentiment-style signal for a client row from existing data only.
 *
 * Heuristic (TODO(backend): replace with a real `contacts.sentiment`
 * column or a derived view that scores recent message tone):
 *   - silent     → no contact in > 30d
 *   - frustrated → has an open emergency matter
 *   - anxious    → has a low or overdrawn retainer (placeholder: matter open
 *                  > 14d with urgency=time_sensitive — overdue-invoice signal
 *                  isn't available per-contact yet)
 *   - calm       → everything else
 */
export const deriveContactSignal = ({
  lastContactDays,
  matters,
}: {
  lastContactDays: number | null;
  matters: readonly BackendMatter[];
}): SignalPillSignal => {
  if (matters.some((m) => String(m.urgency ?? '').toLowerCase() === URGENCY_EMERGENCY
    && String(m.status ?? '').toLowerCase() !== 'closed'
    && String(m.status ?? '').toLowerCase() !== 'archived')) {
    return 'frustrated';
  }
  if (lastContactDays !== null && lastContactDays > 30) {
    return 'silent';
  }
  if (matters.some((m) => String(m.urgency ?? '').toLowerCase() === 'time_sensitive')) {
    return 'anxious';
  }
  return 'calm';
};

/**
 * Days since the most recent contact-affecting touch on this record.
 *
 * Right now we only have `updated_at` on the ContactRecord — message-thread
 * timestamps don't fan out to the contacts list (would be N+1). The number
 * is therefore a proxy ("days since the record itself was touched"), not a
 * true "days since the lawyer last messaged the client".
 *
 * TODO(backend): expose `last_contact_at` on the user-details payload (a
 * MAX(messages.created_at, intakes.updated_at, ...) per contact) so this can
 * become exact.
 */
export const computeLastContactDays = (
  contact: ContactRecord,
  now: number
): number | null => {
  const candidates: string[] = [];
  if (contact.updated_at) candidates.push(contact.updated_at);
  if (contact.created_at) candidates.push(contact.created_at);
  if (candidates.length === 0) return null;
  const latest = candidates
    .map((iso) => new Date(iso).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  if (!latest) return null;
  return Math.max(0, Math.floor((now - latest) / DAY_MS));
};

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
