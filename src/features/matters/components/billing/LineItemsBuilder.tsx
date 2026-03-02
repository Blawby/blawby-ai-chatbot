import { TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { asMajor, safeMultiply } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';

type LineItemsBuilderProps = {
  lineItems: InvoiceLineItem[];
  onChange: (lineItems: InvoiceLineItem[]) => void;
};

const newLineItem = (): InvoiceLineItem => ({
  id: crypto.randomUUID(),
  type: 'service',
  description: '',
  quantity: 1,
  unit_price: asMajor(0),
  line_total: asMajor(0)
});

const describeSource = (item: InvoiceLineItem): string | null => {
  if (item.time_entry_id) {
    const qty = Number(item.quantity ?? 0);
    return qty > 0 ? `${qty.toFixed(2)} hrs billable time` : 'Billable time';
  }
  if (item.expense_id) {
    return 'Billable expense';
  }
  return null;
};

export const LineItemsBuilder = ({ lineItems, onChange }: LineItemsBuilderProps) => {
  const updateItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    const next = lineItems.map((item, idx) => {
      if (idx !== index) return item;
      const merged = { ...item, ...patch };
      const qty = Number(merged.quantity || 0);
      return { ...merged, line_total: safeMultiply(merged.unit_price, qty) };
    });
    onChange(next);
  };

  const removeItem = (index: number) => {
    if (lineItems.length <= 1) return;
    const item = lineItems[index];
    const requiresConfirm = Boolean(item?.time_entry_id || item?.expense_id);
    if (requiresConfirm) {
      const confirmed = typeof window === 'undefined' ? true : window.confirm('Remove this pre-filled line item?');
      if (!confirmed) return;
    }
    onChange(lineItems.filter((_, idx) => idx !== index));
  };

  const addItem = () => {
    onChange([...lineItems, newLineItem()]);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-input-text">Line items</h3>
          <p className="text-xs text-input-placeholder">
            Describe the services or expenses to bill.
          </p>
        </div>
        <Button size="xs" variant="secondary" onClick={addItem}>
          Add line item
        </Button>
      </div>

      {lineItems.length === 0 ? (
        <p className="text-sm text-input-placeholder">No line items yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-glass/30">
          <table className="min-w-full divide-y divide-line-glass/30 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-input-placeholder">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 w-32">Qty</th>
                <th className="px-4 py-3 w-40">Unit price</th>
                <th className="px-4 py-3 w-32">Total</th>
                <th className="px-4 py-3 w-16 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-glass/20">
              {lineItems.map((item, index) => {
                const sourceHint = describeSource(item);
                const disableRemoval = lineItems.length <= 1;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 align-top">
                      <Input
                        label="Description"
                        value={item.description}
                        onChange={(value) => updateItem(index, { description: value })}
                      />
                      {sourceHint ? (
                        <p className="mt-1 text-xs text-input-placeholder">
                          {sourceHint}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input
                        type="number"
                        label="Quantity"
                        min={0.1}
                        step={0.1}
                        value={String(item.quantity ?? 1)}
                        onChange={(value) => {
                          const parsed = Number(value);
                          updateItem(index, {
                            quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 1
                          });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <CurrencyInput
                        label="Unit price"
                        value={item.unit_price}
                        onChange={(value) => updateItem(index, { unit_price: asMajor(value ?? 0) })}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-semibold text-input-text">
                        {formatCurrency(item.line_total ?? asMajor(0))}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button
                        size="icon-sm"
                        variant="danger-ghost"
                        onClick={() => removeItem(index)}
                        disabled={disableRemoval}
                        icon={<TrashIcon className="h-4 w-4" />}
                        aria-label="Remove line item"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
