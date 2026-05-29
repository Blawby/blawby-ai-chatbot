import { Panel } from '@/shared/ui/layout/Panel';
import { Pill, type PillTone } from '@/design-system/primitives';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { InvoicePaymentEvent } from '@/features/invoices/types';

interface InvoicePaymentsSectionProps {
  payments: InvoicePaymentEvent[];
}

const paymentTone = (status: string): PillTone => {
  const normalized = status.toLowerCase();
  if (normalized === 'succeeded' || normalized === 'paid' || normalized === 'completed') return 'live';
  if (normalized === 'failed' || normalized === 'cancelled') return 'urgent';
  if (normalized === 'pending') return 'warn';
  return 'dim';
};

export const InvoicePaymentsSection = ({ payments }: InvoicePaymentsSectionProps) => {
  if (payments.length === 0) return null;

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Payments</h3>
        <span className="text-xs text-dim-2">{payments.length} {payments.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <ul className="space-y-3">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex items-start justify-between gap-3 rounded-r-md border border-line-subtle bg-paper-2/20 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{formatCurrency(payment.amount)}</p>
              <p className="text-xs text-dim-2">
                {payment.paidAt ? formatLongDate(payment.paidAt) : 'Date unknown'}
              </p>
              {payment.note ? (
                <p className="mt-1 text-xs text-dim-2">{payment.note}</p>
              ) : null}
            </div>
            <Pill tone={paymentTone(payment.status)}>{payment.status}</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
};
