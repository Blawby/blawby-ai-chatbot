import { Panel } from '@/shared/ui/layout/Panel';
import { StatusBadge } from '@/shared/ui/badges/StatusBadge';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoicePaymentEvent } from '@/features/invoices/types';

interface InvoicePaymentsSectionProps {
  payments: InvoicePaymentEvent[];
}

const paymentVariant = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'succeeded' || normalized === 'paid' || normalized === 'completed') return 'success' as const;
  if (normalized === 'failed' || normalized === 'cancelled') return 'error' as const;
  if (normalized === 'pending') return 'warning' as const;
  return 'info' as const;
};

export const InvoicePaymentsSection = ({ payments }: InvoicePaymentsSectionProps) => {
  if (payments.length === 0) return null;

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-input-text">Payments</h3>
        <span className="text-xs text-input-placeholder">{payments.length} {payments.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <ul className="space-y-3">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-line-glass/20 bg-surface-utility/20 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-input-text">{formatCurrency(payment.amount)}</p>
              <p className="text-xs text-input-placeholder">
                {payment.paidAt ? formatLongDate(payment.paidAt) : 'Date unknown'}
              </p>
              {payment.note ? (
                <p className="mt-1 text-xs text-input-placeholder">{payment.note}</p>
              ) : null}
            </div>
            <StatusBadge status={paymentVariant(payment.status)}>{payment.status}</StatusBadge>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
