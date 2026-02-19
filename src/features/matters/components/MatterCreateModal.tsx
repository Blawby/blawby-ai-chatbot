import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { MarkdownUploadTextarea } from '@/shared/ui/input/MarkdownUploadTextarea';
import { Combobox } from '@/shared/ui/input/Combobox';
import { RadioGroupWithDescriptions } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { Avatar } from '@/shared/ui/profile';
import { type MatterOption, type MatterMilestoneFormInput } from '@/features/matters/data/matterTypes';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, type MatterStatus } from '@/shared/types/matterStatus';
import type { ComponentChildren } from 'preact';
import type { DescribedRadioOption } from '@/shared/ui/input/RadioGroupWithDescriptions';
import {
  ScaleIcon,
  ShieldCheckIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  ShieldExclamationIcon,
  DocumentCheckIcon,
  BriefcaseIcon,
  PauseCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowUturnRightIcon
} from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { asMajor, type MajorAmount } from '@/shared/utils/money';
import { FormGrid } from '@/shared/ui/layout/FormGrid';
import { Panel } from '@/shared/ui/layout/Panel';

type MatterFormMode = 'create' | 'edit';

interface MatterFormModalProps {
  onClose: () => void;
  onSubmit?: (values: MatterFormState) => Promise<void> | void;
  practiceId?: string | null;
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

const STATUS_ICON: Record<MatterStatus, preact.ComponentType<preact.JSX.SVGAttributes<SVGSVGElement>>> = {
  first_contact: ChatBubbleLeftRightIcon,
  intake_pending: MagnifyingGlassIcon,
  conflict_check: ShieldExclamationIcon,
  conflicted: ExclamationTriangleIcon,
  eligibility: ScaleIcon,
  referred: ArrowUturnRightIcon,
  consultation_scheduled: DocumentCheckIcon,
  declined: XCircleIcon,
  engagement_pending: PauseCircleIcon,
  active: BriefcaseIcon,
  pleadings_filed: DocumentCheckIcon,
  discovery: MagnifyingGlassIcon,
  mediation: ScaleIcon,
  pre_trial: ShieldExclamationIcon,
  trial: ExclamationTriangleIcon,
  order_entered: CheckCircleIcon,
  appeal_pending: ArrowUturnRightIcon,
  closed: CheckCircleIcon
};

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
  description: initialValues?.description ?? ''
});

const buildLeadingIcon = (icon: ComponentChildren) => (
  <div className="w-6 h-6 rounded-full border border-dashed border-line-glass/30 flex items-center justify-center text-input-placeholder">
    {icon}
  </div>
);

const MatterFormModalInner = ({
  onClose,
  onSubmit,
  practiceId,
  clients,
  practiceAreas,
  practiceAreasLoading = false,
  assignees,
  mode = 'create',
  initialValues
}: MatterFormModalProps) => {
  const [formState, setFormState] = useState<MatterFormState>(() => buildInitialState(mode, initialValues));
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
  const hasFormErrors = Object.keys(formErrors).length > 0;
  const canSubmit = Boolean(formState.title && formState.clientId) && !hasFormErrors;

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

  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create matter';
  const modalTitle = mode === 'edit' ? 'Edit Matter' : 'Propose new matter';

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
    <Panel className="p-4 sm:p-6 lg:p-8">
      <form
        className="space-y-6 max-w-4xl mx-auto"
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
            await onSubmit({ ...formState });
            setIsSubmitting(false);
            onClose();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save matter';
            setSubmitError(message);
            setIsSubmitting(false);
          }
        }}
      >
        <h2 className="text-xl font-semibold text-input-text">{modalTitle}</h2>

        <Input
          label="Matter Title"
          placeholder="Enter matter title"
          value={formState.title}
          onChange={(value) => updateForm('title', value)}
          required
        />

        <div>
          <MarkdownUploadTextarea
            label="Description"
            value={formState.description}
            onChange={(value) => updateForm('description', value)}
            practiceId={practiceId}
            placeholder="Let the client know how you'd approach the project and drop supporting files directly into the description."
            rows={8}
            maxLength={5000}
          />
        </div>

        <hr className="h-px border-line-glass/30" />

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-input-text">Provide matter details</h2>
          <Combobox
            label="Matter Status"
            placeholder="Select status"
            value={formState.status}
            options={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label
            }))}
            leading={(selectedOption) => {
              const selectedStatus = (selectedOption?.value ?? formState.status) as MatterStatus;
              const StatusIcon = STATUS_ICON[selectedStatus] ?? ScaleIcon;
              return (
                <StatusIcon className="h-4 w-4 text-input-placeholder" aria-hidden="true" />
              );
            }}
            optionLeading={(option) => {
              const StatusIcon = STATUS_ICON[option.value as MatterStatus] ?? ScaleIcon;
              return <StatusIcon className="h-4 w-4 text-input-placeholder" aria-hidden="true" />;
            }}
            onChange={(value) => updateForm('status', value as MatterStatus)}
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

          <Combobox
            label="Practice Area"
            placeholder={practiceAreasLoading ? 'Loading services...' : 'Select practice area'}
            value={formState.practiceAreaId}
            options={practiceAreaOptions}
            leading={buildLeadingIcon(<ScaleIcon className="h-4 w-4" />)}
            onChange={(value) => updateForm('practiceAreaId', value)}
            disabled={practiceAreasLoading}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-input-text">Matter specifics</h3>
          <FormGrid>
            <Input
              label="Case number"
              value={formState.caseNumber}
              onChange={(value) => updateForm('caseNumber', value)}
              placeholder="e.g. 24-CV-1029"
            />
            <Combobox
              label="Matter type"
              value={formState.matterType}
              onChange={(value) => updateForm('matterType', value)}
              placeholder="e.g. Contract dispute"
              options={[]}
              leading={buildLeadingIcon(<BriefcaseIcon className="h-4 w-4" />)}
              allowCustomValues
              addNewLabel="Add matter type"
            />
          </FormGrid>
          <FormGrid>
            <div className="w-full">
              <Combobox
                label="Urgency"
                value={formState.urgency}
                options={[
                  { value: '', label: 'Select urgency' },
                  { value: 'routine', label: 'Routine' },
                  { value: 'time_sensitive', label: 'Time sensitive' },
                  { value: 'emergency', label: 'Emergency' }
                ]}
                onChange={(value) => updateForm('urgency', value as MatterFormState['urgency'])}
                className="w-full"
                searchable={false}
              />
            </div>
            <Combobox
              label="Court"
              value={formState.court}
              onChange={(value) => updateForm('court', value)}
              placeholder="e.g. Superior Court of CA"
              options={[]}
              leading={buildLeadingIcon(<ScaleIcon className="h-4 w-4" />)}
              allowCustomValues
              addNewLabel="Add court"
            />
          </FormGrid>
          <FormGrid>
            <Combobox
              label="Judge"
              value={formState.judge}
              onChange={(value) => updateForm('judge', value)}
              placeholder="e.g. Hon. A. Smith"
              options={[]}
              leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
              allowCustomValues
              addNewLabel="Add judge"
            />
            <Combobox
              label="Opposing party"
              value={formState.opposingParty}
              onChange={(value) => updateForm('opposingParty', value)}
              placeholder="Enter opposing party"
              options={[]}
              leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
              allowCustomValues
              addNewLabel="Add opposing party"
            />
          </FormGrid>
          <FormGrid>
            <Combobox
              label="Opposing counsel"
              value={formState.opposingCounsel}
              onChange={(value) => updateForm('opposingCounsel', value)}
              placeholder="Enter opposing counsel"
              options={[]}
              leading={buildLeadingIcon(<UserIcon className="h-4 w-4" />)}
              allowCustomValues
              addNewLabel="Add opposing counsel"
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
                    <ol className="list-decimal pl-4 space-y-2 text-sm text-input-text">
                      {formState.milestones.map((milestone, index) => (
                        <li
                          key={`${milestone.description}-${index}`}
                          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-center"
                        >
                          <span className="min-w-0">{milestone.description}</span>
                          <span className="text-left sm:text-right tabular-nums">
                            {milestone.amount ? `$${milestone.amount.toFixed(2)}` : '$0.00'}
                          </span>
                          <span className="text-left sm:text-right tabular-nums text-input-placeholder">
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
                        <p className="mt-1 text-sm text-input-placeholder">
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
                icon={<span className="text-xs font-semibold text-input-placeholder">%</span>}
                iconPosition="right"
              />
            </div>
          )}
        </div>

        <div className="glass-panel p-4 flex items-center space-x-3">
          <div className="shrink-0">
            <div className="p-2 rounded-full bg-surface-overlay/70 border border-line-glass/30">
              <ShieldCheckIcon className="h-6 w-6 text-input-text" />
            </div>
          </div>
          <p className="text-sm text-input-text">
            Payments are built for securing IOLTA compliance.{' '}
            <a
              href="https://blawby.com/compliance/iolta-compliance"
              className="font-medium underline text-brand-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </p>
        </div>

        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-input-placeholder">
          {submitError ? (
            <p className="text-red-400">{submitError}</p>
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
    </Panel>
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

export const MatterCreateForm = MatterCreateModal;
export const MatterEditForm = MatterEditModal;
