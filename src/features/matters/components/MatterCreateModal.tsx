import { useMemo, useState } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { Input } from '@/shared/ui/input/Input';
import { RadioGroup } from '@/shared/ui/input/RadioGroup';
import { Select } from '@/shared/ui/input/Select';
import { Textarea } from '@/shared/ui/input/Textarea';
import type { MatterOption } from '@/features/matters/data/mockMatters';

interface MatterCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: MatterOption[];
  practiceAreas: MatterOption[];
  assignees: MatterOption[];
}

type BillingType = 'hourly' | 'fixed';

type MatterFormState = {
  title: string;
  clientId: string;
  practiceAreaId: string;
  assigneeId: string;
  status: string;
  billingType: BillingType;
  hourlyRate?: number;
  fixedFee?: number;
  description: string;
};

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' }
];

const BILLING_OPTIONS = [
  {
    value: 'hourly',
    label: 'Hourly',
    description: 'Bill based on time logged for the matter.'
  },
  {
    value: 'fixed',
    label: 'Fixed fee',
    description: 'Set a single flat amount for the matter.'
  }
];

export const MatterCreateModal = ({
  isOpen,
  onClose,
  clients,
  practiceAreas,
  assignees
}: MatterCreateModalProps) => {
  const [formState, setFormState] = useState<MatterFormState>({
    title: '',
    clientId: '',
    practiceAreaId: '',
    assigneeId: '',
    status: 'open',
    billingType: 'hourly',
    hourlyRate: undefined,
    fixedFee: undefined,
    description: ''
  });

  const clientOptions = useMemo(
    () => clients.map((client) => ({ value: client.id, label: client.name })),
    [clients]
  );
  const practiceAreaOptions = useMemo(
    () => practiceAreas.map((area) => ({ value: area.id, label: area.name })),
    [practiceAreas]
  );
  const assigneeOptions = useMemo(
    () => assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
    [assignees]
  );

  const canSubmit = Boolean(formState.title && formState.clientId && formState.practiceAreaId);

  const updateForm = <K extends keyof MatterFormState>(key: K, value: MatterFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Matter">
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onClose();
        }}
      >
        <Input
          label="Matter title"
          value={formState.title}
          onChange={(value) => updateForm('title', value)}
          placeholder="e.g., LLC formation for Redwood Labs"
          required
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Client"
            value={formState.clientId}
            onChange={(value) => updateForm('clientId', value)}
            options={clientOptions}
            placeholder="Select a client"
            searchable
          />
          <Select
            label="Practice area"
            value={formState.practiceAreaId}
            onChange={(value) => updateForm('practiceAreaId', value)}
            options={practiceAreaOptions}
            placeholder="Select a practice area"
            searchable
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Status"
            value={formState.status}
            onChange={(value) => updateForm('status', value)}
            options={STATUS_OPTIONS}
          />
          <Select
            label="Assignee"
            value={formState.assigneeId}
            onChange={(value) => updateForm('assigneeId', value)}
            options={assigneeOptions}
            placeholder="Assign team member"
          />
        </div>

        <RadioGroup
          label="Billing type"
          value={formState.billingType}
          onChange={(value) => updateForm('billingType', value as BillingType)}
          options={BILLING_OPTIONS}
        />

        {formState.billingType === 'hourly' ? (
          <CurrencyInput
            label="Hourly rate"
            value={formState.hourlyRate}
            onChange={(value) => updateForm('hourlyRate', value)}
            placeholder="150"
          />
        ) : (
          <CurrencyInput
            label="Fixed fee"
            value={formState.fixedFee}
            onChange={(value) => updateForm('fixedFee', value)}
            placeholder="2500"
          />
        )}

        <Textarea
          label="Description"
          value={formState.description}
          onChange={(value) => updateForm('description', value)}
          placeholder="Add a short summary for the matter..."
          rows={4}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-white/5 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          <p>UI-only preview. Submission is disabled until the backend is ready.</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create matter
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
