import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Briefcase, Plus, Search } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input, Textarea, Combobox, Switch, type ComboboxOption } from '@/shared/ui/input';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import { Dialog, DialogBody, DialogFooter, useDialogFormReset } from '@/shared/ui/dialog';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { InfiniteScroll } from '@/shared/ui/layout/InfiniteScroll';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { listIntakes, type IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';

import { createEngagementContract, listEngagements, sendEngagementToClient } from '../api/engagementsApi';
import type {
  EngagementListItem,
  EngagementStatus,
  ProposalData,
  ProposalFees,
} from '../types/engagement';
import EngagementDetailPage from './EngagementDetailPage';

const PAGE_SIZE = 20;

// ── Filter / status helpers ──────────────────────────────────────────────────

type StatusFilter = 'all' | EngagementStatus;

const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
];

const normalizeStatusFilter = (value: string | null | undefined): StatusFilter => {
  if (value === 'draft' || value === 'sent' || value === 'accepted' || value === 'declined') {
    return value;
  }
  return 'all';
};

type StatusVariant = { label: string; className: string };

const engagementStatusBadge = (status: EngagementStatus | string | undefined): StatusVariant => {
  switch (status) {
    case 'accepted':
      return { label: 'Accepted', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300' };
    case 'declined':
      return { label: 'Declined', className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300' };
    case 'draft':
      return { label: 'Draft', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' };
    case 'sent':
      return { label: 'Sent', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30' };
    default:
      return { label: '—', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30' };
  }
};

const StatusPill: FunctionComponent<{ status: EngagementStatus | string | undefined }> = ({ status }) => {
  const variant = engagementStatusBadge(status);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', variant.className)}>
      {variant.label}
    </span>
  );
};

// ── Display helpers ──────────────────────────────────────────────────────────

const getMatterLabel = (item: EngagementListItem): string => {
  const proposalSummary = item.proposal_data?.client_summary?.matter_summary;
  if (proposalSummary && proposalSummary.trim()) return proposalSummary;
  if (item.title && item.title.trim()) return item.title;
  return '—';
};

const getBillingLabel = (fees: ProposalFees | null | undefined): string => {
  if (!fees) return '—';
  const type = (fees.billing_type ?? '').toLowerCase();
  if (type === 'flat' || type === 'fixed' || type === 'flat_fee') return 'Flat fee';
  if (type === 'hourly') return 'Hourly';
  if (type === 'contingency') return 'Contingency';
  if (type === 'retainer') return 'Retainer';
  if (type) return fees.billing_type as string;
  return '—';
};

const getRetainerLabel = (fees: ProposalFees | null | undefined): string => {
  if (!fees) return '$0';
  const amount = fees.retainer_amount;
  if (typeof amount === 'number' && amount > 0) return formatCurrency(amount);
  const fixed = fees.fixed_fee_amount;
  if (typeof fixed === 'number' && fixed > 0) return formatCurrency(fixed);
  return '$0';
};

const matchesSearch = (item: EngagementListItem, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = (item.client_name ?? '').toLowerCase();
  const email = (item.client_email ?? '').toLowerCase();
  const matter = getMatterLabel(item).toLowerCase();
  return name.includes(q) || email.includes(q) || matter.includes(q);
};

// ── Mobile card ──────────────────────────────────────────────────────────────

const EngagementMobileCard: FunctionComponent<{
  item: EngagementListItem;
  onClick: () => void;
}> = ({ item, onClick }) => {
  const name = item.client_name || 'Unknown Client';
  const matter = getMatterLabel(item);
  const retainer = getRetainerLabel(item.proposal_data?.fees);

  const rows: ReadonlyArray<{ label: string; value: ComponentChildren }> = [
    { label: 'Matter', value: <span className="text-input-placeholder break-words">{matter}</span> },
    { label: 'Retainer', value: <span className="font-medium text-input-text tabular-nums">{retainer}</span> },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-card-border bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="flex items-start justify-between gap-3 pb-3">
        <span className="font-semibold text-input-text break-words">{name}</span>
        <StatusPill status={item.status} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-xs font-medium uppercase tracking-wide text-input-placeholder">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
};

// ── Create Engagement dialog ─────────────────────────────────────────────────

type FeeStructure = 'flat' | 'hourly' | 'contingency' | 'retainer';

const FEE_TABS: ReadonlyArray<{ id: FeeStructure; label: string; banner: string }> = [
  { id: 'flat', label: 'Flat fee', banner: 'Single fixed fee for the entire scope of representation.' },
  { id: 'hourly', label: 'Hourly', banner: 'Billed against a retainer at the attorney hourly rate.' },
  { id: 'contingency', label: 'Contingency', banner: 'Fees recovered as a percentage of any settlement or award.' },
  { id: 'retainer', label: 'Retainer', banner: 'Recurring retainer held in trust and drawn against work performed.' },
];

// Templates surface in the dropdown but are not persisted today — the backend
// template-rendering layer populates contract_body on send. When a templates
// API exists, swap the static list for a fetched one.
const TEMPLATE_OPTIONS: ComboboxOption[] = [
  { value: 'standard', label: 'Standard Engagement Agreement' },
  { value: 'flat-fee', label: 'Flat Fee Agreement' },
  { value: 'hourly', label: 'Hourly Engagement Agreement' },
  { value: 'contingency', label: 'Contingency Fee Agreement' },
  { value: 'retainer', label: 'Retainer Agreement' },
];

const PRACTICE_AREA_OPTIONS: ComboboxOption[] = [
  { value: 'family', label: 'Family Law' },
  { value: 'personal-injury', label: 'Personal Injury' },
  { value: 'estate-planning', label: 'Estate Planning' },
  { value: 'criminal-defense', label: 'Criminal Defense' },
  { value: 'business', label: 'Business Law' },
];

const JURISDICTION_OPTIONS: ComboboxOption[] = [
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'TX', label: 'Texas' },
  { value: 'FL', label: 'Florida' },
  { value: 'IL', label: 'Illinois' },
];

type CreateForm = {
  intakeId: string;
  engagementName: string;
  practiceArea: string;
  jurisdiction: string;
  templateId: string;
  feeStructure: FeeStructure;
  flatFeeAmount: string;
  hourlyRate: string;
  contingencyRate: string;
  retainerAmount: string;
  internalNotes: string;
  sendToClient: boolean;
  recipientEmail: string;
  messagePreview: string;
};

type CreateErrors = Partial<Record<keyof CreateForm, string>>;

const EMPTY_FORM: CreateForm = {
  intakeId: '',
  engagementName: '',
  practiceArea: '',
  jurisdiction: '',
  templateId: '',
  feeStructure: 'flat',
  flatFeeAmount: '',
  hourlyRate: '',
  contingencyRate: '',
  retainerAmount: '',
  internalNotes: '',
  sendToClient: false,
  recipientEmail: '',
  messagePreview: '',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateForm = (form: CreateForm): CreateErrors => {
  const errors: CreateErrors = {};
  if (!form.intakeId) errors.intakeId = 'Client is required';
  if (!form.engagementName.trim()) errors.engagementName = 'Engagement name is required';
  if (!form.templateId) errors.templateId = 'Template is required';
  if (form.sendToClient && !EMAIL_REGEX.test(form.recipientEmail.trim())) {
    errors.recipientEmail = 'A valid recipient email is required';
  }
  return errors;
};

const buildProposalData = (form: CreateForm, intake: IntakeListItem | null): ProposalData => {
  const fees: ProposalFees = {
    billing_type: form.feeStructure,
    fixed_fee_amount: form.feeStructure === 'flat' && form.flatFeeAmount ? Number(form.flatFeeAmount) : null,
    hourly_rate_attorney: form.feeStructure === 'hourly' && form.hourlyRate ? Number(form.hourlyRate) : null,
    contingency_percentage: form.feeStructure === 'contingency' && form.contingencyRate ? Number(form.contingencyRate) : null,
    retainer_amount: form.feeStructure === 'retainer' && form.retainerAmount ? Number(form.retainerAmount) : null,
    fee_notes: null,
  };

  return {
    representation: {
      scope_summary: form.engagementName.trim(),
    },
    fees,
    risk_review: {
      conflict_status: 'unknown',
      jurisdiction_status: 'unknown',
    },
    client_summary: {
      client_name: intake?.metadata?.name?.trim() || null,
      matter_summary: form.engagementName.trim() || null,
    },
    draft_meta: {
      version: 1,
      generated_at: new Date().toISOString(),
    },
  };
};

interface CreateEngagementDialogProps {
  practiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (engagementId: string) => void;
}

const CreateEngagementDialog: FunctionComponent<CreateEngagementDialogProps> = ({
  practiceId,
  isOpen,
  onClose,
  onCreated,
}) => {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [intakes, setIntakes] = useState<IntakeListItem[]>([]);
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(false);
  const [intakesError, setIntakesError] = useState<string | null>(null);

  // Note: fee-structure tab switches inside this form must NOT clear fields —
  // those are handled by `updateField('feeStructure', …)` which preserves all
  // other form state.
  useDialogFormReset({
    isOpen,
    trigger: 'on-open',
    reason: 'Each open starts a fresh draft; clears any stale submit error or in-flight flag from a previously-interrupted attempt.',
    reset: () => {
      setForm(EMPTY_FORM);
      setErrors({});
      setHasAttemptedSubmit(false);
      setSubmitting(false);
      setSubmitError(null);
    },
  });

  // Fetch accepted intakes (client-side search filtering) on dialog open.
  useEffect(() => {
    if (!isOpen || !practiceId) return;
    const controller = new AbortController();
    setIsLoadingIntakes(true);
    setIntakesError(null);
    setIntakes([]);

    listIntakes(
      practiceId,
      { page: 1, limit: 100, triage_status: 'accepted' },
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setIntakes(result.intakes);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setIntakesError(error instanceof Error ? error.message : 'Failed to load clients');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingIntakes(false);
      });

    return () => controller.abort();
  }, [isOpen, practiceId]);

  const selectedIntake = useMemo(
    () => intakes.find((intake) => intake.uuid === form.intakeId) ?? null,
    [intakes, form.intakeId],
  );

  const intakeOptions = useMemo<ComboboxOption[]>(
    () =>
      intakes.map((intake) => {
        const name = intake.metadata?.name?.trim() || 'Anonymous lead';
        const subject = resolveIntakeTitle(intake.metadata, '');
        return {
          value: intake.uuid,
          label: name,
          description: subject || intake.metadata?.email || undefined,
          meta: formatRelativeTime(intake.created_at),
        };
      }),
    [intakes],
  );

  // Auto-fill recipient email from selected intake.
  useEffect(() => {
    if (!selectedIntake) return;
    const email = selectedIntake.metadata?.email?.trim();
    if (email) {
      setForm((prev) => (prev.recipientEmail ? prev : { ...prev, recipientEmail: email }));
    }
  }, [selectedIntake]);

  const updateField = useCallback(<K extends keyof CreateForm>(field: K, value: CreateForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (hasAttemptedSubmit) {
      setErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [hasAttemptedSubmit]);

  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    setSubmitError(null);
    const validation = validateForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const proposalData = buildProposalData(form, selectedIntake);
      const created = await createEngagementContract(practiceId, {
        intake_id: form.intakeId,
        engagement_notes: form.internalNotes.trim() || undefined,
        proposal_data: proposalData,
      });

      if (form.sendToClient) {
        try {
          await sendEngagementToClient(practiceId, created.id, form.messagePreview.trim() || undefined);
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : 'Engagement created, but failed to send.');
          setSubmitting(false);
          return;
        }
      }

      onCreated(created.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create engagement');
    } finally {
      setSubmitting(false);
    }
  }, [form, practiceId, selectedIntake, onCreated]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  const activeFeeTab = FEE_TABS.find((t) => t.id === form.feeStructure) ?? FEE_TABS[0];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create engagement"
      description="Start a new engagement agreement from an intake. You can review and edit it before sending."
      disableBackdropClick={submitting}
      contentClassName="max-w-2xl"
    >
      <DialogBody className="space-y-5">
        {submitError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {submitError}
          </div>
        )}

        {/* Client section */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Client</h3>
          {selectedIntake ? (
            <SelectedIntakeCard
              intake={selectedIntake}
              onClear={() => updateField('intakeId', '')}
            />
          ) : (
            <>
              <Combobox
                placeholder={isLoadingIntakes ? 'Loading clients…' : 'Search for a client…'}
                options={intakeOptions}
                value={form.intakeId}
                onChange={(value) => updateField('intakeId', value)}
                disabled={submitting || isLoadingIntakes}
                searchable
              />
              {errors.intakeId && <p className="mt-1 text-xs text-rose-400">{errors.intakeId}</p>}
            </>
          )}
          {intakesError && <p className="text-sm text-rose-400">{intakesError}</p>}
        </section>

        {/* Engagement details */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Engagement details</h3>
          <Input
            label="Engagement name"
            placeholder="e.g., Personal Injury Representation Agreement"
            value={form.engagementName}
            onChange={(value) => updateField('engagementName', value)}
            disabled={submitting}
            error={errors.engagementName}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Combobox
              label="Practice area"
              placeholder="Select practice area"
              options={PRACTICE_AREA_OPTIONS}
              value={form.practiceArea}
              onChange={(value) => updateField('practiceArea', value)}
              disabled={submitting}
              searchable
            />
            <Combobox
              label="Jurisdiction"
              placeholder="Select state"
              options={JURISDICTION_OPTIONS}
              value={form.jurisdiction}
              onChange={(value) => updateField('jurisdiction', value)}
              disabled={submitting}
              searchable
            />
          </div>
          <div>
            <Combobox
              label="Template"
              placeholder="Select a template…"
              options={TEMPLATE_OPTIONS}
              value={form.templateId}
              onChange={(value) => updateField('templateId', value)}
              disabled={submitting}
              searchable
            />
            {errors.templateId && <p className="mt-1 text-xs text-rose-400">{errors.templateId}</p>}
          </div>
        </section>

        {/* Fee structure */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Fee structure</h3>
          <Tabs
            items={FEE_TABS.map((t) => ({ id: t.id, label: t.label }))}
            activeId={form.feeStructure}
            onChange={(id) => updateField('feeStructure', id as FeeStructure)}
          />
          <div className="rounded-lg border border-card-border bg-surface-card px-3 py-2 text-xs text-input-placeholder">
            {activeFeeTab.banner}
          </div>
          <FeeAmountInput
            structure={form.feeStructure}
            flatFee={form.flatFeeAmount}
            hourly={form.hourlyRate}
            contingency={form.contingencyRate}
            retainer={form.retainerAmount}
            disabled={submitting}
            onChange={updateField}
          />
        </section>

        {/* Internal notes */}
        <section className="space-y-2">
          <Textarea
            label="Internal notes (optional)"
            placeholder="Add internal notes for your team…"
            value={form.internalNotes}
            onChange={(value) => updateField('internalNotes', value)}
            rows={3}
            disabled={submitting}
          />
        </section>

        {/* Send to client */}
        <section className="space-y-3 border-t border-card-border pt-4">
          <Switch
            label="Send to client after creation"
            value={form.sendToClient}
            onChange={(value) => updateField('sendToClient', value)}
            disabled={submitting}
          />
          {form.sendToClient && (
            <div className="space-y-3 pl-1">
              <Input
                label="Recipient email"
                type="email"
                placeholder="client@example.com"
                value={form.recipientEmail}
                onChange={(value) => updateField('recipientEmail', value)}
                disabled={submitting}
                error={errors.recipientEmail}
              />
              <Textarea
                label="Message preview"
                placeholder="Please review the attached engagement agreement…"
                value={form.messagePreview}
                onChange={(value) => updateField('messagePreview', value)}
                rows={3}
                disabled={submitting}
              />
            </div>
          )}
        </section>
      </DialogBody>
      <DialogFooter>
        <span className="mr-auto self-center text-xs text-input-placeholder hidden sm:inline">
          You can edit the engagement before sending.
        </span>
        <Button variant="secondary" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting} icon={Plus}>
          {submitting ? 'Creating…' : (form.sendToClient ? 'Create and send' : 'Create engagement')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

const SelectedIntakeCard: FunctionComponent<{
  intake: IntakeListItem;
  onClear: () => void;
}> = ({ intake, onClear }) => {
  const name = intake.metadata?.name?.trim() || 'Anonymous lead';
  const email = intake.metadata?.email?.trim() || '';
  const subject = resolveIntakeTitle(intake.metadata, '');
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-card-border bg-surface-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-input-text">{name}</p>
        <p className="truncate text-sm text-input-placeholder">{email}</p>
        {subject && <p className="mt-1 truncate text-xs text-input-placeholder">{subject}</p>}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 text-xs font-medium text-accent hover:text-accent/80 focus:outline-none focus-visible:underline"
      >
        Change
      </button>
    </div>
  );
};

const FeeAmountInput: FunctionComponent<{
  structure: FeeStructure;
  flatFee: string;
  hourly: string;
  contingency: string;
  retainer: string;
  disabled: boolean;
  onChange: <K extends keyof CreateForm>(field: K, value: CreateForm[K]) => void;
}> = ({ structure, flatFee, hourly, contingency, retainer, disabled, onChange }) => {
  if (structure === 'flat') {
    return (
      <Input
        label="Flat fee amount"
        placeholder="$0"
        type="number"
        value={flatFee}
        onChange={(value) => onChange('flatFeeAmount', value)}
        disabled={disabled}
      />
    );
  }
  if (structure === 'hourly') {
    return (
      <Input
        label="Hourly rate"
        placeholder="$0 / hour"
        type="number"
        value={hourly}
        onChange={(value) => onChange('hourlyRate', value)}
        disabled={disabled}
      />
    );
  }
  if (structure === 'contingency') {
    return (
      <Input
        label="Contingency rate"
        placeholder="0%"
        type="number"
        value={contingency}
        onChange={(value) => onChange('contingencyRate', value)}
        disabled={disabled}
      />
    );
  }
  return (
    <Input
      label="Retainer amount"
      placeholder="$0"
      type="number"
      value={retainer}
      onChange={(value) => onChange('retainerAmount', value)}
      disabled={disabled}
    />
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

type EngagementsPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  activeStatusFilter?: string | null;
};

export const EngagementsPage: FunctionComponent<EngagementsPageProps> = ({
  practiceId,
  basePath = '/practice/engagements',
  conversationsBasePath,
  practiceName,
  practiceLogo,
  activeStatusFilter = null,
}) => {
  const location = useLocation();

  // Routing
  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedEngagementId = pathSegments[0] ? decodeURIComponent(pathSegments[0]) : null;
  const detailMode: 'view' | 'edit' = pathSegments[1] === 'edit' ? 'edit' : 'view';

  // Tab state — initialized from sidebar prop, page-internal tabs take over.
  const sidebarTab = normalizeStatusFilter(activeStatusFilter);
  const [activeTab, setActiveTab] = useState<StatusFilter>(sidebarTab);
  useEffect(() => {
    setActiveTab(sidebarTab);
  }, [sidebarTab]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Create dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const {
    items: engagements,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
  } = usePaginatedList<EngagementListItem>({
    fetchPage: async (page, signal) => {
      if (!practiceId) return { items: [], hasMore: false };
      const result = await listEngagements(
        practiceId,
        {
          page,
          limit: PAGE_SIZE,
          status: activeTab === 'all' ? undefined : [activeTab],
        },
        { signal },
      );
      return {
        items: result.items,
        hasMore: result.total > page * PAGE_SIZE,
      };
    },
    deps: [practiceId, activeTab, refreshCounter],
  });

  const filteredEngagements = useMemo(
    () => engagements.filter((item) => matchesSearch(item, searchQuery)),
    [engagements, searchQuery],
  );

  const handleSelectEngagement = useCallback((engagement: EngagementListItem) => {
    location.route(`${basePath}/${encodeURIComponent(engagement.id)}`);
  }, [basePath, location]);

  const handleBack = useCallback(() => {
    location.route(basePath);
  }, [basePath, location]);

  const handleOpenCreate = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setIsCreateDialogOpen(false);
  }, []);

  const handleEngagementCreated = useCallback((engagementId: string) => {
    setIsCreateDialogOpen(false);
    setRefreshCounter((c) => c + 1);
    location.route(`${basePath}/${encodeURIComponent(engagementId)}`);
  }, [basePath, location]);

  const handleActionComplete = useCallback(() => {
    setRefreshCounter((c) => c + 1);
    handleBack();
  }, [handleBack]);

  if (selectedEngagementId) {
    return (
      <EngagementDetailPage
        practiceId={practiceId}
        engagementId={selectedEngagementId}
        conversationsBasePath={conversationsBasePath}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onBack={handleBack}
        onActionComplete={handleActionComplete}
        mode={detailMode}
        basePath={basePath}
      />
    );
  }

  // ── Table column + row construction ────────────────────────────────────────
  const headerCellClass = 'text-xs font-semibold uppercase tracking-wide text-input-placeholder';
  const columns: DataTableColumn[] = [
    { id: 'client', label: 'Client', isPrimary: true, headerClassName: headerCellClass },
    { id: 'matter', label: 'Matter', headerClassName: headerCellClass },
    { id: 'billing', label: 'Billing', hideAt: 'md', headerClassName: headerCellClass },
    { id: 'status', label: 'Status', headerClassName: headerCellClass },
    { id: 'sent', label: 'Sent', hideAt: 'lg', headerClassName: headerCellClass, align: 'right' },
    { id: 'retainer', label: 'Retainer', headerClassName: headerCellClass, align: 'right' },
  ];

  const rows: DataTableRow[] = filteredEngagements.map((item) => ({
    id: item.id,
    onClick: () => handleSelectEngagement(item),
    cells: {
      client: <span className="truncate font-medium text-input-text">{item.client_name || 'Unknown Client'}</span>,
      matter: <span className="truncate text-input-placeholder">{getMatterLabel(item)}</span>,
      billing: <span className="text-input-placeholder">{getBillingLabel(item.proposal_data?.fees)}</span>,
      status: <StatusPill status={item.status} />,
      sent: <span className="text-input-placeholder tabular-nums">{item.sent_at ? formatRelativeTime(item.sent_at) : '—'}</span>,
      retainer: <span className="font-medium text-input-text tabular-nums">{getRetainerLabel(item.proposal_data?.fees)}</span>,
    },
  }));

  const tabItems: TabItem[] = STATUS_FILTERS.map((f) => ({ id: f.id, label: f.label }));

  const showEmpty = !isLoading && !error && filteredEngagements.length === 0 && !hasMore;
  const emptyMessage = searchQuery
    ? `No engagements match "${searchQuery}".`
    : activeTab === 'all'
      ? 'When you accept an intake and begin drafting an engagement letter, it will appear here.'
      : `No ${activeTab} engagements yet.`;

  return (
    <div className="flex h-full flex-col min-h-0 bg-surface-workspace">
      {/* Desktop header */}
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-card-border px-6 py-5">
        <h1 className="text-xl font-semibold text-input-text">Engagements</h1>
        <div className="flex items-center gap-3">
          <div className="w-72">
            <Input
              type="search"
              placeholder="Search engagements…"
              value={searchInput}
              onChange={setSearchInput}
              icon={Search}
              iconClassName="h-4 w-4"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleOpenCreate}
            disabled={!practiceId}
            icon={Plus}
          >
            New Engagement
          </Button>
        </div>
      </header>

      {/* Tab row (desktop + mobile) */}
      <div className="border-b border-card-border bg-surface-workspace">
        <Tabs
          items={tabItems}
          activeId={activeTab}
          onChange={(id) => setActiveTab(normalizeStatusFilter(id))}
          className="px-2 md:px-4"
        />
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 py-3 border-b border-card-border">
        <Input
          type="search"
          placeholder="Search engagements…"
          value={searchInput}
          onChange={setSearchInput}
          icon={Search}
          iconClassName="h-4 w-4"
        />
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : showEmpty ? (
          <WorkspacePlaceholderState
            icon={Briefcase}
            title={searchQuery ? 'No results' : 'No engagements yet'}
            description={emptyMessage}
            primaryAction={searchQuery ? undefined : { label: 'New Engagement', onClick: handleOpenCreate, icon: Plus, disabled: !practiceId }}
            className="p-8"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block px-6 py-4">
              <DataTable
                columns={columns}
                rows={rows}
                loading={isLoading && rows.length === 0}
                density="compact"
                stickyHeader
                rowClassName="transition-colors duration-150 hover:!bg-surface-card-hover"
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            </div>

            {/* Mobile cards */}
            <div className="md:hidden">
              {isLoading && filteredEngagements.length === 0 ? (
                <div className="flex flex-col gap-3 px-4 py-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="h-32 rounded-xl bg-surface-card animate-pulse" />
                  ))}
                </div>
              ) : (
                <InfiniteScroll
                  className="gap-3 px-4 py-3"
                  hasMore={hasMore}
                  loading={isLoadingMore}
                  onLoadMore={loadMore}
                >
                  {filteredEngagements.map((item) => (
                    <EngagementMobileCard
                      key={item.id}
                      item={item}
                      onClick={() => handleSelectEngagement(item)}
                    />
                  ))}
                </InfiniteScroll>
              )}
            </div>
          </>
        )}

        {/* Mobile create FAB */}
        <div className="md:hidden fixed bottom-6 right-6">
          <Button
            variant="primary"
            onClick={handleOpenCreate}
            disabled={!practiceId}
            icon={Plus}
            className="shadow-lg"
          >
            New
          </Button>
        </div>
      </div>

      {practiceId && (
        <CreateEngagementDialog
          practiceId={practiceId}
          isOpen={isCreateDialogOpen}
          onClose={handleCloseCreate}
          onCreated={handleEngagementCreated}
        />
      )}
    </div>
  );
};

export default EngagementsPage;
