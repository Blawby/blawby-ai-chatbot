import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Checkbox, CurrencyInput, DatePicker, Input } from '@/shared/ui/input';
import { formatDateOnlyStringUtc } from '@/shared/utils/dateOnly';
import type { MatterExpense } from '@/features/matters/data/mockMatters';

export type ExpenseFormValues = {
  description: string;
  amount: number | undefined;
  date: string;
  billable: boolean;
};

const buildDefaultValues = (expense?: MatterExpense): ExpenseFormValues => ({
  description: expense?.description ?? '',
  amount: typeof expense?.amount === 'number' ? expense.amount : undefined,
  date: expense?.date ?? formatDateOnlyStringUtc(new Date()),
  billable: expense?.billable ?? true
});

interface ExpenseFormProps {
  initialExpense?: MatterExpense;
  onSubmit: (values: ExpenseFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const ExpenseForm = ({ initialExpense, onSubmit, onCancel, onDelete }: ExpenseFormProps) => {
  const [values, setValues] = useState<ExpenseFormValues>(() => buildDefaultValues(initialExpense));

  const canSubmit = Boolean(values.description.trim()) && values.amount !== undefined && Boolean(values.date);

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    if (!canSubmit || values.amount === undefined) return;
    onSubmit({
      ...values,
      description: values.description.trim()
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <Input
        label="Description"
        value={values.description}
        onChange={(nextValue) => setValues((prev) => ({ ...prev, description: nextValue }))}
        placeholder="Court filing fee"
        required
      />

      <CurrencyInput
        label="Amount"
        value={values.amount}
        onChange={(nextValue) => setValues((prev) => ({ ...prev, amount: nextValue }))}
        required
        min={0}
        step={0.01}
      />

      <DatePicker
        label="Date"
        value={values.date}
        onChange={(nextValue) => setValues((prev) => ({ ...prev, date: nextValue }))}
        required
      />

      <Checkbox
        checked={values.billable}
        onChange={(checked) => setValues((prev) => ({ ...prev, billable: checked }))}
        label="Billable"
        description="Mark as billable to include this expense on invoices."
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {onDelete && (
          <Button variant="danger" type="button" onClick={onDelete} className="mr-auto">
            Delete
          </Button>
        )}
        <Button variant="secondary" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {initialExpense ? 'Update Expense' : 'Add Expense'}
        </Button>
      </div>
    </form>
  );
};
