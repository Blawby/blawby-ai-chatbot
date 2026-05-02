import { useMemo, useState, type Dispatch, type StateUpdater } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { Textarea } from '@/shared/ui/input/Textarea';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { MarkdownUploadTextarea } from '@/shared/ui/input/MarkdownUploadTextarea';
import { Combobox } from '@/shared/ui/input/Combobox';
import { RadioGroupWithDescriptions } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { renderUserAvatar } from '@/shared/ui/profile';
import { type MatterOption, type MatterMilestoneFormInput } from '@/features/matters/data/matterTypes';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, type MatterStatus } from '@/shared/types/matterStatus';
import type { ComponentChildren } from 'preact';
import type { DescribedRadioOption } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { Scale, ShieldCheck, User, MessagesSquare, Search, Briefcase, CheckCircle2, XCircle, AlertTriangle, Plus, Redo2, FileCheck2, CirclePause, ShieldAlert } from 'lucide-preact';


import { Icon } from '@/shared/ui/Icon';
import { formatDateOnlyUtc } from '@/shared/utils/dateOnly';
import { asMajor, isFiniteNumber as isMajorAmount, type MajorAmount } from '@/shared/utils/money';
import { FormGrid } from '@/shared/ui/layout/FormGrid';
import { Panel } from '@/shared/ui/layout/Panel';
import { AddContactDialog } from '@/shared/ui/contacts/AddContactDialog';
import { parseMultiValueText, serializeMultiValueText } from '@/features/matters/utils/multiValueText';

type MatterFormMode = 'create' | 'edit';

interface MatterFormProps {
  onClose: () => void;
  onSubmit?: (values: MatterFormState) => Promise<void> | void;
  onContactCreated?: () => Promise<void> | void;
  practiceId?: string | null;
  clients: MatterOption[];
  practiceAreas: MatterOption[];
  practiceAreasLoading?: boolean;
  assignees: MatterOption[];
  mode?: MatterFormMode;
  initialValues?: Partial<MatterFormState>;
  requireClientSelection?: boolean;
}

type MatterCreateFormProps = Omit<MatterFormProps, 'mode'>;

interface MatterEditFormProps extends Omit<MatterFormProps, 'mode'> {
  initialValues: Partial<MatterFormState>;
}

export type BillingType = 'hourly' | 'fixed' | 'contingency' | 'pro_bono';

export type PaymentFrequency = 'project' | 'milestone';


export type MatterFormState = {
  title: string;
  // UI treats this as "contact", but backend contract remains `client_id`.
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
  first_contact: MessagesSquare,
  intake_pending: Search,
  conflict_check: ShieldAlert,
  conflicted: AlertTriangle,
  eligibility: Scale,
  referred: Redo2,
  consultation_scheduled: FileCheck2,
  declined: XCircle,
  intake_accepted: CheckCircle2,
  engagement_draft: Briefcase,
  engagement_sent: Briefcase,
  engagement_accepted: CheckCircle2,
  engagement_pending: CirclePause,
  active: Briefcase,
  pleadings_filed: FileCheck2,
  discovery: Search,
  mediation: Scale,
  pre_trial: ShieldAlert,
  trial: AlertTriangle,
  order_entered: CheckCircle2,
  appeal_pending: Redo2,
  closed: CheckCircle2
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

type MilestoneDraftState = {
  description: string;
  dueDate: string;
  amount: MajorAmount | undefined;
};

const MatterMilestoneForm = ({
  milestones,
  draft,
  isVisible,
  onDraftChange,
  onAdd,
  onShowForm,
}: {
  milestones: MatterMilestoneFormInput[];
  draft: MilestoneDraftState;
  isVisible: boolean;
  onDraftChange: Dispatch<StateUpdater<MilestoneDraftState>>;
  onAdd: () => void;
  onShowForm: () => void;
}) => {
  const canAddMilestone =
    draft.description.trim().length > 0 &&
    draft.dueDate &&
    isMajorAmount(draft.amount);

  return (
    <div className="border-t border-line-glass/30 pt-6 space-y-4">
      <h4 className="text-lg font-medium text-input-text">Enter project milestones</h4>

      {milestones.length > 0 && (
        <ol className="list-decimal pl-4 space-y-2 text-sm text-input-text">
          {milestones.map((milestone, index) => (
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

      {isVisible ? (
        <div className="space-y-2">
          <div>
            <Textarea
              label="Milestone description"
              value={draft.description}
              onChange={(value) =>
                onDraftChange((prev) => ({
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
              {draft.description.length}/100
            </p>
          </div>

          <Input
            label="Due date"
            type="date"
            value={draft.dueDate}
            onChange={(value) =>
              onDraftChange((prev) => ({
                ...prev,
                dueDate: value
              }))
            }
          />

          <CurrencyInput
            label="Amount"
            value={draft.amount}
            onChange={(value) =>
              onDraftChange((prev) => ({
                ...prev,
                amount: typeof value === 'number' ? asMajor(value) : undefined
              }))
            }
          />

          <div className="w-full flex justify-end">
            <Button type="button" onClick={onAdd} disabled={!canAddMilestone}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={onShowForm}
          icon={Plus}
          iconClassName="h-4 w-4"
        >
          Add Milestone
        </Button>
      )}
    </div>
  );
};

const MatterFormInner = ({
  onClose,
  onSubmit,
  onContactCreated,
  practiceId,
  clients,
  practiceAreas,
  practiceAreasLoading = false,
  assignees,
  mode = 'create',
  initialValues,
  requireClientSelection = true
}: MatterFormProps) => {
  const [formState, setFormState] = useState<MatterFormState>(() => buildInitialState(mode, initialValues));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
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

  const [isMilestoneFormVisible, setIsMilestoneFormVisible] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraftState>({
    description: '',
    dueDate: '',
    amount: undefined as MajorAmount | undefined
  });
  const canSubmit = Boolean(formState.title && (!requireClientSelection || formState.clientId));

  const updateForm = <K extends keyof MatterFormState>(key: K, value: MatterFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const submitLabel = mode === 'edit' ? 'Save changes' : 'Create matter';
  const modalTitle = mode === 'edit' ? 'Edit Matter' : 'Propose new matter';

  const addMilestone = () => {
    if (!isMajorAmount(milestoneDraft.amount) || !milestoneDraft.description.trim() || !milestoneDraft.dueDate) {
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
    <>
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
            placeholder="Share how you would approach the project and drop supporting files directly into the description."
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
              const StatusIcon = STATUS_ICON[selectedStatus] ?? Scale;
              return (
                <Icon icon={StatusIcon} className="h-4 w-4 text-input-placeholder" />
              );
            }}
            optionLeading={(option) => {
              const StatusIcon = STATUS_ICON[option.value as MatterStatus] ?? Scale;
              return <Icon icon={StatusIcon} className="h-4 w-4 text-input-placeholder" />;
            }}
            onChange={(value) => updateForm('status', value as MatterStatus)}
          />

          <Combobox
            label={`Contact${requireClientSelection ? ' *' : ''}`}
            placeholder="Select contact"
            value={formState.clientId}
            options={clientOptions}
            leading={(selectedOption) => {
              if (selectedOption) {
                const client = clientById.get(selectedOption.value);
                if (client) {
                  return renderUserAvatar({ name: client.name, image: client.image }, 'sm');
                }
              }
              return buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />);
            }}
            optionLeading={(option) => {
              const client = clientById.get(option.value);
              if (!client) return null;
              return renderUserAvatar({ name: client.name, image: client.image }, 'sm');
            }}
            optionMeta={(option) => {
              const client = clientById.get(option.value);
              return client?.email || option.meta;
            }}
            onChange={(value) => updateForm('clientId', value)}
            footer={practiceId ? (
              (close) => (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-accent-utility hover:bg-surface-utility/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    close();
                    setAddPersonOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Invite contact
                </button>
              )
            ) : undefined}
          />

          <Combobox
            label="Practice Area"
            placeholder={practiceAreasLoading ? 'Loading services...' : 'Select practice area'}
            value={formState.practiceAreaId}
            options={practiceAreaOptions}
            leading={buildLeadingIcon(<Icon icon={Scale} className="h-4 w-4"  />)}
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
              leading={buildLeadingIcon(<Icon icon={Briefcase} className="h-4 w-4"  />)}
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
              leading={buildLeadingIcon(<Icon icon={Scale} className="h-4 w-4"  />)}
              allowCustomValues
              addNewLabel="Add court"
            />
          </FormGrid>
          <FormGrid>
            <Combobox
              label="Judge"
              value={parseMultiValueText(formState.judge)}
              onChange={(values) => updateForm('judge', serializeMultiValueText(values))}
              placeholder="e.g. Hon. A. Smith"
              options={[]}
              leading={buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />)}
              multiple
              allowCustomValues
              addNewLabel="Add judge"
            />
            <Combobox
              label="Opposing party"
              value={parseMultiValueText(formState.opposingParty)}
              onChange={(values) => updateForm('opposingParty', serializeMultiValueText(values))}
              placeholder="Enter opposing party"
              options={[]}
              leading={buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />)}
              multiple
              allowCustomValues
              addNewLabel="Add opposing party"
            />
          </FormGrid>
          <FormGrid>
            <Combobox
              label="Opposing counsel"
              value={parseMultiValueText(formState.opposingCounsel)}
              onChange={(values) => updateForm('opposingCounsel', serializeMultiValueText(values))}
              placeholder="Enter opposing counsel"
              options={[]}
              leading={buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />)}
              multiple
              allowCustomValues
              addNewLabel="Add opposing counsel"
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
              leading={buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />)}
              optionLeading={(option) => {
                const assignee = assigneeById.get(option.value);
                if (!assignee) return null;
                return renderUserAvatar({ name: assignee.name, image: assignee.image }, 'sm');
              }}
              optionMeta={(option) => option.meta}
              onChange={(value) => updateForm('responsibleAttorneyId', value)}
            />
            <Combobox
              label="Originating attorney"
              placeholder="Select attorney"
              value={formState.originatingAttorneyId}
              options={assigneeOptions}
              leading={buildLeadingIcon(<Icon icon={User} className="h-4 w-4"  />)}
              optionLeading={(option) => {
                const assignee = assigneeById.get(option.value);
                if (!assignee) return null;
                return renderUserAvatar({ name: assignee.name, image: assignee.image }, 'sm');
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
                <MatterMilestoneForm
                  milestones={formState.milestones}
                  draft={milestoneDraft}
                  isVisible={isMilestoneFormVisible}
                  onDraftChange={setMilestoneDraft}
                  onAdd={addMilestone}
                  onShowForm={() => setIsMilestoneFormVisible(true)}
                />
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
                  updateForm(
                    'contingencyPercent',
                    Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : undefined
                  );
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

        {submitError ? (
          <p className="text-sm text-red-400">{submitError}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs text-input-placeholder">
            <Icon icon={ShieldCheck} className="h-4 w-4 text-input-placeholder"  />
            <span>
              Payments are built for securing IOLTA compliance.{' '}
              <a
                href="https://blawby.com/compliance/iolta-compliance"
                className="font-medium underline text-accent-500 hover:text-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more
              </a>
            </span>
          </p>
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
      <AddContactDialog
        practiceId={practiceId ?? null}
        isOpen={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onSuccess={onContactCreated}
      />
    </>
  );
};

export const MatterForm = (props: MatterFormProps) => {
  const { mode = 'create', initialValues } = props;
  // Remounting here intentionally discards in-progress edits when the parent swaps the
  // initialValues object. That keeps the form state aligned with the selected matter.
  const resetKey = useMemo(
    () => `${mode}-${JSON.stringify(initialValues ?? {})}`,
    [mode, initialValues]
  );

  return <MatterFormInner key={resetKey} {...props} />;
};

export const MatterCreateForm = (props: MatterCreateFormProps) => (
  <MatterForm {...props} mode="create" />
);

export const MatterEditForm = (props: MatterEditFormProps) => (
  <MatterForm {...props} mode="edit" />
);
