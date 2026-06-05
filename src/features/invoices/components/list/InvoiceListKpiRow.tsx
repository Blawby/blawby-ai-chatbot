import { StatCard } from '@/shared/ui/cards';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceListAggregates } from '@/features/invoices/hooks/useInvoiceListAggregates';

interface InvoiceListKpiRowProps {
  aggregates: InvoiceListAggregates;
}

const SkeletonStat = ({ label }: { label: string }) => (
  <div className="panel rounded-2xl p-4">
    <p className="text-xs text-dim-2">{label}</p>
    <div className="mt-2 h-7 w-24 animate-pulse rounded bg-paper-2/40" />
    <div className="mt-2 h-3 w-16 animate-pulse rounded bg-paper-2/30" />
  </div>
);

const KpiCard = ({
  label,
  amount,
  count,
}: {
  label: string;
  amount?: number;
  count: number;
}) => {
  const value = amount === undefined ? String(count) : formatCurrency(amount);
  const subtitle = amount === undefined
    ? `${count} ${count === 1 ? 'invoice' : 'invoices'}`
    : `${count} ${count === 1 ? 'invoice' : 'invoices'}`;
  return (
    <StatCard
      label={label}
      value={value}
      trend={{ value: subtitle, direction: 'neutral' }}
    />
  );
};

export const InvoiceListKpiRow = ({ aggregates }: InvoiceListKpiRowProps) => {
  if (aggregates.loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonStat label="Outstanding" />
        <SkeletonStat label="Past due" />
        <SkeletonStat label="Paid (30d)" />
        <SkeletonStat label="Drafts" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Outstanding" amount={aggregates.outstanding.amount} count={aggregates.outstanding.count} />
      <KpiCard label="Past due" amount={aggregates.pastDue.amount} count={aggregates.pastDue.count} />
      <KpiCard label="Paid (30d)" amount={aggregates.paid30d.amount} count={aggregates.paid30d.count} />
      <KpiCard label="Drafts" count={aggregates.drafts.count} />
    </div>
  );
};
