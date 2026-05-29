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

const formatQuantity = (raw: number | null | undefined, billingIncrementMinutes?: number | null): string => {
  const qty = Number(raw ?? 1);
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(billingIncrementMinutes ? 2 : 1);
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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Line items</h3>
        {!readOnly ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setIsAddMode(true)}
            icon={Plus}
            iconClassName="h-3.5 w-3.5 mr-1"
          >
            Add line item
          </Button>
        ) : null}
      </div>

      {lineItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-subtle p-8 text-center bg-surface-utility/20">
           <p className="text-sm text-dim-2">No line items added yet.</p>
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
        <ul className="divide-y divide-line-subtle border-y border-line-subtle">
          {lineItems.map((item, index) => {
            const itemTotal = item.line_total ?? asMajor(0);
            const qtyFormatted = formatQuantity(item.quantity, billingIncrementMinutes);

            return (
              <li
                key={item.id}
                className="group flex items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1 text-sm text-ink">
                  <span className="break-words">
                    {item.description || <i className="text-dim-2">No description</i>}
                  </span>
                  <span className="text-dim-2"> × {qtyFormatted}</span>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-ink">
                  {formatCurrency(itemTotal)}
                </span>
                {!readOnly ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setEditingItem({ item, index })}
                      icon={SquarePen}
                      iconClassName="h-4 w-4 text-dim-2 hover:text-accent-foreground"
                      aria-label="Edit item"
                      title="Edit item"
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeItem(index)}
                      icon={Trash2}
                      iconClassName="h-4 w-4 text-dim-2 hover:text-accent-error-light"
                      aria-label="Delete item"
                      title="Delete item"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
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
