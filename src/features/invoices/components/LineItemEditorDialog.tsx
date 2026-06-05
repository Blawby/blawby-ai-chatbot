import { useCallback, useEffect, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Kbd } from '@/shared/ui/Kbd';
import { asMajor, safeMultiply, getMajorAmountValue } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';

interface LineItemEditorDialogProps {
  isOpen: boolean;
  item: InvoiceLineItem | null;
  onSave: (item: InvoiceLineItem) => void;
  onClose: () => void;
  billingIncrementMinutes?: number | null;
}

const newLineItem = (): InvoiceLineItem => ({
  id: crypto.randomUUID(),
  type: 'service',
  description: '',
  quantity: 1,
  unit_price: asMajor(0),
  line_total: asMajor(0),
});

export const LineItemEditorDialog = ({
  isOpen,
  item,
  onSave,
  onClose,
  billingIncrementMinutes,
}: LineItemEditorDialogProps) => {
  const step = (billingIncrementMinutes && billingIncrementMinutes > 0)
    ? billingIncrementMinutes / 60
    : 0.1;
  // Lazy init from the `item` prop. Parents remount this dialog per record
  // (key={item.id} or unmount-on-close), so no re-sync effect is needed.
  // See docs/solutions/conventions/form-reset-pattern-2026-05-18.md.
  const [formData, setFormData] = useState<InvoiceLineItem>(() => item ?? newLineItem());

  const updateField = useCallback((patch: Partial<InvoiceLineItem>) => {
    setFormData((prev) => {
      const next = { ...prev, ...patch };
      const qty = Number(next.quantity ?? 0);
      return { ...next, line_total: safeMultiply(next.unit_price, qty) };
    });
  }, []);

  const canSave = formData.description.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave(formData);
    onClose();
  }, [canSave, formData, onSave, onClose]);

  const handleSaveAndAddAnother = useCallback(() => {
    if (item !== null || !canSave) return;
    onSave(formData);
    // Reset on successful submit — user explicitly requested to add another.
    setFormData(newLineItem());
  }, [item, canSave, formData, onSave]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleSave]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={item ? 'Edit line item' : 'Add line item'}
      contentClassName="max-w-xl"
    >
      <DialogBody className="space-y-4">
        <Input
          label="Description"
          placeholder="e.g. Professional services"
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
              updateField({ quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 });
            }}
          />
          <CurrencyInput
            label="Unit price"
            value={getMajorAmountValue(formData.unit_price)}
            onChange={(val) => updateField({ unit_price: asMajor(val ?? 0) })}
          />
        </div>

        <div className="flex items-center justify-between border-t border-line-subtle pt-3">
          <span className="text-sm text-dim-2">Total</span>
          <span className="text-lg font-semibold text-ink">
            {formatCurrency(formData.line_total ?? asMajor(0))}
          </span>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {item === null ? (
          <Button variant="ghost" onClick={handleSaveAndAddAnother} disabled={!canSave}>
            Save and add another
          </Button>
        ) : null}
        <Button onClick={handleSave} disabled={!canSave}>
          <span className="inline-flex items-center gap-2">
            Save
            <span className="hidden items-center gap-0.5 text-xs sm:inline-flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </span>
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
