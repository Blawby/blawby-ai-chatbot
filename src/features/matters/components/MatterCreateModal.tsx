import { useMemo, useState } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { FileInput } from '@/shared/ui/input/FileInput';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Select } from '@/shared/ui/input';
import { RadioGroupWithDescriptions } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { Avatar } from '@/shared/ui/profile';
import { type MatterOption, type MatterMilestoneFormInput } from '@/features/matters/data/matterTypes';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, type MatterStatus } from '@/shared/types/matterStatus';
import type { ComponentChildren } from 'preact';
import type { DescribedRadioOption } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { ScaleIcon, ShieldCheckIcon, UserIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/shared/utils/cn';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { asMajor, type MajorAmount } from '@/shared/utils/money';
import { FormGrid } from '@/shared/ui/layout/FormGrid';

type MatterFormMode = 'create' | 'edit';

interface MatterFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (values: MatterFormState) => Promise<void> | void;
  clients: MatterOption[];
  practiceAreas: MatterOption[];
  practiceAreasLoading?: boolean;
  assignees: MatterOption[];
  mode?: MatterFormMode;
  initialValues?: Partial<MatterFormState>;
}

type MatterCreateModalProps = Omit<MatterFormModalProps, 'mode' | 'initialValues'>;

interface MatterEditModalProps extends Omit<MatterFormModalProps, 'mode'> {
  initialValues: Partial<MatterFormState>;
}

export type BillingType = 'hourly' | 'fixed' | 'contingency' | 'pro_bono';

export type PaymentFrequency = 'project' | 'milestone';


export type MatterFormState = {
  title: string;
  clientId: string;
  practiceAreaId: string;
  assigneeIds: string[];
  status: MatterStatus;
  caseNumber: string;
  matterType: string;
  urgency: 'routine' | 'time_sensitive' | 'emergency' | '';
  responsibleAttorneyId: string;
  originatingAttorneyId: string;
  court: string;
  judge: string;
  opposingParty: string;
  opposingCounsel: string;
  openDate: string;
  closeDate: string;
  billingType: BillingType;
  attorneyHourlyRate?: MajorAmount;
  adminHourlyRate?: MajorAmount;
  paymentFrequency?: PaymentFrequency;
  totalFixedPrice?: MajorAmount;
  settlementAmount?: MajorAmount;
  milestones: MatterMilestoneFormInput[];
  contingencyPercent?: number;
  description: string;
  files: File[];
};

const BILLING_OPTIONS = [
  {
    value: 'hourly',
    label: 'Hourly',
    description: 'Bill based on the time spent on the matter'
  },
  {
    value: 'fixed',
    label: 'Fixed Price',
    description: 'Set a fixed price for the entire matter'
  },
  {
    value: 'contingency',
    label: 'Contingency',
    description: 'Set a percentage fee based on the outcome'
  },
  {
    value: 'pro_bono',
    label: 'Pro bono',
    description: 'Provide services without charge'
  }
];

const STATUS_OPTIONS: Array<{ value: MatterStatus; label: string }> = MATTER_WORKFLOW_STATUSES.map(
  (status) => ({
    value: status,
    label: MATTER_STATUS_LABELS[status]
  })
);

const PAYMENT_FREQUENCY_OPTIONS: DescribedRadioOption[] = [
  {
    value: 'project',
    label: 'Project',
    description: 'Collect a single fixed payment for the project'
  },
  {
    value: 'milestone',
    label: 'Milestones',
    description: 'Collect payments across project milestones'
  }
];

const buildInitialState = (mode: MatterFormMode, initialValues?: Partial<MatterFormState>): MatterFormState => ({
  title: initialValues?.title ?? '',
  clientId: initialValues?.clientId ?? '',
  practiceAreaId: initialValues?.practiceAreaId ?? '',
  assigneeIds: initialValues?.assigneeIds ?? [],
  status: initialValues?.status ?? 'first_contact',
  caseNumber: initialValues?.caseNumber ?? '',
  matterType: initialValues?.matterType ?? '',
  urgency: initialValues?.urgency ?? '',
  responsibleAttorneyId: initialValues?.responsibleAttorneyId ?? '',
  originatingAttorneyId: initialValues?.originatingAttorneyId ?? '',
  court: initialValues?.court ?? '',
  judge: initialValues?.judge ?? '',
  opposingParty: initialValues?.opposingParty ?? '',
  opposingCounsel: initialValues?.opposingCounsel ?? '',
  openDate: initialValues?.openDate ?? '',
  closeDate: initialValues?.closeDate ?? '',
  billingType: initialValues?.billingType ?? 'hourly',
  attorneyHourlyRate: initialValues?.attorneyHourlyRate,
  adminHourlyRate: initialValues?.adminHourlyRate,
  paymentFrequency: initialValues?.paymentFrequency,
  totalFixedPrice: initialValues?.totalFixedPrice,
  settlementAmount: initialValues?.settlementAmount,
  milestones: initialValues?.milestones ?? [],
  contingencyPercent: initialValues?.contingencyPercent,
  description: initialValues?.description ?? '',
  files: initialValues?.files ?? []
});

const buildLeadingIcon = (icon: ComponentChildren) => (
  <div className="w-6 h-6 rounded-full border border-dashed border-line-glass/30 flex items-center justify-center text-input-placeholder">
    {icon}
  </div>
);

const StatusPillGroup = ({
  value,
  onChange,
  options
}: {
  value: MatterStatus;
  onChange: (value: MatterStatus) => void;
  options: Array<{ value: MatterStatus; label: string }>;
}) => (
  <fieldset>
    <legend className="block text-sm font-medium text-input-text mb-1">Matter Status</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const inputId = `status-pill-${option.value}`;
        const isSelected = option.value === value;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
              isSelected
                ? 'bg-accent-500 text-gray-900 ring-accent-500'
                : 'bg-surface-glass/60 text-input-text ring-line-glass/30 hover:bg-surface-glass/50'
            )}
          >
            <input
              id={inputId}
              type="radio"
              name="matter-status"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value as MatterStatus)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  </fieldset>
);

const MatterFormModalInner = ({
  isOpen,
  onClose,
  onSubmit,
  clients,
  practiceAreas,
  practiceAreasLoading = false,
  assignees,
  mode = 'create',
  initialValues
}: MatterFormModalProps) => {
  const [formState, setFormState] = useState<MatterFormState>(() => buildInitialState(mode, initialValues));
  const [assigneeInput, setAssigneeInput] = useState(
    () => (initialValues?.assigneeIds ?? []).join(', ')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof MatterFormState, string>>>({});

  const clientOptions = useMemo(
    () => clients.map((client) => ({
      value: client.id,
      label: client.name,
      meta: client.email
    })),
    [clients]
  );
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
  );
  const practiceAreaOptions = useMemo(
    () => practiceAreas.map((area) => ({ value: area.id, label: area.name })),
    [practiceAreas]
  );
  const assigneeOptions = useMemo(
    () =>
      assignees.map((assignee) => ({
        value: assignee.id,
        label: assignee.name,
        meta: assignee.role
      })),
    [assignees]
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees]
  );

  const renderUserAvatar = (name?: string, image?: string | null, size: 'xs' | 'sm' = 'xs') => (
    <Avatar
      name={name?.trim() || 'User'}
      src={image ?? null}
      size={size}
      className="bg-surface-glass/60 backdrop-blur-sm"
    />
  );

  const [isMilestoneFormVisible, setIsMilestoneFormVisible] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState({
    description: '',
    dueDate: '',
    amount: undefined as MajorAmount | undefined
  });
  const [fileError, setFileError] = useState<string | null>(null);

  const hasFormErrors = Object.keys(formErrors).length > 0;
  const canSubmit = Boolean(formState.title && formState.clientId) && !hasFormErrors;
  const isAssigneeOptionsEmpty = assigneeOptions.length === 0;

  const updateForm = <K extends keyof MatterFormState>(key: K, value: MatterFormState[K]) => {
    setFormState((prev) => {
      const next = { ...prev, [key]: value };

      if (key === 'openDate' || key === 'closeDate') {
        const { openDate, closeDate } = next;
        if (openDate && closeDate && new Date(closeDate) < new Date(openDate)) {
          setFormErrors((prevErrors) => ({
            ...prevErrors,
            closeDate: 'Close date cannot be earlier than open date'
          }));
        } else {
          setFormErrors((prevErrors) => {
            const nextErrors = { ...prevErrors };
            delete nextErrors.closeDate;
            return nextErrors;
          });
        }
      }

      return next;
    });
  };

  const parseAssigneeInput = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const applyAssigneeInput = (value: string) => {
    const parsed = parseAssigneeInput(value);
    updateForm('assigneeIds', parsed);
    setAssigneeInput(parsed.join(', '));
    return parsed;
  };

  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create matter';
  const modalTitle = mode === 'edit' ? 'Edit Matter' : 'Propose new matter';

  const handleFilesChange = (incoming: FileList | File[]) => {
    const nextFiles = Array.isArray(incoming) ? incoming : Array.from(incoming);
    const maxTotalSize = 25 * 1024 * 1024;
    const limited = [...formState.files];
    let totalSize = limited.reduce((sum, file) => sum + file.size, 0);
    let droppedAny = false;
    for (const file of nextFiles) {
      if (limited.length >= 6 || totalSize + file.size > maxTotalSize) {
        droppedAny = true;
        continue;
      }
      limited.push(file);
      totalSize += file.size;
    }
    if (droppedAny) {
      setFileError('Some files were not added: exceeds count or size limits.');
    } else {
      setFileError(null);
    }
    updateForm('files', limited);
  };

  const removeFile = (index: number) => {
    updateForm('files', formState.files.filter((_, fileIndex) => fileIndex !== index));
    setFileError(null);
  };

  const canAddMilestone =
    milestoneDraft.description.trim().length > 0 &&
    milestoneDraft.dueDate &&
    typeof milestoneDraft.amount === 'number';

  const addMilestone = () => {
    if (!canAddMilestone) {
      return;
    }
    updateForm('milestones', [
      ...formState.milestones,
      {
        description: milestoneDraft.description.trim(),
        dueDate: milestoneDraft.dueDate,
        amount: milestoneDraft.amount
      }
    ]);
    setMilestoneDraft({ description: '', dueDate: '', amount: undefined });
    setIsMilestoneFormVisible(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      type="fullscreen"
      contentClassName="bg-surface-base"
      headerClassName="bg-surface-base"
    >
      <form
        className="space-y-6 max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setSubmitError(null);
          if (!onSubmit) {
            onClose();
            return;
          }
          setIsSubmitting(true);
          try {
            const resolvedAssignees = isAssigneeOptionsEmpty
              ? parseAssigneeInput(assigneeInput)
              : formState.assigneeIds;
            await onSubmit({ ...formState, assigneeIds: resolvedAssignees });
            setIsSubmitting(false);
            onClose();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save matter';
            setSubmitError(message);
            setIsSubmitting(false);
          }
        }}
      >
        <h1 className="text-3xl font-bold text-input-text">
          {mode === 'edit' ? 'Edit matter' : 'Propose new matter'}
        </h1>

        <Input
          label="Matter Title"
          placeholder="Enter matter title"
          value={formState.title}
          onChange={(value) => updateForm('title', value)}
          required
        />

        <StatusPillGroup
          value={formState.status}
          options={STATUS_OPTIONS}
          onChange={(value) => updateForm('status', value)}
        />

        <Combobox
          label="Client *"
          placeholder="Select customer"
          value={formState.clientId}
          options={clientOptions}
          leading={(selectedOption) => {
            if (selectedOption) {
              const client = clientById.get(selectedOption.value);
              if (client) {
                return renderUserAvatar(client.name, client.image, 'sm');
              }
            }
            return buildLeadingIcon(<UserIcon className="h-4 w-4" />);
          }}
          optionLeading={(option) => {
            const client = clientById.get(option.value);
            if (!client) return null;
            return renderUserAvatar(client.name, client.image, 'sm');
          }}
          optionMeta={(option) => {
            const client = clientById.get(option.value);
            return client?.email || option.meta;
          }}
          onChange={(value) => updateForm('clientId', value)}
        />

        <hr className="h-px border-line-glass/30" />

        <div>
          <h2 className="text-lg font-medium text-input-text mb-2">Provide matter details</h2>
          <div className="space-y-2">
            <Textarea
              label="Description"
              value={formState.description}
              onChange={(value) => updateForm('description', value)}
              placeholder="Let the client know how you'd approach the project or include a cover letter about your experience"
              rows={4}
              maxLength={5000}
              enforceMaxLength="hard"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formState.description.length}/5000 characters
            </p>
          </div>
        </div>

        <Combobox
          label="Practice Area"
          placeholder={practiceAreasLoading ? 'Loading services...' : 'Select practice area'}
          value={formState.practiceAreaId}
          options={practiceAreaOptions}
          leading={buildLeadingIcon(<ScaleIcon className="h-4 w-4" />)}
          onChange={(value) => updateForm('practiceAreaId', value)}
          disabled={practiceAreasLoading}
        />

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-input-text">Matter specifics</h3>
          <FormGrid>
            <Input
              label="Case number"
              value={formState.caseNumber}
              onChange={(value) => updateForm('caseNumber', value)}
              placeholder="e.g. 24-CV-1029"
            />
            <Input
              label="Matter type"
              value={formState.matterType}
              onChange={(value) => updateForm('matterType', value)}
              placeholder="e.g. Contract dispute"
            />
          </FormGrid>
          <FormGrid>
            <div className="w-full">
              <span className="block text-sm font-medium text-input-text mb-1" id="matter-urgency-label">
                Urgency
              </span>
              <Select
                value={formState.urgency}
                options={[
                  { value: '', label: 'Select urgency' },
                  { value: 'routine', label: 'Routine' },
                  { value: 'time_sensitive', label: 'Time sensitive' },
                  { value: 'emergency', label: 'Emergency' }
                ]}
                onChange={(value) => updateForm('urgency', value as MatterFormState['urgency'])}
                aria-labelledby="matter-urgency-label"
                className="w-full justify-between px-3 py-2 text-sm rounded-lg border border-input-border bg-input-bg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <Input
              label="Court"
              value={formState.court}
              onChange={(value) => updateForm('court', value)}
              placeholder="e.g. Superior Court of CA"
            />
          </FormGrid>
          <FormGrid>
            <Input
              label="Judge"
              value={formState.judge}
              onChange={(value) => updateForm('judge', value)}
              placeholder="e.g. Hon. A. Smith"
            />
            <Input
              label="Opposing party"
              value={formState.opposingParty}
              onChange={(value) => updateForm('opposingParty', value)}
            />
          </FormGrid>
          <FormGrid>
            <Input
              label="Opposing counsel"
              value={formState.opposingCounsel}
              onChange={(value) => updateForm('opposingCounsel', value)}
            />
            <Input
              label="Open date"
              type="date"
              value={formState.openDate}
              onChange={(value) => updateForm('openDate', value)}
            />
          </FormGrid>
          <FormGrid>
            <Input
              label="Close date"
              type="date"
              value={formState.closeDate}
              onChange={(value) => updateForm('closeDate', value)}
              error={formErrors.closeDate}
              variant={formErrors.closeDate ? 'error' : 'default'}
            />
            <CurrencyInput
              label="Settlement amount"
              value={formState.settlementAmount}
              onChange={(value) =>
                updateForm('settlementAmount', typeof value === 'number' ? asMajor(value) : undefined)
              }
              placeholder="0"
            />
          </FormGrid>
        </div>

        <div className="border-t border-line-glass/30 pt-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-input-text">Additional documents</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Attach up to 6 files with a max combined size of 25 MB. Use PNG, GIF, PDF, PPT, TXT, or DOC.
            </p>
          </div>

          <div>
            <FileInput
              accept=".png,.gif,.pdf,.ppt,.pptx,.txt,.doc,.docx"
              multiple
              value={formState.files}
              onChange={handleFilesChange}
              maxTotalSize={25 * 1024 * 1024}
              maxFiles={6}
              showAcceptText={false}
              onRemove={removeFile}
            />
            {fileError && (
              <p className="mt-2 text-sm text-red-500">{fileError}</p>
            )}
          </div>
        </div>

        <div className="border-t border-line-glass/30 pt-6 space-y-4">
          <h3 className="text-lg font-medium text-input-text">Team Members</h3>
          {isAssigneeOptionsEmpty ? (
            <Input
              label="Assignee IDs"
              placeholder="Comma-separated user IDs (optional)"
              value={assigneeInput}
              onChange={(value) => setAssigneeInput(value)}
              onBlur={() => applyAssigneeInput(assigneeInput)}
            />
          ) : (
            <Combobox
              label="Select Assignees"
              placeholder="Select Assignees"
              value={formState.assigneeIds}
              options={assigneeOptions}
              multiple
              leading={(selectedOption, selectedOptions) => {
                const first = selectedOptions?.[0] ?? selectedOption;
                if (first) {
                  const assignee = assigneeById.get(first.value);
                  if (assignee) {
                    return renderUserAvatar(assignee.name, assignee.image, 'sm');
                  }
                }
                return buildLeadingIcon(<UserIcon className="h-4 w-4" />);
              }}
              optionLeading={(option) => {
                const assignee = assigneeById.get(option.value);
                if (!assignee) return null;
                return renderUserAvatar(assignee.name, assignee.image, 'sm');
              }}
              optionMeta={(option) => option.meta}
              onChange={(value) => updateForm('assigneeIds', value)}
            />
          )}
        </div>

        <div className="border-t border-line-glass/30 pt-6 space-y-4">
          <h3 className="text-lg font-medium text-input-text">Attorney assignments</h3>
          <FormGrid>
            <Combobox
              label="Responsible attorney"
              placeholder="Select attorney"
              value={formState.responsibleAttorneyId}
              options={assigneeOptions}
              leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
              optionLeading={(option) => {
                const assignee = assigneeById.get(option.value);
                if (!assignee) return null;
                return renderUserAvatar(assignee.name, assignee.image, 'sm');
              }}
              optionMeta={(option) => option.meta}
              onChange={(value) => updateForm('responsibleAttorneyId', value)}
            />
            <Combobox
              label="Originating attorney"
              placeholder="Select attorney"
              value={formState.originatingAttorneyId}
              options={assigneeOptions}
              leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
              optionLeading={(option) => {
                const assignee = assigneeById.get(option.value);
                if (!assignee) return null;
                return renderUserAvatar(assignee.name, assignee.image, 'sm');
              }}
              optionMeta={(option) => option.meta}
              onChange={(value) => updateForm('originatingAttorneyId', value)}
            />
          </FormGrid>
        </div>

        <div className="border-t border-line-glass/30 pt-6 space-y-4">
          <RadioGroupWithDescriptions
            label="Billing type"
            name="billing-type"
            value={formState.billingType}
            options={BILLING_OPTIONS}
            onChange={(value) => updateForm('billingType', value as BillingType)}
          />

          {formState.billingType === 'hourly' && (
            <FormGrid>
              <CurrencyInput
                label="Attorney hourly rate"
                value={formState.attorneyHourlyRate}
                onChange={(value) =>
                  updateForm('attorneyHourlyRate', typeof value === 'number' ? asMajor(value) : undefined)
                }
                placeholder="150"
              />
              <CurrencyInput
                label="Admin hourly rate"
                value={formState.adminHourlyRate}
                onChange={(value) =>
                  updateForm('adminHourlyRate', typeof value === 'number' ? asMajor(value) : undefined)
                }
                placeholder="95"
              />
            </FormGrid>
          )}

          {formState.billingType === 'fixed' && (
            <div className="space-y-6">
              <RadioGroupWithDescriptions
                label="Payment frequency"
                name="payment-frequency"
                value={formState.paymentFrequency ?? ''}
                options={PAYMENT_FREQUENCY_OPTIONS}
                onChange={(value) => updateForm('paymentFrequency', value as PaymentFrequency)}
              />

              {formState.paymentFrequency === 'project' && (
                <CurrencyInput
                  label="Total Fixed Price"
                  value={formState.totalFixedPrice}
                  onChange={(value) =>
                    updateForm('totalFixedPrice', typeof value === 'number' ? asMajor(value) : undefined)
                  }
                  placeholder="2500"
                />
              )}

              {formState.paymentFrequency === 'milestone' && (
                <div className="border-t border-line-glass/30 pt-6 space-y-4">
                  <h4 className="text-lg font-medium text-input-text">Enter project milestones</h4>

                  {formState.milestones.length > 0 && (
                    <ol className="list-decimal pl-4 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                      {formState.milestones.map((milestone, index) => (
                        <li
                          key={`${milestone.description}-${index}`}
                          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-center"
                        >
                          <span className="min-w-0">{milestone.description}</span>
                          <span className="text-left sm:text-right tabular-nums">
                            {milestone.amount ? `$${milestone.amount.toFixed(2)}` : '$0.00'}
                          </span>
                          <span className="text-left sm:text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {milestone.dueDate ? formatDateOnlyUtc(milestone.dueDate) : ''}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {isMilestoneFormVisible ? (
                    <div className="space-y-2">
                      <div>
                        <Textarea
                          label="Milestone description"
                          value={milestoneDraft.description}
                          onChange={(value) =>
                            setMilestoneDraft((prev) => ({
                              ...prev,
                              description: value
                            }))
                          }
                          rows={2}
                          maxLength={100}
                          enforceMaxLength="hard"
                          placeholder="Enter a description of your deliverable"
                        />
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {milestoneDraft.description.length}/100
                        </p>
                      </div>

                      <Input
                        label="Due date"
                        type="date"
                        value={milestoneDraft.dueDate}
                        onChange={(value) =>
                          setMilestoneDraft((prev) => ({
                            ...prev,
                            dueDate: value
                          }))
                        }
                      />

                      <CurrencyInput
                        label="Amount"
                        value={milestoneDraft.amount}
                        onChange={(value) =>
                          setMilestoneDraft((prev) => ({
                            ...prev,
                            amount: typeof value === 'number' ? asMajor(value) : undefined
                          }))
                        }
                      />

                      <div className="w-full flex justify-end">
                        <Button type="button" onClick={addMilestone} disabled={!canAddMilestone}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setIsMilestoneFormVisible(true)}
                      icon={
                        <PlusIcon className="h-4 w-4" aria-hidden="true" />
                      }
                    >
                      Add Milestone
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {formState.billingType === 'contingency' && (
            <div className="max-w-sm">
              <Input
                label="Contingency percentage"
                value={formState.contingencyPercent !== undefined ? String(formState.contingencyPercent) : ''}
                onChange={(value) => {
                  const parsed = value.trim() === '' ? undefined : Number(value);
                  updateForm('contingencyPercent', Number.isFinite(parsed) ? parsed : undefined);
                }}
                placeholder="20"
                type="number"
                min={0}
                max={100}
                step={0.1}
                inputMode="decimal"
                icon={<span className="text-xs font-semibold text-gray-400">%</span>}
                iconPosition="right"
              />
            </div>
          )}
        </div>

        <div className="bg-surface-glass/60 backdrop-blur-sm rounded-lg p-4 flex items-center space-x-3">
          <div className="shrink-0">
            <div className="p-2 bg-black rounded-full">
              <ShieldCheckIcon className="h-6 w-6 text-white" />
            </div>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Payments are built for securing IOLTA compliance.{' '}
            <span className="font-medium underline">Learn more</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-glass/60 backdrop-blur-sm px-4 py-3 text-xs text-input-placeholder">
          {submitError ? (
            <p className="text-red-600 dark:text-red-400">{submitError}</p>
          ) : (
            <p>Ready to save this matter to the practice workspace.</p>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? 'Saving...' : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export const MatterFormModal = (props: MatterFormModalProps) => {
  const { mode = 'create', initialValues } = props;
  const resetKey = useMemo(
    () => `${mode}-${JSON.stringify(initialValues ?? {})}`,
    [mode, initialValues]
  );

  return <MatterFormModalInner key={resetKey} {...props} />;
};

export const MatterCreateModal = (props: MatterCreateModalProps) => (
  <MatterFormModal {...props} mode="create" />
);

export const MatterEditModal = (props: MatterEditModalProps) => (
  <MatterFormModal {...props} mode="edit" />
);
