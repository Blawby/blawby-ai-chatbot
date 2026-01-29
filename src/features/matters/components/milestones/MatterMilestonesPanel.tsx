import { useMemo, useState } from 'preact/hooks';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { Input } from '@/shared/ui/input/Input';
import { Select } from '@/shared/ui/input/Select';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import type { MatterDetail } from '@/features/matters/data/mockMatters';

type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

interface MatterMilestonesPanelProps {
  matter: MatterDetail;
  milestones?: MatterDetail['milestones'];
  loading?: boolean;
  error?: string | null;
  onCreateMilestone?: (values: { description: string; amount: number; dueDate: string; status?: MilestoneStatus }) => Promise<void> | void;
  onUpdateMilestone?: (
    milestone: MatterDetail['milestones'][number],
    values: { description: string; amount: number; dueDate: string; status?: MilestoneStatus }
  ) => Promise<void> | void;
  onDeleteMilestone?: (milestone: MatterDetail['milestones'][number]) => Promise<void> | void;
  onReorderMilestones?: (nextOrder: MatterDetail['milestones']) => Promise<void> | void;
  allowReorder?: boolean;
  allowEdit?: boolean;
}

export const MatterMilestonesPanel = ({
  matter,
  milestones,
  loading = false,
  error = null,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onReorderMilestones,
  allowReorder = false,
  allowEdit = true
}: MatterMilestonesPanelProps) => {
  const resolvedMilestones = milestones ?? matter.milestones ?? [];
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MatterDetail['milestones'][number] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MatterDetail['milestones'][number] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [formState, setFormState] = useState({
    description: '',
    amount: undefined as number | undefined,
    dueDate: '',
    status: 'pending' as MilestoneStatus
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showError } = useToastContext();
  const canCreate = Boolean(onCreateMilestone);
  const canEdit = allowEdit && (Boolean(onUpdateMilestone) || Boolean(onDeleteMilestone));
  const canReorder = allowReorder && typeof onReorderMilestones === 'function';
  const statusOptions = useMemo(() => ([
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' }
  ]), []);

  const openForm = () => {
    if (!canCreate) return;
    setEditingMilestone(null);
    setFormState({
      description: '',
      amount: undefined,
      dueDate: '',
      status: 'pending'
    });
    setSubmitError(null);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const openEditForm = (milestone: MatterDetail['milestones'][number]) => {
    if (!canEdit) return;
    setEditingMilestone(milestone);
    setFormState({
      description: milestone.description ?? '',
      amount: milestone.amount ?? undefined,
      dueDate: milestone.dueDate ?? '',
      status: milestone.status ?? 'pending'
    });
    setSubmitError(null);
    setFormKey((prev) => prev + 1);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setSubmitError(null);
    setEditingMilestone(null);
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!formState.description.trim() || formState.amount === undefined || !formState.dueDate) {
      setSubmitError('Please fill out description, amount, and due date.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        description: formState.description.trim(),
        amount: formState.amount,
        dueDate: formState.dueDate,
        status: formState.status
      };
      if (editingMilestone && onUpdateMilestone) {
        await onUpdateMilestone(editingMilestone, payload);
      } else if (onCreateMilestone) {
        await onCreateMilestone(payload);
      } else {
        return;
      }
      closeForm();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : `Failed to ${editingMilestone ? 'update' : 'create'} milestone`;
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const moveMilestone = async (index: number, direction: -1 | 1) => {
    if (!canReorder) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= resolvedMilestones.length) return;
    const next = [...resolvedMilestones];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    try {
      await onReorderMilestones?.(next);
    } catch (error) {
      console.error('[MatterMilestonesPanel] Failed to reorder milestones', error);
      showError('Could not reorder milestones', 'Please try again.');
    }
  };

  const confirmDelete = (milestone: MatterDetail['milestones'][number]) => {
    if (!canEdit) return;
    setDeleteTarget(milestone);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !onDeleteMilestone) return;
    setDeleteError(null);
    setIsSubmitting(true);
    try {
      await onDeleteMilestone(deleteTarget);
      setDeleteTarget(null);
      if (editingMilestone?.id === deleteTarget.id) {
        closeForm();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete milestone';
      setDeleteError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Milestones</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {resolvedMilestones.length} milestones tracked
          </p>
        </div>
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={openForm} disabled={!canCreate}>
          Add milestone
        </Button>
      </header>

      {error ? (
        <div className="px-6 py-6 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : loading && resolvedMilestones.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          Loading milestones...
        </div>
      ) : resolvedMilestones.length === 0 ? (
        <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No milestones yet. Add milestones to track key deliverables for this matter.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-white/10">
          {resolvedMilestones.map((milestone, index) => (
            <li key={milestone.id ?? `${milestone.description}-${index}`} className="px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {milestone.description}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {milestone.dueDate ? (
                      <span>
                        Due <time dateTime={milestone.dueDate}>{formatDateOnlyUtc(milestone.dueDate)}</time>
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(milestone.amount ?? 0)}
                  </div>
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<PencilIcon className="h-4 w-4" />}
                        onClick={() => openEditForm(milestone)}
                        aria-label="Edit milestone"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<TrashIcon className="h-4 w-4" />}
                        onClick={() => confirmDelete(milestone)}
                        aria-label="Delete milestone"
                      />
                    </div>
                  ) : null}
                  {canReorder ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ArrowUpIcon className="h-4 w-4" />}
                        onClick={() => moveMilestone(index, -1)}
                        aria-label="Move milestone up"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ArrowDownIcon className="h-4 w-4" />}
                        onClick={() => moveMilestone(index, 1)}
                        aria-label="Move milestone down"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={closeForm}
          title="Add milestone"
          contentClassName="max-w-2xl"
        >
          <form key={formKey} className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Description"
              value={formState.description}
              onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))}
              required
              placeholder="Draft documents"
            />
            <CurrencyInput
              label="Amount"
              value={formState.amount}
              onChange={(value) => setFormState((prev) => ({ ...prev, amount: value }))}
              required
              min={0}
              step={0.01}
            />
            <Input
              label="Due date"
              type="date"
              value={formState.dueDate}
              onChange={(value) => setFormState((prev) => ({ ...prev, dueDate: value }))}
              required
            />
            <div>
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Status</span>
              <Select
                value={formState.status}
                options={statusOptions}
                onChange={(value) => setFormState((prev) => ({ ...prev, status: value as MilestoneStatus }))}
                className="w-full justify-between px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-input-bg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            {submitError && (
              <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingMilestone ? 'Update milestone' : 'Add milestone'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {canEdit && deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete milestone"
          contentClassName="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this milestone? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete milestone'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};
