import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  ArrowsUpDownIcon,
  EllipsisVerticalIcon,
  InformationCircleIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { Checkbox, Combobox, CurrencyInput, Input, Textarea } from '@/shared/ui/input';
import type { ComboboxOption } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';
import { EditorShell } from '@/shared/ui/layout';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { SettingSection } from '@/features/settings/components/SettingSection';
import ChatDockedAction from '@/features/chat/components/ChatDockedAction';
import {
  BuilderAssistantPreviewMessage,
  BuilderWidgetComposerShell,
  BuilderWidgetShell,
} from '@/features/intake/components/BuilderWidgetPreview';
import { ContactForm } from '@/features/intake/components/ContactForm';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
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

type BuilderSelectionId = 'contact' | 'opening' | 'disclaimer' | 'payment' | `required:${string}` | `enrichment:${string}`;

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

  // Adjust insertion index when moving forward because removing the item
  // shifts subsequent indices left by one. When moving from a lower index to
  // a higher index we should insert at toIndex - 1 to achieve the expected
  // visual placement.
  const targetIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;

  const next = [...items];
  const moved = next.splice(fromIndex, 1)[0];
  if (!moved) return items;
  // Clamp insertion index to valid bounds
  const insertAt = Math.max(0, Math.min(next.length, targetIndex));
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

function hasSelectableAnswers(field: Pick<IntakeFieldDefinition, 'type' | 'options'>): boolean {
  return field.type === 'select' || Boolean(field.options?.length);
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

function QuestionDivider() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative flex items-center gap-3 py-4">
      <span className="h-px flex-1 bg-line-utility/60 dark:bg-line-glass/20" aria-hidden="true" />
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowInfo((value) => !value)}
          onMouseEnter={() => setShowInfo(true)}
          onMouseLeave={() => setShowInfo(false)}
          onFocus={() => setShowInfo(true)}
          onBlur={() => setShowInfo(false)}
          className="inline-flex items-center gap-2 text-xs text-input-placeholder transition-colors hover:text-input-text"
          aria-expanded={showInfo}
          aria-label="Explain AI-assisted follow-up"
        >
          <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
          AI-assisted follow-up
        </button>
        {showInfo ? (
          <div className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-xl border border-line-glass/30 bg-elevation-3 p-3 text-left text-xs leading-relaxed text-input-text shadow-2xl">
            Blawby AI can ask these follow-up questions after the client shares their basic information, so you can collect extra detail without making the first step feel heavy.
          </div>
        ) : null}
      </div>
      <span className="h-px flex-1 bg-line-utility/60 dark:bg-line-glass/20" aria-hidden="true" />
    </div>
  );
}

type AddQuestionButtonProps = {
  children: string;
  disabled?: boolean;
  onClick: () => void;
};

function AddQuestionButton({ children, disabled = false, onClick }: AddQuestionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-utility/70 bg-transparent px-4 py-3 text-sm font-semibold text-input-placeholder transition-colors hover:border-line-utility hover:bg-surface-utility/50 hover:text-input-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/45 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line-glass/35 dark:hover:border-line-glass/60 dark:hover:bg-surface-utility/40"
    >
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
}

type BuilderNavRowProps = {
  index?: number;
  label: string;
  selected: boolean;
  locked?: boolean;
  icon?: JSX.Element;
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

function BuilderNavRow({
  index,
  label,
  selected,
  locked = false,
  icon,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  dragHandlers,
}: BuilderNavRowProps) {
  const canDrag = !locked && Boolean(dragHandlers);
  const hasMenu = !locked && Boolean(onRemove || onMoveUp || onMoveDown);
  const displayLabel = label.trim() || 'Untitled question';
  const iconWrapClassName = selected
    ? 'bg-surface-workspace/70 text-accent-utility ring-1 ring-accent-500/25 dark:bg-surface-workspace/15 dark:text-accent-utility dark:ring-accent-500/20'
    : 'bg-surface-utility/70 text-input-placeholder group-hover:bg-surface-utility group-hover:text-input-text dark:bg-surface-utility/45 dark:group-hover:bg-surface-utility/70';
  const iconClassName = selected ? 'text-accent-utility' : 'text-input-placeholder';

  return (
    <div
      className="group"
      role="listitem"
      aria-label={displayLabel}
      draggable={canDrag}
      aria-grabbed={canDrag ? 'false' : undefined}
      onDragStart={dragHandlers?.onDragStart}
      onDrop={dragHandlers?.onDrop}
      onDragOver={dragHandlers?.onDragOver}
    >
      <div
        className={`relative flex items-center gap-1 rounded-2xl px-2 py-2 transition-all ${
          selected
            ? 'nav-item-active'
            : 'nav-item-inactive'
        }`}
      >
        {selected ? (
          <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent-500" aria-hidden="true" />
        ) : null}
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none"
        >
          {typeof index === 'number' ? (
            <span className={`w-4 shrink-0 text-center font-mono text-[11px] ${selected ? 'text-accent-utility' : 'text-input-placeholder'}`}>
              {String(index)}
            </span>
          ) : (
            <span className="w-4 shrink-0" aria-hidden="true" />
          )}
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-colors ${iconWrapClassName}`}
            aria-hidden="true"
          >
            {icon ? icon : locked ? (
              <LockClosedIcon className={`h-3.5 w-3.5 ${iconClassName}`} />
            ) : canDrag ? (
              <ArrowsUpDownIcon className={`h-3.5 w-3.5 ${iconClassName}`} />
            ) : (
              <PencilSquareIcon className={`h-3.5 w-3.5 ${iconClassName}`} />
            )}
          </span>
          <span className="min-w-0 flex-1 pr-0.5">
            <span className="block truncate text-sm font-medium leading-6">{displayLabel}</span>
          </span>
        </button>
        {hasMenu ? (
          <span className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Open actions for ${displayLabel}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    selected
                      ? 'bg-surface-workspace/70 text-accent-utility hover:bg-surface-workspace dark:bg-surface-workspace/15 dark:hover:bg-surface-workspace/25'
                      : 'bg-surface-utility/14 text-input-text/80 hover:bg-surface-utility/22 hover:text-input-text'
                  }`}
                >
                  <EllipsisVerticalIcon className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {onMoveUp ? (
                  <DropdownMenuItem onSelect={onMoveUp}>
                    Move up
                  </DropdownMenuItem>
                ) : null}
                {onMoveDown ? (
                  <DropdownMenuItem onSelect={onMoveDown}>
                    Move down
                  </DropdownMenuItem>
                ) : null}
                {onRemove ? (
                  <DropdownMenuItem onSelect={onRemove}>
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WidgetComposerPreview() {
  return <BuilderWidgetComposerShell />;
}

function WidgetCanvasShell({
  practiceName,
  practiceLogo,
  children,
  docked,
}: {
  practiceName?: string | null;
  practiceLogo?: string | null;
  children?: JSX.Element | JSX.Element[] | null;
  docked?: JSX.Element | null;
}) {
  return (
    <BuilderWidgetShell
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      docked={docked}
    >
      {children}
    </BuilderWidgetShell>
  );
}

function WidgetAssistantCanvasMessage({
  practiceName,
  practiceLogo,
  value,
  readOnly = false,
  placeholder,
  onChange,
  onBlur,
  bubbleClassName = '',
}: {
  practiceName?: string | null;
  practiceLogo?: string | null;
  value: string;
  readOnly?: boolean;
  placeholder: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  bubbleClassName?: string;
}) {
  return (
    <BuilderAssistantPreviewMessage
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={onChange}
      onBlur={onBlur}
      bubbleClassName={bubbleClassName}
    />
  );
}

function BuilderQuestionCanvas({
  field,
  readOnly = false,
  practiceName,
  practiceLogo,
  onLabelChange,
  onLabelBlur,
}: {
  field: EditorField;
  readOnly?: boolean;
  practiceName?: string | null;
  practiceLogo?: string | null;
  onLabelChange: (next: string) => void;
  onLabelBlur?: () => void;
}) {
  return (
    <WidgetCanvasShell practiceName={practiceName} practiceLogo={practiceLogo}>
      <div className="flex h-full flex-col">
        <WidgetAssistantCanvasMessage
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          value={getFieldCanvasQuestion(field)}
          readOnly={readOnly}
          placeholder="Untitled question"
          onChange={onLabelChange}
          onBlur={onLabelBlur}
          bubbleClassName="bg-transparent px-0 py-0"
        />
        <div className="flex-1" />
        <WidgetComposerPreview />
      </div>
    </WidgetCanvasShell>
  );
}

function BuilderOpeningCanvas({
  value,
  practiceName,
  practiceLogo,
  onChange,
}: {
  value: string;
  practiceName?: string | null;
  practiceLogo?: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <WidgetCanvasShell practiceName={practiceName} practiceLogo={practiceLogo}>
      <div className="flex h-full flex-col">
        <WidgetAssistantCanvasMessage
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          value={value}
          placeholder="Add an opening message"
          onChange={onChange}
          bubbleClassName="bg-transparent px-0 py-0"
        />
        <div className="flex-1" />
        <WidgetComposerPreview />
      </div>
    </WidgetCanvasShell>
  );
}

function BuilderDisclaimerCanvas({
  value,
  practiceName,
  practiceLogo,
  onChange,
}: {
  value: string;
  practiceName?: string | null;
  practiceLogo?: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <WidgetCanvasShell
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      docked={(
        <ChatDockedAction
          isOpen
          title="Legal disclaimer"
          description="Clients review this after the contact step."
          showCloseButton={false}
        >
          <textarea
            value={value}
            onInput={(event) => onChange((event.currentTarget as HTMLTextAreaElement).value)}
            placeholder="Add a legal disclaimer"
            rows={7}
            className="w-full resize-none rounded-2xl border border-line-glass/25 bg-surface-card/70 px-4 py-3 text-sm leading-6 text-input-text outline-none placeholder:text-input-placeholder"
          />
          <Button type="button" className="mt-5 w-full" disabled>
            Accept and continue
          </Button>
        </ChatDockedAction>
      )}
    />
  );
}

function BuilderInspectorCheckboxRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="pt-1">
      <Checkbox
        label={label}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function BuilderContactCanvas({
  practiceName,
  practiceLogo,
}: {
  practiceName?: string | null;
  practiceLogo?: string | null;
}) {
  return (
    <WidgetCanvasShell
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      docked={(
        <ChatDockedAction
          isOpen
          title="Request Consultation"
          description="Please provide your contact details to begin."
          showCloseButton={false}
        >
          <ContactForm
            onSubmit={async () => {}}
            fields={['name', 'email', 'phone']}
            required={['name', 'email', 'phone']}
            initialValues={{
              name: 'Jordan Client',
              email: 'jordan@example.com',
              phone: '(919) 555-0142',
            }}
            variant="plain"
            showSubmitButton
            submitFullWidth
            submitLabel="Continue"
          />
        </ChatDockedAction>
      )}
    />
  );
}

function BuilderPaymentCanvas({
  amount,
  currencyCode,
  practiceName,
  practiceLogo,
  onAmountChange,
}: {
  amount: number | null;
  currencyCode: string;
  practiceName?: string | null;
  practiceLogo?: string | null;
  onAmountChange: (amount: number | null) => void;
}) {
  return (
    <WidgetCanvasShell practiceName={practiceName} practiceLogo={practiceLogo}>
      <WidgetAssistantCanvasMessage
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        value="Your consultation request is ready. Complete the consultation fee to send it to the practice."
        readOnly
        placeholder=""
        onChange={() => {}}
        bubbleClassName="bg-transparent px-0 py-0"
      />
      <div className="px-4 pb-4">
        <div className="ml-12 rounded-3xl border border-line-glass/25 bg-surface-card/75 p-4 shadow-glass">
          <CurrencyInput
            label="Consultation fee"
            value={amount ?? undefined}
            onChange={(value) => onAmountChange(typeof value === 'number' && Number.isFinite(value) ? value : null)}
            placeholder="150.00"
            min={0.5}
            step={0.01}
            description={currencyCode}
          />
          <Button type="button" className="mt-4 w-full" disabled>
            Pay consultation fee
          </Button>
        </div>
      </div>
    </WidgetCanvasShell>
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
                <EllipsisVerticalIcon className="h-4 w-4" />
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
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<BuilderSelectionId>('contact');
  const [replacementFieldKey, setReplacementFieldKey] = useState('');

  const applyEditorState = useCallback((updater: (prev: EditorState) => EditorState) => {
    setState(updater);
  }, []);

  const draftTemplate = useMemo(() => editorStateToTemplate(state), [state]);
  const draftSnapshot = useMemo(() => serializeTemplate(draftTemplate), [draftTemplate]);
  const hasChanges = draftSnapshot !== initialSnapshot;
  const practiceCanvasName = practicePreviewConfig.name?.trim() || 'Blawby Messenger';
  const practiceCanvasLogo = practicePreviewConfig.profileImage ?? null;
  const staticFlowStepCount = 1;
  const visibleRequiredFieldCount = staticFlowStepCount + state.requiredFields.length;
  const paymentStepIndex = visibleRequiredFieldCount + state.enrichmentFields.length + 1;
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

  const updateFieldOptions = (key: string, phase: FieldPhase, rawOptions: string) => {
    updateField(key, phase, (field) => {
      const options = rawOptions.split(',').map((option) => option.trim()).filter(Boolean);
      return {
        ...field,
        options: options.length > 0 ? options : undefined,
        type: inferQuestionType(field.isStandard ? getFieldCanvasQuestion(field) : field.label, options),
      };
    });
  };

  const setFieldMultipleChoice = (key: string, phase: FieldPhase, enabled: boolean) => {
    updateField(key, phase, (field) => {
      if (enabled) {
        const options = field.options?.length ? field.options : ['Option 1', 'Option 2'];
        return {
          ...field,
          type: 'select',
          options,
        };
      }

      return {
        ...field,
        options: undefined,
        type: inferQuestionType(field.isStandard ? getFieldCanvasQuestion(field) : field.label, undefined),
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
    setReplacementFieldKey('');
  };

  const removeField = (key: string, phase: FieldPhase) => {
    if (LOCKED_REQUIRED_KEYS.has(key)) return;
    applyEditorState((prev) => (
      phase === 'required'
        ? { ...prev, requiredFields: prev.requiredFields.filter((field) => field.key !== key) }
        : { ...prev, enrichmentFields: prev.enrichmentFields.filter((field) => field.key !== key) }
    ));
    setSelectedItemId('contact');
    setReplacementFieldKey('');
  };

  const moveRequiredField = (fromIndex: number, toIndex: number) => {
    applyEditorState((prev) => {
      const locked = prev.requiredFields.filter((field) => LOCKED_REQUIRED_KEYS.has(field.key));
      const movable = prev.requiredFields.filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key));
      return { ...prev, requiredFields: [...locked, ...moveItem(movable, fromIndex, toIndex)] };
    });
  };

  const moveEnrichmentField = (fromIndex: number, toIndex: number) => {
    applyEditorState((prev) => ({
        ...prev,
        enrichmentFields: moveItem(prev.enrichmentFields, fromIndex, toIndex),
    }));
  };

  const replaceSelectedField = (nextField: IntakeFieldDefinition, phase: FieldPhase, currentKey: string) => {
    const replacement: EditorField = {
      ...nextField,
      required: phase === 'required',
      phase,
      _id: nextField.key,
    };

    applyEditorState((prev) => {
      const update = (fields: EditorField[]) => fields.map((field) => field.key === currentKey ? replacement : field);
      return phase === 'required'
        ? { ...prev, requiredFields: update(prev.requiredFields) }
        : { ...prev, enrichmentFields: update(prev.enrichmentFields) };
    });
    setSelectedItemId(`${phase}:${nextField.key}`);
    setReplacementFieldKey('');
  };

  const replaceSelectedWithCustomField = (label: string, phase: FieldPhase, currentKey: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;

    const existingKeys = new Set(
      [...state.requiredFields, ...state.enrichmentFields]
        .map((field) => field.key)
        .filter((key) => key !== currentKey),
    );
    const replacementKey = generateFieldKey(trimmedLabel, existingKeys);
    const replacement: EditorField = {
      key: replacementKey,
      label: trimmedLabel,
      previewQuestion: getDefaultPreviewQuestion(trimmedLabel),
      description: '',
      type: inferQuestionType(trimmedLabel),
      required: phase === 'required',
      phase,
      isStandard: false,
      _id: replacementKey,
    };

    applyEditorState((prev) => {
      const update = (fields: EditorField[]) => fields.map((field) => field.key === currentKey ? replacement : field);
      return phase === 'required'
        ? { ...prev, requiredFields: update(prev.requiredFields) }
        : { ...prev, enrichmentFields: update(prev.enrichmentFields) };
    });
    setSelectedItemId(`${phase}:${replacementKey}`);
    setReplacementFieldKey('');
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
    setReplacementFieldKey('');
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
      {slugError ? (
        <p className="mt-1 text-xs text-rose-500">{slugError}</p>
      ) : null}
    </div>
  );

  const effectiveSelectedItemId = useMemo(() => {
    if (selectedItemId === 'payment') {
      return state.paymentLinkEnabled ? selectedItemId : 'contact';
    }
    if (selectedItemId.startsWith('required:')) {
      const key = selectedItemId.slice('required:'.length);
      return state.requiredFields.some((field) => field.key === key) ? selectedItemId : 'contact';
    }
    if (selectedItemId.startsWith('enrichment:')) {
      const key = selectedItemId.slice('enrichment:'.length);
      return state.enrichmentFields.some((field) => field.key === key) ? selectedItemId : 'contact';
    }
    return selectedItemId;
  }, [selectedItemId, state.enrichmentFields, state.paymentLinkEnabled, state.requiredFields]);

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

  const selectBuilderItem = (nextSelection: BuilderSelectionId) => {
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
    setReplacementFieldKey('');
  };

  const replacementOptions = useMemo<ComboboxOption[]>(() => {
    if (!selectedFieldContext) return [];
    return STANDARD_FIELD_DEFINITIONS
      .filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key))
      .filter((field) => ![...state.requiredFields, ...state.enrichmentFields].some(
        (item) => item.key === field.key && item.key !== selectedFieldContext.field.key,
      ))
      .map((field) => {
        return {
          value: field.key,
          label: field.label,
          description: field.description,
        };
      });
  }, [selectedFieldContext, state.enrichmentFields, state.requiredFields]);

  const builderSidebar = (
    <div className="space-y-6 overflow-visible">
      <div className="space-y-2">
        <p className="px-2 text-xs font-semibold uppercase tracking-widest text-input-placeholder">Questions</p>

        <BuilderNavRow
          index={1}
          label="Contact"
          locked
          icon={<UserGroupIcon className="h-4 w-4" />}
          selected={effectiveSelectedItemId === 'contact'}
          onSelect={() => selectBuilderItem('contact')}
        />

        {lockedRequiredFields.map((field, index) => (
          <BuilderNavRow
            key={field.key}
            index={staticFlowStepCount + index + 1}
            label={field.label}
            selected={effectiveSelectedItemId === `required:${field.key}`}
            onSelect={() => selectBuilderItem(`required:${field.key}`)}
          />
        ))}

        {movableRequiredFields.map((field, index) => (
          <BuilderNavRow
            key={field._id}
            index={staticFlowStepCount + lockedRequiredFields.length + index + 1}
            label={field.label}
            selected={effectiveSelectedItemId === `required:${field.key}`}
            onSelect={() => selectBuilderItem(`required:${field.key}`)}
            onMoveUp={index > 0 ? () => moveRequiredField(index, index - 1) : undefined}
            onMoveDown={index < movableRequiredFields.length - 1 ? () => moveRequiredField(index, index + 1) : undefined}
            onRemove={() => removeField(field.key, 'required')}
            dragHandlers={{
              onDragStart: () => requiredDrag.handleDragStart(index),
              onDrop: () => requiredDrag.handleDrop(index),
              onDragOver: requiredDrag.handleDragOver,
            }}
          />
        ))}

        <div className="relative overflow-visible pt-1">
          <AddQuestionButton
            onClick={() => addBlankField('required')}
            disabled={isSaving}
          >
            Add core question
          </AddQuestionButton>
        </div>
      </div>

      <div className="space-y-2">
        <QuestionDivider />

        {state.enrichmentFields.map((field, index) => (
          <BuilderNavRow
            key={field._id}
            index={visibleRequiredFieldCount + index + 1}
            label={field.label}
            selected={effectiveSelectedItemId === `enrichment:${field.key}`}
            onSelect={() => selectBuilderItem(`enrichment:${field.key}`)}
            onMoveUp={index > 0 ? () => moveEnrichmentField(index, index - 1) : undefined}
            onMoveDown={index < state.enrichmentFields.length - 1 ? () => moveEnrichmentField(index, index + 1) : undefined}
            onRemove={() => removeField(field.key, 'enrichment')}
            dragHandlers={{
              onDragStart: () => enrichmentDrag.handleDragStart(index),
              onDrop: () => enrichmentDrag.handleDrop(index),
              onDragOver: enrichmentDrag.handleDragOver,
            }}
          />
        ))}

        <div className="relative overflow-visible pt-1">
          <AddQuestionButton
            onClick={() => addBlankField('enrichment')}
            disabled={isSaving}
          >
            Add follow-up question
          </AddQuestionButton>
        </div>
      </div>

      <div className="space-y-2 border-t border-line-glass/20 pt-4">
        {state.paymentLinkEnabled ? (
          <BuilderNavRow
            index={paymentStepIndex}
            label="Consultation fee"
            selected={effectiveSelectedItemId === 'payment'}
            onSelect={() => selectBuilderItem('payment')}
            onRemove={removePaymentStep}
          />
        ) : (
          <AddQuestionButton onClick={addPaymentStep} disabled={isSaving}>
            Add payment step
          </AddQuestionButton>
        )}
      </div>

      <div className="space-y-2 border-t border-line-glass/20 pt-4">
        <p className="px-2 text-xs font-semibold uppercase tracking-widest text-input-placeholder">Settings</p>
        <BuilderNavRow
          label="Legal disclaimer"
          selected={effectiveSelectedItemId === 'disclaimer'}
          onSelect={() => selectBuilderItem('disclaimer')}
        />
        <BuilderNavRow
          label="Opening message"
          selected={effectiveSelectedItemId === 'opening'}
          onSelect={() => selectBuilderItem('opening')}
        />
      </div>
    </div>
  );

  const builderCanvas = selectedFieldContext ? (
    <BuilderQuestionCanvas
      field={selectedFieldContext.field}
      readOnly={false}
      practiceName={practiceCanvasName}
      practiceLogo={practiceCanvasLogo}
      onLabelChange={(label) => updateFieldLabel(selectedFieldContext.field.key, selectedFieldContext.phase, label)}
      onLabelBlur={() => finalizeFieldLabel(selectedFieldContext.field.key, selectedFieldContext.phase)}
    />
  ) : effectiveSelectedItemId === 'payment' ? (
    <BuilderPaymentCanvas
      amount={state.consultationFee}
      currencyCode={currencyCode}
      practiceName={practiceCanvasName}
      practiceLogo={practiceCanvasLogo}
      onAmountChange={(value) => applyEditorState((prev) => ({ ...prev, consultationFee: value }))}
    />
  ) : effectiveSelectedItemId === 'opening' ? (
    <BuilderOpeningCanvas
      value={state.introMessage}
      practiceName={practiceCanvasName}
      practiceLogo={practiceCanvasLogo}
      onChange={(value) => applyEditorState((prev) => ({ ...prev, introMessage: value }))}
    />
  ) : effectiveSelectedItemId === 'disclaimer' ? (
    <BuilderDisclaimerCanvas
      value={state.legalDisclaimer}
      practiceName={practiceCanvasName}
      practiceLogo={practiceCanvasLogo}
      onChange={(value) => applyEditorState((prev) => ({ ...prev, legalDisclaimer: value }))}
    />
  ) : (
    <BuilderContactCanvas practiceName={practiceCanvasName} practiceLogo={practiceCanvasLogo} />
  );

  const inspectorContent = (
    <div className="space-y-6">
      {selectedFieldContext ? (
        <SettingSection title="Question settings">
          <div className="space-y-4">
            {!LOCKED_REQUIRED_KEYS.has(selectedFieldContext.field.key) ? (
              <Combobox
                label="Change field"
                value={replacementFieldKey}
                onChange={(value) => {
                  setReplacementFieldKey(value);
                  const nextField = STANDARD_FIELD_DEFINITIONS.find((field) => field.key === value);
                  if (nextField) {
                    replaceSelectedField(nextField, selectedFieldContext.phase, selectedFieldContext.field.key);
                    return;
                  }
                  replaceSelectedWithCustomField(value, selectedFieldContext.phase, selectedFieldContext.field.key);
                }}
                options={replacementOptions}
                placeholder={selectedFieldContext.field.isStandard ? selectedFieldContext.field.label : 'Choose a standard field'}
                allowCustomValues
                addNewLabel="Create question"
                hideCustomHint
              />
            ) : null}

            <BuilderInspectorCheckboxRow
              label="Required"
              checked={selectedFieldContext.phase === 'required'}
              onChange={(checked) => changeFieldPhase(
                selectedFieldContext.field.key,
                selectedFieldContext.phase,
                checked ? 'required' : 'enrichment',
              )}
              disabled={LOCKED_REQUIRED_KEYS.has(selectedFieldContext.field.key)}
            />

            {!LOCKED_REQUIRED_KEYS.has(selectedFieldContext.field.key) && !selectedFieldContext.field.isStandard ? (
              <BuilderInspectorCheckboxRow
                label="Multiple choice"
                checked={hasSelectableAnswers(selectedFieldContext.field)}
                onChange={(checked) => setFieldMultipleChoice(selectedFieldContext.field.key, selectedFieldContext.phase, checked)}
              />
            ) : null}

            {!selectedFieldContext.field.isStandard && hasSelectableAnswers(selectedFieldContext.field) ? (
              <Input
                label="Answer options"
                description="Comma-separated"
                value={(selectedFieldContext.field.options ?? []).join(', ')}
                onChange={(value) => updateFieldOptions(selectedFieldContext.field.key, selectedFieldContext.phase, value)}
                placeholder="Option 1, Option 2"
              />
            ) : null}

            <Textarea
              label={selectedFieldContext.field.isStandard ? 'AI question phrasing' : 'AI instruction'}
              description={selectedFieldContext.field.isStandard
                ? 'How the AI asks this question. Leave blank to use the default.'
                : 'How the AI should ask and handle this question.'}
              value={selectedFieldContext.field.promptHint ?? ''}
              onChange={(value) => updateFieldHint(selectedFieldContext.field.key, selectedFieldContext.phase, value)}
              placeholder={selectedFieldContext.field.isStandard
                ? `e.g. "Ask for the client's ${selectedFieldContext.field.label.toLowerCase()} in a warm, conversational tone."`
                : 'Describe how the AI should ask and what counts as a valid answer.'}
              rows={4}
              resize="vertical"
            />
          </div>
        </SettingSection>
      ) : effectiveSelectedItemId === 'payment' ? (
        <SettingSection title="Payment step">
          <div className="space-y-4">
            {isStripeLoading ? (
              <SettingsNotice variant="info">
                Checking your Stripe payout setup.
              </SettingsNotice>
            ) : !hasStripeAccount ? (
              <SettingsNotice variant="warning">
                Connect Stripe in payouts before publishing a payment step for this intake.
              </SettingsNotice>
            ) : (
              <SettingsNotice variant={payoutsEnabled ? 'info' : 'warning'}>
                Payments will be sent to Stripe account {maskStripeAccountId(stripeStatus?.stripe_account_id)} using {practiceBusinessEmail?.trim() || 'your practice email'}.
              </SettingsNotice>
            )}
            <div className="space-y-3 rounded-2xl border border-line-glass/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-input-text">Stripe account</span>
                <span className="text-sm text-input-text">{maskStripeAccountId(stripeStatus?.stripe_account_id)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-input-text">Business email</span>
                <span className="text-sm text-input-text">{practiceBusinessEmail?.trim() || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-input-text">Status</span>
                <span className="text-sm text-input-text">{stripeStatusLabel}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/practice/${encodeURIComponent(practiceSlug)}/settings/practice/payouts`)}
            >
              Manage payouts
            </Button>
          </div>
        </SettingSection>
      ) : effectiveSelectedItemId === 'opening' ? (
        <SettingSection title="Opening message">
          <div className="space-y-4">
            <BuilderInspectorCheckboxRow
              label="Include opening message"
              checked={Boolean(state.introMessage.trim())}
              onChange={(checked) => applyEditorState((prev) => ({
                  ...prev,
                  introMessage: checked
                    ? (prev.introMessage.trim() || defaultIntroMessage || 'How can we help you today?')
                    : '',
              }))}
              disabled={isSaving}
            />
            <SettingsNotice variant="info">
              This appears after the legal disclaimer when enabled and before the first intake question.
            </SettingsNotice>
          </div>
        </SettingSection>
      ) : effectiveSelectedItemId === 'disclaimer' ? (
        <SettingSection title="Legal disclaimer">
          <div className="space-y-4">
            <BuilderInspectorCheckboxRow
              label="Include legal disclaimer"
              checked={Boolean(state.legalDisclaimer.trim())}
              onChange={(checked) => applyEditorState((prev) => ({
                  ...prev,
                  legalDisclaimer: checked
                    ? (prev.legalDisclaimer.trim() || defaultLegalDisclaimer || 'This chat does not create an attorney-client relationship.')
                    : '',
              }))}
              disabled={isSaving}
            />
            <SettingsNotice variant="info">
              Clients review this after the contact step and before the opening message.
            </SettingsNotice>
          </div>
        </SettingSection>
      ) : (
        <SettingSection title="Contact step">
          <SettingsNotice variant="info">
            Name, email, and phone are collected together before the conversation starts.
          </SettingsNotice>
        </SettingSection>
      )}
    </div>
  );

  return (
    <EditorShell
      layout="builder"
      title={headerTitle}
      showBack
      backVariant="close"
      onBack={onCancel}
      contentMaxWidth={null}
      sidebar={builderSidebar}
      inspector={inspectorContent}
      sidebarClassName="bg-surface-navigation px-4 py-5 border-0"
      inspectorClassName="bg-surface-utility px-5 py-5 border-0"
      actions={
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-input-placeholder sm:inline">
            {hasChanges ? 'Draft changes' : 'Published'}
          </span>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      }
    >
      {builderCanvas}
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

  useEffect(() => {
    if (!practiceId) {
      setResponseCounts({});
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
      });

    return () => controller.abort();
  }, [practiceId]);

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
              <PlusIcon className="h-6 w-6" />
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
  const { currentPractice, loading: practiceLoading, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
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
            showError('Rename not allowed', 'This form has existing responses and cannot be renamed.');
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

  if (practiceLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <LoadingBlock showLabel={false} showSpinner size="lg" />
      </div>
    );
  }

  if (!currentPractice) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <p className="text-sm text-input-placeholder">No practice selected.</p>
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
