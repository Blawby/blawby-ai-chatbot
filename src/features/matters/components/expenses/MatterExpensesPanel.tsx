import { useMemo, useState } from 'preact/hooks';
import { EllipsisVerticalIcon, PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { ulid } from 'ulid';
import { format, parseISO } from 'date-fns';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { MatterDetail, MatterExpense } from '@/features/matters/data/mockMatters';
import { ExpenseForm, type ExpenseFormValues } from './ExpenseForm';

const formatExpenseDate = (dateString: string) => format(parseISO(dateString), 'MMM d, yyyy');

const statusStyles: Record<'billable' | 'nonbillable', string> = {
  billable: 'text-green-700 bg-green-50 ring-green-600/20 dark:text-green-200 dark:bg-green-500/10',
  nonbillable: 'text-red-700 bg-red-50 ring-red-600/20 dark:text-red-200 dark:bg-red-500/10'
};

interface MatterExpensesPanelProps {
  matter: MatterDetail;
  expenses?: MatterExpense[];
  loading?: boolean;
  error?: string | null;
  onCreateExpense?: (values: ExpenseFormValues) => Promise<void> | void;
  allowEdit?: boolean;
}

export const MatterExpensesPanel = ({
  matter,
  expenses,
  loading = false,
  error = null,
  onCreateExpense,
  allowEdit = true
}: MatterExpensesPanelProps) => {
  const [localExpenses, setLocalExpenses] = useState<MatterExpense[]>(() => matter.expenses ?? []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MatterExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterExpense | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedExpenses = expenses ?? localExpenses;
  const canEdit = allowEdit && expenses === undefined && !onCreateExpense;

  const sortedExpenses = useMemo(() => {
    return [...resolvedExpenses].sort((a, b) => b.date.localeCompare(a.date));
  }, [resolvedExpenses]);

  const totalExpenses = useMemo(() => {
    return resolvedExpenses.reduce((total, expense) => total + expense.amount, 0);
  }, [resolvedExpenses]);

  const billableTotal = useMemo(() => {
    return resolvedExpenses.filter((expense) => expense.billable).reduce((total, expense) => total + expense.amount, 0);
  }, [resolvedExpenses]);

  const openNewExpense = () => {
    setEditingExpense(null);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const openEditExpense = (expense: MatterExpense) => {
    if (!canEdit) return;
    setEditingExpense(expense);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingExpense(null);
  };

  const handleSave = async (values: ExpenseFormValues) => {
    if (values.amount === undefined) return;
    setSubmitError(null);
    if (onCreateExpense) {
      setIsSubmitting(true);
      try {
        await onCreateExpense(values);
        closeForm();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save expense';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const nextExpense: MatterExpense = {
      id: editingExpense?.id ?? ulid(),
      description: values.description,
      amount: Math.round(values.amount * 100),
      date: values.date,
      billable: values.billable
    };

    setLocalExpenses((prev) => (
      editingExpense
        ? prev.map((expense) => (expense.id === editingExpense.id ? nextExpense : expense))
        : [nextExpense, ...prev]
    ));

    closeForm();
  };

  const confirmDelete = (expense: MatterExpense) => {
    if (!canEdit) return;
    setDeleteTarget(expense);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setLocalExpenses((prev) => prev.filter((expense) => expense.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editingExpense?.id === deleteTarget.id) {
      closeForm();
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Expenses</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sortedExpenses.length} recorded · {formatCurrency(totalExpenses)} total · {formatCurrency(billableTotal)} billable
          </p>
        </div>
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={openNewExpense}>
          Add expense
        </Button>
      </header>

      {error ? (
        <div className="px-6 py-6 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : loading && sortedExpenses.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          Loading expenses...
        </div>
      ) : sortedExpenses.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No expenses yet. Add receipts, filing fees, or other costs tied to this matter.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-white/10">
          {sortedExpenses.map((expense) => {
            const statusClass = expense.billable ? statusStyles.billable : statusStyles.nonbillable;
            return (
              <li
                key={expense.id}
                className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <button
                  type="button"
                  className="min-w-0 text-left flex-1"
                  onClick={() => openEditExpense(expense)}
                  disabled={!canEdit}
                >
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {expense.description}
                    </p>
                    <span
                      className={[
                        statusClass,
                        'whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
                      ].join(' ')}
                    >
                      {expense.billable ? 'Billable' : 'Not billable'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    <span className="whitespace-nowrap">
                      Date: <time dateTime={expense.date}>{formatExpenseDate(expense.date)}</time>
                    </span>
                    <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 fill-current">
                      <circle cx="1" cy="1" r="1" />
                    </svg>
                    <span className="truncate">Amount: {formatCurrency(expense.amount)}</span>
                  </div>
                </div>
                </button>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Open expense actions"
                        icon={<EllipsisVerticalIcon className="h-4 w-4" />}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <div className="py-1">
                        <DropdownMenuItem onSelect={() => openEditExpense(expense)}>
                          <span className="flex items-center gap-2">
                            <PencilIcon className="h-4 w-4" />
                            Edit
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => confirmDelete(expense)}>
                          <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </span>
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={closeForm}
          title={editingExpense ? 'Edit expense' : 'Add expense'}
          contentClassName="max-w-2xl"
        >
          <ExpenseForm
            key={`${editingExpense?.id ?? 'new'}-${formKey}`}
            initialExpense={editingExpense ?? undefined}
            onSubmit={handleSave}
            onCancel={closeForm}
            onDelete={canEdit && editingExpense ? () => confirmDelete(editingExpense) : undefined}
          />
          {submitError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          {isSubmitting && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Saving expense...</p>
          )}
        </Modal>
      )}

      {canEdit && deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete expense"
          contentClassName="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this expense? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>Delete expense</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
