import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  ArrowLeft,
  ChevronDown,
  CreditCard,
  Eye,
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
import { IntakeFlowPreview } from '@/features/intake/components/BuilderWidgetPreview';
import { IntakePreviewDialog } from '@/features/intake/components/IntakePreviewDialog';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';
import { cn } from '@/shared/utils/cn';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { SkeletonLoader } from '@/shared/ui/layout';
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


function parseTemplatesFromMetadata(metadata: Record<string, unknown> | null | undefined): IntakeTemplate[] {
  if (!metadata) return [];

  const raw = metadata.intakeTemplates;
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

function getFieldCanvasQuestion(field: Pick<IntakeFieldDefinition, 'isStandard' | 'label' | 'previewQuestion'>): string {
  if (field.isStandard) {
    return field.previewQuestion?.trim() || field.label;
  }
  return field.label;
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
    <div className="rounded-xl border border-line-glass/30 bg-surface-card px-3 py-2">
      <p className="text-lg font-semibold text-input-text">{value}</p>
      <p className="text-xs text-input-placeholder">{label}</p>
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
    <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">
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
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-card transition-colors',
        isActive ? 'border-line-utility border-l-[3px] border-l-accent-500' : 'border-line-utility',
      )}
    >
      <div className="flex items-center gap-2 p-3.5">
        <button
          type="button"
          onClick={() => {
            onSelectHeader?.();
            if (!isOpen) onToggle();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="font-mono text-xs text-input-placeholder">{number}.</span>
          <span className="text-input-placeholder">{icon}</span>
          <span className="truncate text-sm font-medium text-input-text">{title}</span>
        </button>
        {badge ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              badge.tone === 'required'
                ? 'bg-accent-500 text-[rgb(var(--accent-foreground))]'
                : 'bg-surface-input text-input-placeholder',
            )}
          >
            {badge.label}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          aria-expanded={isOpen}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-input-placeholder hover:text-input-text"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>
      </div>
      {isOpen && children ? (
        <div className="border-t border-line-utility/60 px-2.5 pb-2.5 pt-1.5">{children}</div>
      ) : null}
    </div>
  );
}

type QuestionRowProps = {
  label: string;
  isSelected: boolean;
  isLocked?: boolean;
  badgeLabel?: string;
  onSelect: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragHandlers?: {
    onDragStart: () => void;
    onDrop: () => void;
    onDragOver: (event: JSX.TargetedDragEvent<HTMLElement>) => void;
  };
};

function QuestionRow({ label, isSelected, isLocked, badgeLabel, onSelect, onRemove, onMoveUp, onMoveDown, dragHandlers }: QuestionRowProps) {
  const draggable = !isLocked && Boolean(dragHandlers);
  const displayLabel = label.trim() || 'Untitled question';

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
        isSelected ? 'bg-accent-500/10' : 'hover:bg-surface-input/60',
      )}
      draggable={draggable}
      onDragStart={dragHandlers?.onDragStart}
      onDrop={dragHandlers?.onDrop}
      onDragOver={dragHandlers?.onDragOver}
    >
      {isLocked ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-input-placeholder" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onKeyDown={handleGripKey}
          aria-label={`Reorder ${displayLabel} — Arrow Up or Down to move`}
          className="inline-flex h-5 w-3.5 shrink-0 cursor-grab items-center justify-center rounded text-input-placeholder hover:text-input-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/45"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left text-input-text focus-visible:outline-none"
      >
        {displayLabel}
      </button>
      {badgeLabel ? (
        <span className="shrink-0 text-[11px] font-medium text-input-placeholder">{badgeLabel}</span>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className="shrink-0 text-[11px] font-medium text-accent-500 hover:underline"
      >
        Edit
      </button>
      {onRemove && !isLocked ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`Delete ${displayLabel}`}
          className="shrink-0 rounded text-input-placeholder transition-colors hover:text-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function LockedFieldChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-utility bg-surface-input px-2 py-0.5 text-[11px] font-medium text-input-placeholder">
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
      className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line-utility/70 px-2 py-1.5 text-xs font-medium text-input-placeholder transition-colors hover:border-line-utility hover:text-input-text disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="text-sm font-medium text-input-text">{label}</span>
      {children}
      {charCount ? (
        <span className="self-end text-[11px] text-input-placeholder">
          {charCount.value.length}/{charCount.max}
        </span>
      ) : null}
    </div>
  );
}

type TemplateCardProps = {
  template: IntakeTemplate;
  isDefault?: boolean;
  isSaving: boolean;
  responseCount?: number;
  practiceSlug: string;
  onOpen?: (template: IntakeTemplate) => void;
  onViewResponses?: (template: IntakeTemplate) => void;
  onEdit?: (template: IntakeTemplate) => void;
  onArchive?: (template: IntakeTemplate) => void;
};

function TemplateCard({
  template,
  isDefault = false,
  isSaving,
  responseCount = 0,
  practiceSlug,
  onOpen,
  onViewResponses,
  onEdit,
  onArchive,
}: TemplateCardProps) {
  const { showSuccess, showError } = useToastContext();
  const questionPreview = template.fields
    .map((field) => getFieldCanvasQuestion(field))
    .filter((question) => question.trim().length > 0)
    .slice(0, 3);
  const remainingQuestions = Math.max(template.fields.length - questionPreview.length, 0);
  const [openEmbedDialog, setOpenEmbedDialog] = useState(false);
  const publicUrl = getPublicFormUrl(practiceSlug, template.slug);

  return (
    <article className="glass-card flex min-h-[230px] flex-col justify-between overflow-hidden rounded-2xl">
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (onOpen && !isSaving) onOpen(template);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && onOpen && !isSaving) {
            e.preventDefault();
            onOpen(template);
          }
        }}
        className={`block w-full flex-1 p-5 text-left transition-colors ${
          !onOpen || isSaving ? 'cursor-default' : 'hover:bg-surface-utility/10 cursor-pointer'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-input-text">{template.name}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                disabled={isSaving}
                aria-label={`Actions for ${template.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-input-placeholder transition-colors hover:bg-surface-utility/10 hover:text-input-text disabled:opacity-60"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
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
              <DropdownMenuItem
                onSelect={() => {
                  setOpenEmbedDialog(true);
                }}
              >
                Copy embed code
              </DropdownMenuItem>
              {!isDefault && onEdit ? (
                <DropdownMenuItem onSelect={() => onEdit(template)}>
                  Edit
                </DropdownMenuItem>
              ) : null}
              {!isDefault && onArchive ? (
                <DropdownMenuItem onSelect={() => onArchive(template)}>
                  Archive
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <EmbedCodeDialog
          isOpen={openEmbedDialog}
          onClose={() => setOpenEmbedDialog(false)}
          practiceSlug={practiceSlug}
          templateSlug={template.slug}
        />

        <div className="mt-5 space-y-2">
          {questionPreview.map((question, index) => (
            <p
              key={`${template.slug}-question-${index}`}
              className="truncate text-sm text-input-text"
            >
              {question}
            </p>
          ))}
          {remainingQuestions > 0 ? (
            <p className="text-sm text-input-placeholder">
              +{remainingQuestions} more question{remainingQuestions === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>

        <div className="mt-4 h-px bg-line-glass/30" />
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onViewResponses?.(template);
            }}
            disabled={!onViewResponses}
            className="px-0 py-0 text-sm"
          >
            {responseCount} response{responseCount === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </article>
  );
}

type TemplateEditorProps = {
  initial?: IntakeTemplate;
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
  onSave: (template: IntakeTemplate) => Promise<void>;
};

function TemplateEditor({
  initial,
  existingTemplates,
  practiceSlug,
  practiceOrganizationId = null,
  practiceBusinessEmail = null,
  defaultIntroMessage,
  defaultLegalDisclaimer,
  currencyCode,
  practicePreviewConfig,
  onCancel,
  onSave,
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
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<BuilderSelectionId>('contact');

  const applyEditorState = useCallback((updater: (prev: EditorState) => EditorState) => {
    setState(updater);
  }, []);

  const draftTemplate = useMemo(() => editorStateToTemplate(state), [state]);
  const draftSnapshot = useMemo(() => serializeTemplate(draftTemplate), [draftTemplate]);
  const hasChanges = draftSnapshot !== initialSnapshot;
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

  const handleSave = async () => {
    if (!validatePublish(state)) return;
    setIsSaving(true);
    try {
      await onSave(editorStateToTemplate(state));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewAndPublish = () => {
    if (!validatePublish(state)) return;
    setShowPreviewDialog(true);
  };

  const handlePublishFromDialog = async () => {
    setIsSaving(true);
    try {
      await onSave(editorStateToTemplate(state));
      setShowPreviewDialog(false);
    } finally {
      setIsSaving(false);
    }
  };

  const isDesktop = useIsDesktop();
  const [mobileView, setMobileView] = useState<'list' | 'config' | 'preview'>('list');
  const [isPreviewInteractive, setIsPreviewInteractive] = useState(false);
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
        className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-input-text outline-none transition-colors placeholder:text-input-placeholder hover:border-line-glass/40 focus:border-line-glass/60 focus:bg-surface-utility/10"
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

  const handlePreviewClick = () => {
    if (!isDesktop) {
      setMobileView('preview');
      return;
    }
    setIsPreviewInteractive((value) => !value);
  };

  const draftStatusLabel = hasChanges
    ? 'Draft changes ready to publish'
    : 'Published — no draft changes';
  const headerActions = (
    <div className="flex items-center gap-3">
      <span className="hidden items-center gap-2 text-xs text-input-placeholder sm:flex">
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            hasChanges ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          aria-hidden="true"
        />
        {draftStatusLabel}
      </span>
      <Button
        type="button"
        variant={isDesktop && isPreviewInteractive ? 'primary' : 'secondary'}
        size="sm"
        icon={Eye}
        onClick={handlePreviewClick}
        disabled={isSaving}
        aria-pressed={isDesktop ? isPreviewInteractive : undefined}
      >
        {isDesktop && isPreviewInteractive ? 'Stop preview' : 'Preview'}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => void handlePreviewAndPublish()}
        disabled={isSaving}
      >
        {isSaving ? 'Publishing...' : 'Preview and Publish'}
      </Button>
    </div>
  );

  // ── Sidebar — accordion section cards ───────────────────────────────────
  const formStructure = (
    <div className="flex flex-col gap-3 overflow-visible">
      <SectionHeaderLabel>FORM STRUCTURE</SectionHeaderLabel>

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
              isSelected={effectiveSelectedItemId === `required:${field.key}`}
              badgeLabel="Required"
              onSelect={() => selectItem(`required:${field.key}`)}
              onRemove={() => removeField(field.key, 'required')}
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
              isSelected={effectiveSelectedItemId === `enrichment:${field.key}`}
              onSelect={() => selectItem(`enrichment:${field.key}`)}
              onRemove={() => removeField(field.key, 'enrichment')}
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
  const livePreview = (
    <div className="flex h-full flex-col items-center gap-4 py-4">
      <SectionHeaderLabel>
        {isPreviewInteractive ? 'PREVIEW MODE' : 'LIVE PREVIEW'}
      </SectionHeaderLabel>
      <IntakeFlowPreview
        template={draftTemplate}
        practiceName={practiceCanvasName}
        practiceLogo={practiceCanvasLogo}
        currencyCode={currencyCode}
        interactive={isPreviewInteractive}
      />
      <p className="text-center text-xs text-input-placeholder">
        {isPreviewInteractive
          ? 'Try the form like a client would — answers are not saved.'
          : 'Updates as you edit — this is exactly what clients will see.'}
      </p>
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
              className="flex items-center justify-between rounded-lg border border-line-utility bg-surface-input px-3 py-2 text-left text-sm text-input-text"
            >
              <span>Free text</span>
              <ChevronDown className="h-4 w-4 text-input-placeholder" />
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
      return (
        <div className="flex flex-col gap-4 p-4">
          <SettingsNotice variant="info">
            Name, email, and phone are collected automatically before the conversation starts. These fields cannot be removed.
          </SettingsNotice>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 p-4 text-sm text-input-placeholder">
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

  // Hide the close X when nothing is selected — the empty "Settings" state
  // is itself the closed state, so there's nothing further to close.
  const showCloseButton = effectiveSelectedItemId !== 'none';
  const inspectorPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line-utility px-4 py-3">
        <p className="text-sm font-semibold text-input-text">{inspectorTitle}</p>
        {showCloseButton ? (
          <button
            type="button"
            onClick={closeInspector}
            aria-label="Close panel"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-input-placeholder hover:text-input-text"
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
          <header className="flex items-center gap-2 border-b border-line-utility px-3 py-3">
            <Button
              type="button"
              variant="icon"
              size="icon-sm"
              icon={ArrowLeft}
              aria-label="Back to list"
              onClick={() => setMobileView('list')}
            />
            <h1 className="flex-1 text-center text-sm font-semibold text-input-text">{mobileTitle}</h1>
            <span className="w-8" aria-hidden="true" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{renderConfigBody()}</div>
        </div>
      );
    }

    if (mobileView === 'preview') {
      return (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-2 border-b border-line-utility px-3 py-3">
            <Button
              type="button"
              variant="icon"
              size="icon-sm"
              icon={ArrowLeft}
              aria-label="Back to list"
              onClick={() => setMobileView('list')}
            />
            <h1 className="flex-1 text-center text-sm font-semibold text-input-text">Live preview</h1>
            <span className="w-8" aria-hidden="true" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-4">
            <IntakeFlowPreview
              template={draftTemplate}
              practiceName={practiceCanvasName}
              practiceLogo={practiceCanvasLogo}
              currencyCode={currencyCode}
              interactive
            />
            <p className="text-center text-xs text-input-placeholder">
              Try the form like a client would — answers are not saved.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-line-utility px-3 py-3">
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            icon={X}
            aria-label="Close"
            onClick={onCancel}
          />
          <h1 className="flex-1 text-center text-sm font-semibold text-input-text">Question Builder</h1>
          <span className="w-8" aria-hidden="true" />
        </header>
        <div className="flex items-center justify-center gap-2 border-b border-line-utility px-3 py-2">
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
            onClick={() => void handlePreviewAndPublish()}
            disabled={isSaving}
          >
            {isSaving ? 'Publishing...' : 'Preview and Publish'}
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
      sidebarClassName="bg-surface-navigation px-3 py-4 border-0"
      inspectorClassName="bg-surface-utility p-0 border-0"
      actions={headerActions}
    >
      {livePreview}
      <IntakePreviewDialog
        isOpen={showPreviewDialog}
        template={draftTemplate}
        practiceName={practiceCanvasName}
        practiceLogo={practiceCanvasLogo}
        practiceSubtitle={practicePreviewConfig.name ? undefined : 'We typically reply in a few minutes'}
        currencyCode={currencyCode}
        onConfirm={handlePublishFromDialog}
        onCancel={() => setShowPreviewDialog(false)}
        loading={isSaving}
      />
    </EditorShell>
  );
}

type TemplateListViewProps = {
  defaultTemplate: IntakeTemplate;
  existingTemplates: IntakeTemplate[];
  practiceId: string | null;
  practiceSlug: string;
  isSaving: boolean;
  onNew: () => void;
  onOpen: (template: IntakeTemplate) => void;
  onViewResponses: (template: IntakeTemplate) => void;
  onEdit: (template: IntakeTemplate) => void;
  onDelete: (template: IntakeTemplate) => Promise<void>;
};

/**
 * Placeholder card matching the eventual TemplateCard layout: title row,
 * three preview question lines, footer with the response-count link.
 * Rendered in the same grid as real cards so the swap to data reflows
 * minimally.
 */
function FormCardSkeleton({ titleWidth = 'w-32' }: { titleWidth?: string }) {
  return (
    <div
      className="glass-card flex min-h-[230px] flex-col rounded-2xl p-5"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <SkeletonLoader variant="text" height="h-4" width={titleWidth} rounded="rounded-md" />
        <SkeletonLoader variant="text" height="h-4" width="w-1" rounded="rounded" />
      </div>
      <div className="mt-4 space-y-2.5">
        <SkeletonLoader variant="text" height="h-3" width="w-full" rounded="rounded-md" />
        <SkeletonLoader variant="text" height="h-3" width="w-5/6" rounded="rounded-md" />
        <SkeletonLoader variant="text" height="h-3" width="w-3/4" rounded="rounded-md" />
      </div>
      <div className="mt-auto pt-6">
        <SkeletonLoader variant="text" height="h-3" width="w-24" rounded="rounded-md" />
      </div>
    </div>
  );
}

function TemplateListView({
  defaultTemplate,
  existingTemplates,
  practiceId,
  practiceSlug,
  isSaving,
  onNew,
  onOpen,
  onViewResponses,
  onEdit,
  onDelete,
}: TemplateListViewProps) {
  const [deleteTarget, setDeleteTarget] = useState<IntakeTemplate | null>(null);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  // Gate the cards on counts having loaded (or definitively failed) so the
  // skeleton is visible during the fetch — including on warm navigation
  // when the practice/templates are already cached. Without this, the
  // page renders cards instantly with placeholder "0 responses" labels
  // that pop to real counts a moment later.
  const [responseCountsLoaded, setResponseCountsLoaded] = useState(false);

  useEffect(() => {
    setResponseCountsLoaded(false);
    if (!practiceId) {
      setResponseCounts({});
      setResponseCountsLoaded(true);
      return;
    }

    const controller = new AbortController();

    // Known limitation: until the backend supports template-level response
    // counts, the forms list loads a bounded page and counts client-side.
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

  if (!responseCountsLoaded) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FormCardSkeleton titleWidth="w-24" />
            <FormCardSkeleton titleWidth="w-36" />
            <FormCardSkeleton titleWidth="w-28" />
            <FormCardSkeleton titleWidth="w-32" />
            <FormCardSkeleton titleWidth="w-40" />
            <FormCardSkeleton titleWidth="w-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <TemplateCard
            template={defaultTemplate}
            isDefault
            isSaving={isSaving}
            responseCount={responseCounts[defaultTemplate.slug] ?? 0}
            practiceSlug={practiceSlug}
            onOpen={onOpen}
            onViewResponses={onViewResponses}
            onEdit={onEdit}
          />

          {existingTemplates.map((template) => (
            <TemplateCard
              key={template.slug}
              template={template}
              isSaving={isSaving}
              responseCount={responseCounts[template.slug] ?? 0}
              practiceSlug={practiceSlug}
              onOpen={onOpen}
              onViewResponses={onViewResponses}
              onEdit={onEdit}
              onArchive={setDeleteTarget}
            />
          ))}

          <button
            type="button"
            onClick={onNew}
            disabled={isSaving}
            className="glass-card flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-line-glass/50 p-5 text-center transition-colors hover:border-line-glass/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="rounded-2xl border border-line-glass/30 bg-surface-card p-3 text-input-text">
              <Plus className="h-6 w-6" />
            </span>
            <span className="mt-4 text-sm font-semibold text-input-text">
              New form
            </span>
          </button>
        </div>
      </div>

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Archive form"
      >
        <DialogBody>
          <p className="text-sm text-input-text">
            Are you sure you want to archive <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="mt-2 text-sm text-input-placeholder">
            Links using{' '}
            <code className="rounded bg-surface-utility px-1.5 py-0.5 font-mono text-xs">
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
                // Keep dialog open so the user can retry; errors are surfaced by onDelete's caller.
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
    () => parseTemplatesFromMetadata(currentPractice?.metadata ?? practiceDetails?.metadata),
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
  const templateNotFound = Boolean(routeTemplateSlug && routeTemplateSlug !== 'new' && !editTarget);

  const persistTemplates = useCallback(async (nextTemplates: IntakeTemplate[]) => {
    if (!currentPractice) return;

    const currentMetadata = (() => {
      try {
        const raw = currentPractice?.metadata ?? practiceDetails?.metadata;
        if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
        if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
        return {};
      } catch { return {}; }
    })();

    const nextMetadata = { ...currentMetadata, intakeTemplates: JSON.stringify(nextTemplates) };

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
    navigate(`${basePath}/responses?template=${encodeURIComponent(template.slug)}`);
  };

  const handleEdit = (template: IntakeTemplate) => {
    navigate(`${basePath}/${encodeURIComponent(template.slug)}/edit`);
  };

  const handleCancel = () => {
    navigate(basePath);
  };

  const handleSave = async (template: IntakeTemplate) => {
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
            showError('Rename check failed', 'Unable to verify whether this form has existing responses. Rename aborted.');
            setIsSaving(false);
            return;
          }
          if (hasResponses) {
            showError('Rename not allowed', 'This form has existing responses and cannot be renamed.');
            setIsSaving(false);
            return;
          }
        } catch (_err) {
          // If the check fails, be conservative and prevent rename to avoid accidental orphaning.
          showError('Rename check failed', 'Unable to verify whether this form has existing responses. Rename aborted.');
          setIsSaving(false);
          return;
        }
      }

      // Build the next templates list by removing any existing entries with the
      // old or new slug, then inserting the updated template. This preserves
      // ordering while ensuring the old slug is removed during a rename.
      const nextTemplates = [
        ...existingTemplates.filter((existing) => existing.slug !== (editTarget?.slug ?? template.slug) && existing.slug !== template.slug),
        template,
      ];
      await persistTemplates(nextTemplates);
      showSuccess(editTarget ? 'Form updated' : 'Form created', `"${template.name}" saved.`);
      navigate(`${basePath}/${encodeURIComponent(template.slug)}`);
    } catch (error) {
      showError('Save failed', error instanceof Error ? error.message : 'Unable to save form.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      await persistTemplates(existingTemplates.filter((existing) => existing.slug !== template.slug));
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
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <FormCardSkeleton titleWidth="w-24" />
            <FormCardSkeleton titleWidth="w-36" />
            <FormCardSkeleton titleWidth="w-28" />
            <FormCardSkeleton titleWidth="w-32" />
            <FormCardSkeleton titleWidth="w-40" />
            <FormCardSkeleton titleWidth="w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (templateNotFound) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <SettingsNotice variant="warning">This intake form no longer exists.</SettingsNotice>
      </div>
    );
  }

  if (routeMode === 'editor') {
    return (
      <TemplateEditor
        key={editTarget?.slug ?? routeTemplateSlug ?? 'new'}
        initial={editTarget}
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
        onSave={handleSave}
      />
    );
  }

  return (
    <TemplateListView
      defaultTemplate={defaultTemplate}
      existingTemplates={customTemplates}
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
