import type { FunctionComponent } from 'preact';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-preact';

import { Pill, SignalPill, type PillTone, type SignalPillSignal } from '@/design-system/primitives';
import type { IntakePreflight, IntakePreflightCheck } from '@/features/intake/api/intakePreflightApi';
import { Button } from '@/shared/ui/Button';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';

export interface IntakePreflightChecksProps {
  data: IntakePreflight | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  className?: string;
}

const LABELS: Record<IntakePreflightCheck['key'], string> = {
  conflict: 'Conflict of interest',
  jurisdiction: 'Jurisdiction',
  'practice-fit': 'Practice area fit',
  capacity: 'Capacity',
  documents: 'Documents',
  'identity-verification': 'Identity (KYC)',
};

const STATUS_LABELS: Record<IntakePreflightCheck['status'], string> = {
  pass: 'clear',
  review: 'review',
  block: 'blocked',
  not_available: 'not available',
};

const statusPresentation = (status: IntakePreflightCheck['status']): {
  icon: IconComponent;
  iconClass: string;
  signal: SignalPillSignal;
} => {
  switch (status) {
    case 'pass': return { icon: CheckCircle2, iconClass: 'text-success', signal: 'healthy' };
    case 'block': return { icon: ShieldAlert, iconClass: 'text-neg', signal: 'urgent' };
    case 'review': return { icon: AlertTriangle, iconClass: 'text-warning', signal: 'warn' };
    case 'not_available': return { icon: Info, iconClass: 'text-dim-2', signal: 'quiet' };
  }
};

const overallPresentation = (status: IntakePreflight['overall_status']): { label: string; tone: PillTone } => {
  if (status === 'ready') return { label: 'Ready', tone: 'live' };
  if (status === 'blocked') return { label: 'Blocked', tone: 'urgent' };
  return { label: 'Review needed', tone: 'warn' };
};

export const IntakePreflightChecks: FunctionComponent<IntakePreflightChecksProps> = ({
  data,
  loading,
  error,
  onRetry,
  className,
}) => {
  if (loading && !data) {
    return (
      <section className={cn('flex min-h-40 items-center justify-center rounded-r-md border border-card-border bg-card', className)}>
        <LoadingSpinner size="md" ariaLabel="Loading pre-flight checks" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className={cn('flex items-center justify-between gap-4 rounded-r-md border border-card-border bg-card px-5 py-4', className)}>
        <div className="flex items-center gap-3 text-sm text-neg">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error ?? 'Pre-flight checks are unavailable.'}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </section>
    );
  }

  const overall = overallPresentation(data.overall_status);

  return (
    <section
      className={cn('overflow-hidden rounded-r-md border border-card-border bg-card', className)}
      aria-label="Pre-flight intake checks"
    >
      <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3 sm:px-5">
        <div>
          <h3 className="font-serif text-base font-normal tracking-tight text-ink">Pre-flight checks</h3>
          <p className="mt-0.5 text-xs text-dim-2">Deterministic evidence from practice and intake records.</p>
        </div>
        <Pill tone={overall.tone}>{overall.label}</Pill>
      </div>
      <ul className="divide-y divide-line-subtle">
        {data.checks.map((check) => {
          const presentation = statusPresentation(check.status);
          return (
            <li key={check.key} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <Icon icon={presentation.icon} className={cn('mt-0.5 h-4 w-4 shrink-0', presentation.iconClass)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-ink">{LABELS[check.key]}</div>
                  <SignalPill signal={presentation.signal} label={STATUS_LABELS[check.status]} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-dim-2">{check.summary}</p>
                {check.evidence.length > 0 ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-dim">
                    {check.evidence.join(' · ')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default IntakePreflightChecks;
