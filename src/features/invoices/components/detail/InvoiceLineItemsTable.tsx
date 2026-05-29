import { Panel } from '@/shared/ui/layout/Panel';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { asMajor } from '@/shared/utils/money';
import type { InvoiceDetail } from '@/features/invoices/types';

interface InvoiceLineItemsTableProps {
  detail: InvoiceDetail;
}

export const InvoiceLineItemsTable = ({ detail }: InvoiceLineItemsTableProps) => {
  const { lineItems, subtotal, taxAmount, discountAmount, total, amountPaid, amountDue } = detail;
  const showDiscount = (discountAmount ?? 0) > 0;
  const showTax = (taxAmount ?? 0) > 0;
  const showPaymentBreakdown = amountPaid > 0;

  return (
    <Panel className="overflow-hidden rounded-2xl">
      <div className="px-5 pt-5">
        <h3 className="text-sm font-semibold text-ink">Line items</h3>
      </div>
      {lineItems.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-dim-2">No line items.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-line-subtle text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-dim-2 bg-surface-utility/30">
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 w-20 text-right font-medium">Qty</th>
                <th className="px-5 py-3 w-32 text-right font-medium">Unit price</th>
                <th className="px-5 py-3 w-32 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-ink">{item.description || <i>No description</i>}</td>
                  <td className="px-5 py-3 text-right text-dim-2 tabular-nums">
                    {Number(item.quantity ?? 1).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right text-dim-2 tabular-nums">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-ink tabular-nums">
                    {formatCurrency(item.line_total ?? asMajor(0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-utility/10 text-sm">
              <tr>
                <td colSpan={3} className="px-5 py-2 text-right text-dim-2">Subtotal</td>
                <td className="px-5 py-2 text-right text-ink tabular-nums">{formatCurrency(subtotal ?? 0)}</td>
              </tr>
              {showDiscount ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-dim-2">Discount</td>
                  <td className="px-5 py-2 text-right text-ink tabular-nums">
                    -{formatCurrency(discountAmount ?? 0)}
                  </td>
                </tr>
              ) : null}
              {showTax ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-dim-2">Tax</td>
                  <td className="px-5 py-2 text-right text-ink tabular-nums">{formatCurrency(taxAmount ?? 0)}</td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-ink">Total</td>
                <td className="px-5 py-3 text-right text-base font-semibold text-ink tabular-nums">
                  {formatCurrency(total)}
                </td>
              </tr>
              {showPaymentBreakdown ? (
                <>
                  <tr>
                    <td colSpan={3} className="px-5 py-2 text-right text-dim-2">Amount paid</td>
                    <td className="px-5 py-2 text-right text-ink tabular-nums">
                      -{formatCurrency(amountPaid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-5 py-2 text-right text-dim-2">Amount remaining</td>
                    <td className="px-5 py-2 text-right text-ink tabular-nums">
                      {formatCurrency(amountDue)}
                    </td>
                  </tr>
                </>
              ) : null}
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
};
