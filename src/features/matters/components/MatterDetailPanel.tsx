/**
 * MatterDetailsPanel
 *
 * Replaces the flat 3-column grid with contextual, inline-editable field groups.
 * Each group has its own edit mode — pencil → inputs in place → Save/Cancel.
 * No route change, no modal, no full-page form.
 *
 * Groups:
 *   1. Case identifiers  — case number · matter type · urgency
 *   2. Parties           — opposing party · opposing counsel
 *   3. Jurisdiction      — court · judge
 *   4. Attorneys         — responsible · originating
 *   5. Financial         — settlement amount (hidden when null and not editing)
 */

import { useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/input/Combobox';
import { Input } from '@/shared/ui/input/Input';
import { PencilIcon, CheckIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { type MatterDetail, type MatterOption } from '@/features/matters/data/matterTypes';
import { type MatterFormState } from '@/features/matters/components/MatterCreateModal';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { cn } from '@/shared/utils/cn';
import { asMajor } from '@/shared/utils/money';
import { parseMultiValueText, serializeMultiValueText } from '@/features/matters/utils/multiValueText';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatterDetailsPanelProps {
  detail: MatterDetail;
  assigneeOptions: MatterOption[];
  onSave: (patch: Partial<MatterFormState>) => Promise<void>;
}

// Which group is currently being edited
type EditingGroup = 'identifiers' | 'parties' | 'jurisdiction' | 'attorneys' | 'financial' | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const URGENCY_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'time_sensitive', label: 'Time Sensitive' },
  { value: 'emergency', label: 'Emergency' },
  { value: '', label: 'None' }
];

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/** Read-only field — suppressed when empty unless forceShow */
const ReadField = ({
  label,
  value,
  forceShow = false,
  className
}: {
  label: string;
  value: string | null | undefined;
  forceShow?: boolean;
  className?: string;
}) => {
  const display = value?.trim() || null;
  if (!display && !forceShow) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium text-input-placeholder">
        {label}
      </p>
      <p className={cn('mt-1 text-sm', display ? 'text-input-text' : 'text-input-placeholder italic')}>
        {display ?? 'Not set'}
      </p>
    </div>
  );
};

/** Text input for inline editing */
const InlineInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  id
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'date';
  id?: string;
}) => (
  <div>
    <Input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      className="w-full"
      labelKey={undefined}
      size="sm"
    />
  </div>
);

/** Currency input — shows dollar sign, stores major-unit string */
const InlineCurrencyInput = ({
  label,
  value,
  onChange,
  placeholder = '0.00',
  id
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) => (
  <div>
    <Input
      id={id}
      type="number"
      min="0"
      step={0.01}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      icon={<span className="text-sm text-input-placeholder">$</span>}
      iconPosition="left"
      className="w-full"
      labelKey={undefined}
      size="sm"
    />
  </div>
);

/** Section wrapper with header + optional edit controls */
const SectionHeader = ({
  title,
  isEditing,
  isSaving,
  onEdit,
  onSave,
  onCancel
}: {
  title: string;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <div className="flex items-center justify-between mb-4">
    <h4 className="text-sm font-medium text-input-text">
      {title}
    </h4>
    {isEditing ? (
      <div className="flex items-center gap-1.5">
        <Button
          size="xs"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          icon={<XMarkIcon className="h-3.5 w-3.5" />}
          aria-label="Cancel editing"
        />
        <Button
          size="xs"
          onClick={onSave}
          disabled={isSaving}
          icon={<CheckIcon className="h-3.5 w-3.5" />}
          aria-label="Save changes"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    ) : (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={onEdit}
        icon={<PencilIcon className="h-4 w-4" />}
        className={cn(
          'text-input-placeholder/80 transition-colors',
          'hover:text-input-text focus-visible:text-input-text'
        )}
        aria-label={`Edit ${title.toLowerCase()}`}
      />
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const MatterDetailsPanel = ({
  detail,
  assigneeOptions,
  onSave
}: MatterDetailsPanelProps) => {
  const [editing, setEditing] = useState<EditingGroup>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Draft state (populated when a group enters edit mode) ────────────────
  const [draftIdentifiers, setDraftIdentifiers] = useState({
    caseNumber: '',
    matterType: '',
    urgency: ''
  });
  const [draftParties, setDraftParties] = useState({
    opposingParty: '',
    opposingCounsel: ''
  });
  const [draftJurisdiction, setDraftJurisdiction] = useState({
    court: '',
    judge: ''
  });
  const [draftAttorneys, setDraftAttorneys] = useState({
    responsibleAttorneyId: '',
    originatingAttorneyId: ''
  });
  const [draftFinancial, setDraftFinancial] = useState({
    settlementAmount: ''
  });

  // ── Open group for editing ────────────────────────────────────────────────
  const startEdit = (group: EditingGroup) => {
    setSaveError(null);
    if (group === 'identifiers') {
      setDraftIdentifiers({
        caseNumber: detail.caseNumber ?? '',
        matterType: detail.matterType ?? '',
        urgency: detail.urgency ?? ''
      });
    } else if (group === 'parties') {
      setDraftParties({
        opposingParty: detail.opposingParty ?? '',
        opposingCounsel: detail.opposingCounsel ?? ''
      });
    } else if (group === 'jurisdiction') {
      setDraftJurisdiction({
        court: detail.court ?? '',
        judge: detail.judge ?? ''
      });
    } else if (group === 'attorneys') {
      setDraftAttorneys({
        responsibleAttorneyId: detail.responsibleAttorneyId ?? '',
        originatingAttorneyId: detail.originatingAttorneyId ?? ''
      });
    } else if (group === 'financial') {
      const amount = detail.settlementAmount;
      setDraftFinancial({
        settlementAmount: amount != null ? String(amount) : ''
      });
    }
    setEditing(group);
  };

  const cancelEdit = () => setEditing(null);

  // ── Commit save ───────────────────────────────────────────────────────────
  const commitSave = async (patch: Partial<MatterFormState>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(patch);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save changes';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const saveIdentifiers = () =>
    commitSave({
      caseNumber: draftIdentifiers.caseNumber,
      matterType: draftIdentifiers.matterType,
      urgency: draftIdentifiers.urgency as MatterFormState['urgency']
    });

  const saveParties = () =>
    commitSave({
      opposingParty: draftParties.opposingParty,
      opposingCounsel: draftParties.opposingCounsel
    });

  const saveJurisdiction = () =>
    commitSave({
      court: draftJurisdiction.court,
      judge: draftJurisdiction.judge
    });

  const saveAttorneys = () =>
    commitSave({
      responsibleAttorneyId: draftAttorneys.responsibleAttorneyId,
      originatingAttorneyId: draftAttorneys.originatingAttorneyId
    });

  const saveFinancial = () => {
    const trimmed = draftFinancial.settlementAmount.trim();
    if (trimmed === '') {
      void commitSave({ settlementAmount: undefined });
      return;
    }
    const raw = parseFloat(trimmed);
    if (Number.isNaN(raw)) {
      setSaveError('Settlement amount must be a valid number');
      return;
    }
    const amount = asMajor(raw);
    void commitSave({ settlementAmount: amount });
  };

  // ── Resolve attorney names for read mode ──────────────────────────────────
  const resolveAtty = (id: string | null | undefined) => {
    if (!id) return null;
    return assigneeOptions.find((a) => a.id === id)?.name ?? null;
  };

  // ── Visible section check — hide groups with no data in read mode ─────────
  const identifiersHasData = !!(detail.caseNumber || detail.matterType || detail.urgency);
  const partiesHasData = !!(detail.opposingParty || detail.opposingCounsel);
  const jurisdictionHasData = !!(detail.court || detail.judge);
  const attorneysHasData = !!(detail.responsibleAttorneyId || detail.originatingAttorneyId);
  const financialHasData = detail.settlementAmount != null;
  const missingGroups = [
    { key: 'identifiers', label: 'Identifiers' },
    { key: 'parties', label: 'Opposing parties' },
    { key: 'jurisdiction', label: 'Jurisdiction' },
    { key: 'attorneys', label: 'Attorneys' },
    { key: 'financial', label: 'Financial' }
  ] as const;
  const missingSectionOptions: Array<{ key: NonNullable<EditingGroup>; label: string }> = missingGroups.filter(({ key }) => {
    if (key === 'identifiers') return !identifiersHasData;
    if (key === 'parties') return !partiesHasData;
    if (key === 'jurisdiction') return !jurisdictionHasData;
    if (key === 'attorneys') return !attorneysHasData;
    return !financialHasData;
  });

  // ── Shared section props factory ──────────────────────────────────────────
  const sectionProps = (group: NonNullable<EditingGroup>) => ({
    isEditing: editing === group,
    isSaving: saving,
    onEdit: () => startEdit(group),
    onSave: group === 'identifiers' ? saveIdentifiers
      : group === 'parties' ? saveParties
      : group === 'jurisdiction' ? saveJurisdiction
      : group === 'attorneys' ? saveAttorneys
      : saveFinancial,
    onCancel: cancelEdit
  });

  // ── Helper: always show a group if it's being edited ─────────────────────
  const showGroup = (hasData: boolean, group: NonNullable<EditingGroup>) =>
    hasData || editing === group;

  return (
    <div className="glass-panel divide-y divide-white/[0.06]">
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-input-text">Matter details</h3>
      </div>

      {/* ── Case identifiers ────────────────────────────────────────────── */}
      {showGroup(identifiersHasData, 'identifiers') && (
        <div className="group px-5 py-4">
          <SectionHeader title="Case" {...sectionProps('identifiers')} />
          {saveError && editing === 'identifiers' && (
            <div className="mt-3 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          {editing === 'identifiers' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <InlineInput
                label="Case number"
                value={draftIdentifiers.caseNumber}
                onChange={(v) => setDraftIdentifiers((d) => ({ ...d, caseNumber: v }))}
                placeholder="e.g. 24-CV-1029"
              />
              <InlineInput
                label="Matter type"
                value={draftIdentifiers.matterType}
                onChange={(v) => setDraftIdentifiers((d) => ({ ...d, matterType: v }))}
                placeholder="e.g. Contract dispute"
              />
              <div>
                <p className="block text-xs font-medium text-input-placeholder mb-1.5">
                  Urgency
                </p>
                <Combobox
                  id="matter-detail-urgency"
                  placeholder="Select urgency"
                  value={draftIdentifiers.urgency}
                  onChange={(v) => setDraftIdentifiers((d) => ({ ...d, urgency: v ?? '' }))}
                  options={URGENCY_OPTIONS}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadField label="Case number" value={detail.caseNumber} forceShow={identifiersHasData} />
              <ReadField label="Matter type" value={detail.matterType} />
              <ReadField
                label="Urgency"
                value={detail.urgency
                  ? detail.urgency.charAt(0).toUpperCase() + detail.urgency.slice(1).replace(/_/g, ' ')
                  : null}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Parties ─────────────────────────────────────────────────────── */}
      {showGroup(partiesHasData, 'parties') && (
        <div className="group px-5 py-4">
          <SectionHeader title="Parties" {...sectionProps('parties')} />
          {saveError && editing === 'parties' && (
            <div className="mt-3 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          {editing === 'parties' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Combobox
                id="matter-detail-opposing-party"
                label="Opposing party"
                placeholder="Enter opposing party"
                value={parseMultiValueText(draftParties.opposingParty)}
                onChange={(values) =>
                  setDraftParties((d) => ({ ...d, opposingParty: serializeMultiValueText(values) }))
                }
                options={[]}
                multiple
                allowCustomValues
                addNewLabel="Add opposing party"
              />
              <Combobox
                id="matter-detail-opposing-counsel"
                label="Opposing counsel"
                placeholder="Enter opposing counsel"
                value={parseMultiValueText(draftParties.opposingCounsel)}
                onChange={(values) =>
                  setDraftParties((d) => ({ ...d, opposingCounsel: serializeMultiValueText(values) }))
                }
                options={[]}
                multiple
                allowCustomValues
                addNewLabel="Add opposing counsel"
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Opposing party" value={detail.opposingParty} forceShow={partiesHasData} />
              <ReadField label="Opposing counsel" value={detail.opposingCounsel} />
            </div>
          )}
        </div>
      )}

      {/* ── Jurisdiction ─────────────────────────────────────────────────── */}
      {showGroup(jurisdictionHasData, 'jurisdiction') && (
        <div className="group px-5 py-4">
          <SectionHeader title="Jurisdiction" {...sectionProps('jurisdiction')} />
          {saveError && editing === 'jurisdiction' && (
            <div className="mt-3 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          {editing === 'jurisdiction' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <InlineInput
                label="Court"
                value={draftJurisdiction.court}
                onChange={(v) => setDraftJurisdiction((d) => ({ ...d, court: v }))}
                placeholder="e.g. Superior Court of CA"
              />
              <Combobox
                id="matter-detail-judge"
                label="Judge"
                placeholder="e.g. Hon. A. Smith"
                value={parseMultiValueText(draftJurisdiction.judge)}
                onChange={(values) =>
                  setDraftJurisdiction((d) => ({ ...d, judge: serializeMultiValueText(values) }))
                }
                options={[]}
                multiple
                allowCustomValues
                addNewLabel="Add judge"
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField label="Court" value={detail.court} forceShow={jurisdictionHasData} />
              <ReadField label="Judge" value={detail.judge} />
            </div>
          )}
        </div>
      )}

      {/* ── Attorneys ─────────────────────────────────────────────────────── */}
      {showGroup(attorneysHasData, 'attorneys') && (
        <div className="group px-5 py-4">
          <SectionHeader title="Attorneys" {...sectionProps('attorneys')} />
          {saveError && editing === 'attorneys' && (
            <div className="mt-3 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          {editing === 'attorneys' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="block text-xs font-medium text-input-placeholder mb-1.5">
                  Responsible attorney
                </p>
                <Combobox
                  id="matter-detail-responsible-attorney"
                  placeholder="Select attorney"
                  value={draftAttorneys.responsibleAttorneyId}
                  onChange={(v) => setDraftAttorneys((d) => ({ ...d, responsibleAttorneyId: v ?? '' }))}
                  options={assigneeOptions.map((a) => ({ value: a.id, label: a.name }))}
                  searchable
                />
              </div>
              <div>
                <p className="block text-xs font-medium text-input-placeholder mb-1.5">
                  Originating attorney
                </p>
                <Combobox
                  id="matter-detail-originating-attorney"
                  placeholder="Select attorney"
                  value={draftAttorneys.originatingAttorneyId}
                  onChange={(v) => setDraftAttorneys((d) => ({ ...d, originatingAttorneyId: v ?? '' }))}
                  options={assigneeOptions.map((a) => ({ value: a.id, label: a.name }))}
                  searchable
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadField
                label="Responsible attorney"
                value={resolveAtty(detail.responsibleAttorneyId)}
                forceShow={attorneysHasData}
              />
              <ReadField
                label="Originating attorney"
                value={resolveAtty(detail.originatingAttorneyId)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Financial ────────────────────────────────────────────────────── */}
      {showGroup(financialHasData, 'financial') && (
        <div className="group px-5 py-4">
          <SectionHeader title="Financial" {...sectionProps('financial')} />
          {saveError && editing === 'financial' && (
            <div className="mt-3 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {saveError}
            </div>
          )}
          {editing === 'financial' ? (
            <div className="max-w-xs">
              <InlineCurrencyInput
                label="Settlement amount"
                value={draftFinancial.settlementAmount}
                onChange={(v) => setDraftFinancial({ settlementAmount: v })}
              />
            </div>
          ) : (
            <ReadField
              label="Settlement amount"
              value={detail.settlementAmount != null ? formatCurrency(detail.settlementAmount) : null}
              forceShow={financialHasData}
            />
          )}
        </div>
      )}

      {/* ── Add details prompt — always available for missing groups ─────── */}
      {editing === null && missingSectionOptions.length > 0 && (
        <div className="px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {missingSectionOptions.map((group) => (
              <Button
                key={group.key}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startEdit(group.key)}
                icon={<PlusIcon className="h-3.5 w-3.5" />}
                className="rounded-full"
              >
                {group.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
