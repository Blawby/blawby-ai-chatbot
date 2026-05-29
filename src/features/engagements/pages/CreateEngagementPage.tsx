import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Send, Sparkles } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input, Textarea, Combobox, type ComboboxOption } from '@/shared/ui/input';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
import { RadioGroupWithDescriptions } from '@/shared/ui/input/RadioGroupWithDescriptions';
import type { DescribedRadioOption } from '@/shared/ui/input/RadioGroupWithDescriptions';
import { EditorShell } from '@/shared/ui/layout';
import { FormGrid } from '@/shared/ui/layout/FormGrid';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { asMajor } from '@/shared/utils/money';
import type { MajorAmount } from '@/shared/utils/money';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { getPracticeIntake, listIntakes } from '@/features/intake/api/intakesApi';
import type { IntakeListItem, PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { apiClient } from '@/shared/lib/apiClient';
import { generateEngagement } from '@/config/urls';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';

import { createEngagementContract } from '../api/engagementsApi';
import {
  buildDeterministicContractBody,
  buildEngagementDraftFormFromIntake,
  buildProposalDataFromDraft,
  EMPTY_ENGAGEMENT_DRAFT_FORM,
  type EngagementDraftForm,
} from '../utils/engagementDraft';

// ── Constants ────────────────────────────────────────────────────────────────

const BILLING_OPTIONS: DescribedRadioOption[] = [
  { value: 'hourly',      label: 'Hourly',      description: 'Bill based on time spent on the engagement' },
  { value: 'fixed',       label: 'Fixed fee',   description: 'One fixed fee for the entire engagement' },
  { value: 'retainer',    label: 'Retainer',    description: 'Upfront retainer collected before work begins' },
  { value: 'contingency', label: 'Contingency', description: 'Percentage fee based on the outcome' },
  { value: 'pro_bono',    label: 'Pro bono',    description: 'Services provided without charge' },
];

const URGENCY_OPTIONS: ComboboxOption[] = [
  { value: '',               label: 'Not specified' },
  { value: 'routine',        label: 'Routine' },
  { value: 'time_sensitive', label: 'Time sensitive' },
  { value: 'emergency',      label: 'Emergency' },
];

const CONFLICT_STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'unknown',           label: 'Unknown' },
  { value: 'clear',             label: 'Clear' },
  { value: 'review_required',   label: 'Review required' },
  { value: 'conflicted',        label: 'Conflicted' },
  { value: 'insufficient_data', label: 'Insufficient data' },
];

const JURISDICTION_STATUS_OPTIONS: ComboboxOption[] = [
  { value: 'unknown',     label: 'Unknown' },
  { value: 'supported',   label: 'Supported' },
  { value: 'unsupported', label: 'Unsupported' },
];

const PAYMENT_FREQUENCY_OPTIONS: ComboboxOption[] = [
  { value: '',              label: 'Not specified' },
  { value: 'one_time',      label: 'One time' },
  { value: 'monthly',       label: 'Monthly' },
  { value: 'quarterly',     label: 'Quarterly' },
  { value: 'on_completion', label: 'On completion' },
];

// ── Engagement template types (mirrors EngagementTemplatesPage.tsx) ──────────

type EngagementLetterTemplate = {
  id: string;
  name: string;
  practiceArea: string;
  feeType: 'hourly' | 'flat' | 'contingency' | 'pro_bono';
  hourlyRateCents: number | null;
  flatFeeCents: number | null;
  contingencyPct: number | null;
  retainerCents: number | null;
  scopeTemplate: string;
  body: string;
};

type IntakeEnrichedData = {
  practice_area: string | null;
  ai_matter_description: string | null;
  ai_scope_suggestion: string | null;
  [key: string]: unknown;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

const asNullableNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function normalizeTemplate(value: unknown, index: number): EngagementLetterTemplate {
  const raw = asRecord(value);
  const feeType = raw.feeType;
  return {
    id: typeof raw.id === 'string' ? raw.id : `template-${index}`,
    name: typeof raw.name === 'string' ? raw.name : '',
    practiceArea: typeof raw.practiceArea === 'string' ? raw.practiceArea : '',
    feeType: feeType === 'hourly' || feeType === 'flat' || feeType === 'contingency' || feeType === 'pro_bono'
      ? feeType
      : 'hourly',
    hourlyRateCents: asNullableNumber(raw.hourlyRateCents),
    flatFeeCents: asNullableNumber(raw.flatFeeCents),
    contingencyPct: asNullableNumber(raw.contingencyPct),
    retainerCents: asNullableNumber(raw.retainerCents),
    scopeTemplate: typeof raw.scopeTemplate === 'string' ? raw.scopeTemplate : '',
    body: typeof raw.body === 'string' ? raw.body : '',
  };
}

function parseEngagementTemplates(practiceDetails: unknown): EngagementLetterTemplate[] {
  if (!practiceDetails || typeof practiceDetails !== 'object') return [];
  const meta = asRecord((practiceDetails as Record<string, unknown>).metadata);
  const raw = meta.engagementLetterTemplates;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(normalizeTemplate) : []; } catch { return []; }
  }
  return Array.isArray(raw) ? raw.map(normalizeTemplate) : [];
}

function parseEnrichedData(metadata: Record<string, unknown>): IntakeEnrichedData | null {
  const cf = asRecord(metadata.custom_fields ?? metadata.customFields);
  const raw = cf._enriched_data;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as IntakeEnrichedData : null;
  } catch { return null; }
}

function autoSelectTemplate(
  templates: EngagementLetterTemplate[],
  practiceArea: string | null,
): EngagementLetterTemplate | null {
  if (!templates.length) return null;
  if (!practiceArea) return templates[0];
  const normalized = practiceArea.toLowerCase().trim();
  return (
    templates.find((t) => t.practiceArea.toLowerCase().trim() === normalized) ??
    templates.find((t) =>
      normalized.includes(t.practiceArea.toLowerCase().trim()) ||
      t.practiceArea.toLowerCase().trim().includes(normalized),
    ) ??
    templates[0]
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof EngagementDraftForm, string>>;

const validateForm = (form: EngagementDraftForm): FormErrors => {
  const errors: FormErrors = {};
  if (!form.intakeId) errors.intakeId = 'An accepted intake is required';
  if (!form.matterSummary.trim()) errors.matterSummary = 'Matter summary is required';
  if (!form.scopeSummary.trim()) errors.scopeSummary = 'Scope summary is required';
  if (!form.contractBody.trim()) errors.contractBody = 'Contract body is required';
  return errors;
};

// ── Letter preview ───────────────────────────────────────────────────────────

const billingSummaryLine = (form: EngagementDraftForm): string => {
  switch (form.billingType) {
    case 'hourly': {
      const parts: string[] = [];
      if (form.hourlyRateAttorney) parts.push(`Attorney ${formatCurrency(Number(form.hourlyRateAttorney))}/hr`);
      if (form.hourlyRateAdmin) parts.push(`Admin ${formatCurrency(Number(form.hourlyRateAdmin))}/hr`);
      return parts.join(' · ') || 'Hourly';
    }
    case 'fixed':
      return form.fixedFeeAmount ? `Fixed fee: ${formatCurrency(Number(form.fixedFeeAmount))}` : 'Fixed fee';
    case 'retainer':
      return form.retainerAmount ? `Retainer: ${formatCurrency(Number(form.retainerAmount))}` : 'Retainer';
    case 'contingency':
      return form.contingencyPercentage ? `Contingency: ${form.contingencyPercentage}%` : 'Contingency';
    case 'pro_bono':
      return 'Pro bono — no charge';
    default:
      return form.billingType || '—';
  }
};

const EngagementLetterPreview: FunctionComponent<{
  form: EngagementDraftForm;
  practiceName?: string;
}> = ({ form, practiceName }) => {
  const clientName = form.clientName.trim() || 'Client Name';
  const matterSummary = form.matterSummary.trim() || 'Matter description';
  const contractBody = form.contractBody.trim();
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="rounded-r-md border border-card-border bg-card text-sm leading-relaxed text-ink shadow-sm overflow-hidden">
      {/* Letterhead */}
      <div className="border-b border-line-subtle bg-card/20 px-6 py-4 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-dim-2">
          {practiceName || 'Your Practice'}
        </p>
        <p className="text-xs text-dim-2">{today}</p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Addressee */}
        <div className="space-y-0.5">
          <p className="font-semibold text-ink">{clientName}</p>
          <p className="text-xs text-dim-2">Re: {matterSummary}</p>
        </div>

        {/* Body */}
        <div className="border-t border-line-subtle pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-dim-2">
            Engagement Agreement
          </p>
          {contractBody ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed">{contractBody}</p>
          ) : (
            <p className="text-xs italic text-dim-2">
              Complete the form to generate the engagement letter preview.
            </p>
          )}
        </div>

        {/* Fee summary */}
        {form.billingType ? (
          <div className="rounded-lg border border-line-subtle bg-card/30 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-dim-2">Fee Summary</p>
            <p className="text-xs">{billingSummaryLine(form)}</p>
            {form.feeNotes.trim() && (
              <p className="text-xs text-dim-2">{form.feeNotes.trim()}</p>
            )}
          </div>
        ) : null}

        {/* Signature block */}
        <div className="border-t border-line-subtle pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="font-medium text-ink">Client</p>
              <div className="h-7 border-b border-dashed border-line-subtle" />
              <p className="text-dim-2">Date ___________</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-ink">Attorney</p>
              <div className="h-7 border-b border-dashed border-line-subtle" />
              <p className="text-dim-2">Date ___________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Selected intake card ─────────────────────────────────────────────────────

const SelectedIntakeCard: FunctionComponent<{
  intake: IntakeListItem | PracticeIntakeDetail;
  detailLoading?: boolean;
  onClear: () => void;
}> = ({ intake, detailLoading = false, onClear }) => {
  const name = intake.metadata?.name?.trim() || 'Anonymous lead';
  const email = intake.metadata?.email?.trim() || '';
  const subject = resolveIntakeTitle(intake.metadata, '');
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-card-border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{name}</p>
        {email && <p className="truncate text-sm text-dim-2">{email}</p>}
        {subject && <p className="mt-0.5 truncate text-xs text-dim-2">{subject}</p>}
        {detailLoading && (
          <div className="mt-1">
            <LoadingSpinner size="sm" ariaLabel="Loading intake details" className="text-dim-2" />
          </div>
        )}
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

// ── Section heading ──────────────────────────────────────────────────────────

const SectionHeading: FunctionComponent<{ title: string }> = ({ title }) => (
  <h3 className="border-b border-line-subtle pb-2 text-xs font-semibold uppercase tracking-widest text-dim-2">
    {title}
  </h3>
);

// ── Main page ────────────────────────────────────────────────────────────────

type CreateEngagementPageProps = {
  practiceId: string | null;
  initialIntakeId?: string | null;
  practiceName?: string;
  onCreated: (engagementId: string) => void;
  onCancel: () => void;
};

export const CreateEngagementPage: FunctionComponent<CreateEngagementPageProps> = ({
  practiceId,
  initialIntakeId = null,
  practiceName,
  onCreated,
  onCancel,
}) => {
  const { showError } = useToastContext();

  const [form, setForm] = useState<EngagementDraftForm>({
    ...EMPTY_ENGAGEMENT_DRAFT_FORM,
    intakeId: initialIntakeId ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [intakes, setIntakes] = useState<IntakeListItem[]>([]);
  const [selectedIntakeDetail, setSelectedIntakeDetail] = useState<PracticeIntakeDetail | null>(null);
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(false);
  const [isLoadingIntakeDetail, setIsLoadingIntakeDetail] = useState(false);
  const [intakesError, setIntakesError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isGeneratingBody, setIsGeneratingBody] = useState(false);
  const isGeneratingBodyRef = useRef(false);
  const generationTokenRef = useRef(0);
  const activeGenerationRef = useRef<{ token: number; intakeId: string } | null>(null);
  const selectedIntakeIdRef = useRef(initialIntakeId ?? '');
  const lastGeneratedIntakeIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  selectedIntakeIdRef.current = form.intakeId;
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const {
    details: practiceDetails,
    hasDetails: hasPracticeDetails,
    fetchDetails: fetchPracticeDetails,
  } = usePracticeDetails(practiceId, null, false);

  useEffect(() => {
    if (!practiceId || hasPracticeDetails) return;
    fetchPracticeDetails().catch(() => undefined);
  }, [practiceId, hasPracticeDetails, fetchPracticeDetails]);

  useEffect(() => {
    if (!practiceId) return;
    const controller = new AbortController();
    setIsLoadingIntakes(true);
    setIntakesError(null);

    listIntakes(practiceId, { page: 1, limit: 100, triage_status: 'accepted' }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setIntakes(result.intakes);
        if (initialIntakeId) {
          const match = result.intakes.find((i) => i.uuid === initialIntakeId);
          if (match) setForm((prev) => buildEngagementDraftFormFromIntake(match, prev));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIntakesError(err instanceof Error ? err.message : 'Failed to load intakes');
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingIntakes(false); });

    return () => controller.abort();
  }, [practiceId, initialIntakeId]);

  const selectedIntake = useMemo(
    () => selectedIntakeDetail ?? intakes.find((i) => i.uuid === form.intakeId) ?? null,
    [intakes, form.intakeId, selectedIntakeDetail],
  );

  const intakeOptions = useMemo<ComboboxOption[]>(
    () => intakes.map((intake) => ({
      value: intake.uuid,
      label: intake.metadata?.name?.trim() || 'Anonymous lead',
      description: resolveIntakeTitle(intake.metadata, '') || intake.metadata?.email || undefined,
      meta: formatRelativeTime(intake.created_at),
    })),
    [intakes],
  );

  const updateField = useCallback(<K extends keyof EngagementDraftForm>(
    field: K,
    value: EngagementDraftForm[K],
  ) => {
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
    const intake = intakes.find((i) => i.uuid === value);
    generationTokenRef.current += 1;
    activeGenerationRef.current = null;
    isGeneratingBodyRef.current = false;
    setIsGeneratingBody(false);
    setSelectedIntakeDetail(null);
    setForm((prev) =>
      intake
        ? buildEngagementDraftFormFromIntake(intake, { ...prev, intakeId: value, contractBody: '' })
        : { ...prev, intakeId: value },
    );
  }, [intakes]);

  const engagementTemplates = useMemo(() => parseEngagementTemplates(practiceDetails), [practiceDetails]);

  const templateOptions = useMemo<ComboboxOption[]>(
    () => engagementTemplates.map((t) => ({
      value: t.id,
      label: t.name,
      description: t.practiceArea || undefined,
    })),
    [engagementTemplates],
  );

  const selectedTemplate = useMemo(
    () => engagementTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [engagementTemplates, selectedTemplateId],
  );

  const generateFromTemplate = useCallback(async (
    template: EngagementLetterTemplate,
    intake: PracticeIntakeDetail,
  ): Promise<boolean> => {
    if (isGeneratingBodyRef.current) return false;
    const intakeId = intake.uuid;
    const localGenerationToken = generationTokenRef.current + 1;
    generationTokenRef.current = localGenerationToken;
    activeGenerationRef.current = { token: localGenerationToken, intakeId };
    isGeneratingBodyRef.current = true;
    lastGeneratedIntakeIdRef.current = intakeId;

    const isCurrentGeneration = () =>
      activeGenerationRef.current?.token === localGenerationToken
      && activeGenerationRef.current.intakeId === intakeId
      && selectedIntakeIdRef.current === intakeId;

    const meta = asRecord(intake.metadata);
    const enriched = parseEnrichedData(meta);
    setIsGeneratingBody(true);
    try {
      const result = await apiClient.post<{ contractBody: string }>(generateEngagement, {
        enrichedData: enriched,
        template,
        intakeFields: {
          clientName: typeof meta.name === 'string' ? meta.name : '',
          clientEmail: typeof meta.email === 'string' ? meta.email : '',
          opposingParty: typeof meta.opposing_party === 'string' ? meta.opposing_party : null,
          description: typeof meta.description === 'string' ? meta.description : null,
          courtDate: intake.court_date ?? null,
          practiceName: practiceName ?? null,
        },
      });
      if (!isCurrentGeneration()) return false;
      if (isMountedRef.current) {
        setForm((prev) => ({ ...prev, contractBody: result.data.contractBody }));
      }
      return true;
    } catch (error) {
      if (!isCurrentGeneration()) return false;
      if (isMountedRef.current) {
        showError('Generation failed', error instanceof Error ? error.message : 'Failed to generate engagement letter');
        setForm((prev) => ({ ...prev, contractBody: prev.contractBody || buildDeterministicContractBody(prev) }));
      }
      return false;
    } finally {
      if (activeGenerationRef.current?.token === localGenerationToken) {
        activeGenerationRef.current = null;
        isGeneratingBodyRef.current = false;
        if (isMountedRef.current) setIsGeneratingBody(false);
      }
    }
  }, [practiceName, showError]);

  useEffect(() => {
    if (!practiceId || !form.intakeId) {
      generationTokenRef.current += 1;
      activeGenerationRef.current = null;
      isGeneratingBodyRef.current = false;
      if (isMountedRef.current) setIsGeneratingBody(false);
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

        if (!engagementTemplates.length) return;
        if (lastGeneratedIntakeIdRef.current === detail.uuid) return;

        const meta = asRecord(detail.metadata);
        const enriched = parseEnrichedData(meta);
        const best = autoSelectTemplate(engagementTemplates, enriched?.practice_area ?? null);
        if (!best) return;

        setSelectedTemplateId(best.id);
        void generateFromTemplate(best, detail);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSubmitError(err instanceof Error ? err.message : 'Failed to load intake details');
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingIntakeDetail(false); });

    return () => controller.abort();
  }, [form.intakeId, practiceId, engagementTemplates, generateFromTemplate]);

  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    setSubmitError(null);
    const validation = validateForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    if (!practiceId) return;
    setSubmitting(true);
    try {
      const created = await createEngagementContract(practiceId, {
        intake_id: form.intakeId,
        contract_body: form.contractBody.trim(),
        engagement_notes: form.engagementNotes.trim() || undefined,
        proposal_data: buildProposalDataFromDraft(form),
      });
      onCreated(created.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create engagement');
    } finally {
      setSubmitting(false);
    }
  }, [form, practiceId, onCreated]);

  const currencyValue = (raw: string): MajorAmount | undefined =>
    raw.trim() ? asMajor(Number(raw)) : undefined;

  const currencyUpdate = (key: keyof EngagementDraftForm) =>
    (v: number | undefined) => updateField(key, v != null ? String(v) : '');

  return (
    <EditorShell
      title="New Engagement"
      subtitle="Draft the agreement from an accepted intake."
      showBack
      backVariant="close"
      onBack={onCancel}
      contentMaxWidth={null}
      contentClassName="p-0"
      actions={(
        <Button
          variant="primary"
          icon={Send}
          iconPosition="right"
          onClick={handleSubmit}
          disabled={submitting || !practiceId}
        >
          {submitting ? 'Creating...' : 'Create engagement'}
        </Button>
      )}
    >
      <div className="flex min-h-0 flex-1">

        {/* ── Left: form ── */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-8 p-4 pb-20 sm:p-6">

            {submitError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {submitError}
              </div>
            )}

            {/* Source intake */}
            <section className="space-y-3">
              <SectionHeading title="Source intake" />
              <p className="text-xs text-dim-2">
                Select an accepted intake — the form will pre-fill from the intake data.
              </p>
              {selectedIntake ? (
                <SelectedIntakeCard
                  intake={selectedIntake}
                  detailLoading={isLoadingIntakeDetail}
                  onClear={() => updateField('intakeId', '')}
                />
              ) : (
                <Combobox
                  placeholder={isLoadingIntakes ? 'Loading accepted intakes…' : 'Search accepted intakes…'}
                  options={intakeOptions}
                  value={form.intakeId}
                  onChange={handleIntakeChange}
                  disabled={submitting || isLoadingIntakes}
                  searchable
                />
              )}
              {errors.intakeId && <p className="text-xs text-rose-400">{errors.intakeId}</p>}
              {intakesError && <p className="text-sm text-rose-400">{intakesError}</p>}
            </section>

            {/* Client & matter */}
            <section className="space-y-4">
              <SectionHeading title="Client & matter" />
              <FormGrid>
                <Input
                  label="Client name"
                  value={form.clientName}
                  onChange={(v) => updateField('clientName', v)}
                  disabled={submitting}
                />
                <Input
                  label="Practice area"
                  value={form.practiceArea}
                  onChange={(v) => updateField('practiceArea', v)}
                  disabled={submitting}
                />
              </FormGrid>
              <Input
                label="Matter summary"
                value={form.matterSummary}
                onChange={(v) => updateField('matterSummary', v)}
                disabled={submitting}
                error={errors.matterSummary}
              />
              <FormGrid>
                <Input
                  label="Location"
                  value={form.locationSummary}
                  onChange={(v) => updateField('locationSummary', v)}
                  disabled={submitting}
                />
                <Combobox
                  label="Urgency"
                  options={URGENCY_OPTIONS}
                  value={form.urgency}
                  onChange={(v) => updateField('urgency', v)}
                  disabled={submitting}
                  searchable={false}
                />
              </FormGrid>
              <FormGrid>
                <Input
                  label="Opposing party"
                  value={form.opposingParty}
                  onChange={(v) => updateField('opposingParty', v)}
                  disabled={submitting}
                />
                <Input
                  label="Court date"
                  type="date"
                  value={form.courtDate}
                  onChange={(v) => updateField('courtDate', v)}
                  disabled={submitting}
                />
              </FormGrid>
              <Textarea
                label="Goals"
                value={form.goalsSummary}
                onChange={(v) => updateField('goalsSummary', v)}
                rows={2}
                disabled={submitting}
              />
            </section>

            {/* Scope */}
            <section className="space-y-4">
              <SectionHeading title="Scope of representation" />
              <Textarea
                label="Scope summary"
                value={form.scopeSummary}
                onChange={(v) => updateField('scopeSummary', v)}
                rows={3}
                disabled={submitting}
                error={errors.scopeSummary}
              />
              <FormGrid>
                <Textarea
                  label="Included services (one per line)"
                  value={form.includedServices}
                  onChange={(v) => updateField('includedServices', v)}
                  rows={3}
                  disabled={submitting}
                />
                <Textarea
                  label="Excluded services (one per line)"
                  value={form.excludedServices}
                  onChange={(v) => updateField('excludedServices', v)}
                  rows={3}
                  disabled={submitting}
                />
              </FormGrid>
              <FormGrid>
                <Textarea
                  label="Client identity notes"
                  value={form.clientIdentityNotes}
                  onChange={(v) => updateField('clientIdentityNotes', v)}
                  rows={2}
                  disabled={submitting}
                />
                <Textarea
                  label="Jurisdiction notes"
                  value={form.jurisdictionNotes}
                  onChange={(v) => updateField('jurisdictionNotes', v)}
                  rows={2}
                  disabled={submitting}
                />
              </FormGrid>
            </section>

            {/* Fees */}
            <section className="space-y-4">
              <SectionHeading title="Fees" />
              <RadioGroupWithDescriptions
                label="Billing type"
                name="billing-type"
                value={form.billingType}
                options={BILLING_OPTIONS}
                onChange={(v) => updateField('billingType', v)}
              />

              {form.billingType === 'hourly' && (
                <FormGrid>
                  <CurrencyInput
                    label="Attorney hourly rate"
                    value={currencyValue(form.hourlyRateAttorney)}
                    onChange={currencyUpdate('hourlyRateAttorney')}
                    disabled={submitting}
                    placeholder="250"
                  />
                  <CurrencyInput
                    label="Admin hourly rate"
                    value={currencyValue(form.hourlyRateAdmin)}
                    onChange={currencyUpdate('hourlyRateAdmin')}
                    disabled={submitting}
                    placeholder="95"
                  />
                </FormGrid>
              )}

              {form.billingType === 'fixed' && (
                <CurrencyInput
                  label="Fixed fee amount"
                  value={currencyValue(form.fixedFeeAmount)}
                  onChange={currencyUpdate('fixedFeeAmount')}
                  disabled={submitting}
                  placeholder="2500"
                />
              )}

              {form.billingType === 'retainer' && (
                <CurrencyInput
                  label="Retainer amount"
                  value={currencyValue(form.retainerAmount)}
                  onChange={currencyUpdate('retainerAmount')}
                  disabled={submitting}
                  placeholder="1500"
                />
              )}

              {form.billingType === 'contingency' && (
                <Input
                  label="Contingency percentage (%)"
                  type="number"
                  value={form.contingencyPercentage}
                  onChange={(v) => updateField('contingencyPercentage', v)}
                  disabled={submitting}
                  placeholder="33"
                />
              )}

              {form.billingType && form.billingType !== 'pro_bono' && (
                <Combobox
                  label="Payment frequency"
                  options={PAYMENT_FREQUENCY_OPTIONS}
                  value={form.paymentFrequency}
                  onChange={(v) => updateField('paymentFrequency', v)}
                  disabled={submitting}
                  searchable={false}
                />
              )}

              <Textarea
                label="Fee notes"
                value={form.feeNotes}
                onChange={(v) => updateField('feeNotes', v)}
                rows={2}
                disabled={submitting}
                placeholder="Any additional billing terms for the client…"
              />
            </section>

            {/* Risk review */}
            <section className="space-y-4">
              <SectionHeading title="Risk review" />
              <FormGrid>
                <Combobox
                  label="Conflict status"
                  options={CONFLICT_STATUS_OPTIONS}
                  value={form.conflictStatus}
                  onChange={(v) => updateField('conflictStatus', v as EngagementDraftForm['conflictStatus'])}
                  disabled={submitting}
                  searchable={false}
                />
                <Combobox
                  label="Jurisdiction status"
                  options={JURISDICTION_STATUS_OPTIONS}
                  value={form.jurisdictionStatus}
                  onChange={(v) => updateField('jurisdictionStatus', v as EngagementDraftForm['jurisdictionStatus'])}
                  disabled={submitting}
                  searchable={false}
                />
              </FormGrid>
              <FormGrid>
                <Textarea
                  label="Risk notes (one per line)"
                  value={form.riskNotes}
                  onChange={(v) => updateField('riskNotes', v)}
                  rows={2}
                  disabled={submitting}
                />
                <Textarea
                  label="Open questions (one per line)"
                  value={form.openQuestions}
                  onChange={(v) => updateField('openQuestions', v)}
                  rows={2}
                  disabled={submitting}
                />
              </FormGrid>
            </section>

            {/* Contract */}
            <section className="space-y-3">
              <SectionHeading title="Contract body" />
              {engagementTemplates.length > 0 ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Combobox
                      label="Engagement template"
                      options={templateOptions}
                      value={selectedTemplateId ?? ''}
                      onChange={(v) => setSelectedTemplateId(v || null)}
                      disabled={submitting || isGeneratingBody}
                      searchable={templateOptions.length > 4}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={isGeneratingBody ? undefined : Sparkles}
                    onClick={() => {
                      const template = selectedTemplate ?? engagementTemplates[0];
                      if (template && selectedIntakeDetail) void generateFromTemplate(template, selectedIntakeDetail);
                    }}
                    disabled={submitting || isGeneratingBody || !selectedIntakeDetail}
                    className="shrink-0 mb-[1px]"
                  >
                    {isGeneratingBody ? (
                      <span className="inline-flex items-center gap-1.5">
                        <LoadingSpinner size="sm" ariaLabel="Generating" />
                        Generating…
                      </span>
                    ) : 'Generate'}
                  </Button>
                </div>
              ) : null}
              <Textarea
                label="Contract body"
                value={form.contractBody}
                onChange={(v) => updateField('contractBody', v)}
                rows={14}
                disabled={submitting || isGeneratingBody}
                error={errors.contractBody}
              />
              <Textarea
                label="Internal notes"
                value={form.engagementNotes}
                onChange={(v) => updateField('engagementNotes', v)}
                rows={3}
                disabled={submitting}
                placeholder="Notes visible only to your team…"
              />
            </section>

          </div>
        </div>

        {/* ── Right: live preview (xl+) ── */}
        <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-l border-line-subtle p-6 xl:block">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-dim-2">
              Client preview
            </p>
            <p className="text-xs text-dim-2">
              This is what the client will see when they open the engagement.
            </p>
            <EngagementLetterPreview form={form} practiceName={practiceName} />
          </div>
        </aside>

      </div>
    </EditorShell>
  );
};

export default CreateEngagementPage;
