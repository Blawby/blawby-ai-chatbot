import { useCallback, useMemo, useState } from 'preact/hooks';
import { Plus, Trash2 } from 'lucide-preact';

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
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { AIRibbon, Observation } from '@/design-system/patterns';
import { Pill } from '@/design-system/primitives';

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
              <span className="text-sm font-medium text-ink">Template name</span>
              <Input
                type="text"
                value={template.name}
                onChange={(v) => update('name', v)}
                placeholder="e.g. Family Law – Hourly Engagement"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Practice area</span>
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
          <div className="flex flex-col gap-3 rounded-r-md border border-line-subtle bg-card p-4">
            <p className="text-sm font-semibold text-ink">Fee arrangement</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FEE_TYPE_LABELS) as EngagementFeeType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('feeType', type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    template.feeType === type
                      ? 'border-accent bg-accent/10 text-accent-ink'
                      : 'border-line-subtle text-dim-2 hover:border-line-subtle hover:text-ink',
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
                    <span className="text-sm font-medium text-ink">Attorney rate ($/hr)</span>
                    <Input
                      type="text"
                      value={centsToDisplay(template.hourlyRateCents)}
                      onChange={(v) => update('hourlyRateCents', displayToCents(v))}
                      placeholder="350.00"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Retainer ($)</span>
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
                  <span className="text-sm font-medium text-ink">Flat fee ($)</span>
                  <Input
                    type="text"
                    value={centsToDisplay(template.flatFeeCents)}
                    onChange={(v) => update('flatFeeCents', displayToCents(v))}
                    placeholder="1500.00"
                  />
                </div>
              ) : template.feeType === 'contingency' ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">Contingency %</span>
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
            <span className="text-sm font-medium text-ink">Scope of representation</span>
            <p className="text-xs text-dim-2">
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
            <span className="text-sm font-medium text-ink">Letter body</span>
            <p className="text-xs text-dim-2">
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
          <p className="text-sm font-semibold text-ink">Available placeholders</p>
          <p className="text-xs text-dim-2">Click to insert at cursor position in the letter body.</p>
          <div className="flex flex-col gap-1">
            {PLACEHOLDER_DOCS.map(({ key, description }) => (
              <button
                key={key}
                type="button"
                onClick={() => insertPlaceholder(key)}
                className="flex flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-card"
              >
                <span className="font-mono text-xs text-accent">{key}</span>
                <span className="text-xs text-dim-2">{description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </EditorShell>
  );
}

// ---------------------------------------------------------------------------
// List view — area-grouped, filter chips, AI authoring strip, rich cards
// (mirrors design_handoff_blawby_chat_first/screens/EngagementTemplates.html)
// ---------------------------------------------------------------------------

// Suggested area buckets surfaced as empty-area CTAs even when no template
// exists for them yet — mirrors the "Pro bono" prompt in the design mock.
const SUGGESTED_AREAS: readonly string[] = ['Family', 'Estate', 'Litigation', 'Corporate', 'Pro bono'];

type StatusFilter = 'Drafts' | 'Needs review';

const PLACEHOLDER_RE = /\{\{\s*[\w.-]+\s*\}\}/g;

const countPlaceholders = (body: string): number => {
  const matches = body.match(PLACEHOLDER_RE);
  return matches ? new Set(matches.map((m) => m.replace(/\s/g, ''))).size : 0;
};

/**
 * Until the backend tracks publish/version state on engagement templates,
 * a template is considered a "draft" if it has no body yet. Anything with
 * letter body content is treated as "live". Backend support will replace
 * this with explicit `publishedAt` / `version` fields.
 *
 * TODO(backend): expose `publishedAt`, `version`, `lastReviewedAt`,
 * `useCount`, `comprehensionScore`, `lastSentAt`, `lastSentClient` on
 * the engagement template row so the card metadata can be live data.
 */
const isDraft = (template: EngagementLetterTemplate): boolean =>
  template.body.trim().length === 0;

/**
 * Heuristic for "Needs review": a template missing a practice area OR
 * missing a scope template is something the user almost certainly wants
 * to revisit. Replace with a real `lastReviewedAt` cutoff once available.
 */
const needsReview = (template: EngagementLetterTemplate): boolean =>
  !template.practiceArea.trim() || !template.scopeTemplate.trim();

const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const feeSummary = (template: EngagementLetterTemplate): { mode: string; amount: string; unit?: string } => {
  switch (template.feeType) {
    case 'hourly': {
      const hourly = template.hourlyRateCents != null
        ? formatCurrency(template.hourlyRateCents / 100)
        : '—';
      return {
        mode: template.retainerCents ? 'Hourly + retainer' : 'Hourly',
        amount: hourly,
        unit: '/hr',
      };
    }
    case 'flat':
      return {
        mode: 'Fixed fee',
        amount: template.flatFeeCents != null ? formatCurrency(template.flatFeeCents / 100) : '—',
      };
    case 'contingency':
      return {
        mode: 'Contingency',
        amount: template.contingencyPct != null ? `${template.contingencyPct}%` : '—',
      };
    case 'pro_bono':
      return { mode: 'Pro bono', amount: 'Free' };
    default:
      return { mode: FEE_TYPE_LABELS[template.feeType], amount: '—' };
  }
};

interface AreaBucket {
  area: string; // display label, title-cased
  key: string;  // normalized lookup key
  templates: EngagementLetterTemplate[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

function groupByArea(templates: EngagementLetterTemplate[]): AreaBucket[] {
  const map = new Map<string, AreaBucket>();
  // Seed with suggested areas first so they always appear in stable order
  // (and empty buckets render their CTA cards).
  for (const area of SUGGESTED_AREAS) {
    map.set(normalize(area), { area, key: normalize(area), templates: [] });
  }
  for (const template of templates) {
    const raw = template.practiceArea.trim() || 'Uncategorized';
    const key = normalize(raw);
    const existing = map.get(key);
    if (existing) {
      existing.templates.push(template);
    } else {
      map.set(key, { area: titleCase(raw), key, templates: [template] });
    }
  }
  return Array.from(map.values());
}

// -- Filter chips ------------------------------------------------------------

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}

const FilterChip = ({ label, count, active, onToggle }: FilterChipProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={active}
    className={cn(
      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors',
      active
        ? 'border-ink bg-ink text-paper'
        : 'border-rule bg-card text-dim hover:border-ink-3 hover:text-ink-2',
    )}
  >
    <span>{label}</span>
    <span className="font-mono text-accent">{count}</span>
  </button>
);

// -- Template card -----------------------------------------------------------

interface TemplateCardProps {
  template: EngagementLetterTemplate;
  onEdit: (template: EngagementLetterTemplate) => void;
}

const TemplateCard = ({ template, onEdit }: TemplateCardProps) => {
  const placeholderCount = useMemo(() => countPlaceholders(template.body), [template.body]);
  const fee = useMemo(() => feeSummary(template), [template]);
  const draft = isDraft(template);
  const review = !draft && needsReview(template);

  // Until backend exposes review state, we surface one Observation when a
  // live template is missing scope — a concrete, actionable nudge the
  // assistant could volunteer. (Mirrors the "trust account paragraph
  // missing" voice in the design mock.)
  const observation = review && !template.scopeTemplate.trim() ? (
    <Observation label="I noticed">
      The scope of representation paragraph is empty. Templates without a
      scope tend to come back with revisions — want me to draft one from
      your prior <em>{template.practiceArea || 'matters'}</em> work?
    </Observation>
  ) : null;

  return (
    <button
      type="button"
      onClick={() => onEdit(template)}
      className={cn(
        'group flex w-full flex-col gap-4 rounded-r-md border border-rule bg-card p-5 text-left',
        'transition-[border-color,box-shadow,transform] duration-150',
        'hover:-translate-y-px hover:border-paper-edge hover:shadow-2 sm:p-6',
      )}
    >
      <div className="grid w-full gap-5 lg:grid-cols-[1fr_180px] lg:items-start lg:gap-7">
        {/* Left — gist + meta */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="font-serif text-xl leading-tight tracking-tight text-ink sm:text-2xl">
              {template.name || <span className="text-dim-2">Untitled template</span>}
            </span>
            {draft ? (
              <Pill tone="warn">draft</Pill>
            ) : review ? (
              <Pill tone="gold">needs review</Pill>
            ) : (
              <Pill tone="live">live</Pill>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
            <span>
              <span className="text-ink-2">{placeholderCount}</span> placeholders
            </span>
            {/* TODO(backend): replace stub `useCount`, `comprehension`, `lastSentAt` with live fields */}
            <span className="text-dim-2">·</span>
            <span>fee · <span className="text-ink-2">{fee.mode}</span></span>
            {template.scopeTemplate.trim() ? (
              <>
                <span className="text-dim-2">·</span>
                <span>scope set</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Right — fee + arrow */}
        <div className="flex items-end justify-between gap-3 lg:h-full lg:flex-col lg:items-end lg:justify-between lg:text-right">
          <div className="flex flex-col gap-1 lg:items-end">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">
              {fee.mode}
            </span>
            <span className="font-serif text-2xl leading-none tracking-tight text-ink tabular-nums sm:text-[28px]">
              {fee.amount}
              {fee.unit ? (
                <span className="ml-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-dim">
                  {fee.unit}
                </span>
              ) : null}
            </span>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-dim transition-colors',
              'group-hover:text-accent-deep',
            )}
            aria-hidden="true"
          >
            Open in builder <span aria-hidden="true">→</span>
          </span>
        </div>
      </div>
      {observation ? <div className="w-full">{observation}</div> : null}
    </button>
  );
};

// -- Empty-area CTA ----------------------------------------------------------

interface EmptyAreaCardProps {
  area: string;
  onAsk: () => void;
}

const EmptyAreaCard = ({ area, onAsk }: EmptyAreaCardProps) => (
  <div className="flex flex-col items-start gap-4 rounded-r-md border border-dashed border-rule bg-paper p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
    <div className="flex-1">
      <p className="font-serif text-base text-ink sm:text-[17px]">
        No {area.toLowerCase()} template yet
      </p>
      <p className="mt-1 text-sm leading-snug text-ink-2">
        The assistant can draft one from your prior {area.toLowerCase()} matters.
      </p>
    </div>
    <Button type="button" size="sm" variant="secondary" onClick={onAsk}>
      Ask assistant
    </Button>
  </div>
);

// -- Area section ------------------------------------------------------------

interface AreaSectionProps {
  bucket: AreaBucket;
  onAdd: (area: string) => void;
  onAsk: (area: string) => void;
  onEdit: (template: EngagementLetterTemplate) => void;
}

const AreaSection = ({ bucket, onAdd, onAsk, onEdit }: AreaSectionProps) => {
  const count = bucket.templates.length;
  const countLabel = count === 0 ? 'none yet' : `${count} template${count === 1 ? '' : 's'}`;

  // Mobile: each section is its own <details>; desktop: always open via CSS.
  return (
    <details open className="group/area">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-baseline justify-between gap-3 py-1',
          'lg:cursor-default',
          // Strip default disclosure marker
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-xl font-normal leading-none tracking-tight text-ink sm:text-[22px]">
            {bucket.area}
          </h2>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim">
            {countLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAdd(bucket.area);
          }}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 underline decoration-dim-2 decoration-dotted underline-offset-2 transition-colors hover:text-accent-deep hover:decoration-accent-deep"
        >
          + add
        </button>
      </summary>

      <div className="mt-3.5">
        {count === 0 ? (
          <EmptyAreaCard area={bucket.area} onAsk={() => onAsk(bucket.area)} />
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {bucket.templates.map((template) => (
              <TemplateCard key={template.id} template={template} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
};

// -- List view root ----------------------------------------------------------

type ListViewProps = {
  templates: EngagementLetterTemplate[];
  onNew: () => void;
  onNewInArea: (area: string) => void;
  onEdit: (template: EngagementLetterTemplate) => void;
};

function TemplateListView({ templates, onNew, onNewInArea, onEdit }: ListViewProps) {
  const { showSuccess } = useToastContext();

  const [draftPrompt, setDraftPrompt] = useState('');
  const [areaFilters, setAreaFilters] = useState<Set<string>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(new Set());

  const buckets = useMemo(() => groupByArea(templates), [templates]);

  const areaChips = useMemo(() => {
    // Build chips from areas that have at least one template (avoids the
    // chip list growing with every suggested-but-empty bucket).
    return buckets
      .filter((b) => b.templates.length > 0)
      .map((b) => ({ key: b.key, label: b.area, count: b.templates.length }));
  }, [buckets]);

  const draftCount = templates.filter(isDraft).length;
  const reviewCount = templates.filter((t) => !isDraft(t) && needsReview(t)).length;

  const filteredBuckets = useMemo(() => {
    const noFilters = areaFilters.size === 0 && statusFilters.size === 0;
    if (noFilters) return buckets;

    return buckets
      .map((bucket) => {
        // Area filter: keep bucket only if its key is active (or no area filters)
        const areaPasses = areaFilters.size === 0 || areaFilters.has(bucket.key);
        if (!areaPasses) return { ...bucket, templates: [] };

        const filtered = bucket.templates.filter((t) => {
          if (statusFilters.size === 0) return true;
          if (statusFilters.has('Drafts') && isDraft(t)) return true;
          if (statusFilters.has('Needs review') && !isDraft(t) && needsReview(t)) return true;
          return false;
        });
        return { ...bucket, templates: filtered };
      })
      // When status filters are on, hide empty area sections to avoid noisy CTAs
      .filter((b) => (statusFilters.size === 0 ? true : b.templates.length > 0));
  }, [buckets, areaFilters, statusFilters]);

  const toggleArea = useCallback((key: string) => {
    setAreaFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleStatus = useCallback((status: StatusFilter) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setAreaFilters(new Set());
    setStatusFilters(new Set());
  }, []);

  const handleDraft = useCallback(() => {
    // TODO(backend): wire to a `/engagement-templates/draft-from-prompt`
    // endpoint that returns a fully-populated EngagementLetterTemplate.
    // Until then, surface the intent and seed a blank template so the
    // user can paste/edit. The prompt itself is preserved in toast copy.
    showSuccess(
      'Draft request noted',
      draftPrompt.trim()
        ? `Opening a blank template — assistant authoring isn't wired yet.`
        : 'Describe the template first, then ask the assistant to draft it.',
    );
    if (draftPrompt.trim()) {
      onNew();
    }
  }, [draftPrompt, onNew, showSuccess]);

  const handleAskAssistant = useCallback((area: string) => {
    // TODO(backend): wire to assistant authoring; for now open a blank
    // template pre-seeded with the area so the user can keep going.
    onNewInArea(area);
  }, [onNewInArea]);

  const handleBrowseCommunity = useCallback(() => {
    // TODO(backend): replace with a community-templates gallery dialog
    // (read-only browse + import). The endpoint and UI both don't exist
    // yet — surface the intent for now.
    showSuccess('Community templates', 'A community template gallery is on the roadmap.');
  }, [showSuccess]);

  const totalCount = templates.length;
  const allActive = areaFilters.size === 0 && statusFilters.size === 0;

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-7 px-6 pb-24 pt-8 sm:px-10 lg:px-16 lg:pt-10">
      {/* Page hero */}
      <header className="flex flex-col gap-5 border-b border-rule pb-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-normal leading-[1.05] tracking-tight text-ink sm:text-4xl lg:text-[46px]">
            Letters the assistant <em className="not-italic text-accent">drafts from.</em>
          </h1>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-ink-2 sm:text-[14px]">
            When an intake is accepted, the assistant picks the right template by practice area and fee structure, fills in placeholders from the intake, and shows you a finished letter to review.
            <span className="block text-dim-2">Open any template to edit it in the builder.</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleBrowseCommunity}>
            Browse community
          </Button>
          <Button type="button" variant="primary" size="sm" icon={Plus} onClick={onNew}>
            New template
          </Button>
        </div>
      </header>

      {/* AI authoring strip */}
      <AIRibbon
        variant="authoring"
        title="Describe a template — I'll draft it"
        editable
        onEdit={setDraftPrompt}
        actions={[
          {
            id: 'draft',
            label: 'Draft ↗',
            variant: 'primary',
            onClick: handleDraft,
          },
        ]}
      />

      {/* Filter chips — horizontally scrollable on mobile */}
      <div
        className={cn(
          'flex items-center gap-1.5 overflow-x-auto pb-1',
          'sm:flex-wrap sm:overflow-visible sm:pb-0',
          // hide the horizontal scrollbar visually but keep scroll
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        role="group"
        aria-label="Filter templates"
      >
        <FilterChip
          label="All"
          count={totalCount}
          active={allActive}
          onToggle={clearAll}
        />
        {areaChips.map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.label}
            count={chip.count}
            active={areaFilters.has(chip.key)}
            onToggle={() => toggleArea(chip.key)}
          />
        ))}
        {draftCount > 0 ? (
          <FilterChip
            label="Drafts"
            count={draftCount}
            active={statusFilters.has('Drafts')}
            onToggle={() => toggleStatus('Drafts')}
          />
        ) : null}
        {reviewCount > 0 ? (
          <FilterChip
            label="Needs review"
            count={reviewCount}
            active={statusFilters.has('Needs review')}
            onToggle={() => toggleStatus('Needs review')}
          />
        ) : null}
      </div>

      {/* Area sections */}
      {totalCount === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-r-md border border-dashed border-rule bg-paper p-6 sm:p-8">
          <p className="font-serif text-lg text-ink">No templates yet</p>
          <p className="max-w-[56ch] text-sm leading-relaxed text-ink-2">
            Create your first engagement letter template, or describe one above and the assistant will draft it from your prior matters.
          </p>
          <Button type="button" variant="primary" size="sm" icon={Plus} onClick={onNew}>
            New template
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-9">
          {filteredBuckets.map((bucket) => (
            <AreaSection
              key={bucket.key}
              bucket={bucket}
              onAdd={onNewInArea}
              onAsk={handleAskAssistant}
              onEdit={onEdit}
            />
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
      title="Engagement templates"
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
          onNewInArea={(area) => setEditTarget({ ...BLANK_TEMPLATE(), practiceArea: area })}
          onEdit={setEditTarget}
        />
      )}
    </EditorShell>
  );
};
