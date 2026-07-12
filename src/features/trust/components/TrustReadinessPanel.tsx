import type { FunctionComponent } from 'preact';
import { AlertTriangle, Landmark, Scale, ShieldCheck } from 'lucide-preact';

import { Pill } from '@/design-system/primitives';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { TrustReadiness } from '@/features/trust/services/trustReadinessApi';

const formatCents = (cents: number): string => formatCurrency(cents / 100);

const formatVariance = (cents: number): string => {
  if (cents === 0) return formatCents(0);
  return `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`;
};

interface TrustReadinessPanelProps {
  data: TrustReadiness | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReconcile: () => void;
}

export const TrustReadinessPanel: FunctionComponent<TrustReadinessPanelProps> = ({
  data,
  loading,
  error,
  onRetry,
  onReconcile,
}) => {
  if (loading && !data) {
    return (
      <section className="panel flex min-h-40 items-center justify-center" aria-label="Loading trust readiness">
        <LoadingSpinner size="md" ariaLabel="Loading trust readiness" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="panel flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3 text-sm text-neg">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error ?? 'Trust readiness is unavailable.'}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </section>
    );
  }

  const latest = data.latest_reconciliation;
  const lowTargets = data.retainer_targets.filter((target) => target.status === 'low');
  const statusTone = !latest ? 'dim' : latest.status === 'balanced' ? 'live' : 'warn';
  const statusLabel = !latest ? 'Not reconciled' : latest.status === 'balanced' ? 'Balanced' : 'Variance found';

  return (
    <section className="panel overflow-hidden" aria-labelledby="trust-readiness-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border border-line-subtle bg-paper-2 p-2 text-gold">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="trust-readiness-heading" className="font-sans text-lg text-ink">Reconciliation readiness</h2>
              <Pill tone={statusTone}>{statusLabel}</Pill>
            </div>
            <p className="mt-1 text-sm text-dim-2">
              Bank statement, trust books, and client ledgers remain separate evidence sources.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onReconcile}>Reconcile</Button>
      </div>

      <div className="grid gap-px bg-line-subtle sm:grid-cols-3">
        <div className="bg-paper px-5 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim">Bank statement</span>
          <strong className="mt-1 block font-mono text-base tabular-nums text-ink">
            {latest ? formatCents(latest.bank_statement_balance) : '—'}
          </strong>
        </div>
        <div className="bg-paper px-5 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim">Trust books</span>
          <strong className="mt-1 block font-mono text-base tabular-nums text-ink">
            {latest ? formatCents(latest.trust_book_balance) : '—'}
          </strong>
        </div>
        <div className="bg-paper px-5 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-dim">Client ledgers now</span>
          <strong className="mt-1 block font-mono text-base tabular-nums text-ink">
            {formatCents(data.ledger.client_ledger_balance)}
          </strong>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex flex-col gap-2">
          {latest ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tabular-nums">
              <span className={latest.bank_to_book_variance === 0 ? 'text-pos' : 'text-warn'}>
                Bank ↔ books {formatVariance(latest.bank_to_book_variance)}
              </span>
              <span className={latest.book_to_client_variance === 0 ? 'text-pos' : 'text-warn'}>
                Books ↔ clients {formatVariance(latest.book_to_client_variance)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-dim-2">No immutable reconciliation snapshot has been recorded.</span>
          )}
          <span className="text-xs text-dim">
            {latest
              ? `Recorded ${formatRelativeTime(latest.created_at)} · ${latest.source === 'bank_integration' ? 'bank integration' : 'manual statement'}`
              : 'Start with a statement ending date and independent bank and book balances.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={lowTargets.length > 0 ? 'warn' : 'live'}>
            {lowTargets.length} of {data.retainer_targets.length} retainers below target
          </Pill>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-subtle bg-paper-2 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.06em] text-dim">
        <span className="inline-flex items-center gap-1.5"><Landmark className="h-3 w-3" />Operating account not connected</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" />Invoice receivables excluded</span>
        <span>Operating revenue excluded</span>
      </div>
    </section>
  );
};
