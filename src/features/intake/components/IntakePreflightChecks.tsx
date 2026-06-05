import { FunctionComponent } from 'preact';
import { CheckCircle2, AlertTriangle, Info, ShieldCheck } from 'lucide-preact';

import { SignalPill, type SignalPillSignal } from '@/design-system/primitives';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';
import type { IntakeEnrichedData } from '@/shared/types/intake';

type CheckStatus = 'pass' | 'warn' | 'unknown';

interface CheckRow {
  key: string;
  label: string;
  status: CheckStatus;
  pillLabel: string;
  rationale: string;
  signal: SignalPillSignal;
  icon: IconComponent;
}

export interface IntakePreflightChecksProps {
  /** Enriched-data row from AI submission — drives conflict + practice-area derivation. */
  enrichedData: IntakeEnrichedData | null;
  /** Intake-supplied jurisdiction state (e.g. "NC"). */
  intakeState: string | null;
  /** Practice's covered states (from PracticeDetails.serviceStates). */
  coverageStates: readonly string[] | null;
  /** Practice's enabled service IDs/names — used for area-fit check. */
  practiceServiceLabels: readonly string[];
  className?: string;
}

const PASS_PILL_SIGNAL: SignalPillSignal = 'healthy';
const WARN_PILL_SIGNAL: SignalPillSignal = 'warn';
const QUIET_PILL_SIGNAL: SignalPillSignal = 'quiet';

/**
 * Pre-flight checks panel — 5 deterministic rows surfacing the conflict,
 * jurisdiction, practice-area fit, capacity, and KYC signals so the user
 * doesn't have to compute them.
 *
 * TODO(backend):
 *  - Capacity row: needs a real `/api/practice/:id/capacity` endpoint that
 *    aggregates open matters · forecasted hours. Today we render "manual
 *    review" because no aggregate exists.
 *  - KYC row: needs Stripe identity / id-verification status (already
 *    captured by payment but not surfaced). Today we render "manual review".
 */
export const IntakePreflightChecks: FunctionComponent<IntakePreflightChecksProps> = ({
  enrichedData,
  intakeState,
  coverageStates,
  practiceServiceLabels,
  className,
}) => {
  // Conflict — derived from enrichedData.conflict_check_names array.
  const conflicts = enrichedData?.conflict_check_names ?? [];
  const conflictRow: CheckRow = conflicts.length === 0
    ? {
      key: 'conflict',
      label: 'Conflict of interest',
      status: 'pass',
      pillLabel: 'clear',
      rationale: 'No matching names in active or closed matters.',
      signal: PASS_PILL_SIGNAL,
      icon: ShieldCheck,
    }
    : {
      key: 'conflict',
      label: 'Conflict of interest',
      status: 'warn',
      pillLabel: `${conflicts.length} hit${conflicts.length === 1 ? '' : 's'}`,
      rationale: `Possible conflict: ${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? '…' : ''}`,
      signal: WARN_PILL_SIGNAL,
      icon: AlertTriangle,
    };

  // Jurisdiction — match against practice's coverage states.
  const normalizedIntakeState = intakeState?.trim().toUpperCase() ?? null;
  const normalizedCoverage = (coverageStates ?? [])
    .map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : ''))
    .filter(Boolean);
  let jurisdictionRow: CheckRow;
  if (!normalizedIntakeState) {
    jurisdictionRow = {
      key: 'jurisdiction',
      label: 'Jurisdiction',
      status: 'unknown',
      pillLabel: 'unknown',
      rationale: 'Intake did not specify a state — confirm with client.',
      signal: QUIET_PILL_SIGNAL,
      icon: Info,
    };
  } else if (normalizedCoverage.length === 0) {
    jurisdictionRow = {
      key: 'jurisdiction',
      label: 'Jurisdiction',
      status: 'unknown',
      pillLabel: 'set coverage',
      rationale: `Intake is in ${normalizedIntakeState}. No coverage states configured for this practice.`,
      signal: QUIET_PILL_SIGNAL,
      icon: Info,
    };
  } else if (normalizedCoverage.includes(normalizedIntakeState)) {
    jurisdictionRow = {
      key: 'jurisdiction',
      label: 'Jurisdiction',
      status: 'pass',
      pillLabel: 'clear',
      rationale: `${normalizedIntakeState} is within your licensed coverage.`,
      signal: PASS_PILL_SIGNAL,
      icon: ShieldCheck,
    };
  } else {
    jurisdictionRow = {
      key: 'jurisdiction',
      label: 'Jurisdiction',
      status: 'warn',
      pillLabel: 'out of coverage',
      rationale: `Intake is in ${normalizedIntakeState}; you cover ${normalizedCoverage.slice(0, 4).join(', ')}.`,
      signal: WARN_PILL_SIGNAL,
      icon: AlertTriangle,
    };
  }

  // Practice-area fit — match against enabled services.
  const practiceArea = enrichedData?.practice_area?.trim().toLowerCase() ?? '';
  const serviceMatches = practiceArea
    ? practiceServiceLabels.some((label) => label.toLowerCase().includes(practiceArea))
    : false;
  const areaRow: CheckRow = !practiceArea
    ? {
      key: 'area',
      label: 'Practice area fit',
      status: 'unknown',
      pillLabel: 'unknown',
      rationale: 'AI could not classify a practice area for this intake.',
      signal: QUIET_PILL_SIGNAL,
      icon: Info,
    }
    : serviceMatches
      ? {
        key: 'area',
        label: 'Practice area fit',
        status: 'pass',
        pillLabel: 'match',
        rationale: `${enrichedData?.practice_area ?? practiceArea} is one of your enabled services.`,
        signal: PASS_PILL_SIGNAL,
        icon: CheckCircle2,
      }
      : {
        key: 'area',
        label: 'Practice area fit',
        status: 'unknown',
        pillLabel: 'verify',
        rationale: `${enrichedData?.practice_area ?? practiceArea} not in your enabled services — confirm fit.`,
        signal: QUIET_PILL_SIGNAL,
        icon: Info,
      };

  // Capacity — TODO(backend): real capacity endpoint not yet shipped.
  const capacityRow: CheckRow = {
    key: 'capacity',
    label: 'Capacity',
    status: 'unknown',
    pillLabel: 'manual review',
    rationale: 'Capacity signal not yet wired — check your active matter load.',
    signal: QUIET_PILL_SIGNAL,
    icon: Info,
  };

  // KYC — TODO(backend): Stripe identity status not yet surfaced.
  const kycRow: CheckRow = {
    key: 'kyc',
    label: 'Identity (KYC)',
    status: 'unknown',
    pillLabel: 'manual review',
    rationale: 'Stripe captured payment basics; full KYC signal not yet surfaced.',
    signal: QUIET_PILL_SIGNAL,
    icon: Info,
  };

  const rows: readonly CheckRow[] = [
    conflictRow,
    jurisdictionRow,
    areaRow,
    capacityRow,
    kycRow,
  ];

  return (
    <section
      className={cn(
        'rounded-r-md border border-card-border bg-card',
        'overflow-hidden',
        className,
      )}
      aria-label="Pre-flight intake checks"
    >
      <div className="flex items-center justify-between border-b border-line-subtle bg-paper-2 px-4 py-3 sm:px-5">
        <h3 className="font-serif text-base font-normal tracking-tight text-ink">
          Pre-flight checks
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
          all automatic
        </span>
      </div>
      <ul className="divide-y divide-line-subtle">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-start gap-3 px-4 py-3 sm:px-5"
          >
            <Icon
              icon={row.icon}
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                row.status === 'pass' ? 'text-success'
                  : row.status === 'warn' ? 'text-warning'
                    : 'text-dim-2',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-ink">{row.label}</div>
                <SignalPill
                  signal={row.signal}
                  label={row.pillLabel}
                />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-dim-2">
                {row.rationale}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default IntakePreflightChecks;
