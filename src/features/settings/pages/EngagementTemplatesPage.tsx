import { useCallback, useMemo, useState } from 'preact/hooks';
import { FileText, Plus, Trash2 } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { Combobox } from '@/shared/ui/input/Combobox';
import type { ComboboxOption } from '@/shared/ui/input/Combobox';
import { EditorShell } from '@/shared/ui/layout';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { cn } from '@/shared/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EngagementFeeType = 'hourly' | 'flat' | 'contingency' | 'pro_bono';

export type EngagementLetterTemplate = {
  id: string;
  name: string;
  practiceArea: string;
  feeType: EngagementFeeType;
  hourlyRateCents: number | null;
  flatFeeCents: number | null;
  contingencyPct: number | null;
  retainerCents: number | null;
  scopeTemplate: string;
  body: string;
};

const FEE_TYPE_LABELS: Record<EngagementFeeType, string> = {
  hourly: 'Hourly',
  flat: 'Flat fee',
  contingency: 'Contingency',
  pro_bono: 'Pro bono',
};

const PLACEHOLDER_DOCS: Array<{ key: string; description: string }> = [
  { key: '{{clientName}}', description: 'Client full name' },
  { key: '{{clientEmail}}', description: 'Client email' },
  { key: '{{matterDescription}}', description: 'AI-generated matter description' },
  { key: '{{practiceArea}}', description: 'Practice area' },
  { key: '{{scope}}', description: 'Scope of representation' },
  { key: '{{opposingParty}}', description: 'Opposing party name' },
  { key: '{{courtDate}}', description: 'Court date (if any)' },
  { key: '{{jurisdiction}}', description: 'State / jurisdiction' },
  { key: '{{practiceName}}', description: 'Your practice name' },
  { key: '{{hourlyRate}}', description: 'Hourly rate (formatted)' },
  { key: '{{flatFee}}', description: 'Flat fee (formatted)' },
  { key: '{{retainer}}', description: 'Retainer amount (formatted)' },
  { key: '{{contingencyPct}}', description: 'Contingency percentage' },
  { key: '{{date}}', description: 'Date the letter is generated' },
];

// ---------------------------------------------------------------------------
// Metadata helpers — same pattern as intake templates
// ---------------------------------------------------------------------------

const METADATA_KEY = 'engagementLetterTemplates';

function parseTemplatesFromMetadata(metadata: Record<string, unknown> | null | undefined): EngagementLetterTemplate[] {
  if (!metadata) return [];
  const raw = metadata[METADATA_KEY];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as EngagementLetterTemplate[]) : [];
    } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as EngagementLetterTemplate[]) : [];
}

function generateId(): string {
  return `et_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Editor sub-component
// ---------------------------------------------------------------------------

type EditorProps = {
  initial: EngagementLetterTemplate;
  serviceOptions: ComboboxOption[];
  onSave: (template: EngagementLetterTemplate) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  isSaving: boolean;
};

const centsToDisplay = (cents: number | null): string =>
  cents != null && cents > 0 ? (cents / 100).toFixed(2) : '';

const displayToCents = (value: string): number | null => {
  const n = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

function TemplateEditor({ initial, serviceOptions, onSave, onDelete, onBack, isSaving }: EditorProps) {
  const [template, setTemplate] = useState<EngagementLetterTemplate>(initial);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const update = <K extends keyof EngagementLetterTemplate>(key: K, value: EngagementLetterTemplate[K]) =>
    setTemplate((prev) => ({ ...prev, [key]: value }));

  const insertPlaceholder = (key: string) => {
    const el = document.querySelector<HTMLTextAreaElement>('#et-body');
    if (!el) {
      update('body', template.body + key);
      return;
    }
    const start = el.selectionStart ?? template.body.length;
    const end = el.selectionEnd ?? start;
    const next = template.body.slice(0, start) + key + template.body.slice(end);
    update('body', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + key.length, start + key.length);
    });
  };

  return (
    <EditorShell
      title={template.name || 'New template'}
      showBack
      onBack={onBack}
      contentMaxWidth={null}
      actions={
        <div className="flex items-center gap-2">
          {onDelete ? (
            <Button
              type="button"
              variant={deleteConfirm ? 'danger' : 'secondary'}
              size="sm"
              icon={Trash2}
              onClick={async () => {
                if (!deleteConfirm) { setDeleteConfirm(true); return; }
                await onDelete();
              }}
              disabled={isSaving}
            >
              {deleteConfirm ? 'Confirm delete' : 'Delete'}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => void onSave(template)}
            disabled={isSaving || !template.name.trim() || !template.body.trim()}
          >
            {isSaving ? 'Saving…' : 'Save template'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_280px]">
        {/* Main editor column */}
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-input-text">Template name</span>
              <Input
                type="text"
                value={template.name}
                onChange={(v) => update('name', v)}
                placeholder="e.g. Family Law – Hourly Engagement"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-input-text">Practice area</span>
              <Combobox
                options={serviceOptions}
                value={template.practiceArea}
                onChange={(v) => update('practiceArea', v)}
                placeholder="e.g. Family Law"
                allowCustomValues
                hideCustomHint
              />
            </div>
          </div>

          {/* Fee configuration */}
          <div className="flex flex-col gap-3 rounded-xl border border-line-subtle bg-surface-card p-4">
            <p className="text-sm font-semibold text-input-text">Fee arrangement</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FEE_TYPE_LABELS) as EngagementFeeType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('feeType', type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    template.feeType === type
                      ? 'border-accent-500 bg-accent-500/10 text-accent-500'
                      : 'border-line-subtle text-input-placeholder hover:border-line-subtle hover:text-input-text',
                  )}
                >
                  {FEE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {template.feeType === 'hourly' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-input-text">Attorney rate ($/hr)</span>
                    <Input
                      type="text"
                      value={centsToDisplay(template.hourlyRateCents)}
                      onChange={(v) => update('hourlyRateCents', displayToCents(v))}
                      placeholder="350.00"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-input-text">Retainer ($)</span>
                    <Input
                      type="text"
                      value={centsToDisplay(template.retainerCents)}
                      onChange={(v) => update('retainerCents', displayToCents(v))}
                      placeholder="2500.00"
                    />
                  </div>
                </>
              ) : template.feeType === 'flat' ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-input-text">Flat fee ($)</span>
                  <Input
                    type="text"
                    value={centsToDisplay(template.flatFeeCents)}
                    onChange={(v) => update('flatFeeCents', displayToCents(v))}
                    placeholder="1500.00"
                  />
                </div>
              ) : template.feeType === 'contingency' ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-input-text">Contingency %</span>
                  <Input
                    type="text"
                    value={template.contingencyPct != null ? String(template.contingencyPct) : ''}
                    onChange={(v) => {
                      const n = parseFloat(v);
                      update('contingencyPct', Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null);
                    }}
                    placeholder="33"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Scope template */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-input-text">Scope of representation</span>
            <p className="text-xs text-input-placeholder">
              Default scope language for this practice area. The AI will refine this per matter.
            </p>
            <Textarea
              value={template.scopeTemplate}
              onChange={(v) => update('scopeTemplate', v)}
              placeholder="Representation includes: reviewing existing orders, filing required motions, attending hearings, and advising on settlement options."
              rows={3}
            />
          </div>

          {/* Letter body */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-input-text">Letter body</span>
            <p className="text-xs text-input-placeholder">
              Write your engagement letter once. Click placeholders on the right to insert them at the cursor.
            </p>
            <Textarea
              id="et-body"
              value={template.body}
              onChange={(v) => update('body', v)}
              placeholder={`Dear {{clientName}},\n\nThank you for contacting {{practiceName}}. This letter confirms the terms of our engagement...\n\n{{matterDescription}}\n\nScope of representation:\n{{scope}}\n\nFee arrangement:\nOur services will be billed at {{hourlyRate}} per hour, with an initial retainer of {{retainer}}.\n\nPlease sign and return a copy of this letter to confirm your acceptance.\n\nSincerely,\n{{practiceName}}`}
              rows={18}
            />
          </div>
        </div>

        {/* Placeholder sidebar */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-input-text">Available placeholders</p>
          <p className="text-xs text-input-placeholder">Click to insert at cursor position in the letter body.</p>
          <div className="flex flex-col gap-1">
            {PLACEHOLDER_DOCS.map(({ key, description }) => (
              <button
                key={key}
                type="button"
                onClick={() => insertPlaceholder(key)}
                className="flex flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-input"
              >
                <span className="font-mono text-xs text-accent-500">{key}</span>
                <span className="text-xs text-input-placeholder">{description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </EditorShell>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

type ListViewProps = {
  templates: EngagementLetterTemplate[];
  onNew: () => void;
  onEdit: (template: EngagementLetterTemplate) => void;
};

function TemplateListView({ templates, onNew, onEdit }: ListViewProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-input-placeholder">
            Create a template for each practice area. When you generate an engagement letter from an intake, the AI will select the matching template, fill in the client&apos;s details, and produce a ready-to-review draft.
          </p>
        </div>
        <Button icon={Plus} onClick={onNew} size="sm">New template</Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-subtle py-12 text-center">
          <FileText className="h-8 w-8 text-input-placeholder" />
          <p className="text-sm font-medium text-input-text">No templates yet</p>
          <p className="text-xs text-input-placeholder">Create your first engagement letter template to get started.</p>
          <Button icon={Plus} onClick={onNew} size="sm" variant="secondary">New template</Button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line-subtle overflow-hidden rounded-xl border border-line-subtle">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onEdit(template)}
              className="flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-card"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-input-text">{template.name}</p>
                <p className="text-xs text-input-placeholder">
                  {template.practiceArea || 'No practice area'} · {FEE_TYPE_LABELS[template.feeType]}
                </p>
              </div>
              <span className="shrink-0 text-xs text-accent-500">Edit</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

const BLANK_TEMPLATE = (): EngagementLetterTemplate => ({
  id: generateId(),
  name: '',
  practiceArea: '',
  feeType: 'hourly',
  hourlyRateCents: null,
  flatFeeCents: null,
  contingencyPct: null,
  retainerCents: null,
  scopeTemplate: '',
  body: '',
});

interface EngagementTemplatesPageProps {
  onBack?: () => void;
}

export const EngagementTemplatesPage = ({ onBack }: EngagementTemplatesPageProps) => {
  const { currentPractice, isLoading, updatePractice } = usePracticeManagement({ fetchPracticeDetails: true });
  const { details: practiceDetails, setDetails } = usePracticeDetails(
    currentPractice?.id,
    currentPractice?.slug,
    false,
  );
  const { showSuccess, showError } = useToastContext();
  const [editTarget, setEditTarget] = useState<EngagementLetterTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const templates = useMemo(
    () => parseTemplatesFromMetadata(currentPractice?.metadata ?? practiceDetails?.metadata),
    [currentPractice?.metadata, practiceDetails?.metadata],
  );

  const serviceOptions = useMemo<ComboboxOption[]>(
    () => (Array.isArray(practiceDetails?.services) ? practiceDetails.services : [])
      .map((service) => {
        const rawName = (service as Record<string, unknown>).name;
        const name = typeof rawName === 'string'
          ? rawName.trim()
          : '';
        return name ? ({ value: name, label: name }) : null;
      })
      .filter((option): option is ComboboxOption => option !== null),
    [practiceDetails?.services],
  );

  const persist = useCallback(async (nextTemplates: EngagementLetterTemplate[]) => {
    if (!currentPractice) return;

    const currentMetadata = (() => {
      try {
        const raw = currentPractice?.metadata ?? practiceDetails?.metadata;
        if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
        if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
        return {};
      } catch { return {}; }
    })();

    const nextMetadata = { ...currentMetadata, [METADATA_KEY]: JSON.stringify(nextTemplates) };
    const snapshot = practiceDetails;
    setDetails({ ...(snapshot ?? {}), metadata: nextMetadata });

    try {
      await updatePractice(currentPractice.id, { metadata: nextMetadata });
    } catch (error) {
      setDetails(snapshot ?? null);
      throw error;
    }
  }, [currentPractice, practiceDetails, setDetails, updatePractice]);

  const handleSave = async (template: EngagementLetterTemplate) => {
    setIsSaving(true);
    try {
      const next = [
        ...templates.filter((t) => t.id !== template.id),
        template,
      ];
      await persist(next);
      showSuccess('Template saved', `"${template.name}" saved.`);
      setEditTarget(null);
    } catch (error) {
      showError('Save failed', error instanceof Error ? error.message : 'Unable to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await persist(templates.filter((t) => t.id !== id));
      showSuccess('Template deleted');
      setEditTarget(null);
    } catch (error) {
      showError('Delete failed', error instanceof Error ? error.message : 'Unable to delete template.');
    } finally {
      setIsSaving(false);
    }
  };

  if (editTarget) {
    const isNew = !templates.some((t) => t.id === editTarget.id);
    return (
      <TemplateEditor
        initial={editTarget}
        serviceOptions={serviceOptions}
        onSave={handleSave}
        onDelete={isNew ? undefined : async () => { await handleDelete(editTarget.id); }}
        onBack={() => setEditTarget(null)}
        isSaving={isSaving}
      />
    );
  }

  return (
    <EditorShell
      title="Engagement Templates"
      showBack
      onBack={onBack}
      contentMaxWidth={null}
    >
      {isLoading ? (
        <div className="p-6">
          <LoadingSpinner ariaLabel="Loading engagement templates" />
        </div>
      ) : (
        <TemplateListView
          templates={templates}
          onNew={() => setEditTarget(BLANK_TEMPLATE())}
          onEdit={setEditTarget}
        />
      )}
    </EditorShell>
  );
};
