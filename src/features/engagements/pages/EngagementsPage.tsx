import { FunctionComponent, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Briefcase, Plus, Search } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input, Textarea, Combobox, type ComboboxOption } from '@/shared/ui/input';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import { Dialog, DialogBody, DialogFooter, useDialogFormReset } from '@/shared/ui/dialog';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { InfiniteScroll } from '@/shared/ui/layout/InfiniteScroll';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { getPracticeIntake, listIntakes, type IntakeListItem, type PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';

import { createEngagementContract, listEngagements } from '../api/engagementsApi';
import type {
  EngagementListItem,
  EngagementStatus,
  ProposalFees,
} from '../types/engagement';
import {
  buildDeterministicContractBody,
  buildEngagementDraftFormFromIntake,
  buildProposalDataFromDraft,
  EMPTY_ENGAGEMENT_DRAFT_FORM,
  type EngagementDraftForm,
} from '../utils/engagementDraft';
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

const resolveQueryValue = (value: string | string[] | null | undefined): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
      return { label: 'Sent', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' };
    default:
      return { label: '—', className: 'bg-surface-overlay/60 text-input-placeholder ring-line-subtle' };
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

const BILLING_TYPE_OPTIONS: ComboboxOption[] = [
  { value: 'fixed', label: 'Fixed fee' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'pro_bono', label: 'Pro bono' },
];

const RISK_STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'clear', label: 'Clear' },
  { value: 'review_required', label: 'Review required' },
  { value: 'conflicted', label: 'Conflicted' },
  { value: 'insufficient_data', label: 'Insufficient data' },
];

const JURISDICTION_STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'supported', label: 'Supported' },
  { value: 'unsupported', label: 'Unsupported' },
];

type CreateErrors = Partial<Record<keyof EngagementDraftForm, string>>;

const validateForm = (form: EngagementDraftForm): CreateErrors => {
  const errors: CreateErrors = {};
  if (!form.intakeId) errors.intakeId = 'Accepted intake is required';
  if (!form.matterSummary.trim()) errors.matterSummary = 'Matter summary is required';
  if (!form.scopeSummary.trim()) errors.scopeSummary = 'Scope summary is required';
  if (!form.contractBody.trim()) errors.contractBody = 'Contract body is required before creating an engagement';
  return errors;
};

interface CreateEngagementDialogProps {
  practiceId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (engagementId: string) => void;
  initialIntakeId?: string | null;
}

const CreateEngagementDialog: FunctionComponent<CreateEngagementDialogProps> = ({
  practiceId,
  isOpen,
  onClose,
  onCreated,
  initialIntakeId = null,
}) => {
  const [form, setForm] = useState<EngagementDraftForm>(EMPTY_ENGAGEMENT_DRAFT_FORM);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [intakes, setIntakes] = useState<IntakeListItem[]>([]);
  const [selectedIntakeDetail, setSelectedIntakeDetail] = useState<PracticeIntakeDetail | null>(null);
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(false);
  const [isLoadingIntakeDetail, setIsLoadingIntakeDetail] = useState(false);
  const [intakesError, setIntakesError] = useState<string | null>(null);

  useDialogFormReset({
    isOpen,
    trigger: 'on-open',
    reason: 'Each open starts a fresh draft; clears any stale submit error or in-flight flag from a previously-interrupted attempt.',
    reset: () => {
      setForm({ ...EMPTY_ENGAGEMENT_DRAFT_FORM, intakeId: initialIntakeId ?? '' });
      setErrors({});
      setHasAttemptedSubmit(false);
      setSubmitting(false);
      setSubmitError(null);
      setSelectedIntakeDetail(null);
    },
  });

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
        if (initialIntakeId) {
          const selected = result.intakes.find((intake) => intake.uuid === initialIntakeId);
          if (selected) {
            setForm((prev) => buildEngagementDraftFormFromIntake(selected, prev));
          }
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setIntakesError(error instanceof Error ? error.message : 'Failed to load clients');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingIntakes(false);
      });

    return () => controller.abort();
  }, [initialIntakeId, isOpen, practiceId]);

  const selectedIntake = useMemo(
    () => selectedIntakeDetail ?? intakes.find((intake) => intake.uuid === form.intakeId) ?? null,
    [intakes, form.intakeId, selectedIntakeDetail],
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

  useEffect(() => {
    if (!isOpen || !practiceId || !form.intakeId) {
      setSelectedIntakeDetail(null);
      return;
    }
    const controller = new AbortController();
    setIsLoadingIntakeDetail(true);
    getPracticeIntake(practiceId, form.intakeId, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        setSelectedIntakeDetail(detail);
        setForm((prev) => buildEngagementDraftFormFromIntake(detail, prev));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSubmitError(error instanceof Error ? error.message : 'Failed to load intake details');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingIntakeDetail(false);
      });
    return () => controller.abort();
  }, [form.intakeId, isOpen, practiceId]);

  const updateField = useCallback(<K extends keyof EngagementDraftForm>(field: K, value: EngagementDraftForm[K]) => {
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

  const handleIntakeChange = useCallback((value: string) => {
    const intake = intakes.find((entry) => entry.uuid === value);
    setSelectedIntakeDetail(null);
    setForm((prev) => (
      intake
        ? buildEngagementDraftFormFromIntake(intake, { ...prev, intakeId: value, contractBody: '' })
        : { ...prev, intakeId: value }
    ));
  }, [intakes]);

  const refreshContractBody = useCallback(() => {
    setForm((prev) => ({ ...prev, contractBody: buildDeterministicContractBody(prev) }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    setSubmitError(null);
    const validation = validateForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const proposalData = buildProposalDataFromDraft(form);
      const created = await createEngagementContract(practiceId, {
        intake_id: form.intakeId,
        contract_body: form.contractBody.trim(),
        engagement_notes: form.engagementNotes.trim() || undefined,
        proposal_data: proposalData,
      });

      onCreated(created.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create engagement');
    } finally {
      setSubmitting(false);
    }
  }, [form, practiceId, onCreated]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create engagement"
      description="Draft an engagement contract from an accepted intake before sending it to the client."
      disableBackdropClick={submitting}
      contentClassName="max-w-4xl"
    >
      <DialogBody className="space-y-5">
        {submitError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {submitError}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Source intake</h3>
          {selectedIntake ? (
            <SelectedIntakeCard
              intake={selectedIntake}
              detailLoading={isLoadingIntakeDetail}
              onClear={() => updateField('intakeId', '')}
            />
          ) : (
            <>
              <Combobox
                placeholder={isLoadingIntakes ? 'Loading accepted intakes…' : 'Search accepted intakes…'}
                options={intakeOptions}
                value={form.intakeId}
                onChange={handleIntakeChange}
                disabled={submitting || isLoadingIntakes}
                searchable
              />
              {errors.intakeId && <p className="mt-1 text-xs text-rose-400">{errors.intakeId}</p>}
            </>
          )}
          {intakesError && <p className="text-sm text-rose-400">{intakesError}</p>}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Input
            label="Client name"
            value={form.clientName}
            onChange={(value) => updateField('clientName', value)}
            disabled={submitting}
          />
          <Input
            label="Practice area"
            value={form.practiceArea}
            onChange={(value) => updateField('practiceArea', value)}
            disabled={submitting}
          />
          <Input
            label="Matter summary"
            value={form.matterSummary}
            onChange={(value) => updateField('matterSummary', value)}
            disabled={submitting}
            error={errors.matterSummary}
          />
          <Input
            label="Location summary"
            value={form.locationSummary}
            onChange={(value) => updateField('locationSummary', value)}
            disabled={submitting}
          />
        </section>

        <section className="space-y-3">
          <Textarea
            label="Goals summary"
            value={form.goalsSummary}
            onChange={(value) => updateField('goalsSummary', value)}
            rows={2}
            disabled={submitting}
          />
          <Textarea
            label="Scope summary"
            value={form.scopeSummary}
            onChange={(value) => updateField('scopeSummary', value)}
            rows={3}
            disabled={submitting}
            error={errors.scopeSummary}
          />
          <Textarea
            label="Included services (one per line)"
            value={form.includedServices}
            onChange={(value) => updateField('includedServices', value)}
            rows={3}
            disabled={submitting}
          />
          <Textarea
            label="Excluded services (one per line)"
            value={form.excludedServices}
            onChange={(value) => updateField('excludedServices', value)}
            rows={3}
            disabled={submitting}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Textarea
              label="Client identity notes"
              value={form.clientIdentityNotes}
              onChange={(value) => updateField('clientIdentityNotes', value)}
              rows={2}
              disabled={submitting}
            />
            <Textarea
              label="Jurisdiction notes"
              value={form.jurisdictionNotes}
              onChange={(value) => updateField('jurisdictionNotes', value)}
              rows={2}
              disabled={submitting}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Fees</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Combobox label="Billing type" options={BILLING_TYPE_OPTIONS} value={form.billingType} onChange={(value) => updateField('billingType', value)} disabled={submitting} />
            <Input label="Fixed fee amount" type="number" value={form.fixedFeeAmount} onChange={(value) => updateField('fixedFeeAmount', value)} disabled={submitting} />
            <Input label="Retainer amount" type="number" value={form.retainerAmount} onChange={(value) => updateField('retainerAmount', value)} disabled={submitting} />
            <Input label="Attorney hourly rate" type="number" value={form.hourlyRateAttorney} onChange={(value) => updateField('hourlyRateAttorney', value)} disabled={submitting} />
            <Input label="Admin hourly rate" type="number" value={form.hourlyRateAdmin} onChange={(value) => updateField('hourlyRateAdmin', value)} disabled={submitting} />
            <Input label="Contingency percentage" type="number" value={form.contingencyPercentage} onChange={(value) => updateField('contingencyPercentage', value)} disabled={submitting} />
          </div>
          <Input label="Payment frequency" value={form.paymentFrequency} onChange={(value) => updateField('paymentFrequency', value)} disabled={submitting} />
          <Textarea label="Fee notes" value={form.feeNotes} onChange={(value) => updateField('feeNotes', value)} rows={2} disabled={submitting} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Risk review</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Combobox label="Conflict status" options={RISK_STATUS_OPTIONS} value={form.conflictStatus} onChange={(value) => updateField('conflictStatus', value as EngagementDraftForm['conflictStatus'])} disabled={submitting} />
            <Combobox label="Jurisdiction status" options={JURISDICTION_STATUS_OPTIONS} value={form.jurisdictionStatus} onChange={(value) => updateField('jurisdictionStatus', value as EngagementDraftForm['jurisdictionStatus'])} disabled={submitting} />
          </div>
          <Textarea label="Risk notes (one per line)" value={form.riskNotes} onChange={(value) => updateField('riskNotes', value)} rows={2} disabled={submitting} />
          <Textarea label="Open questions (one per line)" value={form.openQuestions} onChange={(value) => updateField('openQuestions', value)} rows={2} disabled={submitting} />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Urgency" value={form.urgency} onChange={(value) => updateField('urgency', value)} disabled={submitting} />
          <Input label="Court date" type="date" value={form.courtDate} onChange={(value) => updateField('courtDate', value)} disabled={submitting} />
          <Input label="Desired outcome" value={form.desiredOutcome} onChange={(value) => updateField('desiredOutcome', value)} disabled={submitting} />
          <Input label="Opposing party" value={form.opposingParty} onChange={(value) => updateField('opposingParty', value)} disabled={submitting} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">Contract body</h3>
            <Button type="button" variant="secondary" size="sm" onClick={refreshContractBody} disabled={submitting}>
              Regenerate draft
            </Button>
          </div>
          <Textarea
            label="Contract body"
            value={form.contractBody}
            onChange={(value) => updateField('contractBody', value)}
            rows={12}
            disabled={submitting}
            error={errors.contractBody}
          />
          <Textarea
            label="Engagement notes"
            value={form.engagementNotes}
            onChange={(value) => updateField('engagementNotes', value)}
            rows={3}
            disabled={submitting}
          />
        </section>
      </DialogBody>
      <DialogFooter>
        <span className="mr-auto self-center text-xs text-input-placeholder hidden sm:inline">
          Create the draft first, then review and send from the detail page.
        </span>
        <Button variant="secondary" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting} icon={Plus}>
          {submitting ? 'Creating…' : 'Create engagement'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
};

const SelectedIntakeCard: FunctionComponent<{
  intake: IntakeListItem | PracticeIntakeDetail;
  detailLoading?: boolean;
  onClear: () => void;
}> = ({ intake, detailLoading = false, onClear }) => {
  const name = intake.metadata?.name?.trim() || 'Anonymous lead';
  const email = intake.metadata?.email?.trim() || '';
  const subject = resolveIntakeTitle(intake.metadata, '');
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-card-border bg-surface-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-input-text">{name}</p>
        <p className="truncate text-sm text-input-placeholder">{email}</p>
        {subject && <p className="mt-1 truncate text-xs text-input-placeholder">{subject}</p>}
        {detailLoading ? <p className="mt-1 text-xs text-input-placeholder">Loading intake details…</p> : null}
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
  const queryCreate = resolveQueryValue(location.query?.create);
  const queryIntakeId = resolveQueryValue(location.query?.intakeId);
  const shouldOpenCreateFromQuery = !selectedEngagementId && (queryCreate === '1' || Boolean(queryIntakeId));

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

  useEffect(() => {
    if (shouldOpenCreateFromQuery) {
      setIsCreateDialogOpen(true);
    }
  }, [shouldOpenCreateFromQuery]);

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
    if (shouldOpenCreateFromQuery) {
      location.route(basePath, true);
    }
  }, [basePath, location, shouldOpenCreateFromQuery]);

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
      <header className="hidden md:flex items-center justify-between gap-4 border-b border-line-subtle px-6 py-5">
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
      <div className="border-b border-line-subtle bg-surface-workspace">
        <Tabs
          items={tabItems}
          activeId={activeTab}
          onChange={(id) => setActiveTab(normalizeStatusFilter(id))}
          className="px-2 md:px-4"
        />
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-4 py-3 border-b border-line-subtle">
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
          initialIntakeId={queryIntakeId}
        />
      )}
    </div>
  );
};

export default EngagementsPage;
