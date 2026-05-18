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
        <h3 className="text-sm font-semibold text-input-text">Line items</h3>
      </div>
      {lineItems.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-input-placeholder">No line items.</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-line-glass/30 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-input-placeholder bg-surface-utility/30">
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 w-20 text-right font-medium">Qty</th>
                <th className="px-5 py-3 w-32 text-right font-medium">Unit price</th>
                <th className="px-5 py-3 w-32 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-glass/20">
              {lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-input-text">{item.description || <i>No description</i>}</td>
                  <td className="px-5 py-3 text-right text-input-placeholder tabular-nums">
                    {Number(item.quantity ?? 1).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right text-input-placeholder tabular-nums">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-input-text tabular-nums">
                    {formatCurrency(item.line_total ?? asMajor(0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-utility/10 text-sm">
              <tr>
                <td colSpan={3} className="px-5 py-2 text-right text-input-placeholder">Subtotal</td>
                <td className="px-5 py-2 text-right text-input-text tabular-nums">{formatCurrency(subtotal ?? 0)}</td>
              </tr>
              {showDiscount ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-input-placeholder">Discount</td>
                  <td className="px-5 py-2 text-right text-input-text tabular-nums">
                    -{formatCurrency(discountAmount ?? 0)}
                  </td>
                </tr>
              ) : null}
              {showTax ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-input-placeholder">Tax</td>
                  <td className="px-5 py-2 text-right text-input-text tabular-nums">{formatCurrency(taxAmount ?? 0)}</td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-input-text">Total</td>
                <td className="px-5 py-3 text-right text-base font-semibold text-input-text tabular-nums">
                  {formatCurrency(total)}
                </td>
              </tr>
              {showPaymentBreakdown ? (
                <>
                  <tr>
                    <td colSpan={3} className="px-5 py-2 text-right text-input-placeholder">Amount paid</td>
                    <td className="px-5 py-2 text-right text-input-text tabular-nums">
                      -{formatCurrency(amountPaid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-5 py-2 text-right text-input-placeholder">Amount remaining</td>
                    <td className="px-5 py-2 text-right text-input-text tabular-nums">
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
