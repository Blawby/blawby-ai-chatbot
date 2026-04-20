import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  ArrowsUpDownIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { SectionDivider, SettingsPage } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import { WidgetPreviewFrame } from '@/features/settings/components/WidgetPreviewFrame';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Tabs } from '@/shared/ui/tabs';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { STANDARD_FIELD_DEFINITIONS, DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';
import type { FieldPhase, IntakeFieldDefinition, IntakeTemplate } from '@/shared/types/intake';

type IntakeTemplatesPageProps = {
  onBack?: () => void;
};

type EditorField = IntakeFieldDefinition & { _id: string };

type EditorState = {
  name: string;
  slug: string;
  slugManuallyEdited: boolean;
  requiredFields: EditorField[];
  enrichmentFields: EditorField[];
};

type AddQuestionMode = 'standard' | 'custom';
type EditorView = 'list' | 'editor';
type EditorTab = 'setup' | 'questions' | 'preview';

type AddQuestionDraft = {
  mode: AddQuestionMode;
  selectedStandardKey: string | null;
  standardHint: string;
  customLabel: string;
  customType: IntakeFieldDefinition['type'];
  customOptions: string;
  customHint: string;
  customPhase: FieldPhase;
};

const SLUG_RE = /^[a-z0-9-]+$/;
const LOCKED_REQUIRED_KEYS = new Set(['description', 'city', 'state']);

const EDITOR_TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'questions', label: 'Questions' },
  { id: 'preview', label: 'Preview' },
];

const FIELD_TYPE_LABELS: Record<IntakeFieldDefinition['type'], string> = {
  text: 'Text',
  select: 'Multiple choice',
  date: 'Date',
  boolean: 'Yes / No',
  number: 'Number',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getEmbedSnippet(practiceSlug: string, templateSlug: string): string {
  return `<script src="https://app.blawby.com/widget.js?template=${templateSlug}" data-practice="${practiceSlug}" async></script>`;
}

function parseTemplatesFromSettings(settings: unknown): IntakeTemplate[] {
  try {
    if (!settings) return [];
    const parsed = typeof settings === 'string' ? (JSON.parse(settings) as unknown) : settings;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const raw = (parsed as Record<string, unknown>).intakeTemplates;
    return Array.isArray(raw) ? (raw as IntakeTemplate[]) : [];
  } catch {
    return [];
  }
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

function getTemplateCounts(template: Pick<IntakeTemplate, 'fields'>) {
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

function getLockedRequiredFields(templateFields: EditorField[]): EditorField[] {
  const templateFieldByKey = new Map(templateFields.map((field) => [field.key, field]));
  return STANDARD_FIELD_DEFINITIONS
    .filter((field) => LOCKED_REQUIRED_KEYS.has(field.key))
    .map((field) => {
      const templateField = templateFieldByKey.get(field.key);
      return templateField ? { ...field, ...templateField, _id: field.key } : { ...field, _id: field.key };
    });
}

function buildEditorState(template?: IntakeTemplate): EditorState {
  if (!template) {
    return {
      name: '',
      slug: '',
      slugManuallyEdited: false,
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
    slugManuallyEdited: true,
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
  return {
    slug: state.slug.trim(),
    name: state.name.trim(),
    isDefault: false,
    fields: [
      ...state.requiredFields.map((field) => stripEditorId(field, 'required')),
      ...state.enrichmentFields.map((field) => stripEditorId(field, 'enrichment')),
    ],
  };
}

function serializeTemplate(template: IntakeTemplate): string {
  return JSON.stringify({
    slug: template.slug,
    name: template.name,
    fields: template.fields,
  });
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const moved = next.splice(fromIndex, 1)[0];
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function copyTextToClipboard(
  text: string,
  onSuccess: () => void,
  onError: (message: string) => void,
) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    navigator.clipboard.writeText(text)
      .then(onSuccess)
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'Could not copy to clipboard.');
      });
    return;
  }

  if (typeof document === 'undefined') {
    onError('Clipboard is not available in this environment.');
    return;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) {
      onSuccess();
    } else {
      onError('Clipboard is not available.');
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Clipboard is not available.');
  }
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

    const next = [...items];
    const moved = next.splice(fromIndex, 1)[0];
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    onReorder(next);
  }, [items, onReorder]);

  const handleDragOver = useCallback((event: JSX.TargetedDragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  return { handleDragStart, handleDrop, handleDragOver };
}

function emptyAddDraft(defaultPhase: FieldPhase): AddQuestionDraft {
  return {
    mode: 'standard',
    selectedStandardKey: null,
    standardHint: '',
    customLabel: '',
    customType: 'text',
    customOptions: '',
    customHint: '',
    customPhase: defaultPhase,
  };
}

type EmbedCodeBlockProps = {
  practiceSlug: string;
  templateSlug: string;
};

function EmbedCodeBlock({ practiceSlug, templateSlug }: EmbedCodeBlockProps) {
  const { showSuccess, showError } = useToastContext();
  const [copied, setCopied] = useState(false);
  const snippet = getEmbedSnippet(practiceSlug, templateSlug);

  const handleCopy = () => {
    copyTextToClipboard(
      snippet,
      () => {
        setCopied(true);
        showSuccess('Embed copied', 'The widget snippet is ready to paste.');
        setTimeout(() => setCopied(false), 2000);
      },
      (message) => showError('Copy failed', message),
    );
  };

  return (
    <div className="glass-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-3 border-b border-line-glass/20 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-widest text-input-placeholder">Embed snippet</span>
        <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-relaxed text-input-text">
        {snippet}
      </pre>
    </div>
  );
}

type StatPillProps = {
  label: string;
  value: number;
};

function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="rounded-xl border border-line-glass/30 bg-surface-card px-3 py-2">
      <p className="text-lg font-semibold text-input-text">{value}</p>
      <p className="text-xs text-input-placeholder">{label}</p>
    </div>
  );
}

type FieldRowProps = {
  field: EditorField;
  locked?: boolean;
  onRemove?: () => void;
  onHintChange?: (hint: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragHandlers?: {
    onDragStart: () => void;
    onDrop: () => void;
    onDragOver: (event: JSX.TargetedDragEvent<HTMLElement>) => void;
  };
};

function FieldRow({
  field,
  locked = false,
  onRemove,
  onHintChange,
  onMoveUp,
  onMoveDown,
  dragHandlers,
}: FieldRowProps) {
  const [showHint, setShowHint] = useState(Boolean(field.promptHint));
  const canDrag = !locked && Boolean(dragHandlers);

  return (
    <div
      className="glass-panel overflow-hidden rounded-xl"
      draggable={canDrag}
      onDragStart={dragHandlers?.onDragStart}
      onDrop={dragHandlers?.onDrop}
      onDragOver={dragHandlers?.onDragOver}
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {canDrag ? (
            <div className="mt-0.5 rounded-lg border border-line-glass/30 bg-surface-card p-2 text-input-placeholder" aria-hidden="true">
              <ArrowsUpDownIcon className="h-4 w-4" />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-input-text">{field.label}</span>
              <span className="rounded-full border border-line-glass/30 px-2 py-0.5 text-xs text-input-placeholder">
                {FIELD_TYPE_LABELS[field.type]}
              </span>
              {!field.isStandard ? (
                <span className="rounded-full border border-line-glass/30 px-2 py-0.5 text-xs text-input-placeholder">
                  Custom
                </span>
              ) : null}
              {locked ? (
                <span className="rounded-full border border-line-glass/30 px-2 py-0.5 text-xs text-input-placeholder">
                  Locked
                </span>
              ) : null}
            </div>
            {field.type === 'select' && field.options?.length ? (
              <p className="mt-1 truncate text-xs text-input-placeholder">{field.options.join(', ')}</p>
            ) : null}
            {field.promptHint ? (
              <p className="mt-1 line-clamp-2 text-xs text-input-placeholder">{field.promptHint}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!locked && onMoveUp ? (
            <Button type="button" variant="secondary" size="sm" onClick={onMoveUp}>
              Up
            </Button>
          ) : null}
          {!locked && onMoveDown ? (
            <Button type="button" variant="secondary" size="sm" onClick={onMoveDown}>
              Down
            </Button>
          ) : null}
          {onHintChange ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowHint((value) => !value)}>
              {showHint ? 'Hide note' : 'Note'}
            </Button>
          ) : null}
          {!locked && onRemove ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {showHint && onHintChange ? (
        <div className="border-t border-line-glass/20 bg-surface-card/50 px-4 pb-3 pt-2">
          <Textarea
            label="Guidance note"
            description="Optional instruction for how the assistant should ask or validate this answer."
            placeholder="Example: Accept make, model, and year if provided."
            value={field.promptHint ?? ''}
            onChange={onHintChange}
            rows={2}
          />
        </div>
      ) : null}
    </div>
  );
}

type AddQuestionModalProps = {
  isOpen: boolean;
  defaultPhase: FieldPhase;
  existingKeys: Set<string>;
  availableStandardFields: IntakeFieldDefinition[];
  onClose: () => void;
  onAdd: (field: IntakeFieldDefinition, phase: FieldPhase) => void;
};

function AddQuestionModal({
  isOpen,
  defaultPhase,
  existingKeys,
  availableStandardFields,
  onClose,
  onAdd,
}: AddQuestionModalProps) {
  const [draft, setDraft] = useState<AddQuestionDraft>(() => emptyAddDraft(defaultPhase));
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setDraft(emptyAddDraft(defaultPhase));
    setError(null);
    onClose();
  };

  const switchMode = (mode: AddQuestionMode) => {
    setDraft({ ...emptyAddDraft(defaultPhase), mode });
    setError(null);
  };

  const handleAdd = () => {
    setError(null);

    if (draft.mode === 'standard') {
      if (!draft.selectedStandardKey) {
        setError('Choose a standard field to add.');
        return;
      }

      const standardField = availableStandardFields.find((field) => field.key === draft.selectedStandardKey);
      if (!standardField) {
        setError('That standard field is no longer available.');
        return;
      }

      onAdd(
        {
          ...standardField,
          required: defaultPhase === 'required',
          phase: defaultPhase,
          promptHint: draft.standardHint.trim() || undefined,
        },
        defaultPhase,
      );
      resetAndClose();
      return;
    }

    const label = draft.customLabel.trim();
    if (!label) {
      setError('Question text is required.');
      return;
    }

    const options = draft.customType === 'select'
      ? draft.customOptions.split(',').map((option) => option.trim()).filter(Boolean)
      : undefined;
    if (draft.customType === 'select' && (!options || options.length < 2)) {
      setError('Multiple choice questions need at least two comma-separated options.');
      return;
    }

    const field: IntakeFieldDefinition = {
      key: generateFieldKey(label, existingKeys),
      label,
      type: draft.customType,
      required: draft.customPhase === 'required',
      phase: draft.customPhase,
      isStandard: false,
      ...(options ? { options } : {}),
      ...(draft.customHint.trim() ? { promptHint: draft.customHint.trim() } : {}),
    };

    onAdd(field, draft.customPhase);
    resetAndClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={resetAndClose} title="Add question" contentClassName="max-w-2xl">
      <DialogBody className="space-y-5">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line-glass/30">
          <button
            type="button"
            onClick={() => switchMode('standard')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              draft.mode === 'standard'
                ? 'bg-accent/10 text-[rgb(var(--accent-foreground))]'
                : 'bg-surface-card text-input-placeholder hover:text-input-text'
            }`}
          >
            Standard field
          </button>
          <button
            type="button"
            onClick={() => switchMode('custom')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              draft.mode === 'custom'
                ? 'bg-accent/10 text-[rgb(var(--accent-foreground))]'
                : 'bg-surface-card text-input-placeholder hover:text-input-text'
            }`}
          >
            Custom question
          </button>
        </div>

        {draft.mode === 'standard' ? (
          <div className="space-y-4">
            {availableStandardFields.length === 0 ? (
              <div className="status-info rounded-xl px-4 py-3 text-sm">
                Every standard field is already in this template.
              </div>
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium text-input-text">Choose a field</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {availableStandardFields.map((field) => (
                    <li key={field.key}>
                      <label
                        className={`flex h-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          draft.selectedStandardKey === field.key
                            ? 'border-accent/40 bg-accent/10 text-[rgb(var(--accent-foreground))]'
                            : 'border-line-glass/30 bg-surface-card text-input-text hover:border-line-glass/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="standard-field"
                          value={field.key}
                          checked={draft.selectedStandardKey === field.key}
                          onChange={() => setDraft((prev) => ({ ...prev, selectedStandardKey: field.key }))}
                          className="accent-[rgb(var(--accent))]"
                        />
                        <span className="flex-1 text-sm">{field.label}</span>
                        <span className="text-xs opacity-75">{FIELD_TYPE_LABELS[field.type]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.selectedStandardKey ? (
              <Textarea
                label="Guidance note"
                description="Optional instruction for this field."
                placeholder="Example: Ask for the hearing or deadline date."
                value={draft.standardHint}
                onChange={(value) => setDraft((prev) => ({ ...prev, standardHint: value }))}
                rows={2}
              />
            ) : null}

            <SettingsHelperText>
              This standard field will be added to the {defaultPhase === 'required' ? 'required' : 'enrichment'} section.
            </SettingsHelperText>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Question text"
              placeholder="Example: What type of vehicle was involved?"
              value={draft.customLabel}
              onChange={(value) => setDraft((prev) => ({ ...prev, customLabel: value }))}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-input-text">Answer type</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FIELD_TYPE_LABELS) as IntakeFieldDefinition['type'][]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, customType: type }))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      draft.customType === type
                        ? 'border-accent/40 bg-accent/10 text-[rgb(var(--accent-foreground))]'
                        : 'border-line-glass/30 bg-surface-card text-input-text hover:border-line-glass/60'
                    }`}
                  >
                    {FIELD_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {draft.customType === 'select' ? (
              <Input
                label="Options"
                description="Separate each option with a comma."
                placeholder="Example: Car, Truck, Motorcycle, Other"
                value={draft.customOptions}
                onChange={(value) => setDraft((prev) => ({ ...prev, customOptions: value }))}
              />
            ) : null}

            <Textarea
              label="Guidance note"
              description="Optional instruction for how to ask or validate this answer."
              placeholder="Example: Accept make, model, and year if provided."
              value={draft.customHint}
              onChange={(value) => setDraft((prev) => ({ ...prev, customHint: value }))}
              rows={2}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-input-text">Section</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['required', 'enrichment'] as FieldPhase[]).map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, customPhase: phase }))}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                      draft.customPhase === phase
                        ? 'border-accent/40 bg-accent/10 text-[rgb(var(--accent-foreground))]'
                        : 'border-line-glass/30 bg-surface-card text-input-text hover:border-line-glass/60'
                    }`}
                  >
                    <p className="text-sm font-medium">{phase === 'required' ? 'Required' : 'Enrichment'}</p>
                    <p className="mt-0.5 text-xs opacity-75">
                      {phase === 'required' ? 'Collected before submit.' : 'Optional after the submit offer.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="status-error rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={resetAndClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={draft.mode === 'standard' && availableStandardFields.length === 0}
        >
          Add question
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

type TemplateCardProps = {
  template: IntakeTemplate;
  practiceSlug: string;
  isDefault?: boolean;
  isSaving: boolean;
  onEdit?: (template: IntakeTemplate) => void;
  onDelete?: (template: IntakeTemplate) => void;
};

function TemplateCard({ template, practiceSlug, isDefault = false, isSaving, onEdit, onDelete }: TemplateCardProps) {
  const { showSuccess, showError } = useToastContext();
  const [copied, setCopied] = useState(false);
  const counts = getTemplateCounts(template);

  const handleCopy = () => {
    copyTextToClipboard(
      getEmbedSnippet(practiceSlug, template.slug),
      () => {
        setCopied(true);
        showSuccess('Embed copied', 'The widget snippet is ready to paste.');
        setTimeout(() => setCopied(false), 2000);
      },
      (message) => showError('Copy failed', message),
    );
  };

  return (
    <article className="glass-card flex min-h-[230px] flex-col justify-between rounded-2xl p-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-input-text">{template.name}</p>
            <p className="mt-1 truncate font-mono text-xs text-input-placeholder">?template={template.slug}</p>
          </div>
          <span className="shrink-0 rounded-full border border-line-glass/30 px-2.5 py-1 text-xs text-input-placeholder">
            {isDefault ? 'Default' : `${counts.total} fields`}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <StatPill label="Required" value={counts.required} />
          <StatPill label="Enrich" value={counts.enrichment} />
          <StatPill label="Custom" value={counts.custom} />
        </div>

        <p className="mt-4 line-clamp-2 text-sm text-input-placeholder">
          {isDefault
            ? 'Used when no template parameter is present. The default flow is managed by the system.'
            : 'A practice-owned intake flow with ordered required and enrichment questions.'}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleCopy}
          disabled={isSaving || !practiceSlug}
          icon={DocumentDuplicateIcon}
          iconClassName="h-4 w-4"
        >
          {copied ? 'Copied' : 'Copy embed'}
        </Button>
        {!isDefault && onEdit ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onEdit(template)}
            disabled={isSaving}
            icon={PencilSquareIcon}
            iconClassName="h-4 w-4"
          >
            Edit
          </Button>
        ) : null}
        {!isDefault && onDelete ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onDelete(template)}
            disabled={isSaving}
            icon={TrashIcon}
            iconClassName="h-4 w-4"
          >
            Delete
          </Button>
        ) : null}
      </div>
    </article>
  );
}

type TemplateEditorProps = {
  initial?: IntakeTemplate;
  existingTemplates: IntakeTemplate[];
  practiceSlug: string;
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
  practicePreviewConfig,
  onCancel,
  onSave,
}: TemplateEditorProps) {
  const { showError } = useToastContext();
  const initialState = useMemo(() => buildEditorState(initial), [initial]);
  const initialSnapshot = useMemo(() => serializeTemplate(editorStateToTemplate(initialState)), [initialState]);
  const [state, setState] = useState<EditorState>(initialState);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>('setup');
  const [addQuestionPhase, setAddQuestionPhase] = useState<FieldPhase | null>(null);

  const draftTemplate = useMemo(() => editorStateToTemplate(state), [state]);
  const draftSnapshot = useMemo(() => serializeTemplate(draftTemplate), [draftTemplate]);
  const hasChanges = draftSnapshot !== initialSnapshot;
  const counts = getTemplateCounts(draftTemplate);

  const lockedRequiredFields = useMemo(
    () => state.requiredFields.filter((field) => LOCKED_REQUIRED_KEYS.has(field.key)),
    [state.requiredFields],
  );
  const movableRequiredFields = useMemo(
    () => state.requiredFields.filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key)),
    [state.requiredFields],
  );
  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const field of [...state.requiredFields, ...state.enrichmentFields]) {
      keys.add(field.key);
    }
    return keys;
  }, [state.requiredFields, state.enrichmentFields]);
  const availableStandardFields = useMemo(
    () => STANDARD_FIELD_DEFINITIONS.filter((field) => !existingKeys.has(field.key) && !LOCKED_REQUIRED_KEYS.has(field.key)),
    [existingKeys],
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
    if (trimmed === 'default') {
      setSlugError('"default" is reserved.');
      return false;
    }
    if (existingTemplates.some((template) => template.slug === trimmed && template.slug !== initial?.slug)) {
      setSlugError('A template with this slug already exists.');
      return false;
    }
    setSlugError(null);
    return true;
  };

  const requiredDrag = useDragReorder(movableRequiredFields, (next) => {
    setState((prev) => ({ ...prev, requiredFields: [...lockedRequiredFields, ...next] }));
  });
  const enrichmentDrag = useDragReorder(state.enrichmentFields, (next) => {
    setState((prev) => ({ ...prev, enrichmentFields: next }));
  });

  const handleNameChange = (name: string) => {
    setState((prev) => ({
      ...prev,
      name,
      slug: prev.slugManuallyEdited ? prev.slug : slugify(name),
    }));
    setSlugError(null);
  };

  const handleSlugChange = (slug: string) => {
    setState((prev) => ({ ...prev, slug, slugManuallyEdited: true }));
    validateSlug(slug);
  };

  const handleReset = () => {
    setState(buildEditorState(initial));
    setSlugError(null);
    setActiveTab('setup');
  };

  const updateFieldHint = (key: string, phase: FieldPhase, hint: string) => {
    setState((prev) => {
      const update = (fields: EditorField[]) =>
        fields.map((field) => field.key === key ? { ...field, promptHint: hint } : field);
      return phase === 'required'
        ? { ...prev, requiredFields: update(prev.requiredFields) }
        : { ...prev, enrichmentFields: update(prev.enrichmentFields) };
    });
  };

  const removeField = (key: string, phase: FieldPhase) => {
    if (LOCKED_REQUIRED_KEYS.has(key)) return;
    setState((prev) => phase === 'required'
      ? { ...prev, requiredFields: prev.requiredFields.filter((field) => field.key !== key) }
      : { ...prev, enrichmentFields: prev.enrichmentFields.filter((field) => field.key !== key) });
  };

  const moveRequiredField = (fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const locked = prev.requiredFields.filter((field) => LOCKED_REQUIRED_KEYS.has(field.key));
      const movable = prev.requiredFields.filter((field) => !LOCKED_REQUIRED_KEYS.has(field.key));
      return { ...prev, requiredFields: [...locked, ...moveItem(movable, fromIndex, toIndex)] };
    });
  };

  const moveEnrichmentField = (fromIndex: number, toIndex: number) => {
    setState((prev) => ({
      ...prev,
      enrichmentFields: moveItem(prev.enrichmentFields, fromIndex, toIndex),
    }));
  };

  const handleAddField = (field: IntakeFieldDefinition, phase: FieldPhase) => {
    const nextField: EditorField = { ...field, required: phase === 'required', phase, _id: field.key };
    setState((prev) => phase === 'required'
      ? { ...prev, requiredFields: [...prev.requiredFields, nextField] }
      : { ...prev, enrichmentFields: [...prev.enrichmentFields, nextField] });
  };

  const handleSave = async () => {
    if (!state.name.trim()) {
      showError('Template name is required.');
      return;
    }
    if (!validateSlug(state.slug)) return;

    setIsSaving(true);
    try {
      await onSave(draftTemplate);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsPage
      title={initial ? `Edit ${initial.name}` : 'New intake template'}
      subtitle="Build an ordered intake flow with a live widget preview."
      showBack
      backVariant="close"
      onBack={onCancel}
      contentMaxWidth={null}
      previewVariant="widget"
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleReset} disabled={!hasChanges || isSaving}>
            Reset
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!hasChanges || isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      }
      preview={(
        <WidgetPreviewFrame
          practiceSlug={practiceSlug}
          scenario="intake-template"
          title="Intake template preview"
          config={{
            ...practicePreviewConfig,
            intakeTemplate: draftTemplate,
          }}
        />
      )}
    >
      <div className="space-y-6">
        <Tabs
          items={EDITOR_TABS}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as EditorTab)}
          actions={(
            <span className="hidden rounded-full border border-line-glass/30 px-2.5 py-1 text-xs text-input-placeholder sm:inline-flex">
              {hasChanges ? 'Unsaved changes' : 'Saved'}
            </span>
          )}
        />

        {activeTab === 'setup' ? (
          <div className="space-y-6">
            <SettingSection title="Template setup">
              <SettingRow label="Template name" description="Shown to practice members in settings." layout="stacked">
                <Input
                  value={state.name}
                  onChange={handleNameChange}
                  placeholder="Example: Auto accident intake"
                  disabled={isSaving}
                />
              </SettingRow>
              <SectionDivider />
              <SettingRow
                label="Slug"
                description="Used in the ?template= embed parameter. Use lowercase letters, numbers, and hyphens."
                layout="stacked"
              >
                <Input
                  value={state.slug}
                  onChange={handleSlugChange}
                  placeholder="Example: auto-accident"
                  disabled={isSaving}
                  error={slugError ?? undefined}
                />
              </SettingRow>
            </SettingSection>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatPill label="Total fields" value={counts.total} />
              <StatPill label="Required" value={counts.required} />
              <StatPill label="Enrichment" value={counts.enrichment} />
              <StatPill label="Custom" value={counts.custom} />
            </div>

            <SettingSection title="Embed code" description="Use this snippet on the page that should start this intake flow.">
              {state.slug ? (
                <EmbedCodeBlock practiceSlug={practiceSlug} templateSlug={state.slug} />
              ) : (
                <div className="status-info rounded-xl px-4 py-3 text-sm">
                  Add a slug to generate the embed snippet.
                </div>
              )}
            </SettingSection>
          </div>
        ) : null}

        {activeTab === 'questions' ? (
          <div className="space-y-6">
            <SettingSection
              title="Required questions"
              description="Collected before the client can submit. The three core fields are locked at the top."
            >
              <div className="space-y-2 py-2">
                {lockedRequiredFields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    locked
                    onHintChange={(hint) => updateFieldHint(field.key, 'required', hint)}
                  />
                ))}

                {movableRequiredFields.map((field, index) => (
                  <FieldRow
                    key={field._id}
                    field={field}
                    onRemove={() => removeField(field.key, 'required')}
                    onHintChange={(hint) => updateFieldHint(field.key, 'required', hint)}
                    onMoveUp={index > 0 ? () => moveRequiredField(index, index - 1) : undefined}
                    onMoveDown={index < movableRequiredFields.length - 1 ? () => moveRequiredField(index, index + 1) : undefined}
                    dragHandlers={{
                      onDragStart: () => requiredDrag.handleDragStart(index),
                      onDrop: () => requiredDrag.handleDrop(index),
                      onDragOver: requiredDrag.handleDragOver,
                    }}
                  />
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddQuestionPhase('required')}
                  disabled={isSaving}
                  icon={PlusIcon}
                  iconClassName="h-4 w-4"
                >
                  Add required question
                </Button>
              </div>
            </SettingSection>

            <SettingSection
              title="Enrichment questions"
              description="Optional questions collected after the submit offer if the client wants to strengthen their case."
            >
              <div className="space-y-2 py-2">
                {state.enrichmentFields.length === 0 ? (
                  <div className="status-info rounded-xl px-4 py-3 text-sm">
                    No enrichment questions yet. Add optional details that help the practice evaluate a case.
                  </div>
                ) : null}

                {state.enrichmentFields.map((field, index) => (
                  <FieldRow
                    key={field._id}
                    field={field}
                    onRemove={() => removeField(field.key, 'enrichment')}
                    onHintChange={(hint) => updateFieldHint(field.key, 'enrichment', hint)}
                    onMoveUp={index > 0 ? () => moveEnrichmentField(index, index - 1) : undefined}
                    onMoveDown={index < state.enrichmentFields.length - 1 ? () => moveEnrichmentField(index, index + 1) : undefined}
                    dragHandlers={{
                      onDragStart: () => enrichmentDrag.handleDragStart(index),
                      onDrop: () => enrichmentDrag.handleDrop(index),
                      onDragOver: enrichmentDrag.handleDragOver,
                    }}
                  />
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddQuestionPhase('enrichment')}
                  disabled={isSaving}
                  icon={PlusIcon}
                  iconClassName="h-4 w-4"
                >
                  Add enrichment question
                </Button>
              </div>
            </SettingSection>
          </div>
        ) : null}

        {activeTab === 'preview' ? (
          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-input-text">Live widget preview</p>
              <p className="mt-2 text-sm text-input-placeholder">
                The preview pane uses your unsaved draft to show the first question and field counts. Save the template before using the embed snippet on a public site.
              </p>
            </div>
            <SettingSection title="Preview checklist">
              <div className="space-y-2 text-sm text-input-placeholder">
                <p>Confirm the first required question feels natural.</p>
                <p>Confirm required questions are in the order the client should answer them.</p>
                <p>Confirm enrichment questions are optional and help strengthen the case.</p>
              </div>
            </SettingSection>
          </div>
        ) : null}
      </div>

      {addQuestionPhase ? (
        <AddQuestionModal
          isOpen
          defaultPhase={addQuestionPhase}
          existingKeys={existingKeys}
          availableStandardFields={availableStandardFields}
          onClose={() => setAddQuestionPhase(null)}
          onAdd={handleAddField}
        />
      ) : null}
    </SettingsPage>
  );
}

type TemplateListViewProps = {
  existingTemplates: IntakeTemplate[];
  practiceSlug: string;
  isSaving: boolean;
  onBack?: () => void;
  onNew: () => void;
  onEdit: (template: IntakeTemplate) => void;
  onDelete: (template: IntakeTemplate) => Promise<void>;
};

function TemplateListView({
  existingTemplates,
  practiceSlug,
  isSaving,
  onBack,
  onNew,
  onEdit,
  onDelete,
}: TemplateListViewProps) {
  const [deleteTarget, setDeleteTarget] = useState<IntakeTemplate | null>(null);

  return (
    <SettingsPage
      title="Intake Templates"
      subtitle="Create ordered AI intake flows for different case types."
      showBack={Boolean(onBack)}
      backVariant="close"
      onBack={onBack}
      contentMaxWidth={null}
      actions={
        <Button type="button" size="sm" onClick={onNew} disabled={isSaving} icon={PlusIcon} iconClassName="h-4 w-4">
          New template
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-3 lg:grid-cols-2">
          <TemplateCard
            template={DEFAULT_INTAKE_TEMPLATE}
            practiceSlug={practiceSlug}
            isDefault
            isSaving={isSaving}
          />

          {existingTemplates.map((template) => (
            <TemplateCard
              key={template.slug}
              template={template}
              practiceSlug={practiceSlug}
              isSaving={isSaving}
              onEdit={onEdit}
              onDelete={setDeleteTarget}
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
              Create intake template
            </span>
            <span className="mt-1 max-w-xs text-sm text-input-placeholder">
              Build an ordered question flow for a specific website page or case type.
            </span>
          </button>
        </div>

        {existingTemplates.length === 0 ? (
          <div className="status-info rounded-xl px-4 py-3 text-sm">
            No custom templates yet. The default flow is available now, and custom templates can be embedded with their own ?template= slug.
          </div>
        ) : null}
      </div>

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete template"
      >
        <DialogBody>
          <p className="text-sm text-input-text">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <p className="mt-2 text-sm text-input-placeholder">
            Embed links using{' '}
            <code className="rounded bg-surface-utility px-1.5 py-0.5 font-mono text-xs">
              ?template={deleteTarget?.slug}
            </code>{' '}
            will fall back to the default template automatically.
          </p>
        </DialogBody>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!deleteTarget) return;
              void onDelete(deleteTarget);
              setDeleteTarget(null);
            }}
            disabled={isSaving}
          >
            {isSaving ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </SettingsPage>
  );
}

export default function IntakeTemplatesPage({ onBack }: IntakeTemplatesPageProps) {
  const { currentPractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details: practiceDetails, updateDetails } = usePracticeDetails(
    currentPractice?.id,
    currentPractice?.slug,
    false,
  );
  const { showSuccess, showError } = useToastContext();
  const [view, setView] = useState<EditorView>('list');
  const [editTarget, setEditTarget] = useState<IntakeTemplate | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const existingTemplates = useMemo(
    () => parseTemplatesFromSettings(practiceDetails?.settings),
    [practiceDetails?.settings],
  );

  const persistTemplates = useCallback(async (nextTemplates: IntakeTemplate[]) => {
    if (!currentPractice) return;

    let settings: Record<string, unknown> = {};
    try {
      const rawSettings = practiceDetails?.settings;
      if (typeof rawSettings === 'string') {
        settings = JSON.parse(rawSettings) as Record<string, unknown>;
      } else if (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)) {
        settings = { ...(rawSettings as Record<string, unknown>) };
      }
    } catch {
      settings = {};
    }

    await updateDetails({ settings: JSON.stringify({ ...settings, intakeTemplates: nextTemplates }) });
  }, [currentPractice, practiceDetails?.settings, updateDetails]);

  const handleNew = () => {
    setEditTarget(undefined);
    setView('editor');
  };

  const handleEdit = (template: IntakeTemplate) => {
    setEditTarget(template);
    setView('editor');
  };

  const handleCancel = () => {
    setEditTarget(undefined);
    setView('list');
  };

  const handleSave = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      const nextTemplates = editTarget
        ? existingTemplates.map((existing) => existing.slug === editTarget.slug ? template : existing)
        : [...existingTemplates, template];
      await persistTemplates(nextTemplates);
      showSuccess(editTarget ? 'Template updated' : 'Template created', `"${template.name}" saved.`);
      setEditTarget(undefined);
      setView('list');
    } catch (error) {
      showError('Save failed', error instanceof Error ? error.message : 'Unable to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: IntakeTemplate) => {
    setIsSaving(true);
    try {
      await persistTemplates(existingTemplates.filter((existing) => existing.slug !== template.slug));
      showSuccess('Template deleted', `"${template.name}" has been removed.`);
    } catch (error) {
      showError('Delete failed', error instanceof Error ? error.message : 'Unable to delete template.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPractice) {
    return (
      <SettingsPage title="Intake Templates" showBack={Boolean(onBack)} onBack={onBack}>
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </SettingsPage>
    );
  }

  if (view === 'editor') {
    return (
      <TemplateEditor
        initial={editTarget}
        existingTemplates={existingTemplates}
        practiceSlug={currentPractice.slug ?? ''}
        practicePreviewConfig={{
          name: currentPractice.name,
          profileImage: currentPractice.logo ?? null,
          accentColor: practiceDetails?.accentColor ?? currentPractice.accentColor,
        }}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    );
  }

  return (
    <TemplateListView
      existingTemplates={existingTemplates}
      practiceSlug={currentPractice.slug ?? ''}
      isSaving={isSaving}
      onBack={onBack}
      onNew={handleNew}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  );
}
