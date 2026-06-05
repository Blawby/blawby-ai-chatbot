import { cn } from '@/shared/utils/cn';

export type SignalPillSignal =
  | 'urgent'
  | 'warn'
  | 'healthy'
  | 'quiet'
  | 'calm'
  | 'anxious'
  | 'frustrated'
  | 'silent';

export interface SignalPillProps {
  /** Semantic risk / sentiment signal — maps to a tone class internally. */
  signal: SignalPillSignal;
  /** Display label. Defaults to capitalized `signal`. */
  label?: string;
  /** Show the leading colored dot. Default true. */
  dot?: boolean;
  className?: string;
}

// signal → semantic tone (pos / warn / neg / dim).
const SIGNAL_TONE: Record<SignalPillSignal, 'pos' | 'warn' | 'neg' | 'dim'> = {
  urgent: 'neg',
  warn: 'warn',
  healthy: 'pos',
  calm: 'pos',
  quiet: 'dim',
  silent: 'dim',
  anxious: 'warn',
  frustrated: 'neg',
};

const capitalize = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

/**
 * Semantic risk / sentiment pill
 * (Matters.html .col-flag, Clients.html .sentiment).
 *
 * Separate from `Pill` because the variant set here is semantic — callers
 * pass `signal="frustrated"` rather than `tone="neg"`, so meaning is preserved
 * at the call site and the visual tone can shift centrally if design changes.
 */
export function SignalPill({ signal, label, dot = true, className }: SignalPillProps) {
  const tone = SIGNAL_TONE[signal];
  return (
    <span
      className={cn('signal-pill', `signal-pill-${tone}`, className)}
      data-signal={signal}
    >
      {dot && <span className="signal-pill-dot" aria-hidden="true" />}
      {label ?? capitalize(signal)}
    </span>
  );
}
