import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { getMajorAmountValue } from '@/shared/utils/money';
import { Avatar } from '@/shared/ui/profile';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import { normalizePublicFileUrl } from '@/shared/lib/apiClient';

type InvoicePreviewProps = {
  title: string;
  referenceLabel?: string | null;
  lineItems: InvoiceLineItem[];
  issueDate?: string | Date | null;
  dueDate?: string;
  /** Invoice number shown in header and bottom bar (e.g. "INV-0001") */
  invoiceNumber?: string | null;
  /** Practice / firm name shown in the "From" block */
  practiceName?: string | null;
  /** Absolute URL for the practice logo (already resolved via R2 proxy) */
  practiceLogoUrl?: string | null;
  /** Practice contact email shown in the "From" block */
  practiceEmail?: string | null;
  /** Client name shown in the "Bill to" block */
  clientName?: string | null;
  /** Client email shown in the "Bill to" block */
  clientEmail?: string | null;
  /** Practice billing increment in minutes */
  billingIncrementMinutes?: number | null;
};

export const InvoicePreview = ({
  title,
  referenceLabel,
  lineItems,
  issueDate,
  dueDate,
  invoiceNumber,
  practiceName,
  practiceLogoUrl,
  practiceEmail,
  clientName,
  clientEmail,
  billingIncrementMinutes,
}: InvoicePreviewProps) => {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + getMajorAmountValue(item.line_total),
    0
  );
  const resolvedIssueDate =
    issueDate instanceof Date
      ? `${issueDate.getUTCFullYear()}-${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(issueDate.getUTCDate()).padStart(2, '0')}`
      : issueDate;

  const totalFormatted = formatCurrency(subtotal);
  const dueDateFormatted = dueDate ? formatLongDate(dueDate) : null;
  const normalizedLogoUrl = practiceLogoUrl ? normalizePublicFileUrl(practiceLogoUrl) : null;

  const hasFirmBlock = Boolean(practiceName || normalizedLogoUrl);
  const hasBillingBlock = Boolean(practiceName || clientName || practiceEmail || clientEmail);

  return (
    /* Outer A4 proportioned wrapper */
    <div className="mx-auto w-full max-w-[794px]" style={{ aspectRatio: '210 / 297' }}>
      <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl text-gray-900 text-sm">

        {/* Scrollable content area — leaves room for the sticky bottom bar */}
        <div className="flex-1 overflow-y-auto pb-10 p-6 space-y-4">

          {/* ── Header: invoice label + number (left) · firm logo + name (right) ── */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Invoice</p>
              {invoiceNumber && (
                <p className="mt-1 text-sm font-medium text-gray-700">{invoiceNumber}</p>
              )}
              <h4 className="mt-2 text-base font-semibold">{title}</h4>
              {referenceLabel && (
                <p className="mt-0.5 text-xs text-gray-500">{referenceLabel}</p>
              )}
            </div>

            {/* Firm identity block (top-right) */}
            {hasFirmBlock && (
              <div className="flex items-center gap-3">
                <Avatar 
                  src={normalizedLogoUrl} 
                  name={practiceName ?? 'Firm'} 
                  size="lg" 
                  className="h-14 w-14"
                />
                {practiceName && (
                  <span className="text-base font-semibold text-gray-900">{practiceName}</span>
                )}
              </div>
            )}
          </div>

          {/* ── Dates ── */}
          <div className="flex gap-8 text-xs text-gray-500">
            <div>
              <span className="font-medium text-gray-700">Date of issue:</span>{' '}
              {resolvedIssueDate ? formatLongDate(resolvedIssueDate) : 'Not set'}
            </div>
            <div>
              <span className="font-medium text-gray-700">Date due:</span>{' '}
              {dueDateFormatted ?? 'Not set'}
            </div>
          </div>

          {/* ── From / Bill-to billing block ── */}
          {hasBillingBlock && (
            <div className="flex justify-between text-xs text-gray-600">
              <div>
                {practiceName && <div className="font-semibold text-gray-900">{practiceName}</div>}
                {practiceEmail && <div>{practiceEmail}</div>}
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">Bill to</div>
                {clientName && <div>{clientName}</div>}
                {clientEmail && <div>{clientEmail}</div>}
              </div>
            </div>
          )}

          {/* ── Amount-due headline ── */}
          {dueDateFormatted && (
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {totalFormatted}{' '}
                <span className="font-normal text-gray-500">due {dueDateFormatted}</span>
              </h2>
            </div>
          )}

          {/* ── Line items table ── */}
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="pb-2 pr-3 font-medium">Description</th>
                <th className="w-16 pb-2 text-right font-medium">Qty</th>
                <th className="w-24 pb-2 text-right font-medium">Unit price</th>
                <th className="w-24 pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td className="py-5 text-gray-400" colSpan={4}>
                    No line items
                  </td>
                </tr>
              ) : (
                lineItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3 text-xs leading-relaxed">{item.description || `Line item ${index + 1}`}</td>
                    <td className="py-2 text-right">
                      {Number(item.quantity || 0).toFixed(billingIncrementMinutes ? 2 : 1)}
                    </td>
                    <td className="py-2 text-right">
                      {formatCurrency(getMajorAmountValue(item.unit_price))}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatCurrency(getMajorAmountValue(item.line_total))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3 text-right pr-3" colSpan={3}>
                  Total
                </td>
                <td className="pt-3 text-right">{totalFormatted}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Sticky bottom bar ── */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between border-t border-gray-200 bg-white px-6 py-2 text-xs text-gray-400">
          <div>{invoiceNumber ?? 'DRAFT'}</div>
          {dueDateFormatted && (
            <div>
              {totalFormatted} due {dueDateFormatted}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
