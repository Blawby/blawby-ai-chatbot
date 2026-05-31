/**
 * EngagementWorkbench
 *
 * A single chat-first workbench that powers BOTH the create flow (no id)
 * and the edit flow (with id + engagement detail). The split is driven
 * by `mode`:
 *   - mode='create' — needs `practiceId`, optional `initialIntakeId`,
 *     and `onCreated(id)`. Drives `createEngagementContract`.
 *   - mode='edit'   — needs an `EngagementDetail` (loaded by caller via
 *     `useEngagementDetail`) and a `setEngagementCache` writer. Drives
 *     `patchEngagementContract`.
 *
 * Layout (per design_handoff_blawby_chat_first/screens/Engagement.html):
 *
 *   [topbar — breadcrumb + serif H1 "Engagement for {Client}" + saved indicator]
 *   [AIRibbon authoring — "I generated this draft from X, prefilled with Y.
 *                         {N} of {Total} placeholders unresolved"]
 *   ┌──────────────────────┬─────────────────────────────────────┐
 *   │ left form panel      │ right preview panel (sticky)        │
 *   │  numbered sections   │  Seg(Letter/Client review/MD source)│
 *   │  1 Client & matter   │  <LetterPaper /> with               │
 *   │  2 Templates strip   │     parsePlaceholders() body        │
 *   │  3 Fees (card grid)  │  Placeholders index card            │
 *   │  4 Scope             │  Action row (Preview/Download/Send) │
 *   │  5 Risk review       │                                     │
 *   │  6 Signing           │                                     │
 *   └──────────────────────┴─────────────────────────────────────┘
 *
 * Mobile (< 1080px): form stacks above preview, preview becomes a
 * collapsible "Preview" section below.
 */
import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Send,
  Sparkles,
  X,
} from 'lucide-preact';

import { AIRibbon } from '@/design-system/patterns/AIRibbon';
import { LetterPaper } from '@/design-system/patterns/LetterPaper';
import type { LetterPaperFeeRow } from '@/design-system/patterns/LetterPaper';
import { PlaceholderToken, parsePlaceholders } from '@/design-system/patterns/PlaceholderToken';
import { Seg } from '@/design-system/patterns/Seg';
import { NumberedSection } from '@/design-system/primitives/NumberedSection';
import type { NumberedSectionState } from '@/design-system/primitives/NumberedSection';
import { Pill } from '@/design-system/primitives/Pill';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea, Combobox, type ComboboxOption } from '@/shared/ui/input';
import { CurrencyInput } from '@/shared/ui/input/CurrencyInput';
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
import { cn } from '@/shared/utils/cn';

import {
  createEngagementContract,
  patchEngagementContract,
} from '../api/engagementsApi';
import type { EngagementDetail } from '../types/engagement';
import {
  buildDeterministicContractBody,
  buildEngagementDraftFormFromIntake,
  buildProposalDataFromDraft,
  EMPTY_ENGAGEMENT_DRAFT_FORM,
  type EngagementDraftForm,
} from '../utils/engagementDraft';

/**
 * Hydrate an `EngagementDraftForm` from an existing `EngagementDetail`.
 * Collapses the canonical `proposal_data` shape back into the flat form
 * state so the workbench can power both create and edit. Lives here
 * (rather than in `engagementDraft.ts`) so the workbench remains
 * self-contained and editing `engagementDraft.ts` isn't required.
 */
function buildEngagementDraftFromDetail(engagement: EngagementDetail): EngagementDraftForm {
  const proposal = engagement.proposal_data;
  const summary = proposal?.client_summary;
  const rep = proposal?.representation;
  const fees = proposal?.fees;
  const risk = proposal?.risk_review;
  const src = proposal?.source_snapshot;

  const numString = (value: number | null | undefined): string =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const joinLines = (value: string[] | null | undefined): string =>
    Array.isArray(value) ? value.join('\n') : '';
  const str = (value: string | null | undefined, ...fallbacks: Array<string | null | undefined>): string => {
    if (typeof value === 'string' && value.trim()) return value;
    for (const f of fallbacks) if (typeof f === 'string' && f.trim()) return f;
    return '';
  };

  return {
    intakeId: engagement.intake_id ?? '',
    contractBody: engagement.contract_body ?? '',
    engagementNotes: engagement.engagement_notes ?? '',
    clientName: str(summary?.client_name, engagement.client_name),
    matterSummary: str(summary?.matter_summary, engagement.title, engagement.description),
    locationSummary: str(summary?.location_summary),
    goalsSummary: str(summary?.goals_summary, src?.desired_outcome, engagement.desired_outcome),
    scopeSummary: str(rep?.scope_summary),
    includedServices: joinLines(rep?.included_services),
    excludedServices: joinLines(rep?.excluded_services),
    clientIdentityNotes: str(rep?.client_identity_notes),
    jurisdictionNotes: str(rep?.jurisdiction_notes),
    billingType: str(fees?.billing_type),
    fixedFeeAmount: numString(fees?.fixed_fee_amount),
    hourlyRateAttorney: numString(fees?.hourly_rate_attorney),
    hourlyRateAdmin: numString(fees?.hourly_rate_admin),
    contingencyPercentage: numString(fees?.contingency_percentage),
    retainerAmount: numString(fees?.retainer_amount),
    paymentFrequency: str(fees?.payment_frequency),
    feeNotes: str(fees?.fee_notes),
    conflictStatus: risk?.conflict_status ?? 'unknown',
    jurisdictionStatus: risk?.jurisdiction_status ?? 'unknown',
    riskNotes: joinLines(risk?.risk_notes),
    openQuestions: joinLines(risk?.open_questions),
    practiceArea: str(src?.practice_area, engagement.practice_area),
    urgency: str(src?.urgency, engagement.urgency),
    desiredOutcome: str(src?.desired_outcome, engagement.desired_outcome),
    opposingParty: str(src?.opposing_party, engagement.opposing_party),
    courtDate: str(src?.court_date),
    conversationId: str(src?.conversation_id, engagement.conversation_id),
    matterId: str(src?.matter_id, engagement.matter_id),
  };
}

// ── Template types (mirrors EngagementTemplatesPage.tsx) ─────────────────────

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

// ── Fee-mode card data ───────────────────────────────────────────────────────

type FeeModeOption = {
  value: string;
  title: string;
  description: string;
};

const FEE_MODE_OPTIONS: readonly FeeModeOption[] = [
  { value: 'hourly',      title: 'Hourly',      description: 'Bill based on time spent on the engagement' },
  { value: 'retainer',    title: 'Retainer',    description: 'Held in trust, drawn down hourly' },
  { value: 'fixed',       title: 'Fixed fee',   description: 'One sum, milestone-paid' },
  { value: 'contingency', title: 'Contingency', description: 'Percentage of recovery' },
  { value: 'pro_bono',    title: 'Pro bono',    description: 'Services provided without charge' },
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

// ── Validation ───────────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof EngagementDraftForm, string>>;

const validateForm = (form: EngagementDraftForm, requireIntake: boolean): FormErrors => {
  const errors: FormErrors = {};
  if (requireIntake && !form.intakeId) errors.intakeId = 'An accepted intake is required';
  if (!form.matterSummary.trim()) errors.matterSummary = 'Matter summary is required';
  if (!form.scopeSummary.trim()) errors.scopeSummary = 'Scope summary is required';
  if (!form.contractBody.trim()) errors.contractBody = 'Contract body is required';
  return errors;
};

// ── Placeholder map ──────────────────────────────────────────────────────────

type ResolvedMapEntry = { value: string; source: string };

const buildResolvedMap = (
  form: EngagementDraftForm,
  practiceName: string | undefined,
): { resolved: Record<string, string>; sources: Record<string, string> } => {
  const map: Record<string, ResolvedMapEntry> = {};
  const put = (key: string, value: string, source: string) => {
    if (value.trim()) map[key] = { value: value.trim(), source };
  };

  put('client_name', form.clientName, 'from intake');
  put('matter_type', form.practiceArea, 'from intake');
  put('matter_summary', form.matterSummary, 'from intake');
  put('jurisdiction', form.locationSummary, 'from intake');
  put('opposing_party', form.opposingParty, 'from intake');
  put('court_date', form.courtDate, 'from intake');
  put('urgency', form.urgency, 'from intake');
  put('goals', form.goalsSummary, 'from intake');
  put('scope_summary', form.scopeSummary, 'authored');
  put('practice_name', practiceName ?? '', 'from firm');

  if (form.hourlyRateAttorney) put('hourly_rate', `$${form.hourlyRateAttorney}`, 'from firm default');
  if (form.fixedFeeAmount)     put('fixed_fee', formatCurrency(Number(form.fixedFeeAmount)), 'authored');
  if (form.retainerAmount)     put('retainer_amount', formatCurrency(Number(form.retainerAmount)), 'authored');
  if (form.contingencyPercentage) put('contingency_percentage', `${form.contingencyPercentage}%`, 'authored');
  if (form.paymentFrequency)   put('payment_frequency', form.paymentFrequency, 'authored');

  const resolved: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(map)) {
    resolved[key] = entry.value;
    sources[key] = entry.source;
  }
  return { resolved, sources };
};

const UNRESOLVED_HINTS: Record<string, string> = {
  ai_est_total:       'expected from similar matters',
  client_portal_url:  'generated on send',
  response_sla:       "firm doesn't have a default",
  signing_date:       'set on client signature',
  client_signature:   'set on client signature',
};

// ── "Saved Xs ago" indicator ─────────────────────────────────────────────────

const useSavedAgo = (savedAt: number | null): string => {
  const [, force] = useState(0);
  useEffect(() => {
    if (savedAt == null) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [savedAt]);
  if (savedAt == null) return '';
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 60) return `saved ${seconds}s ago`;
  if (seconds < 3600) return `saved ${Math.round(seconds / 60)}m ago`;
  return `saved ${formatRelativeTime(new Date(savedAt).toISOString())}`;
};

// ── Mobile detection ─────────────────────────────────────────────────────────

const useIsMobile = (breakpoint = 1080): boolean => {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return isMobile;
};

// ── Engagement number / status display ───────────────────────────────────────

const formatEngagementNumber = (engagement: EngagementDetail | null): string => {
  if (!engagement?.id) return 'BLB-ENG-DRAFT';
  // Backend may not surface a stable display number — derive from id suffix.
  const tail = engagement.id.replace(/[^0-9a-zA-Z]/g, '').slice(-4).toUpperCase();
  return `BLB-ENG-${tail || 'XXXX'}`;
};

// ── Component ────────────────────────────────────────────────────────────────

type CreateModeProps = {
  mode: 'create';
  practiceId: string | null;
  initialIntakeId?: string | null;
  practiceName?: string;
  onCreated: (engagementId: string) => void;
  onCancel: () => void;
};

type EditModeProps = {
  mode: 'edit';
  practiceId: string | null;
  engagement: EngagementDetail;
  practiceName?: string;
  feesEditingDisabled: boolean;
  onSaved: (updated: EngagementDetail) => void;
  onSavedAndSend: (updated: EngagementDetail) => void;
  onCancel: () => void;
  /** Write the patched engagement back into the caller's cache. */
  setEngagementCache: (next: EngagementDetail) => void;
};

export type EngagementWorkbenchProps = CreateModeProps | EditModeProps;

export const EngagementWorkbench: FunctionComponent<EngagementWorkbenchProps> = (props) => {
  const isCreate = props.mode === 'create';
  const { practiceId, practiceName, onCancel } = props;
  const { showError } = useToastContext();

  // ── Form state — hydrate from intake (create) or engagement (edit) ─────────

  const initialForm = useMemo<EngagementDraftForm>(() => {
    if (props.mode === 'edit') return buildEngagementDraftFromDetail(props.engagement);
    return { ...EMPTY_ENGAGEMENT_DRAFT_FORM, intakeId: props.initialIntakeId ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<EngagementDraftForm>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // ── Edit-mode: refresh form when engagement payload changes ────────────────
  const engagementVersion = props.mode === 'edit'
    ? `${props.engagement.id}:${props.engagement.updated_at ?? ''}`
    : null;
  useEffect(() => {
    if (props.mode === 'edit') {
      setForm(buildEngagementDraftFromDetail(props.engagement));
    }
    // Re-hydrate only when the engagement identity/version changes — avoids
    // clobbering unsaved edits when transient state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementVersion]);

  // ── Intake list / detail (create mode only) ────────────────────────────────

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
  const selectedIntakeIdRef = useRef(form.intakeId);
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
    if (!isCreate || !practiceId) return;
    const controller = new AbortController();
    setIsLoadingIntakes(true);
    setIntakesError(null);

    listIntakes(practiceId, { page: 1, limit: 100, triage_status: 'accepted' }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setIntakes(result.intakes);
        const initialIntakeId = props.mode === 'create' ? props.initialIntakeId : null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, practiceId]);

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
    if (!isCreate || !practiceId || !form.intakeId) {
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
  }, [isCreate, form.intakeId, practiceId, engagementTemplates, generateFromTemplate]);

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (props.mode !== 'create') return;
    setHasAttemptedSubmit(true);
    setSubmitError(null);
    const validation = validateForm(form, true);
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
      setLastSavedAt(Date.now());
      props.onCreated(created.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create engagement');
    } finally {
      setSubmitting(false);
    }
  }, [props, form, practiceId]);

  const handlePatch = useCallback(async (sendAfter: boolean) => {
    if (props.mode !== 'edit') return;
    setHasAttemptedSubmit(true);
    setSubmitError(null);
    const validation = validateForm(form, false);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    if (!practiceId) return;

    setSubmitting(true);
    try {
      const updated = await patchEngagementContract(practiceId, props.engagement.id, {
        contract_body: form.contractBody.trim(),
        engagement_notes: form.engagementNotes.trim(),
        proposal_data: buildProposalDataFromDraft(form),
      });
      props.setEngagementCache(updated);
      setLastSavedAt(Date.now());
      if (sendAfter) props.onSavedAndSend(updated);
      else props.onSaved(updated);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save engagement');
    } finally {
      setSubmitting(false);
    }
  }, [props, form, practiceId]);

  const handleSubmit = useCallback(() => {
    if (isCreate) void handleCreate();
    else void handlePatch(false);
  }, [isCreate, handleCreate, handlePatch]);

  // ── Derived view state ─────────────────────────────────────────────────────

  const engagement = props.mode === 'edit' ? props.engagement : null;
  const engagementNumber = formatEngagementNumber(engagement);
  const status = engagement?.status ?? 'draft';
  const clientNameDisplay = form.clientName.trim() || 'New Client';
  const savedLabel = useSavedAgo(lastSavedAt);

  const { resolved, sources } = useMemo(
    () => buildResolvedMap(form, practiceName),
    [form, practiceName],
  );

  // Compute placeholder count across the contract body.
  const placeholderStats = useMemo(() => {
    const segments = parsePlaceholders(form.contractBody, resolved);
    let total = 0;
    let resolvedCount = 0;
    const keys = new Set<string>();
    for (const seg of segments) {
      if (seg.type === 'placeholder') {
        total += 1;
        keys.add(seg.key);
        if (seg.resolved) resolvedCount += 1;
      }
    }
    return { total, resolved: resolvedCount, unresolved: total - resolvedCount, keys };
  }, [form.contractBody, resolved]);

  const ribbonText = useMemo(() => {
    const area = form.practiceArea.trim() || 'this matter';
    const fee = form.billingType.trim() || 'standard';
    const client = form.clientName.trim() || 'this lead';
    return `I generated this draft from the ${area} / ${fee} template, prefilled with ${client}'s intake. ${placeholderStats.unresolved} of ${placeholderStats.total} placeholders unresolved.`;
  }, [form.practiceArea, form.billingType, form.clientName, placeholderStats.unresolved, placeholderStats.total]);

  // ── Section state — done / now / next ──────────────────────────────────────

  const clientAndMatterDone = Boolean(
    form.clientName.trim() && (form.matterSummary.trim() || form.practiceArea.trim()),
  );
  const templatesDone = Boolean(selectedTemplateId || form.contractBody.trim());
  const feesDone = Boolean(form.billingType);
  const scopeDone = Boolean(form.scopeSummary.trim() && form.contractBody.trim());
  const riskDone = form.conflictStatus !== 'unknown' && form.jurisdictionStatus !== 'unknown';
  const signingDone = false; // Always "next" until backend exposes signing parties.

  // First non-done section gets 'now'; later ones get 'next'.
  const sectionStates = useMemo(() => {
    const flags = [clientAndMatterDone, templatesDone, feesDone, scopeDone, riskDone, signingDone];
    let foundNow = false;
    return flags.map<NumberedSectionState>((isDone) => {
      if (isDone) return 'done';
      if (!foundNow) { foundNow = true; return 'now'; }
      return 'next';
    });
  }, [clientAndMatterDone, templatesDone, feesDone, scopeDone, riskDone, signingDone]);

  // ── Preview view toggle ────────────────────────────────────────────────────

  const [previewView, setPreviewView] = useState<'letter' | 'client' | 'markdown'>('letter');
  const isMobile = useIsMobile(1080);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // ── Currency helpers ───────────────────────────────────────────────────────

  const currencyValue = (raw: string): MajorAmount | undefined =>
    raw.trim() ? asMajor(Number(raw)) : undefined;
  const currencyUpdate = (key: keyof EngagementDraftForm) =>
    (v: number | undefined) => updateField(key, v != null ? String(v) : '');

  // ── AIRibbon actions (stubs) ───────────────────────────────────────────────

  const handleRegenerate = useCallback(() => {
    if (!isCreate || !selectedIntakeDetail) return;
    const template = selectedTemplate ?? engagementTemplates[0];
    if (template) void generateFromTemplate(template, selectedIntakeDetail);
    // TODO(backend): in edit mode, plumb regenerate to a worker route that
    // takes proposal_data + practice templates and returns a fresh contract body.
  }, [isCreate, selectedIntakeDetail, selectedTemplate, engagementTemplates, generateFromTemplate]);

  const ribbonActions = useMemo(() => ([
    {
      id: 'regenerate',
      label: 'Re-generate',
      variant: 'primary' as const,
      onClick: handleRegenerate,
    },
    {
      id: 'polish',
      label: 'Polish',
      // TODO(backend): wire to a polish/rewrite endpoint that smooths the
      // tone of the contract body without changing material terms.
      onClick: () => undefined,
    },
    {
      id: 'translate',
      label: 'Translate',
      // TODO(backend): wire to a translate endpoint that produces a
      // plain-English version of the contract body.
      onClick: () => undefined,
    },
  ]), [handleRegenerate]);

  // ── Placeholders: "Resolve all with AI" stub ───────────────────────────────

  const handleResolveAll = useCallback(() => {
    // TODO(backend): call a placeholder-resolution endpoint that takes
    // unresolved placeholder keys + practice defaults and patches the
    // contract body with sensible values.
  }, []);

  // ── Top bar render helpers ─────────────────────────────────────────────────

  const topbarTitle = (
    <div className="flex flex-col gap-0.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
        Engagement · {engagementNumber} · {status}
      </div>
      <h1 className="m-0 font-serif text-[22px] font-normal leading-tight tracking-[-0.012em] text-ink">
        Engagement for <em className="not-italic text-accent-deep italic">{clientNameDisplay}</em>
      </h1>
    </div>
  );

  const topbarActions = (
    <div className="flex items-center gap-2">
      <Pill tone={status === 'draft' ? 'warn' : status === 'sent' ? 'dim' : 'live'}>{status}</Pill>
      {savedLabel && (
        <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim sm:inline">
          {savedLabel}
        </span>
      )}
      {isCreate ? (
        <Button
          variant="primary"
          icon={Send}
          iconPosition="right"
          onClick={handleSubmit}
          disabled={submitting || !practiceId}
        >
          {submitting ? 'Creating…' : 'Create engagement'}
        </Button>
      ) : (
        <>
          <Button variant="secondary" onClick={() => void handlePatch(false)} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            variant="primary"
            icon={Send}
            iconPosition="right"
            onClick={() => void handlePatch(true)}
            disabled={submitting}
          >
            Review &amp; send
          </Button>
        </>
      )}
    </div>
  );

  // ── Form panel ─────────────────────────────────────────────────────────────

  const formPanel = (
    <div className="flex flex-col gap-6">
      {submitError && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {submitError}
        </div>
      )}

      {/* Section 1: Client & matter */}
      <NumberedSection
        number={1}
        state={sectionStates[0]}
        title="Client & matter"
        description={isCreate
          ? 'Pulled from intake on acceptance. Edit anything if the AI got it wrong.'
          : 'Edit the canonical client + matter details for this engagement.'}
      >
        <div className="flex flex-col gap-3">
          {isCreate ? (
            <>
              {selectedIntake ? (
                <div className="flex items-start justify-between gap-3 rounded-md border border-card-border bg-card px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {selectedIntake.metadata?.name?.trim() || 'Anonymous lead'}
                    </p>
                    {selectedIntake.metadata?.email && (
                      <p className="truncate text-sm text-dim-2">{selectedIntake.metadata.email}</p>
                    )}
                    {isLoadingIntakeDetail && (
                      <div className="mt-1">
                        <LoadingSpinner size="sm" ariaLabel="Loading intake details" className="text-dim-2" />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('intakeId', '')}
                    className="shrink-0 text-xs font-medium text-accent hover:text-accent/80 focus:outline-none focus-visible:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <Combobox
                  // TODO(backend): replace intake-only picker with parallel
                  // contact + matter Comboboxes once the engagement create
                  // endpoint accepts contact_id + matter_id directly. Today
                  // the API requires intake_id, so we keep an intake picker.
                  label="Source intake (client + matter)"
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
            </>
          ) : null}

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
        </div>
      </NumberedSection>

      {/* Section 2: Templates */}
      <NumberedSection
        number={2}
        state={sectionStates[1]}
        title="Template"
        description="Pick a template — the right column updates the letter in real time."
      >
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {engagementTemplates.length === 0 ? (
            <p className="text-xs italic text-dim-2">
              No engagement templates yet. Add some in Settings → Engagement templates.
            </p>
          ) : (
            engagementTemplates.map((t) => {
              const isActive = selectedTemplateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(t.id);
                    if (isCreate && selectedIntakeDetail) {
                      void generateFromTemplate(t, selectedIntakeDetail);
                    }
                  }}
                  className={cn(
                    'flex shrink-0 min-w-[120px] cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-[12.5px] transition-colors',
                    isActive
                      ? 'border-ink bg-ink text-accent'
                      : 'border-card-border bg-card text-ink-2 hover:border-ink-3',
                  )}
                  disabled={submitting || isGeneratingBody}
                >
                  <span className={cn(
                    'font-mono text-[9.5px] uppercase tracking-[0.08em]',
                    isActive ? 'opacity-80' : 'opacity-65',
                  )}>
                    {t.feeType === 'flat' ? 'Flat fee' :
                     t.feeType === 'hourly' ? 'Hourly' :
                     t.feeType === 'contingency' ? 'Contingency' :
                     t.feeType === 'pro_bono' ? 'Pro bono' :
                     t.feeType}
                  </span>
                  <span>{t.name}</span>
                </button>
              );
            })
          )}
          <button
            type="button"
            // TODO(backend): wire "+ new" to the engagement templates editor;
            // for now it lives under Settings → Engagement templates and is a
            // separate Wave 2.5 surface.
            onClick={() => undefined}
            className="flex shrink-0 min-w-[100px] cursor-pointer flex-col gap-0.5 rounded-md border border-dashed border-card-border bg-card px-3 py-2 text-left text-[12.5px] text-dim hover:border-ink-3"
            disabled={submitting}
          >
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] opacity-65">New</span>
            <span>+ template</span>
          </button>
        </div>
        {isGeneratingBody && (
          <div className="mt-2 flex items-center gap-2 text-xs text-dim-2">
            <LoadingSpinner size="sm" ariaLabel="Generating" />
            Generating from template…
          </div>
        )}
      </NumberedSection>

      {/* Section 3: Fees */}
      <NumberedSection
        number={3}
        state={sectionStates[2]}
        title="Fees"
        description="Pick a fee model. The right column updates the letter in real time."
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FEE_MODE_OPTIONS.map((opt) => {
              const isActive = form.billingType === opt.value;
              // Mark hourly as "ai suggested" when no billing type is set yet
              // — the design's small "ai suggested" badge.
              const aiSuggested = !form.billingType && opt.value === 'hourly';
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('billingType', opt.value)}
                  disabled={submitting}
                  className={cn(
                    'relative flex flex-col gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                    isActive
                      ? 'border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)]'
                      : 'border-card-border bg-card hover:border-ink-3',
                  )}
                >
                  {aiSuggested && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em] text-accent-deep">
                      <span className="h-1 w-1 rounded-full bg-accent" />
                      ai suggested
                    </span>
                  )}
                  <span className="font-serif text-[15px] tracking-[-0.005em] text-ink">{opt.title}</span>
                  <span className="text-[11.5px] leading-snug text-dim">{opt.description}</span>
                </button>
              );
            })}
          </div>

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
        </div>
      </NumberedSection>

      {/* Section 4: Scope */}
      <NumberedSection
        number={4}
        state={sectionStates[3]}
        title="Scope of representation"
        description="What you will and won't do. The AI suggests these by practice area — edit freely."
      >
        <div className="flex flex-col gap-3">
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
          <Textarea
            label="Contract body"
            value={form.contractBody}
            onChange={(v) => updateField('contractBody', v)}
            rows={10}
            disabled={submitting || isGeneratingBody}
            error={errors.contractBody}
          />
          <Textarea
            label="Internal notes"
            value={form.engagementNotes}
            onChange={(v) => updateField('engagementNotes', v)}
            rows={2}
            disabled={submitting}
            placeholder="Notes visible only to your team…"
          />
        </div>
      </NumberedSection>

      {/* Section 5: Risk review */}
      <NumberedSection
        number={5}
        state={sectionStates[4]}
        title="Risk review"
        description="Quick gut-check before sending. The AI runs these checks automatically."
      >
        <div className="flex flex-col gap-3">
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
        </div>
      </NumberedSection>

      {/* Section 6: Signing */}
      <NumberedSection
        number={6}
        state={sectionStates[5]}
        title="Signing"
        description="Who signs and in what order. Signature parties default to client + firm."
      >
        <div className="rounded-md border border-card-border bg-card px-3 py-3">
          <p className="text-sm text-ink">
            Default signing order: <span className="font-medium">Client</span> →{' '}
            <span className="font-medium">For the firm</span>
          </p>
          <p className="mt-1 text-xs text-dim-2">
            {/* TODO(backend): expose signing_parties + ordering on EngagementDetail
                so this section becomes editable. Today the worker derives parties
                from intake metadata + firm details. */}
            Signing parties are derived from the intake — edit will be enabled
            once the API exposes signing party metadata.
          </p>
        </div>
      </NumberedSection>
    </div>
  );

  // ── Preview panel ──────────────────────────────────────────────────────────

  const firmAddress = useMemo(() => {
    const d = practiceDetails ?? {};
    const parts: string[] = [];
    if (typeof d.address === 'string' && d.address.trim()) parts.push(d.address.trim());
    if (typeof d.city === 'string' && d.city.trim()) {
      const cs = [d.city, d.state, d.postalCode].filter(Boolean).join(', ');
      if (cs) parts.push(cs);
    }
    if (typeof d.businessPhone === 'string' && d.businessPhone.trim()) parts.push(d.businessPhone.trim());
    if (typeof d.businessEmail === 'string' && d.businessEmail.trim()) parts.push(d.businessEmail.trim());
    return parts;
  }, [practiceDetails]);

  // Renders a single contract-body line — text, with placeholder tokens inline.
  const renderBodyLine = useCallback((line: string, lineIdx: number) => {
    const segments = parsePlaceholders(line, resolved);
    if (segments.length === 0) return null;
    return (
      <p key={lineIdx}>
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <PlaceholderToken
              key={i}
              value={seg.value}
              placeholderKey={seg.key}
              status={seg.resolved ? 'resolved' : 'unresolved'}
            />
          ),
        )}
      </p>
    );
  }, [resolved]);

  const feeRows: LetterPaperFeeRow[] = useMemo(() => {
    const rows: LetterPaperFeeRow[] = [];
    if (form.billingType === 'hourly') {
      if (form.hourlyRateAttorney) {
        rows.push({
          label: 'Hourly rate (attorney)',
          amount: formatCurrency(Number(form.hourlyRateAttorney)),
        });
      }
      if (form.hourlyRateAdmin) {
        rows.push({
          label: 'Hourly rate (admin)',
          amount: formatCurrency(Number(form.hourlyRateAdmin)),
        });
      }
    }
    if (form.retainerAmount) {
      rows.push({
        label: 'Initial retainer (held in trust)',
        amount: formatCurrency(Number(form.retainerAmount)),
      });
    }
    if (form.fixedFeeAmount) {
      rows.push({
        label: 'Fixed fee',
        amount: formatCurrency(Number(form.fixedFeeAmount)),
      });
    }
    if (form.contingencyPercentage) {
      rows.push({
        label: 'Contingency percentage',
        amount: `${form.contingencyPercentage}%`,
      });
    }
    if (form.paymentFrequency) {
      rows.push({
        label: 'Payment frequency',
        amount: form.paymentFrequency,
      });
    }
    if (rows.length === 0) {
      rows.push({
        label: 'Fee terms',
        amount: <LetterPaper.Placeholder>to be confirmed</LetterPaper.Placeholder>,
      });
    }
    return rows;
  }, [
    form.billingType,
    form.hourlyRateAttorney,
    form.hourlyRateAdmin,
    form.retainerAmount,
    form.fixedFeeAmount,
    form.contingencyPercentage,
    form.paymentFrequency,
  ]);

  const dueToStart = useMemo(() => {
    if (form.retainerAmount) return formatCurrency(Number(form.retainerAmount));
    if (form.fixedFeeAmount) return formatCurrency(Number(form.fixedFeeAmount));
    return null;
  }, [form.retainerAmount, form.fixedFeeAmount]);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const previewClientReviewHref = engagement
    ? `/client/${engagement.organization_id}/engagements/${encodeURIComponent(engagement.id)}/review`
    : null;

  const letterView = (
    <LetterPaper
      firm={practiceName ? (
        <>
          {practiceName}
        </>
      ) : (
        <LetterPaper.Placeholder>firm name</LetterPaper.Placeholder>
      )}
      address={firmAddress.length > 0 ? (
        firmAddress.map((line, i) => (
          <span key={i}>
            {line}
            {i < firmAddress.length - 1 && <br />}
          </span>
        ))
      ) : (
        <LetterPaper.Placeholder>firm address</LetterPaper.Placeholder>
      )}
      title="Engagement letter"
      date={today}
    >
      {form.contractBody.trim()
        ? form.contractBody
            .split('\n')
            .map((line, i) => renderBodyLine(line, i))
            .filter(Boolean)
        : (
          <p>
            <LetterPaper.Placeholder>
              Complete the form on the left to generate the engagement letter body.
            </LetterPaper.Placeholder>
          </p>
        )}

      <h2>Fees &amp; payment</h2>
      <LetterPaper.Fee
        head="Fee summary"
        rows={feeRows}
        total={dueToStart ? { label: 'Due to start', amount: dueToStart } : undefined}
      />

      <h2>Signature</h2>
      <p>
        Client: <LetterPaper.Placeholder>signature</LetterPaper.Placeholder>
        {' · '}
        Date: <LetterPaper.Placeholder>signing date</LetterPaper.Placeholder>
      </p>
      <p>
        For the firm: <LetterPaper.Placeholder resolved>{practiceName ?? 'Firm signatory'}</LetterPaper.Placeholder>
      </p>
    </LetterPaper>
  );

  const clientReviewView = (
    <div className="rounded-md border border-card-border bg-card p-5 text-sm text-ink-2">
      <p className="font-serif text-base text-ink">Client review page preview</p>
      <p className="mt-2">
        Clients see this letter inside the standard review page with a signature
        pad and consent checkbox.
      </p>
      {previewClientReviewHref ? (
        <a
          href={previewClientReviewHref}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Open the live client review page <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="mt-3 text-xs italic text-dim-2">
          The live review page becomes available after the engagement is created.
        </p>
      )}
    </div>
  );

  const markdownView = (
    <pre className="max-h-[600px] overflow-auto rounded-md border border-card-border bg-card px-4 py-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap">
      {form.contractBody || '(empty contract body)'}
    </pre>
  );

  const placeholdersCard = (
    <div className="rounded-md border border-card-border bg-card px-4 py-3">
      <h4 className="m-0 font-serif text-[15px] font-normal">
        {placeholderStats.total} placeholders — {placeholderStats.resolved} resolved, {placeholderStats.unresolved} open
      </h4>
      <div className="mt-2 flex flex-col">
        {Array.from(placeholderStats.keys).slice(0, 10).map((key) => {
          const isResolved = Object.prototype.hasOwnProperty.call(resolved, key);
          return (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between border-b border-dotted border-card-border py-1.5 text-[12.5px] last:border-b-0',
                !isResolved && 'text-rose-400',
              )}
            >
              <span className={cn('font-mono text-[11px]', isResolved ? 'text-ink-2' : 'text-rose-400')}>
                {`{${key}}`}
              </span>
              <span className={cn('text-right', isResolved ? 'text-dim' : 'font-mono text-[11px] text-rose-400')}>
                {isResolved ? (
                  <>
                    {resolved[key]}
                    {sources[key] && (
                      <span className="ml-2 font-mono text-[10px] text-dim-2">· {sources[key]}</span>
                    )}
                  </>
                ) : (
                  `unresolved · ${UNRESOLVED_HINTS[key] ?? 'no default'}`
                )}
              </span>
            </div>
          );
        })}
        {placeholderStats.keys.size > 10 && (
          <p className="mt-1 text-xs italic text-dim-2">
            …and {placeholderStats.keys.size - 10} more.
          </p>
        )}
        {placeholderStats.keys.size === 0 && (
          <p className="py-1.5 text-xs italic text-dim-2">
            No placeholders in this draft yet — the letter body will be sent as-is.
          </p>
        )}
      </div>
      {placeholderStats.unresolved > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleResolveAll}
            className="chip primary"
          >
            Resolve all ({placeholderStats.unresolved}) with AI
          </button>
        </div>
      )}
    </div>
  );

  const actionRow = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {previewClientReviewHref ? (
        <a
          href={previewClientReviewHref}
          target="_blank"
          rel="noreferrer noopener"
          className="chip"
        >
          Preview as client →
        </a>
      ) : (
        <button type="button" className="chip" disabled>Preview as client →</button>
      )}
      <button
        type="button"
        className="chip"
        // TODO(backend): wire to engagement-contract PDF export endpoint
        // (not currently exposed; see worker/routes for the engagement
        // proxy and add a /pdf action when ready).
        onClick={() => undefined}
      >
        <Download className="mr-1 inline h-3 w-3" />
        Download PDF
      </button>
      {!isCreate && (
        <Button
          variant="primary"
          icon={Send}
          iconPosition="right"
          onClick={() => void handlePatch(true)}
          disabled={submitting}
        >
          Send to client
        </Button>
      )}
    </div>
  );

  const previewPanel = (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">View</span>
        <Seg<'letter' | 'client' | 'markdown'>
          value={previewView}
          options={[
            { value: 'letter',   label: 'Letter' },
            { value: 'client',   label: 'Client review page' },
            { value: 'markdown', label: 'Markdown source' },
          ]}
          onChange={setPreviewView}
          ariaLabel="Switch preview view"
        />
        <span className="flex-1" />
        <Pill tone="dim">
          {placeholderStats.total} placeholders ·{' '}
          {placeholderStats.unresolved > 0 ? (
            <b className="font-mono font-medium text-rose-400">
              {placeholderStats.unresolved} unresolved
            </b>
          ) : (
            <b className="font-mono font-medium text-emerald-400">all resolved</b>
          )}
        </Pill>
      </div>

      {previewView === 'letter'   && letterView}
      {previewView === 'client'   && clientReviewView}
      {previewView === 'markdown' && markdownView}

      <div className="mx-auto w-full max-w-[720px]">
        {placeholdersCard}
        {actionRow}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <EditorShell
      title={topbarTitle}
      showBack
      backVariant="close"
      onBack={onCancel}
      contentMaxWidth={null}
      contentClassName="p-0"
      actions={topbarActions}
    >
      {/* AI ribbon spans the full content width below the topbar. */}
      <div className="border-b border-line-subtle px-6 py-3">
        <AIRibbon
          variant="authoring"
          title={ribbonText}
          actions={ribbonActions}
        />
      </div>

      {/* Workbench: form panel + preview panel. */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">

        {/* Left: form */}
        <div className="min-w-0 flex-1 overflow-y-auto border-b border-line-subtle xl:max-w-[440px] xl:border-b-0 xl:border-r">
          <div className="p-6 pb-20">{formPanel}</div>
        </div>

        {/* Right: preview */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-paper-2">
          {/* Mobile: preview is a collapsible section. Desktop: always visible. */}
          {isMobile ? (
            <div className="border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
                  Preview · {previewStatsLabel(placeholderStats)}
                </span>
                {previewExpanded ? <ChevronUp className="h-4 w-4 text-dim-2" /> : <ChevronDown className="h-4 w-4 text-dim-2" />}
              </button>
              {previewExpanded && (
                <div className="p-6">{previewPanel}</div>
              )}
            </div>
          ) : (
            <div className="p-8">{previewPanel}</div>
          )}
        </div>

      </div>

      {/* Sparkles + X are imported but the Send icon is the only one referenced
          inline; the others are reserved for future polish chips. */}
      <span className="sr-only" aria-hidden="true">
        <Sparkles size={0} />
        <X size={0} />
      </span>
    </EditorShell>
  );
};

function previewStatsLabel(stats: { total: number; resolved: number; unresolved: number }): string {
  if (stats.total === 0) return 'no placeholders';
  if (stats.unresolved === 0) return `all ${stats.total} resolved`;
  return `${stats.unresolved} of ${stats.total} unresolved`;
}

export default EngagementWorkbench;
