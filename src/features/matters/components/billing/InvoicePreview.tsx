import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';

type InvoicePreviewProps = {
  matter: MatterDetail;
  lineItems: InvoiceLineItem[];
  dueDate?: string;
};

export const InvoicePreview = ({ matter, lineItems, dueDate }: InvoicePreviewProps) => {
  const subtotal = lineItems.reduce((sum, item) => sum + (item.line_total as number), 0);

  return (
    <div className="mx-auto min-h-[700px] w-full max-w-[794px] rounded-xl border border-line-glass/30 bg-white p-8 text-gray-900 shadow-sm">
      <header className="flex items-start justify-between border-b border-gray-200 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Invoice</p>
          <h4 className="mt-2 text-lg font-semibold">{matter.title}</h4>
          <p className="mt-1 text-sm text-gray-600">Matter ID: {matter.id}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Issue date: {formatLongDate(new Date().toISOString())}</p>
          <p className="text-sm text-gray-600">Due date: {dueDate ? formatLongDate(dueDate) : 'Not set'}</p>
        </div>
      </header>

      <section className="mt-6">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="pb-2 pr-3 font-medium">Description</th>
              <th className="w-20 pb-2 text-right font-medium">Qty</th>
              <th className="w-28 pb-2 text-right font-medium">Rate</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 ? (
              <tr>
                <td className="py-6 text-gray-500" colSpan={4}>No line items</td>
              </tr>
            ) : (
              lineItems.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-b border-gray-100 align-top">
                  <td className="py-3 pr-3">{item.description || `Line item ${index + 1}`}</td>
                  <td className="py-3 text-right">{item.quantity}</td>
                  <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="py-3 text-right font-medium">{formatCurrency(item.line_total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 flex justify-end">
        <div className="w-full max-w-xs space-y-2 border-t border-gray-200 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
