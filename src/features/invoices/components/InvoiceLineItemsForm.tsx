import { useState } from 'preact/hooks';
import { Trash2, SquarePen, Plus } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { asMajor } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';
import { LineItemEditorDialog } from '@/features/invoices/components/LineItemEditorDialog';

type InvoiceLineItemsFormProps = {
  lineItems: InvoiceLineItem[];
  onChange: (lineItems: InvoiceLineItem[]) => void;
  billingIncrementMinutes?: number | null;
  readOnly?: boolean;
};

export const InvoiceLineItemsForm = ({ lineItems, onChange, billingIncrementMinutes, readOnly = false }: InvoiceLineItemsFormProps) => {
  const [editingItem, setEditingItem] = useState<{ item: InvoiceLineItem | null, index: number } | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);

  const handleSaveItem = (item: InvoiceLineItem) => {
    if (isAddMode) {
      onChange([...lineItems, item]);
    } else if (editingItem) {
      const next = [...lineItems];
      next[editingItem.index] = item;
      onChange(next);
    }
  };

  const removeItem = (index: number) => {
    const item = lineItems[index];
    const requiresConfirm = Boolean(item?.time_entry_id || item?.expense_id);
    if (requiresConfirm) {
      const confirmed = typeof window === 'undefined' ? false : window.confirm('Remove this pre-filled line item?');
      if (!confirmed) return;
    }
    onChange(lineItems.filter((_, idx) => idx !== index));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-input-text">Line items</h3>
        </div>
        {!readOnly ? (
          <Button 
            size="xs" 
            variant="secondary" 
            onClick={() => setIsAddMode(true)}
            icon={Plus}
            iconClassName="h-3.5 w-3.5 mr-1"
          >
            Add line item
          </Button>
        ) : null}
      </div>

      {lineItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-glass/30 p-8 text-center bg-surface-utility/20">
           <p className="text-sm text-input-placeholder">No line items added yet.</p>
           {!readOnly ? (
             <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setIsAddMode(true)}
              className="mt-2"
            >
              Click to add your first item
            </Button>
           ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line-glass/30 bg-surface-utility/20">
          <table className="min-w-full divide-y divide-line-glass/30 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-input-placeholder bg-surface-utility/40">
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 w-20 text-right font-medium">Qty</th>
                <th className="px-5 py-3 w-28 text-right font-medium">Unit Price</th>
                <th className="px-5 py-3 w-32 text-right font-medium">Amount</th>
                {!readOnly ? <th className="px-5 py-3 w-28 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-glass/20">
              {lineItems.map((item, index) => {
                const itemTotal = item.line_total ?? asMajor(0);
                const qtyFormatted = Number(item.quantity ?? 1).toFixed(billingIncrementMinutes ? 2 : 1);
                
                return (
                  <tr key={item.id} className="group hover:bg-surface-utility/60 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-medium text-input-text leading-tight block">
                        {item.description || (<i>No description</i>)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-input-placeholder">
                        {qtyFormatted}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-input-placeholder">
                        {formatCurrency(item.unit_price)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-semibold text-input-text transition-colors group-hover:text-accent-400">
                        {formatCurrency(itemTotal)}
                      </span>
                    </td>
                    {!readOnly ? (
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => setEditingItem({ item, index })}
                            icon={SquarePen} 
                            iconClassName="h-4 w-4 text-input-placeholder hover:text-accent-400"
                            title="Edit item"
                          />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => removeItem(index)}
                            icon={Trash2} 
                            iconClassName="h-4 w-4 text-input-placeholder hover:text-accent-error-light"
                            title="Delete item"
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly ? (
        <>
          <LineItemEditorDialog
            key={`add-${isAddMode}`}
            isOpen={isAddMode}
            item={null}
            onSave={handleSaveItem}
            onClose={() => setIsAddMode(false)}
            billingIncrementMinutes={billingIncrementMinutes}
          />

          <LineItemEditorDialog
            key={editingItem?.item?.id ?? 'none'}
            isOpen={!!editingItem}
            item={editingItem?.item || null}
            onSave={handleSaveItem}
            onClose={() => setEditingItem(null)}
            billingIncrementMinutes={billingIncrementMinutes}
          />
        </>
      ) : null}
    </section>
  );
};
