import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  ArrowLeft,
  ChevronDown,
  CreditCard,
  Eye,
  ExternalLink,
  FileText,
  GripVertical,
  Lock,
  MessageSquare,
  MoreVertical,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-preact';

import { CurrencyInput, Input, Switch, Textarea } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';
import { EditorShell } from '@/shared/ui/layout';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { WidgetPreviewFrame } from '@/features/settings/components/WidgetPreviewFrame';
import type { WidgetPreviewConfig } from '@/shared/types/widgetPreview';
import type { MinorAmount } from '@/shared/utils/money';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';
import { cn } from '@/shared/utils/cn';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { listIntakes, type IntakeListItem } from '@/features/intake/api/intakesApi';
import { fromMinorUnits, toMinorUnitsValue } from '@/shared/utils/money';
import { getOnboardingStatusPayload } from '@/shared/lib/apiClient';
import { STANDARD_FIELD_DEFINITIONS, DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import type { FieldPhase, IntakeFieldDefinition, IntakeTemplate } from '@/shared/types/intake';
import { EmbedCodeDialog, getPublicFormUrl, copyTextToClipboard } from '@/features/intake/components/EmbedCodeBlock';

type IntakeTemplatesPageProps = {
  onBack?: () => void;
  practiceId?: string | null;
  basePath?: string;
  responsesPath?: string;
  routeTemplateSlug?: string | null;
  routeMode?: 'list' | 'detail' | 'editor';
};

type EditorField = IntakeFieldDefinition & { _id: string };
type EditorState = {
  name: string;
  slug: string;
  introMessage: string;
  legalDisclaimer: string;
  paymentLinkEnabled: boolean;
  consultationFee: number | null;
  requiredFields: EditorField[];
  enrichmentFields: EditorField[];
};

type BuilderSelectionId = 'none' | 'contact' | 'opening' | 'disclaimer' | 'payment' | `required:${string}` | `enrichment:${string}`;

const SLUG_RE = /^[a-z0-9-]+$/;
// Structurally locked: these fields cannot be removed, moved, or replaced —
// they are always present and always required. Practice owners CAN edit their
// label and promptHint (wording) so the AI asks the question in their voice.
const LOCKED_REQUIRED_KEYS = new Set(['description', 'city', 'state']);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function parseTemplateListFromMetadata(metadata: Record<string, unknown> | null | undefined, key: string): IntakeTemplate[] {
  if (!metadata) return [];

  const raw = metadata[key];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as IntakeTemplate[]) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? (raw as IntakeTemplate[]) : [];
}

function parseTemplatesFromMetadata(metadata: Record<string, unknown> | null | undefined): IntakeTemplate[] {
  return parseTemplateListFromMetadata(metadata, 'intakeTemplates');
}

function parseDraftTemplatesFromMetadata(metadata: Record<string, unknown> | null | undefined): IntakeTemplate[] {
  return parseTemplateListFromMetadata(metadata, 'intakeTemplateDrafts');
}

function generateFieldKey(label: string, existingKeys: Set<string>): string {
  const base = slugify(label).replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
  const fallback = base || 'customQuestion';
  if (!existingKeys.has(fallback)) return fallback;

  let suffix = 2;
  while (existingKeys.has(`${fallback}${suffix}`)) suffix += 1;
  return `${fallback}${suffix}`;
}

function getFieldPhase(field: IntakeFieldDefinition): FieldPhase {
  return field.phase ?? (field.required ? 'required' : 'enrichment');
}

function _getTemplateCounts(template: Pick<IntakeTemplate, 'fields'>) {
  let required = 0;
  let enrichment = 0;
  let custom = 0;

  for (const field of template.fields) {
    if (getFieldPhase(field) === 'required') required += 1;
    else enrichment += 1;
    if (!field.isStandard) custom += 1;
  }

  return { required, enrichment, custom, total: template.fields.length };
}

function _getPhaseLabel(phase: FieldPhase): string {
  return phase === 'required' ? 'Core' : 'AI follow-up';
}

function getResponseTemplateSlug(intake: IntakeListItem): string | null {
  const metadata = intake.metadata as Record<string, unknown> | null | undefined;
  if (!metadata) return null;
  const directSlug = metadata.intake_template_slug ?? metadata.template_slug;
  if (typeof directSlug === 'string' && directSlug.trim()) return directSlug.trim();

  // Backend intake records do not yet expose template attribution as a
  // first-class field, so the worker persists it in private custom_fields
  // metadata until the backend grows native template filtering support.
  const customFields = metadata.custom_fields ?? metadata.customFields;
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null;
  const templateSlug = (customFields as Record<string, unknown>)._intake_template_slug;
  return typeof templateSlug === 'string' && templateSlug.trim() ? templateSlug.trim() : null;
}

function getLockedRequiredFields(templateFields: EditorField[]): EditorField[] {
  const templateFieldByKey = new Map(templateFields.map((field) => [field.key, field]));
  return STANDARD_FIELD_DEFINITIONS
    .filter((field) => LOCKED_REQUIRED_KEYS.has(field.key))
    .map((field) => {
      const templateField = templateFieldByKey.get(field.key);
      return templateField ? { ...field, ...templateField, _id: field.key } : { ...field, _id: field.key };
    });
}

function buildEditorState(
  template?: IntakeTemplate,
  defaults: {
    introMessage: string;
    legalDisclaimer: string;
    paymentLinkEnabled: boolean;
    consultationFee: number | null;
  } = {
    introMessage: '',
    legalDisclaimer: '',
    paymentLinkEnabled: false,
    consultationFee: null,
  },
): EditorState {
  if (!template) {
    return {
      name: '',
      slug: '',
      introMessage: defaults.introMessage,
      legalDisclaimer: defaults.legalDisclaimer,
      paymentLinkEnabled: defaults.paymentLinkEnabled,
      consultationFee: defaults.consultationFee,
      requiredFields: getLockedRequiredFields([]),
      enrichmentFields: [],
    };
  }

  const templateFields = template.fields.map((field) => ({ ...field, _id: field.key }));
  const lockedRequiredFields = getLockedRequiredFields(templateFields);
  const lockedKeys = new Set(lockedRequiredFields.map((field) => field.key));
  const requiredFields = templateFields.filter((field) => getFieldPhase(field) === 'required' && !lockedKeys.has(field.key));
  const enrichmentFields = templateFields.filter((field) => getFieldPhase(field) === 'enrichment' && !lockedKeys.has(field.key));

  return {
    name: template.name,
    slug: template.slug,
    introMessage: template.introMessage ?? defaults.introMessage,
    legalDisclaimer: template.legalDisclaimer ?? defaults.legalDisclaimer,
    paymentLinkEnabled: template.paymentLinkEnabled ?? defaults.paymentLinkEnabled,
    consultationFee: typeof template.consultationFee === 'number' && Number.isFinite(template.consultationFee)
      ? fromMinorUnits(template.consultationFee)
      : defaults.consultationFee,
    requiredFields: [...lockedRequiredFields, ...requiredFields],
    enrichmentFields,
  };
}

function stripEditorId(field: EditorField, phase: FieldPhase): IntakeFieldDefinition {
  const { _id: _editorId, ...rest } = field;
  return {
    ...rest,
    promptHint: rest.promptHint?.trim() || undefined,
    required: phase === 'required',
    phase,
  };
}

function editorStateToTemplate(state: EditorState): IntakeTemplate {
  const slug = state.slug.trim();
  return {
    slug,
    name: state.name.trim(),
    isDefault: slug === DEFAULT_INTAKE_TEMPLATE.slug,
    introMessage: state.introMessage.trim() || undefined,
    legalDisclaimer: state.legalDisclaimer.trim() || undefined,
    paymentLinkEnabled: state.paymentLinkEnabled,
    consultationFee: (state.paymentLinkEnabled && typeof state.consultationFee === 'number' && Number.isFinite(state.consultationFee))
      ? (toMinorUnitsValue(state.consultationFee) ?? undefined)
      : undefined,
    fields: [
      ...state.requiredFields.map((field) => stripEditorId(field, 'required')),
      ...state.enrichmentFields.map((field) => stripEditorId(field, 'enrichment')),
    ],
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`;
}

function serializeTemplate(template: IntakeTemplate): string {
  return stableSerialize({
    slug: template.slug,
    name: template.name,
    introMessage: template.introMessage,
    legalDisclaimer: template.legalDisclaimer,
    paymentLinkEnabled: template.paymentLinkEnabled,
    consultationFee: template.consultationFee,
    fields: template.fields,
  });
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const moved = next.splice(fromIndex, 1)[0];
  if (!moved) return items;
  const insertAt = Math.max(0, Math.min(next.length, toIndex));
  next.splice(insertAt, 0, moved);
  return next;
}

function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (fromIndex === null || fromIndex === targetIndex) return;

    // Use the same corrected insert logic as moveItem to avoid off-by-one
    // when moving an item forward.
    const next = [...items];
    const moved = next.splice(fromIndex, 1)[0];
    if (!moved) return;
    const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    const clamped = Math.max(0, Math.min(next.length, insertAt));
    next.splice(clamped, 0, moved);
    onReorder(next);
  }, [items, onReorder]);

  const handleDragOver = useCallback((event: JSX.TargetedDragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  return { handleDragStart, handleDrop, handleDragOver };
}

function getDefaultPreviewQuestion(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
}

function getQuestionRowPreview(field: Pick<IntakeFieldDefinition, 'isStandard' | 'label' | 'previewQuestion' | 'promptHint' | 'options'>): string {
  const prompt = field.previewQuestion?.trim() || field.label.trim();
  if (prompt) return prompt;
  const hint = field.promptHint?.trim();
  if (hint) return hint;
  if (field.options?.length) return field.options.filter(Boolean).join(', ');
  return 'Add question';
}

function inferQuestionType(question: string, options?: string[]): IntakeFieldDefinition['type'] {
  const normalizedOptions = (options ?? []).map((option) => option.trim()).filter(Boolean);
  if (normalizedOptions.length > 0) {
    return 'select';
  }

  const normalizedQuestion = question.trim().toLowerCase();
  if (
    /^(do|did|does|have|has|had|is|are|was|were|can|could|should|would|will)\b/.test(normalizedQuestion)
    || /\b(do you|did you|have you|has there|is there|are there|can you|should we|would you)\b/.test(normalizedQuestion)
  ) {
    return 'boolean';
  }

  return 'text';
}

function createBlankQuestion(existingKeys: Set<string>, phase: FieldPhase): EditorField {
  const key = generateFieldKey('Custom question', existingKeys);
  return {
    key,
    label: '',
    type: 'text',
    required: phase === 'required',
    phase,
    isStandard: false,
    _id: key,
  };
}

function maskStripeAccountId(value?: string | null) {
  if (!value) return 'Not connected';
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

// Embed UI lives in src/features/intake/components/EmbedCodeBlock.tsx

type StatPillProps = {
  label: string;
  value: number;
};

function _StatPill({ label, value }: StatPillProps) {
  return (
    <div className="rounded-r-md border border-line-subtle bg-card px-3 py-2">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-dim-2">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Builder UI primitives (3-panel + mobile master-detail)
// ---------------------------------------------------------------------------

type BuilderSection = 'disclaimer' | 'intro' | 'contact' | 'required' | 'enrichment' | 'payment';

function getSectionForSelection(id: BuilderSelectionId): BuilderSection {
  if (id === 'disclaimer') return 'disclaimer';
  if (id === 'opening') return 'intro';
  if (id === 'contact') return 'contact';
  if (id === 'payment') return 'payment';
  if (id.startsWith('enrichment:')) return 'enrichment';
  return 'required';
}

function useIsDesktop(breakpointPx = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia(`(min-width: ${breakpointPx}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width: ${breakpointPx}px)`);
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpointPx]);
  return isDesktop;
}

function SectionHeaderLabel({ children }: { children: string }) {
  return (
    <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-dim-2">
      {children}
    </p>
  );
}

type SectionBadge = { label: string; tone: 'optional' | 'required' };

type SectionCardProps = {
  number: number;
  icon: JSX.Element;
  title: string;
  badge?: SectionBadge;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSelectHeader?: () => void;
  children?: JSX.Element | JSX.Element[] | null;
};

function SectionCard({ number, icon, title, badge, isActive, isOpen, onToggle, onSelectHeader, children }: SectionCardProps) {
  const hasBody = Boolean(children);
  return (
    <div
      className={cn(
        'rounded-r-md border bg-card transition-colors',
        isActive ? 'border-line-subtle border-l-[3px] border-l-accent-500' : 'border-line-subtle',
      )}
    >
      <div className="flex items-center gap-2 p-3.5">
        <button
          type="button"
          onClick={() => {
            onSelectHeader?.();
            if (hasBody && !isOpen) onToggle();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="font-mono text-xs text-dim-2">{number}.</span>
          <span className="text-dim-2">{icon}</span>
          <span className="truncate text-sm font-medium text-ink">{title}</span>
        </button>
        {badge ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              badge.tone === 'required'
                ? 'bg-accent text-[rgb(var(--accent-foreground))]'
                : 'bg-card text-dim-2',
            )}
          >
            {badge.label}
          </span>
        ) : null}
        {hasBody ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            aria-expanded={isOpen}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-dim-2 hover:text-ink"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
          </button>
        ) : null}
      </div>
      {hasBody && isOpen ? (
        <div className="border-t border-line-subtle px-2.5 pb-2.5 pt-1.5">{children}</div>
      ) : null}
    </div>
  );
}

type QuestionRowProps = {
  label: string;
  preview?: string;
  isSelected: boolean;
  isLocked?: boolean;
  badgeLabel?: string;
  onSelect: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragHandlers?: {
    onDragStart: () => void;
    onDrop: () => void;
    onDragOver: (event: JSX.TargetedDragEvent<HTMLElement>) => void;
  };
};

function QuestionRow({ label, preview, isSelected, isLocked, badgeLabel, onSelect, onMoveUp, onMoveDown, dragHandlers }: QuestionRowProps) {
  const draggable = !isLocked && Boolean(dragHandlers);
  const displayLabel = label.trim() || 'Untitled question';
  const previewText = preview?.trim();

  const handleGripKey = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && onMoveUp) {
      event.preventDefault();
      onMoveUp();
    } else if (event.key === 'ArrowDown' && onMoveDown) {
      event.preventDefault();
      onMoveDown();
    }
  };

  return (
    <div
      role="listitem"
      aria-label={displayLabel}
      aria-grabbed={draggable ? false : undefined}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors',
        isSelected ? 'bg-accent/10' : 'hover:bg-card/60',
      )}
      draggable={draggable}
      onDragStart={dragHandlers?.onDragStart}
      onDrop={dragHandlers?.onDrop}
      onDragOver={dragHandlers?.onDragOver}
    >
      {isLocked ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-dim-2" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onKeyDown={handleGripKey}
          aria-label={`Reorder ${displayLabel} — Arrow Up or Down to move`}
          className="inline-flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center rounded text-dim-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/45"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
      >
        <span className="block truncate text-ink">{displayLabel}</span>
        {previewText ? <span className="block truncate text-xs text-dim-2">{previewText}</span> : null}
      </button>
      {badgeLabel ? (
        <span className="shrink-0 text-[11px] font-medium text-dim-2">{badgeLabel}</span>
      ) : null}
    </div>
  );
}

function LockedFieldChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-card px-2 py-0.5 text-[11px] font-medium text-dim-2">
      <Lock className="h-3 w-3" />
      {label}
    </span>
  );
}

function AddInlineButton({ children, onClick, disabled = false }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line-subtle px-2 py-1.5 text-xs font-medium text-dim-2 transition-colors hover:border-line-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function ConfigField({
  label,
  children,
  charCount,
}: {
  label: string;
  children: JSX.Element | JSX.Element[];
  charCount?: { value: string; max: number };
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {charCount ? (
        <span className="self-end text-[11px] text-dim-2">
          {charCount.value.length}/{charCount.max}
        </span>
      ) : null}
    </div>
  );
}


type TemplateEditorProps = {
  initial?: IntakeTemplate;
  hasSavedDraft?: boolean;
  existingTemplates: IntakeTemplate[];
  practiceSlug: string;
  practiceOrganizationId?: string | null;
  practiceBusinessEmail?: string | null;
  defaultIntroMessage: string;
  defaultLegalDisclaimer: string;
  currencyCode: string;
  practicePreviewConfig: {
    name?: string;
    profileImage?: string | null;
    accentColor?: string;
  };
  onCancel: () => void;
  onSaveDraft: (template: IntakeTemplate) => Promise<void>;
  onPublish: (template: IntakeTemplate) => Promise<void>;
  onDiscardDraft: (slug: string) => Promise<void>;
};

function TemplateEditor({
  initial,
  hasSavedDraft: initialHasSavedDraft = false,
  existingTemplates,
  practiceSlug,
  practiceOrganizationId = null,
  practiceBusinessEmail = null,
  defaultIntroMessage,
  defaultLegalDisclaimer,
  currencyCode,
  practicePreviewConfig,
  onCancel,
  onSaveDraft,
  onPublish,
  onDiscardDraft,
}: TemplateEditorProps) {
  const { showError, showSuccess } = useToastContext();
  const { navigate } = useNavigation();
  const editorDefaults = useMemo(() => ({
    introMessage: defaultIntroMessage,
    legalDisclaimer: defaultLegalDisclaimer,
    paymentLinkEnabled: false,
    consultationFee: null,
  }), [defaultIntroMessage, defaultLegalDisclaimer]);
  const initialState = useMemo(() => buildEditorState(initial, editorDefaults), [editorDefaults, initial]);
  const initialSnapshot = useMemo(() => serializeTemplate(editorStateToTemplate(initialState)), [initialState]);
  const [state, setState] = useState<EditorState>(initialState);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const [hasSavedDraft, setHasSavedDraft] = useState(initialHasSavedDraft);
  const [discardPending, setDiscardPending] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<BuilderSelectionId>('contact');

  const applyEditorState = useCallback((updater: (prev: EditorState) => EditorState) => {
    setState(updater);
  }, []);

  const draftTemplate = useMemo(() => editorStateToTemplate(state), [state]);
  const draftSnapshot = useMemo(() => serializeTemplate(draftTemplate), [draftTemplate]);
  const hasChanges = draftSnapshot !== savedSnapshot;
  const practiceCanvasName = practicePreviewConfig.name?.trim() || 'Blawby Messenger';
  const practiceCanvasLogo = practicePreviewConfig.profileImage ?? null;
  const hasStripeAccount = Boolean(stripeStatus?.stripe_account_id);
  const payoutsEnabled = stripeStatus?.payouts_enabled === true;
  const stripeStatusLabel = hasStripeAccount
    ? payoutsEnabled
      ? 'Ready'
      : 'Verification in progress'
    : 'Not connected';

  const lockedRequiredFields = useMemo(
    () => state.requiredFields.filter((field) => LOCKED_REQUIRED_KEYS.has(field.key)),
    [state.requiredFields],
  );
  const movableRequiredFields = useMemo(
    () => state.requiredFields.filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key)),
    [state.requiredFields],
  );
  const validateSlug = (slug: string): boolean => {
    const trimmed = slug.trim();
    if (!trimmed) {
      setSlugError('Slug is required.');
      return false;
    }
    if (!SLUG_RE.test(trimmed)) {
      setSlugError('Slug must use lowercase letters, numbers, and hyphens only.');
      return false;
    }
    if (trimmed === 'default' && initial?.slug !== 'default') {
      setSlugError('"default" is reserved.');
      return false;
    }
    if (existingTemplates.some((template) => template.slug === trimmed && template.slug !== initial?.slug)) {
      setSlugError('A form with this slug already exists.');
      return false;
    }
    setSlugError(null);
    return true;
  };

  const requiredDrag = useDragReorder(movableRequiredFields, (next) => {
    applyEditorState((prev) => ({ ...prev, requiredFields: [...lockedRequiredFields, ...next] }));
  });
  const enrichmentDrag = useDragReorder(state.enrichmentFields, (next) => {
    applyEditorState((prev) => ({ ...prev, enrichmentFields: next }));
  });

  const moveRequiredField = useCallback((fromIndex: number, toIndex: number) => {
    applyEditorState((prev) => {
      const locked = prev.requiredFields.filter((field) => LOCKED_REQUIRED_KEYS.has(field.key));
      const movable = prev.requiredFields.filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key));
      return { ...prev, requiredFields: [...locked, ...moveItem(movable, fromIndex, toIndex)] };
    });
  }, [applyEditorState]);

  const moveEnrichmentField = useCallback((fromIndex: number, toIndex: number) => {
    applyEditorState((prev) => ({
      ...prev,
      enrichmentFields: moveItem(prev.enrichmentFields, fromIndex, toIndex),
    }));
  }, [applyEditorState]);



  useEffect(() => {
    const organizationId = practiceOrganizationId?.trim();
    if (!organizationId) {
      setStripeStatus(null);
      return;
    }

    const controller = new AbortController();
    setIsStripeLoading(true);
    getOnboardingStatusPayload(organizationId, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setStripeStatus(extractStripeStatusFromPayload(payload));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('[IntakeTemplatesPage] Failed to load Stripe status:', error);
        setStripeStatus(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsStripeLoading(false);
        }
      });

    return () => controller.abort();
  }, [practiceOrganizationId]);

  const handleNameChange = (name: string) => {
    applyEditorState((prev) => ({
      ...prev,
      name,
      slug: initial?.slug === DEFAULT_INTAKE_TEMPLATE.slug ? DEFAULT_INTAKE_TEMPLATE.slug : slugify(name),
    }));
    setSlugError(null);
  };

  const updateField = (key: string, phase: FieldPhase, updater: (field: EditorField) => EditorField) => {
    applyEditorState((prev) => {
      const update = (fields: EditorField[]) => fields.map((field) => field.key === key ? updater(field) : field);
      return phase === 'required'
        ? { ...prev, requiredFields: update(prev.requiredFields) }
        : { ...prev, enrichmentFields: update(prev.enrichmentFields) };
    });
  };

  const updateFieldLabel = (key: string, phase: FieldPhase, value: string) => {
    updateField(key, phase, (field) => {
      if (field.isStandard) {
        // Standard fields: store value as-is. Do NOT auto-append '?' on every
        // keystroke — it re-injects into the canvas value each render, causing
        // the '?f?s?d?' cascade. The user can write whatever phrasing they want.
        return {
          ...field,
          label: value,
          previewQuestion: value,
        };
      }

      return {
        ...field,
        label: value,
        previewQuestion: getDefaultPreviewQuestion(value),
      };
    });
  };

  const updateFieldHint = (key: string, phase: FieldPhase, value: string) => {
    updateField(key, phase, (field) => ({ ...field, promptHint: value || undefined }));
  };

  const finalizeFieldLabel = (key: string, phase: FieldPhase) => {
    updateField(key, phase, (field) => {
      if (field.isStandard) return field;
      return {
        ...field,
        type: inferQuestionType(field.label, field.options),
      };
    });
  };

  const changeFieldPhase = (key: string, fromPhase: FieldPhase, nextPhase: FieldPhase) => {
    if (fromPhase === nextPhase || LOCKED_REQUIRED_KEYS.has(key)) return;

    applyEditorState((prev) => {
      const source = fromPhase === 'required' ? prev.requiredFields : prev.enrichmentFields;
      const field = source.find((item) => item.key === key);
      if (!field) return prev;
      const movedField: EditorField = {
        ...field,
        required: nextPhase === 'required',
        phase: nextPhase,
      };

      if (fromPhase === 'required') {
        return {
          ...prev,
          requiredFields: prev.requiredFields.filter((item) => item.key !== key),
          enrichmentFields: [...prev.enrichmentFields, movedField],
        };
      }

      return {
        ...prev,
        requiredFields: [...prev.requiredFields, movedField],
        enrichmentFields: prev.enrichmentFields.filter((item) => item.key !== key),
      };
    });
    setSelectedItemId(`${nextPhase}:${key}`);
  };

  const removeField = (key: string, phase: FieldPhase) => {
    if (LOCKED_REQUIRED_KEYS.has(key)) return;
    applyEditorState((prev) => (
      phase === 'required'
        ? { ...prev, requiredFields: prev.requiredFields.filter((field) => field.key !== key) }
        : { ...prev, enrichmentFields: prev.enrichmentFields.filter((field) => field.key !== key) }
    ));
    setSelectedItemId('contact');
  };

  const addBlankField = (phase: FieldPhase) => {
    const keys = new Set([...state.requiredFields, ...state.enrichmentFields].map((field) => field.key));
    const nextField = createBlankQuestion(keys, phase);
    applyEditorState((prev) => (
      phase === 'required'
        ? { ...prev, requiredFields: [...prev.requiredFields, nextField] }
        : { ...prev, enrichmentFields: [...prev.enrichmentFields, nextField] }
    ));
    setSelectedItemId(`${phase}:${nextField.key}`);
  };

  const addPaymentStep = () => {
    applyEditorState((prev) => ({
      ...prev,
      paymentLinkEnabled: true,
      consultationFee: prev.consultationFee,
    }));
    setSelectedItemId('payment');
  };

  const removePaymentStep = () => {
    applyEditorState((prev) => ({
      ...prev,
      paymentLinkEnabled: false,
    }));
    setSelectedItemId('contact');
  };

  const validatePublish = (currentState: EditorState) => {
    if (!currentState.name.trim()) {
      showError('Form name is required.');
      return false;
    }
    if (!validateSlug(currentState.slug)) return false;

    const allFields = [...currentState.requiredFields, ...currentState.enrichmentFields];
    for (const field of allFields) {
      if (!field.isStandard) {
        if (!field.previewQuestion?.trim()) {
          showError('Question prompt required', `The question for "${field.label}" cannot be empty.`);
          return false;
        }
        if (!field.promptHint?.trim()) {
          showError('AI instruction required', `The AI instruction for "${field.label}" cannot be empty.`);
          return false;
        }
      }
    }

    // Ensure that required standard fields display a non-empty label and previewQuestion
    const invalidStandardRequired: string[] = [];
    for (const field of currentState.requiredFields) {
      if (field.isStandard) {
        const trimmedLabel = field.label.trim();
        const trimmedPreview = (field.previewQuestion ?? '').trim().replace(/\?$/, '');
        if (!trimmedLabel || !trimmedPreview) {
          invalidStandardRequired.push(trimmedLabel || field.key);
        }
      }
    }
    if (invalidStandardRequired.length > 0) {
      showError('Required questions incomplete', `Please fill the following required questions: ${invalidStandardRequired.join(', ')}.`);
      return false;
    }

    if (currentState.paymentLinkEnabled) {
      if (typeof currentState.consultationFee !== 'number' || !Number.isFinite(currentState.consultationFee) || currentState.consultationFee < 0.5) {
        showError('Payment amount required', 'Payment requirements must be at least $0.50.');
        return false;
      }
      if (!stripeStatus?.details_submitted) {
        showError('Stripe not ready', 'Your Stripe account must be fully set up before enabling payments.');
        return false;
      }
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!state.name.trim()) {
      showError('Form name is required.');
      return;
    }
    if (!validateSlug(state.slug)) return;

    setIsSaving(true);
    try {
      const template = editorStateToTemplate(state);
      await onSaveDraft(template);
      setSavedSnapshot(serializeTemplate(template));
      setHasSavedDraft(true);
      setDiscardPending(false);
      showSuccess('Draft saved', `"${template.name}" draft saved.`);
    } catch {
      // Parent handler surfaces the API/source-of-truth error.
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validatePublish(state)) return;

    setIsPublishing(true);
    try {
      const template = editorStateToTemplate(state);
      await onPublish(template);
      setSavedSnapshot(serializeTemplate(template));
      setHasSavedDraft(false);
      setDiscardPending(false);
      showSuccess('Published', `"${template.name}" is live.`);
    } catch {
      // Parent handler surfaces the API/source-of-truth error.
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!hasChanges && !hasSavedDraft) return;
    if (!discardPending) {
      setDiscardPending(true);
      return;
    }

    setIsSaving(true);
    try {
      await onDiscardDraft(state.slug || initial?.slug || draftTemplate.slug);
      setHasSavedDraft(false);
      setDiscardPending(false);
      showSuccess('Draft discarded', 'Draft changes were removed.');
      onCancel();
    } catch {
      // Parent handler surfaces the API/source-of-truth error.
    } finally {
      setIsSaving(false);
    }
  };

  const isDesktop = useIsDesktop();
  const [mobileView, setMobileView] = useState<'list' | 'config' | 'preview'>('list');
  const [openSections, setOpenSections] = useState<Record<BuilderSection, boolean>>({
    disclaimer: false,
    intro: false,
    contact: true,
    required: true,
    enrichment: true,
    payment: false,
  });
  const toggleSection = (key: BuilderSection) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const headerTitle = (
    <div className="min-w-0">
      <input
        type="text"
        value={state.name}
        onInput={(event) => handleNameChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="New intake form"
        disabled={isSaving}
        className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-ink outline-none transition-colors placeholder:text-dim-2 hover:border-line-subtle focus:border-line-subtle focus:bg-paper-2/10"
        aria-label="Form title"
      />
      {slugError ? <p className="mt-1 text-xs text-rose-500">{slugError}</p> : null}
    </div>
  );

  const effectiveSelectedItemId = useMemo(() => {
    // Payment selection is preserved even when the step is disabled — the
    // inspector renders an "Enable payment step" toggle the user clicks to
    // turn it on.
    if (selectedItemId.startsWith('required:')) {
      const key = selectedItemId.slice('required:'.length);
      return state.requiredFields.some((field) => field.key === key) ? selectedItemId : 'contact';
    }
    if (selectedItemId.startsWith('enrichment:')) {
      const key = selectedItemId.slice('enrichment:'.length);
      return state.enrichmentFields.some((field) => field.key === key) ? selectedItemId : 'contact';
    }
    return selectedItemId;
  }, [selectedItemId, state.enrichmentFields, state.requiredFields]);

  const selectedFieldContext = useMemo(() => {
    if (effectiveSelectedItemId.startsWith('required:')) {
      const key = effectiveSelectedItemId.slice('required:'.length);
      const field = state.requiredFields.find((item) => item.key === key);
      return field ? { field, phase: 'required' as const } : null;
    }
    if (effectiveSelectedItemId.startsWith('enrichment:')) {
      const key = effectiveSelectedItemId.slice('enrichment:'.length);
      const field = state.enrichmentFields.find((item) => item.key === key);
      return field ? { field, phase: 'enrichment' as const } : null;
    }
    return null;
  }, [effectiveSelectedItemId, state.enrichmentFields, state.requiredFields]);

  const selectBuilderItem = useCallback((nextSelection: BuilderSelectionId) => {
    if (
      selectedFieldContext
      && !selectedFieldContext.field.isStandard
      && selectedFieldContext.field.label.trim() === ''
      && !selectedFieldContext.field.previewQuestion?.trim()
      && !(selectedFieldContext.field.options?.length)
      && nextSelection !== effectiveSelectedItemId
    ) {
      applyEditorState((prev) => (
        selectedFieldContext.phase === 'required'
          ? { ...prev, requiredFields: prev.requiredFields.filter((field) => field.key !== selectedFieldContext.field.key) }
          : { ...prev, enrichmentFields: prev.enrichmentFields.filter((field) => field.key !== selectedFieldContext.field.key) }
      ));
      showSuccess('Question discarded', 'Untitled question was removed.');
    }

    setSelectedItemId(nextSelection);
  }, [applyEditorState, effectiveSelectedItemId, selectedFieldContext, showSuccess]);

  const activeSection = getSectionForSelection(effectiveSelectedItemId);

  const selectItem = useCallback((id: BuilderSelectionId) => {
    selectBuilderItem(id);
    if (!isDesktop) setMobileView('config');
  }, [isDesktop, selectBuilderItem]);

  const publishDisabled = isSaving || isPublishing || (!hasChanges && !hasSavedDraft);
  const draftStatusLabel = hasChanges
    ? 'Unsaved changes'
    : hasSavedDraft
      ? 'Draft saved'
      : 'Live';
  const headerActions = (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex',
          hasChanges
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : hasSavedDraft
              ? 'border-line-subtle bg-card text-dim-2'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        )}
      >
        {draftStatusLabel}
      </span>
      {!isDesktop ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={Eye}
          onClick={() => setMobileView('preview')}
          disabled={isSaving}
        >
          Preview
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void handleSaveDraft()}
        disabled={isSaving || isPublishing || !hasChanges}
      >
        {isSaving ? 'Saving...' : 'Save draft'}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => void handlePublish()}
        disabled={publishDisabled}
      >
        {isPublishing ? 'Publishing...' : 'Publish'}
      </Button>
    </div>
  );

  // ── Sidebar — accordion section cards ───────────────────────────────────
  const formStructure = (
    <div className="flex flex-col gap-3 overflow-visible">
      <SectionHeaderLabel>FORM STRUCTURE</SectionHeaderLabel>
      {discardPending ? (
        <div className="rounded-r-md border border-rose-500/20 bg-rose-500/10 p-3">
          <p className="text-sm font-semibold text-ink">Discard draft changes?</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleDiscardDraft()}
              disabled={isSaving}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDiscardPending(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : hasChanges || hasSavedDraft ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleDiscardDraft()}
          disabled={isSaving || isPublishing}
          className="justify-start"
        >
          Discard changes
        </Button>
      ) : null}

      <SectionCard
        number={1}
        icon={<FileText className="h-4 w-4" />}
        title="Disclaimer text"
        badge={{ label: 'Optional', tone: 'optional' }}
        isActive={activeSection === 'disclaimer'}
        isOpen={openSections.disclaimer}
        onToggle={() => toggleSection('disclaimer')}
        onSelectHeader={() => selectItem('disclaimer')}
      />

      <SectionCard
        number={2}
        icon={<MessageSquare className="h-4 w-4" />}
        title="Intro text"
        badge={{ label: 'Optional', tone: 'optional' }}
        isActive={activeSection === 'intro'}
        isOpen={openSections.intro}
        onToggle={() => toggleSection('intro')}
        onSelectHeader={() => selectItem('opening')}
      />

      <SectionCard
        number={3}
        icon={<Lock className="h-4 w-4" />}
        title="Auto-collected contact info"
        isActive={activeSection === 'contact'}
        isOpen={openSections.contact}
        onToggle={() => toggleSection('contact')}
        onSelectHeader={() => selectItem('contact')}
      >
        <div className="flex flex-wrap gap-1.5 px-1 pb-1">
          <LockedFieldChip label="Full name" />
          <LockedFieldChip label="Email" />
          <LockedFieldChip label="Phone" />
        </div>
      </SectionCard>

      <SectionCard
        number={4}
        icon={<MessageSquare className="h-4 w-4" />}
        title="Intake questions"
        badge={{ label: 'Required', tone: 'required' }}
        isActive={activeSection === 'required'}
        isOpen={openSections.required}
        onToggle={() => toggleSection('required')}
      >
        <div role="list" aria-label="Intake questions" className="flex flex-col gap-1">
          {lockedRequiredFields.map((field) => (
            <QuestionRow
              key={field.key}
              label={field.label}
              preview={getQuestionRowPreview(field)}
              isSelected={effectiveSelectedItemId === `required:${field.key}`}
              isLocked
              badgeLabel="Required"
              onSelect={() => selectItem(`required:${field.key}`)}
            />
          ))}
          {movableRequiredFields.map((field, index) => (
            <QuestionRow
              key={field._id}
              label={field.label}
              preview={getQuestionRowPreview(field)}
              isSelected={effectiveSelectedItemId === `required:${field.key}`}
              badgeLabel="Required"
              onSelect={() => selectItem(`required:${field.key}`)}
              onMoveUp={index > 0 ? () => moveRequiredField(index, index - 1) : undefined}
              onMoveDown={
                index < movableRequiredFields.length - 1
                  ? () => moveRequiredField(index, index + 1)
                  : undefined
              }
              dragHandlers={{
                onDragStart: () => requiredDrag.handleDragStart(index),
                onDrop: () => requiredDrag.handleDrop(index),
                onDragOver: requiredDrag.handleDragOver,
              }}
            />
          ))}
          <AddInlineButton
            onClick={() => {
              addBlankField('required');
              if (!isDesktop) setMobileView('config');
            }}
            disabled={isSaving}
          >
            Add question
          </AddInlineButton>
        </div>
      </SectionCard>

      <SectionCard
        number={5}
        icon={<Sparkles className="h-4 w-4" />}
        title="AI-assisted follow-up"
        isActive={activeSection === 'enrichment'}
        isOpen={openSections.enrichment}
        onToggle={() => toggleSection('enrichment')}
      >
        <div role="list" aria-label="AI follow-up questions" className="flex flex-col gap-1">
          {state.enrichmentFields.map((field, index) => (
            <QuestionRow
              key={field._id}
              label={field.label}
              preview={getQuestionRowPreview(field)}
              isSelected={effectiveSelectedItemId === `enrichment:${field.key}`}
              onSelect={() => selectItem(`enrichment:${field.key}`)}
              onMoveUp={index > 0 ? () => moveEnrichmentField(index, index - 1) : undefined}
              onMoveDown={
                index < state.enrichmentFields.length - 1
                  ? () => moveEnrichmentField(index, index + 1)
                  : undefined
              }
              dragHandlers={{
                onDragStart: () => enrichmentDrag.handleDragStart(index),
                onDrop: () => enrichmentDrag.handleDrop(index),
                onDragOver: enrichmentDrag.handleDragOver,
              }}
            />
          ))}
          <AddInlineButton
            onClick={() => {
              addBlankField('enrichment');
              if (!isDesktop) setMobileView('config');
            }}
            disabled={isSaving}
          >
            Add follow-up question
          </AddInlineButton>
        </div>
      </SectionCard>

      <SectionCard
        number={6}
        icon={<CreditCard className="h-4 w-4" />}
        title="Payment step"
        badge={{ label: 'Optional', tone: 'optional' }}
        isActive={activeSection === 'payment'}
        isOpen={openSections.payment}
        onToggle={() => toggleSection('payment')}
        onSelectHeader={() => selectItem('payment')}
      />
    </div>
  );

  // ── Center — live preview ───────────────────────────────────────────────
  const previewConfig = useMemo<WidgetPreviewConfig>(() => ({
    name: practiceCanvasName,
    profileImage: practiceCanvasLogo,
    accentColor: practicePreviewConfig.accentColor,
    introMessage: draftTemplate.introMessage ?? null,
    legalDisclaimer: draftTemplate.legalDisclaimer ?? null,
    consultationFee: typeof draftTemplate.consultationFee === 'number'
      ? (draftTemplate.consultationFee as MinorAmount)
      : null,
    paymentLinkEnabled: draftTemplate.paymentLinkEnabled,
    currency: currencyCode,
    intakeTemplate: draftTemplate,
  }), [practiceCanvasName, practiceCanvasLogo, practicePreviewConfig.accentColor, draftTemplate, currencyCode]);
  const publicFormUrl = useMemo(
    () => getPublicFormUrl(practiceSlug, draftTemplate.slug),
    [draftTemplate.slug, practiceSlug],
  );

  // Parent-overlay highlight: when the sidebar selection changes, briefly ring
  // the preview frame as a visual ping. The real widget DOM isn't ours to
  // traverse, so we acknowledge selection at the frame level rather than
  // pinpointing a bubble.
  const [showPreviewPing, setShowPreviewPing] = useState(false);
  useEffect(() => {
    if (effectiveSelectedItemId === 'none' || effectiveSelectedItemId === 'contact') {
      setShowPreviewPing(false);
      return;
    }
    setShowPreviewPing(true);
    const id = setTimeout(() => setShowPreviewPing(false), 1500);
    return () => clearTimeout(id);
  }, [effectiveSelectedItemId]);

  const livePreview = (
    <div className="flex h-full flex-col items-center py-4">
      <div className="w-full max-w-[380px] overflow-hidden rounded-r-md border border-line-subtle bg-card shadow-glass">
        <div className="flex h-11 items-center justify-between border-b border-line-subtle bg-paper-2/50 px-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Widget preview</p>
            <p className="truncate text-xs text-dim-2">{practiceSlug || 'public form'} / {draftTemplate.slug || 'new'}</p>
          </div>
          <a
            href={publicFormUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open public form preview"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim-2 transition-colors hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div className="relative">
          <WidgetPreviewFrame
            practiceSlug={practiceSlug}
            scenario="intake-template"
            config={previewConfig}
            showTitle={false}
            viewportClassName="h-[640px] max-h-[calc(100svh-12rem)] min-h-[560px]"
            initialIntakeStep="conversation"
            framed={false}
          />
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 rounded-b-xl ring-2 ring-accent-500 transition-opacity duration-500',
              showPreviewPing ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
      </div>
    </div>
  );

  // ── Inspector — per-selection config ─────────────────────────────────────
  const closeInspector = () => {
    if (isDesktop) {
      // Clear selection so the inspector falls back to its empty state.
      setSelectedItemId('none');
    } else {
      setMobileView('list');
    }
  };

  const renderConfigBody = (): JSX.Element => {
    if (selectedFieldContext) {
      const isLocked = LOCKED_REQUIRED_KEYS.has(selectedFieldContext.field.key);
      const isStandard = selectedFieldContext.field.isStandard;
      return (
        <div className="flex flex-col gap-4 p-4">
          <ConfigField label="Question label" charCount={{ value: selectedFieldContext.field.label, max: 120 }}>
            <Input
              type="text"
              value={selectedFieldContext.field.label}
              maxLength={120}
              onChange={(value) => updateFieldLabel(
                selectedFieldContext.field.key,
                selectedFieldContext.phase,
                value,
              )}
              onBlur={() => finalizeFieldLabel(selectedFieldContext.field.key, selectedFieldContext.phase)}
              placeholder="What is your legal situation?"
              disabled={isSaving}
            />
          </ConfigField>
          <ConfigField label="Helper text" charCount={{ value: selectedFieldContext.field.promptHint ?? '', max: 120 }}>
            <Input
              type="text"
              value={selectedFieldContext.field.promptHint ?? ''}
              maxLength={120}
              onChange={(value) => updateFieldHint(
                selectedFieldContext.field.key,
                selectedFieldContext.phase,
                value,
              )}
              placeholder="Describe how the AI should ask this question"
              disabled={isSaving}
            />
          </ConfigField>
          {!isStandard ? (
            <ConfigField label="Placeholder" charCount={{ value: selectedFieldContext.field.previewQuestion ?? '', max: 120 }}>
              <Input
                type="text"
                value={selectedFieldContext.field.previewQuestion ?? ''}
                maxLength={120}
                onChange={(value) => updateField(
                  selectedFieldContext.field.key,
                  selectedFieldContext.phase,
                  (field) => ({ ...field, previewQuestion: value }),
                )}
                placeholder="e.g. Divorce, contract dispute..."
                disabled={isSaving}
              />
            </ConfigField>
          ) : null}
          <ConfigField label="Answer type">
            <button
              type="button"
              disabled
              className="flex items-center justify-between rounded-lg border border-line-subtle bg-card px-3 py-2 text-left text-sm text-ink"
            >
              <span>Free text</span>
              <ChevronDown className="h-4 w-4 text-dim-2" />
            </button>
          </ConfigField>
          <Switch
            label="Required"
            description="Clients must answer this question"
            value={selectedFieldContext.phase === 'required'}
            onChange={(checked) => changeFieldPhase(
              selectedFieldContext.field.key,
              selectedFieldContext.phase,
              checked ? 'required' : 'enrichment',
            )}
            disabled={isLocked || isSaving}
          />
          {!isLocked ? (
            <>
              <div className="h-px bg-line-utility" />
              <Button
                type="button"
                variant="danger"
                icon={Trash2}
                onClick={() => removeField(selectedFieldContext.field.key, selectedFieldContext.phase)}
                disabled={isSaving}
                className="w-full justify-center"
              >
                Delete question
              </Button>
            </>
          ) : null}
        </div>
      );
    }

    if (effectiveSelectedItemId === 'payment') {
      return (
        <div className="flex flex-col gap-4 p-4">
          <Switch
            label="Enable payment step"
            value={state.paymentLinkEnabled}
            onChange={(checked) => {
              if (checked) addPaymentStep();
              else removePaymentStep();
            }}
            disabled={isSaving}
          />
          {state.paymentLinkEnabled ? (
            <>
              {isStripeLoading ? (
                <SettingsNotice variant="info">Checking your Stripe payout setup.</SettingsNotice>
              ) : !hasStripeAccount ? (
                <SettingsNotice variant="warning">
                  Connect Stripe in payouts before publishing a payment step.
                </SettingsNotice>
              ) : (
                <SettingsNotice variant={payoutsEnabled ? 'info' : 'warning'}>
                  Payments will be sent to {maskStripeAccountId(stripeStatus?.stripe_account_id)} via {practiceBusinessEmail?.trim() || 'your practice email'} ({stripeStatusLabel}).
                </SettingsNotice>
              )}
              <ConfigField label="Consultation fee">
                <CurrencyInput
                  value={state.consultationFee ?? undefined}
                  onChange={(value) => applyEditorState((prev) => ({
                    ...prev,
                    consultationFee: typeof value === 'number' && Number.isFinite(value) ? value : null,
                  }))}
                  placeholder="150.00"
                  min={0.5}
                  step={0.01}
                  description={currencyCode}
                />
              </ConfigField>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/practice/${encodeURIComponent(practiceSlug)}/settings/practice/payouts`)}
              >
                Manage payouts
              </Button>
            </>
          ) : null}
        </div>
      );
    }

    if (effectiveSelectedItemId === 'disclaimer') {
      return (
        <div className="flex flex-col gap-4 p-4">
          <Switch
            label="Include legal disclaimer"
            description="Shown to clients before the intake conversation begins"
            value={Boolean(state.legalDisclaimer.trim())}
            onChange={(checked) => applyEditorState((prev) => ({
              ...prev,
              legalDisclaimer: checked
                ? (prev.legalDisclaimer.trim() || defaultLegalDisclaimer || 'This chat does not create an attorney-client relationship.')
                : '',
            }))}
            disabled={isSaving}
          />
          <ConfigField label="Disclaimer text">
            <Textarea
              value={state.legalDisclaimer}
              onChange={(value) => applyEditorState((prev) => ({ ...prev, legalDisclaimer: value }))}
              placeholder="By continuing, you acknowledge..."
              rows={5}
              maxLength={500}
              showCharCount
              disabled={isSaving}
            />
          </ConfigField>
        </div>
      );
    }

    if (effectiveSelectedItemId === 'opening') {
      return (
        <div className="flex flex-col gap-4 p-4">
          <Switch
            label="Include intro message"
            description="Shown after the disclaimer, before the first question"
            value={Boolean(state.introMessage.trim())}
            onChange={(checked) => applyEditorState((prev) => ({
              ...prev,
              introMessage: checked
                ? (prev.introMessage.trim() || defaultIntroMessage || 'How can we help you today?')
                : '',
            }))}
            disabled={isSaving}
          />
          <ConfigField label="Intro text">
            <Textarea
              value={state.introMessage}
              onChange={(value) => applyEditorState((prev) => ({ ...prev, introMessage: value }))}
              placeholder="Welcome — tell us about your legal situation."
              rows={4}
              maxLength={300}
              showCharCount
              disabled={isSaving}
            />
          </ConfigField>
        </div>
      );
    }

    if (effectiveSelectedItemId === 'contact') {
      // Contact info is synced from the practice profile — there is nothing
      // editable here, so the inspector renders a compact, low-chrome state
      // instead of a full settings panel.
      return (
        <div className="flex flex-col gap-2 p-4 text-sm text-dim-2">
          Name, email, and phone are collected automatically before the conversation starts. These fields cannot be edited from the question builder.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 p-4 text-sm text-dim-2">
        Select a section or question to configure.
      </div>
    );
  };

  const inspectorTitle: string = (() => {
    if (selectedFieldContext) return 'Question Settings';
    if (effectiveSelectedItemId === 'payment') return 'Payment step';
    if (effectiveSelectedItemId === 'disclaimer') return 'Disclaimer';
    if (effectiveSelectedItemId === 'opening') return 'Intro text';
    if (effectiveSelectedItemId === 'contact') return 'Contact info';
    return 'Settings';
  })();
  const inspectorBreadcrumb = selectedFieldContext
    ? `Intake form / ${selectedFieldContext.phase === 'required' ? 'Intake questions' : 'AI-assisted follow-up'} / ${selectedFieldContext.field.label.trim() || 'Untitled question'}`
    : `Intake form / ${inspectorTitle}`;

  // Hide the close X when the inspector has no editable controls (none /
  // contact) — those states are themselves "collapsed", so there's nothing
  // meaningful to close back to.
  const showCloseButton = effectiveSelectedItemId !== 'none' && effectiveSelectedItemId !== 'contact';
  const inspectorPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{inspectorTitle}</p>
          <p className="truncate text-xs text-dim-2">{inspectorBreadcrumb}</p>
        </div>
        {showCloseButton ? (
          <button
            type="button"
            onClick={closeInspector}
            aria-label="Close panel"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-dim-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{renderConfigBody()}</div>
    </div>
  );

  // ── Mobile master-detail ────────────────────────────────────────────────
  if (!isDesktop) {
    if (mobileView === 'config') {
      const mobileTitle = selectedFieldContext
        ? (selectedFieldContext.field.label.trim() || 'Untitled question')
        : inspectorTitle;
      return (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b border-line-subtle px-3 py-3">
            <Button
              type="button"
              variant="icon"
              size="icon-sm"
              icon={ArrowLeft}
              aria-label="Back to list"
              onClick={() => setMobileView('list')}
            />
            <h1 className="flex-1 text-center text-sm font-semibold text-ink">{mobileTitle}</h1>
            <span className="w-8" aria-hidden="true" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{renderConfigBody()}</div>
        </div>
      );
    }

    if (mobileView === 'preview') {
      return (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b border-line-subtle px-3 py-3">
            <Button
              type="button"
              variant="icon"
              size="icon-sm"
              icon={ArrowLeft}
              aria-label="Back to list"
              onClick={() => setMobileView('list')}
            />
            <h1 className="flex-1 text-center text-sm font-semibold text-ink">Live preview</h1>
            <span className="w-8" aria-hidden="true" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-4">
            <WidgetPreviewFrame
              practiceSlug={practiceSlug}
              scenario="intake-template"
              config={previewConfig}
              showTitle={false}
              viewportClassName="h-[min(720px,calc(100svh-12rem))] min-h-[480px]"
              initialIntakeStep="conversation"
            />
            <p className="text-center text-xs text-dim-2">
              Try the form like a client would — answers are not saved.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-line-subtle px-3 py-3">
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            icon={X}
            aria-label="Close"
            onClick={onCancel}
          />
          <h1 className="flex-1 text-center text-sm font-semibold text-ink">Question Builder</h1>
          <span className="w-8" aria-hidden="true" />
        </header>
        <div className="flex items-center justify-center gap-2 border-b border-line-subtle px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Eye}
            onClick={() => setMobileView('preview')}
            disabled={isSaving}
          >
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleSaveDraft()}
            disabled={isSaving || isPublishing || !hasChanges}
          >
            {isSaving ? 'Saving...' : 'Save draft'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handlePublish()}
            disabled={publishDisabled}
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{formStructure}</div>
      </div>
    );
  }

  // ── Desktop 3-panel layout ──────────────────────────────────────────────
  return (
    <EditorShell
      layout="builder"
      title={headerTitle}
      showBack
      backVariant="close"
      onBack={onCancel}
      contentMaxWidth={null}
      sidebar={formStructure}
      inspector={inspectorPanel}
      sidebarClassName="bg-paper-2 px-3 py-4 border-0"
      inspectorClassName="bg-paper-2 p-0 border-0"
      actions={headerActions}
    >
      {livePreview}
    </EditorShell>
  );
}

type TemplateListViewProps = {
  defaultTemplate: IntakeTemplate;
  existingTemplates: IntakeTemplate[];
  draftTemplates: IntakeTemplate[];
  practiceId: string | null;
  practiceSlug: string;
  isSaving: boolean;
  onNew: () => void;
  onOpen: (template: IntakeTemplate) => void;
  onViewResponses: (template: IntakeTemplate) => void;
  onEdit: (template: IntakeTemplate) => void;
  onDelete: (template: IntakeTemplate) => Promise<void>;
};

const TEMPLATE_TABLE_COLUMNS: DataTableColumn[] = [
  { id: 'name', label: 'Form', isPrimary: true },
  { id: 'questions', label: 'Questions', align: 'right', hideAt: 'sm' },
  { id: 'responses', label: 'Responses', align: 'right' },
  { id: 'actions', label: '', isAction: true, align: 'right' },
];

function TemplateListView({
  defaultTemplate,
  existingTemplates,
  draftTemplates,
  practiceId,
  practiceSlug,
  isSaving,
  onNew,
  onOpen,
  onViewResponses,
  onEdit,
  onDelete,
}: TemplateListViewProps) {
  const { showSuccess, showError } = useToastContext();
  const [deleteTarget, setDeleteTarget] = useState<IntakeTemplate | null>(null);
  const [embedTarget, setEmbedTarget] = useState<IntakeTemplate | null>(null);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  const [responseCountsLoaded, setResponseCountsLoaded] = useState(false);

  useEffect(() => {
    setResponseCountsLoaded(false);
    if (!practiceId) {
      setResponseCounts({});
      setResponseCountsLoaded(true);
      return;
    }

    const controller = new AbortController();

    listIntakes(practiceId, { page: 1, limit: 100 }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const counts = result.intakes.reduce<Record<string, number>>((acc, intake) => {
          const slug = getResponseTemplateSlug(intake) ?? DEFAULT_INTAKE_TEMPLATE.slug;
          acc[slug] = (acc[slug] ?? 0) + 1;
          return acc;
        }, {});
        setResponseCounts(counts);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('[IntakeTemplatesPage] Failed to load form response counts:', error);
        setResponseCounts({});
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setResponseCountsLoaded(true);
      });

    return () => controller.abort();
  }, [practiceId]);

  const draftBySlug = useMemo(
    () => new Map(draftTemplates.map((template) => [template.slug, template])),
    [draftTemplates],
  );
  const publishedSlugs = useMemo(
    () => new Set([defaultTemplate.slug, ...existingTemplates.map((template) => template.slug)]),
    [defaultTemplate.slug, existingTemplates],
  );
  const draftOnlyTemplates = useMemo(
    () => draftTemplates.filter((template) => !publishedSlugs.has(template.slug)),
    [draftTemplates, publishedSlugs],
  );
  const allTemplates = [defaultTemplate, ...existingTemplates, ...draftOnlyTemplates];

  const rows: DataTableRow[] = allTemplates.map((template) => {
    const isDefault = template.slug === defaultTemplate.slug;
    const hasDraft = draftBySlug.has(template.slug);
    const isDraftOnly = !publishedSlugs.has(template.slug);
    const publicUrl = getPublicFormUrl(practiceSlug, template.slug);
    return {
      id: template.slug,
      onClick: () => isDraftOnly ? onEdit(template) : onOpen(template),
      cells: {
        name: (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-medium text-ink">{template.name}</p>
              {hasDraft ? (
                <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Draft
                </span>
              ) : null}
            </div>
            {isDefault ? <p className="text-xs text-dim-2">Default form</p> : isDraftOnly ? <p className="text-xs text-dim-2">Not published yet</p> : null}
          </div>
        ),
        questions: <span className="tabular-nums">{template.fields.length}</span>,
        responses: (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewResponses(template); }}
            className="tabular-nums hover:underline"
          >
            {responseCounts[template.slug] ?? 0}
          </button>
        ),
        actions: (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                disabled={isSaving}
                aria-label={`Actions for ${template.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-dim-2 transition-colors hover:bg-paper-2/10 hover:text-ink disabled:opacity-60"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {!isDraftOnly ? (
                <DropdownMenuItem
                  onSelect={() => {
                    copyTextToClipboard(
                      publicUrl,
                      () => showSuccess('Link copied', 'The form URL is ready to share.'),
                      (message) => showError('Copy failed', message),
                    );
                  }}
                >
                  Copy URL
                </DropdownMenuItem>
              ) : null}
              {!isDraftOnly ? (
                <DropdownMenuItem onSelect={() => setEmbedTarget(template)}>
                  Copy embed code
                </DropdownMenuItem>
              ) : null}
              {!isDefault ? (
                <DropdownMenuItem onSelect={() => onEdit(template)}>Edit</DropdownMenuItem>
              ) : null}
              {!isDefault ? (
                <DropdownMenuItem onSelect={() => setDeleteTarget(template)}>Archive</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={onNew} disabled={isSaving}>New form</Button>
      </div>
      <DataTable
        columns={TEMPLATE_TABLE_COLUMNS}
        rows={rows}
        loading={!responseCountsLoaded}
        density="compact"
        stickyHeader
        className="panel overflow-hidden"
        bodyClassName="bg-transparent"
        rowClassName="transition-colors duration-150 hover:!bg-paper-2"
        emptyState="No intake forms yet."
      />
      {embedTarget ? (
        <EmbedCodeDialog
          isOpen
          onClose={() => setEmbedTarget(null)}
          practiceSlug={practiceSlug}
          templateSlug={embedTarget.slug}
        />
      ) : null}
      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Archive form"
      >
        <DialogBody>
          <p className="text-sm text-ink">
            Are you sure you want to archive <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="mt-2 text-sm text-dim-2">
            Links using{' '}
            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-xs">
              ?template={deleteTarget?.slug}
            </code>{' '}
            will use the default flow.
          </p>
        </DialogBody>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await onDelete(deleteTarget);
                setDeleteTarget(null);
              } catch (err) {
                console.warn('[TemplateListView] Archive failed:', err);
              }
            }}
            disabled={isSaving}
          >
            {isSaving ? 'Archiving...' : 'Archive'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

export default function IntakeTemplatesPage({
  onBack: _onBack,
  practiceId = null,
  basePath = '/practice/intakes',
  responsesPath = '/practice/intakes/responses',
  routeTemplateSlug = null,
  routeMode = 'list',
}: IntakeTemplatesPageProps) {
  const { currentPractice, isLoading: practiceLoading, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details: practiceDetails, setDetails } = usePracticeDetails(
    currentPractice?.id,
    currentPractice?.slug,
    false,
  );
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);

  const existingTemplates = useMemo(
    () => parseTemplatesFromMetadata(practiceDetails?.metadata ?? currentPractice?.metadata),
    [currentPractice?.metadata, practiceDetails?.metadata],
  );
  const draftTemplates = useMemo(
    () => parseDraftTemplatesFromMetadata(practiceDetails?.metadata ?? currentPractice?.metadata),
    [currentPractice?.metadata, practiceDetails?.metadata],
  );
  const defaultTemplate = useMemo(
    () => existingTemplates.find((template) => template.slug === DEFAULT_INTAKE_TEMPLATE.slug) ?? DEFAULT_INTAKE_TEMPLATE,
    [existingTemplates],
  );
  const customTemplates = useMemo(
    () => existingTemplates.filter((template) => template.slug !== DEFAULT_INTAKE_TEMPLATE.slug),
    [existingTemplates],
  );
  const editTarget = useMemo(
    () => {
      if (!routeTemplateSlug || routeTemplateSlug === 'new') return undefined;
      if (routeTemplateSlug === DEFAULT_INTAKE_TEMPLATE.slug) return defaultTemplate;
      return customTemplates.find((template) => template.slug === routeTemplateSlug);
    },
    [customTemplates, defaultTemplate, routeTemplateSlug],
  );
  const draftEditTarget = useMemo(
    () => {
      if (!routeTemplateSlug || routeTemplateSlug === 'new') return undefined;
      return draftTemplates.find((template) => template.slug === routeTemplateSlug);
    },
    [draftTemplates, routeTemplateSlug],
  );
  const templateNotFound = Boolean(routeTemplateSlug && routeTemplateSlug !== 'new' && !editTarget && !draftEditTarget);

  const persistTemplateMetadata = useCallback(async (nextTemplates: IntakeTemplate[], nextDraftTemplates: IntakeTemplate[]) => {
    if (!currentPractice) return;

    const currentMetadata = (() => {
      try {
        const raw = practiceDetails?.metadata ?? currentPractice?.metadata;
        if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
        if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
        return {};
      } catch { return {}; }
    })();

    const nextMetadata = {
      ...currentMetadata,
      intakeTemplates: JSON.stringify(nextTemplates),
      intakeTemplateDrafts: JSON.stringify(nextDraftTemplates),
    };

    // Snapshot BEFORE optimistic update
    const snapshot = practiceDetails;
    const optimisticDetails = {
      ...(snapshot ?? {}),
      metadata: nextMetadata,
    };

    setDetails(optimisticDetails);

    try {
      await updatePractice(currentPractice.id, { metadata: nextMetadata });
    } catch (error) {
      setDetails(snapshot ?? null);
      throw error;
    }
  }, [currentPractice, practiceDetails, setDetails, updatePractice]);

  const handleNew = () => {
    navigate(`${basePath}/new`);
  };

  const handleOpen = (template: IntakeTemplate) => {
    navigate(`${basePath}/${encodeURIComponent(template.slug)}`);
  };

  const handleViewResponses = (template: IntakeTemplate) => {
    navigate(`${responsesPath}?template=${encodeURIComponent(template.slug)}`);
  };

  const handleEdit = (template: IntakeTemplate) => {
    navigate(`${basePath}/${encodeURIComponent(template.slug)}/edit`);
  };

  const handleCancel = () => {
    navigate(basePath);
  };

  const handleSaveDraft = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      const previousSlug = draftEditTarget?.slug ?? editTarget?.slug ?? template.slug;
      const nextDraftTemplates = [
        ...draftTemplates.filter((existing) => existing.slug !== previousSlug && existing.slug !== template.slug),
        template,
      ];
      await persistTemplateMetadata(existingTemplates, nextDraftTemplates);
      if (routeTemplateSlug === 'new' || !routeTemplateSlug) {
        navigate(`${basePath}/${encodeURIComponent(template.slug)}/edit`);
      }
    } catch (error) {
      showError('Draft save failed', error instanceof Error ? error.message : 'Unable to save draft.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishTemplate = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      // Prevent renaming if there are existing intake responses tied to the
      // current edit target's slug, since renaming would orphan those links.
      if (editTarget && template.slug !== editTarget.slug && currentPractice) {
        // Fetch only the first page of intakes and check for any that reference the editTarget.slug
        try {
          const result = await listIntakes(currentPractice.id, { page: 1, limit: 100 });
          const hasResponses = result.intakes.some((i) => getResponseTemplateSlug(i) === editTarget.slug);
          if (!hasResponses && result.total > 100) {
            // Too many to check client-side — block rename conservatively
            throw new Error('Unable to verify whether this form has existing responses. Rename aborted.');
          }
          if (hasResponses) {
            throw new Error('This form has existing responses and cannot be renamed.');
          }
        } catch (_err) {
          // If the check fails, be conservative and prevent rename to avoid accidental orphaning.
          throw new Error(_err instanceof Error ? _err.message : 'Unable to verify whether this form has existing responses. Rename aborted.');
        }
      }

      // Build the next templates list by removing any existing entries with the
      // old or new slug, then inserting the updated template. This preserves
      // ordering while ensuring the old slug is removed during a rename.
      const nextTemplates = [
        ...existingTemplates.filter((existing) => existing.slug !== (editTarget?.slug ?? template.slug) && existing.slug !== template.slug),
        template,
      ];
      const nextDraftTemplates = draftTemplates.filter((existing) => existing.slug !== (draftEditTarget?.slug ?? editTarget?.slug ?? template.slug) && existing.slug !== template.slug);
      await persistTemplateMetadata(nextTemplates, nextDraftTemplates);
      navigate(`${basePath}/${encodeURIComponent(template.slug)}`);
    } catch (error) {
      showError('Publish failed', error instanceof Error ? error.message : 'Unable to publish form.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = async (slug: string) => {
    setIsSaving(true);
    try {
      const nextDraftTemplates = draftTemplates.filter((existing) => existing.slug !== slug && existing.slug !== draftEditTarget?.slug);
      await persistTemplateMetadata(existingTemplates, nextDraftTemplates);
    } catch (error) {
      showError('Discard failed', error instanceof Error ? error.message : 'Unable to discard draft.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      await persistTemplateMetadata(
        existingTemplates.filter((existing) => existing.slug !== template.slug),
        draftTemplates.filter((existing) => existing.slug !== template.slug),
      );
      showSuccess('Form deleted', `"${template.name}" has been removed.`);
    } catch (error) {
      showError('Delete failed', error instanceof Error ? error.message : 'Unable to delete form.');
    } finally {
      setIsSaving(false);
    }
  };

  // Show the skeleton grid while EITHER the practice is loading OR before
  // the local hook subscription has populated `currentPractice`. The latter
  // is critical: when navigating into this page from elsewhere in the app,
  // queryCache already has the practice → `practiceLoading` flips false on
  // the first render → BUT the local `currentPractice` state is still null
  // for one tick until the subscriber broadcast lands. Without this guard,
  // the page briefly fell through to the "No practice selected" empty
  // state instead of a skeleton.
  if (practiceLoading || !currentPractice) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <DataTable columns={TEMPLATE_TABLE_COLUMNS} rows={[]} loading className="panel overflow-hidden" bodyClassName="bg-transparent" />
      </div>
    );
  }

  if (templateNotFound) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <SettingsNotice variant="warning">This intake form no longer exists.</SettingsNotice>
      </div>
    );
  }

  if (routeMode === 'editor') {
    return (
      <TemplateEditor
        key={editTarget?.slug ?? routeTemplateSlug ?? 'new'}
        initial={draftEditTarget ?? editTarget}
        hasSavedDraft={Boolean(draftEditTarget)}
        existingTemplates={customTemplates}
        practiceSlug={currentPractice.slug ?? ''}
        practiceOrganizationId={currentPractice.betterAuthOrgId ?? currentPractice.id}
        practiceBusinessEmail={currentPractice.businessEmail ?? null}
        defaultIntroMessage={practiceDetails?.introMessage ?? ''}
        defaultLegalDisclaimer={practiceDetails?.legalDisclaimer ?? ''}
        currencyCode={currentPractice.currency ?? 'USD'}
        practicePreviewConfig={{
          name: currentPractice.name,
          profileImage: currentPractice.logo ?? undefined,
          accentColor: practiceDetails?.accentColor ?? currentPractice.accentColor ?? undefined,
        }}
        onCancel={handleCancel}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublishTemplate}
        onDiscardDraft={handleDiscardDraft}
      />
    );
  }

  return (
    <TemplateListView
      defaultTemplate={defaultTemplate}
      existingTemplates={customTemplates}
      draftTemplates={draftTemplates}
      practiceId={practiceId ?? currentPractice.id}
      practiceSlug={currentPractice.slug ?? ''}
      isSaving={isSaving}
      onNew={handleNew}
      onOpen={handleOpen}
      onViewResponses={handleViewResponses}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  );
}
