import type { FunctionComponent } from 'preact';
import { Pill } from '@/design-system/primitives';
import { MatterChip } from '@/design-system/patterns';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { TrustLedgerRow } from '@/features/reports/services/reportsTypes';

interface TrustLedgerEntryRowProps {
  entry: TrustLedgerRow;
  onSelectClient?: (clientName: string) => void;
}

/**
 * Classify a ledger entry by the sign of its amount. The backend doesn't
 * tag rows with a discrete "type" today, so sign is the canonical signal:
 * positive = deposit / credit, negative = withdrawal / debit.
 */
type EntryKind = 'deposit' | 'withdrawal';

const kindForAmount = (amountCents: number): EntryKind =>
  amountCents >= 0 ? 'deposit' : 'withdrawal';

const KIND_LABEL: Record<EntryKind, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
};

const KIND_TONE: Record<EntryKind, 'live' | 'warn'> = {
  deposit: 'live',
  withdrawal: 'warn',
};

const formatDateChip = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase();
};

const formatAmount = (amountCents: number): string => {
  const dollars = Math.abs(amountCents) / 100;
  const formatted = formatCurrency(dollars);
  return amountCents >= 0 ? `+${formatted}` : `−${formatted}`;
};

export const TrustLedgerEntryRow: FunctionComponent<TrustLedgerEntryRowProps> = ({
  entry,
  onSelectClient,
}) => {
  const kind = kindForAmount(entry.amountCents);
  const clientLabel = entry.clientName?.trim() || 'Unassigned';
  const amountClass = kind === 'deposit' ? 'text-pos' : 'text-neg';

  return (
    <div className="flex w-full items-start gap-4 px-5 py-4">
      <span className="w-[68px] shrink-0 pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
        {formatDateChip(entry.occurredAt)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Pill tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Pill>
          {entry.clientName ? (
            <MatterChip
              onClick={onSelectClient ? (event) => {
                event.stopPropagation();
                onSelectClient(clientLabel);
              } : undefined}
              title={`Filter by ${clientLabel}`}
            >
              {clientLabel}
            </MatterChip>
          ) : null}
        </div>
        {entry.description ? (
          <p className="text-sm leading-snug text-ink">{entry.description}</p>
        ) : (
          <p className="text-sm leading-snug text-dim">No description</p>
        )}
        <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
          balance after · {formatCurrency(entry.balanceCents / 100)}
        </span>
      </div>
      <span
        className={`shrink-0 pt-1 text-right font-mono text-sm tabular-nums ${amountClass}`}
      >
        {formatAmount(entry.amountCents)}
      </span>
    </div>
  );
};

export default TrustLedgerEntryRow;
