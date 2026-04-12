import { useState } from 'preact/hooks';
import { TrashIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { asMajor, safeMultiply, getMajorAmountValue } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';

type InvoiceLineItemsFormProps = {
  lineItems: InvoiceLineItem[];
  onChange: (lineItems: InvoiceLineItem[]) => void;
  billingIncrementMinutes?: number | null;
  readOnly?: boolean;
};

const newLineItem = (): InvoiceLineItem => ({
  id: crypto.randomUUID(),
  type: 'service',
  description: '',
  quantity: 1,
  unit_price: asMajor(0),
  line_total: asMajor(0)
});

interface LineItemDialogProps {
  isOpen: boolean;
  item: InvoiceLineItem | null;
  onSave: (item: InvoiceLineItem) => void;
  onClose: () => void;
  billingIncrementMinutes?: number | null;
}

const LineItemDialog = ({ isOpen, item, onSave, onClose, billingIncrementMinutes }: LineItemDialogProps) => {
  const step = (billingIncrementMinutes && billingIncrementMinutes > 0) ? billingIncrementMinutes / 60 : 0.1;
  const [formData, setFormData] = useState<InvoiceLineItem>(() => item || newLineItem());

  const handleSave = () => {
    if (!formData.description.trim()) return;
    onSave(formData);
    onClose();
  };

  const updateField = (patch: Partial<InvoiceLineItem>) => {
    setFormData(prev => {
      const next = { ...prev, ...patch };
      const qty = Number(next.quantity || 0);
      return { ...next, line_total: safeMultiply(next.unit_price, qty) };
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={item ? 'Edit Line Item' : 'Add Line Item'}
      contentClassName="max-w-xl"
    >
      <DialogBody className="space-y-4">
        <Input
          label="Description"
          placeholder="e.g. Professional Services"
          value={formData.description}
          onChange={(val) => updateField({ description: val })}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            type="number"
            label="Quantity"
            min={step}
            step={step}
            value={String(formData.quantity ?? 1)}
            onChange={(val) => {
              const parsed = Number(val);
              updateField({
                quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 1
              });
            }}
          />
          <CurrencyInput
            label="Unit price"
            value={getMajorAmountValue(formData.unit_price)}
            onChange={(val) => updateField({ unit_price: asMajor(val ?? 0) })}
          />
        </div>

        <div className="pt-2 border-t border-line-glass/20 flex items-center justify-between">
          <span className="text-sm text-input-placeholder">Total Amount</span>
          <span className="text-lg font-bold text-input-text">
            {formatCurrency(formData.line_total ?? asMajor(0))}
          </span>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!formData.description.trim()}>
          Save Item
        </Button>
      </DialogFooter>
    </Dialog>
  );
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
            icon={PlusIcon}
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
                            icon={PencilSquareIcon} 
                            iconClassName="h-4 w-4 text-input-placeholder hover:text-accent-400"
                            title="Edit item"
                          />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => removeItem(index)}
                            icon={TrashIcon} 
                            iconClassName="h-4 w-4 text-input-placeholder hover:text-[rgb(var(--error-foreground))]"
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

      {/* Logic for Dialogs */}
      {!readOnly ? (
        <>
          <LineItemDialog 
            key={`add-${isAddMode}`}
            isOpen={isAddMode} 
            item={null}
            onSave={handleSaveItem}
            onClose={() => setIsAddMode(false)}
            billingIncrementMinutes={billingIncrementMinutes}
          />

          <LineItemDialog 
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
