import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useMatterDetail } from '@/shared/hooks/useMatterDetail';
import { Combobox, type ComboboxOption } from '@/shared/ui/input';
import { InspectorSectionSkeleton } from '@/shared/ui/layout';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
  InspectorHeaderEntity,
} from '@/shared/ui/inspector/InspectorPrimitives';
import {
  InspectorIdentity,
  renderCompactIdentity,
  renderIdentityStack,
  resolveAttorneyIdentity as resolveAttorneyIdentityHelper,
  resolveAttorneyLabel as resolveAttorneyLabelHelper,
} from '@/shared/ui/inspector/identityHelpers';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { MatterFilesSection } from '@/shared/ui/inspector/MatterFilesSection';

const isValidMatterStatus = (value: unknown): value is MatterStatus =>
  typeof value === 'string' && isMatterStatus(value);

const resolveString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

export interface MatterInspectorProps {
  practiceId: string;
  /** Matter id being inspected. */
  entityId: string;
  // Override / pre-resolved data from caller (falls back to matter detail).
  matterClientName?: string | null;
  matterAssigneeNames?: string[];
  matterCreatedLabel?: string | null;
  matterUpdatedLabel?: string | null;
  matterClientId?: string | null;
  matterUrgency?: string | null;
  matterResponsibleAttorneyId?: string | null;
  matterOriginatingAttorneyId?: string | null;
  matterCaseNumber?: string | null;
  matterType?: string | null;
  matterCourt?: string | null;
  matterJudge?: string | null;
  matterOpposingParty?: string | null;
  matterOpposingCounsel?: string | null;
  // Lookups for combobox population.
  matterClientOptions?: ComboboxOption[];
  matterClients?: InspectorIdentity[];
  matterAssigneeOptions?: ComboboxOption[];
  conversationMembers?: InspectorIdentity[];
  // Mutation callbacks (when undefined, fields render read-only).
  onMatterStatusChange?: (status: MatterStatus) => void;
  onMatterPatchChange?: (patch: Record<string, unknown>) => Promise<void> | void;
}

/**
 * MatterInspector — per-feature inspector for the matter entity type.
 * Extracted from the legacy InspectorPanel (5d.4b). Owns: matter data fetch
 * (via useMatterDetail), all matter editor state + handlers, identity
 * resolution via shared inspector/identityHelpers.
 */
export const MatterInspector = ({
  practiceId,
  entityId,
  matterClientName,
  matterAssigneeNames,
  matterCreatedLabel,
  matterUpdatedLabel,
  matterClientId,
  matterUrgency,
  matterResponsibleAttorneyId,
  matterOriginatingAttorneyId,
  matterCaseNumber,
  matterType,
  matterCourt,
  matterJudge,
  matterOpposingParty,
  matterOpposingCounsel,
  matterClientOptions = [],
  matterClients = [],
  matterAssigneeOptions = [],
  conversationMembers = [],
  onMatterStatusChange,
  onMatterPatchChange,
}: MatterInspectorProps) => {
  const { data: matterDetail, isLoading, error } = useMatterDetail(practiceId, entityId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeMatterEditor, setActiveMatterEditor] = useState<
    'status' | 'person' | 'responsible' | 'originating' | 'urgency' | 'caseNumber' | 'matterType' | 'court' | 'judge' | 'opposingParty' | 'opposingCounsel' | 'team' | null
  >(null);
  const [isSavingMatterStatus, setIsSavingMatterStatus] = useState(false);
  const [isSavingMatterField, setIsSavingMatterField] = useState(false);

  // Reset editor state when entity changes.
  useEffect(() => {
    setActiveMatterEditor(null);
    setLocalError(null);
  }, [entityId]);

  const [inspectorMatterStatus, setInspectorMatterStatus] = useState<MatterStatus | null>(
    isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null,
  );
  useEffect(() => {
    setInspectorMatterStatus(isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null);
  }, [entityId, matterDetail?.status]);

  const canEditMatterStatus = Boolean(onMatterStatusChange && matterDetail && !isLoading && inspectorMatterStatus);
  const canEditMatterFields = Boolean(onMatterPatchChange && matterDetail && !isLoading);

  const matterDetailRecord = matterDetail as Record<string, unknown> | null;

  const resolvedMatterClientName = matterClientName
    ?? resolveString(matterDetailRecord?.client_name)
    ?? null;
  const resolvedMatterClientId = matterClientId
    ?? resolveString(matterDetailRecord?.client_id)
    ?? null;
  const resolvedMatterUrgency = matterUrgency
    ?? resolveString(matterDetailRecord?.urgency)
    ?? null;
  const resolvedMatterResponsibleAttorneyId = matterResponsibleAttorneyId
    ?? resolveString(matterDetailRecord?.responsible_attorney_id)
    ?? null;
  const resolvedMatterOriginatingAttorneyId = matterOriginatingAttorneyId
    ?? resolveString(matterDetailRecord?.originating_attorney_id)
    ?? null;
  const resolvedMatterCaseNumber = matterCaseNumber
    ?? resolveString(matterDetailRecord?.case_number)
    ?? null;
  const resolvedMatterType = matterType
    ?? resolveString(matterDetailRecord?.matter_type)
    ?? null;
  const resolvedMatterCourt = matterCourt
    ?? resolveString(matterDetailRecord?.court)
    ?? null;
  const resolvedMatterJudge = matterJudge
    ?? resolveString(matterDetailRecord?.judge)
    ?? null;
  const resolvedMatterOpposingParty = matterOpposingParty
    ?? resolveString(matterDetailRecord?.opposing_party)
    ?? null;
  const resolvedMatterOpposingCounsel = matterOpposingCounsel
    ?? resolveString(matterDetailRecord?.opposing_counsel)
    ?? null;
  const resolvedMatterCreatedLabel = matterCreatedLabel
    ?? resolveString(matterDetailRecord?.created_at)
    ?? null;
  const resolvedMatterUpdatedLabel = matterUpdatedLabel
    ?? resolveString(matterDetailRecord?.updated_at)
    ?? null;

  const resolvedMatterAssigneeIds = useMemo(() => {
    if (Array.isArray(matterDetailRecord?.assignee_ids) && matterDetailRecord.assignee_ids.length > 0) {
      return matterDetailRecord.assignee_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    const assignees = Array.isArray(matterDetailRecord?.assignees) ? matterDetailRecord.assignees : [];
    return assignees
      .map((assignee) => {
        if (!assignee || typeof assignee !== 'object') return '';
        const row = assignee as Record<string, unknown>;
        return typeof row.id === 'string' ? row.id : '';
      })
      .filter((id): id is string => id.length > 0);
  }, [matterDetailRecord?.assignee_ids, matterDetailRecord?.assignees]);

  const resolvedMatterAssigneeNames = useMemo(() => {
    if (matterAssigneeNames && matterAssigneeNames.length > 0) return matterAssigneeNames;
    const assigneesValue = matterDetailRecord?.assignees;
    const assignees = Array.isArray(assigneesValue) ? assigneesValue : [];
    const namesFromRows = assignees
      .map((assignee) => {
        if (typeof assignee === 'string') return assignee.trim();
        if (!assignee || typeof assignee !== 'object') return '';
        const row = assignee as Record<string, unknown>;
        return resolveString(row.name) ?? resolveString(row.email) ?? '';
      })
      .filter((name): name is string => name.length > 0);
    if (namesFromRows.length > 0) return namesFromRows;
    const assigneeIds = Array.isArray(matterDetailRecord?.assignee_ids)
      ? [...matterDetailRecord.assignee_ids].filter((id) => typeof id === 'string' || typeof id === 'number')
      : [];
    return assigneeIds
      .map((id) => String(id).trim())
      .filter((id) => id.length > 0)
      .map((id) => `User ${id.slice(0, 6)}`);
  }, [matterAssigneeNames, matterDetailRecord]);

  const resolvedMatterClientLabel = useMemo(() => {
    if (resolvedMatterClientName) return resolvedMatterClientName;
    if (resolvedMatterClientId) {
      const option = matterClientOptions.find((entry) => entry.value === resolvedMatterClientId);
      if (option?.label) return option.label;
      return `Client ${resolvedMatterClientId.slice(0, 6)}`;
    }
    return 'Unassigned client';
  }, [resolvedMatterClientId, resolvedMatterClientName, matterClientOptions]);

  const matterClientOptionsWithNone = useMemo<ComboboxOption[]>(() => {
    const hasEmptyOption = matterClientOptions.some((option) => option.value === '');
    return hasEmptyOption
      ? matterClientOptions
      : [{ value: '', label: '— none —' }, ...matterClientOptions];
  }, [matterClientOptions]);

  const resolveMatterClientIdentity = useCallback(() => {
    if (!resolvedMatterClientId) {
      return resolvedMatterClientName
        ? { name: resolvedMatterClientName, image: null }
        : null;
    }
    const client = matterClients.find((entry) => entry.userId === resolvedMatterClientId);
    if (client) return client;
    return resolvedMatterClientName
      ? { userId: resolvedMatterClientId, name: resolvedMatterClientName, image: null, role: 'client' }
      : { userId: resolvedMatterClientId, name: `Client ${resolvedMatterClientId.slice(0, 6)}`, image: null, role: 'client' };
  }, [matterClients, resolvedMatterClientId, resolvedMatterClientName]);

  const resolveAttorneyLabel = useCallback(
    (id: string | null) => resolveAttorneyLabelHelper(id, matterAssigneeOptions),
    [matterAssigneeOptions],
  );
  const resolveAttorneyIdentity = useCallback(
    (id: string | null) => resolveAttorneyIdentityHelper(id, conversationMembers, matterAssigneeOptions),
    [conversationMembers, matterAssigneeOptions],
  );

  const matterTeamIdentities = useMemo(() => {
    const identities = new Map<string, { id: string; name: string; image?: string | null }>();

    const addIdentity = (identity: Pick<InspectorIdentity, 'userId' | 'name' | 'image'> | null | undefined) => {
      if (!identity?.userId || !identity.name) return;
      identities.set(identity.userId, {
        id: identity.userId,
        name: identity.name,
        image: identity.image ?? null,
      });
    };

    addIdentity(resolveAttorneyIdentity(resolvedMatterResponsibleAttorneyId));
    addIdentity(resolveAttorneyIdentity(resolvedMatterOriginatingAttorneyId));

    const assigneeIds = Array.isArray(matterDetailRecord?.assignee_ids)
      ? matterDetailRecord.assignee_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    assigneeIds.forEach((id) => addIdentity(resolveAttorneyIdentity(id)));

    resolvedMatterAssigneeNames.forEach((name, index) => {
      if (!name.trim()) return;
      const nameAlreadyExists = [...identities.values()].some((identity) => identity.name === name);
      if (!nameAlreadyExists) {
        identities.set(`matter-assignee-${index}`, {
          id: `matter-assignee-${index}`,
          name,
          image: null,
        });
      }
    });

    return [...identities.values()];
  }, [
    matterDetailRecord?.assignee_ids,
    resolveAttorneyIdentity,
    resolvedMatterAssigneeNames,
    resolvedMatterOriginatingAttorneyId,
    resolvedMatterResponsibleAttorneyId,
  ]);

  const matterUrgencyLabel = useMemo(() => {
    if (!resolvedMatterUrgency) return 'Not set';
    return resolvedMatterUrgency.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }, [resolvedMatterUrgency]);

  const matterStatusOptions = useMemo<ComboboxOption[]>(
    () => MATTER_WORKFLOW_STATUSES.map((status) => ({
      value: status,
      label: MATTER_STATUS_LABELS[status],
    })),
    [],
  );

  const urgencyOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Not set' },
      { value: 'routine', label: 'Routine' },
      { value: 'time_sensitive', label: 'Time Sensitive' },
      { value: 'emergency', label: 'Emergency' },
    ],
    [],
  );

  const handleMatterStatusChange = async (value: string) => {
    if (!canEditMatterStatus || !onMatterStatusChange || !isMatterStatus(value)) return;
    setLocalError(null);
    setIsSavingMatterStatus(true);
    try {
      await Promise.resolve(onMatterStatusChange(value));
      setInspectorMatterStatus(value);
      setActiveMatterEditor(null);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update matter status');
    } finally {
      setIsSavingMatterStatus(false);
    }
  };

  const handleMatterPatchChange = async (patch: Record<string, unknown>) => {
    if (!canEditMatterFields || !onMatterPatchChange) return;
    setLocalError(null);
    setIsSavingMatterField(true);
    try {
      const keyMap: Record<string, string> = {
        clientId: 'client_id',
        responsibleAttorneyId: 'responsible_attorney_id',
        originatingAttorneyId: 'originating_attorney_id',
        caseNumber: 'case_number',
        matterType: 'matter_type',
        opposingParty: 'opposing_party',
        opposingCounsel: 'opposing_counsel',
        assigneeIds: 'assignee_ids',
      };
      const normalizedPatch = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [keyMap[key] ?? key, value]),
      );
      await Promise.resolve(onMatterPatchChange(normalizedPatch));
      setActiveMatterEditor(null);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update matter');
    } finally {
      setIsSavingMatterField(false);
    }
  };

  const displayError = localError ?? error;

  if (isLoading) {
    return (
      <div className="py-3">
        <InspectorSectionSkeleton wideRows={[true, false, true, false]} />
      </div>
    );
  }

  return (
    <>
      {displayError ? (
        <p className="px-4 py-3 text-sm text-neg">{displayError}</p>
      ) : null}
      <div className="pb-4">
        <InspectorHeaderEntity
          chip="MATTER"
          title={matterDetail?.title ?? 'Matter'}
          subtitle={undefined}
          statusBadge={null}
        />
        <div>
          <InspectorGroup
            label="Status"
            onToggle={canEditMatterStatus
              ? () => setActiveMatterEditor((prev) => (prev === 'status' ? null : 'status'))
              : undefined}
            isOpen={activeMatterEditor === 'status'}
            disabled={isSavingMatterStatus}
          >
            <InspectorEditableRow
              label=""
              summary={inspectorMatterStatus ? MATTER_STATUS_LABELS[inspectorMatterStatus] : '—'}
              summaryMuted={!inspectorMatterStatus}
              isOpen={activeMatterEditor === 'status'}
            >
              <div className="relative z-40">
                <Combobox
                  value={inspectorMatterStatus ?? ''}
                  onChange={(value) => { void handleMatterStatusChange(value); }}
                  options={matterStatusOptions}
                  searchable={false}
                  defaultOpen
                  hideTrigger
                  placeholder="Select status"
                  disabled={isSavingMatterStatus || !canEditMatterStatus}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Client"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'person' ? null : 'person'))
              : undefined}
            isOpen={activeMatterEditor === 'person'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={renderCompactIdentity(resolveMatterClientIdentity()) ?? resolvedMatterClientLabel}
              summaryMuted={!resolvedMatterClientId && !resolvedMatterClientName}
              isOpen={activeMatterEditor === 'person'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterClientId ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ clientId: value === '' ? null : value }); }}
                  options={matterClientOptionsWithNone}
                  searchable
                  defaultOpen
                  hideTrigger
                  placeholder="Select client"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Team"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'team' ? null : 'team'))
              : undefined}
            isOpen={activeMatterEditor === 'team'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={renderIdentityStack(
                matterTeamIdentities,
                'No team members assigned',
                'team member',
                'team members',
              )}
              summaryMuted={matterTeamIdentities.length === 0}
              isOpen={activeMatterEditor === 'team'}
            >
              <div className="relative z-30">
                <Combobox
                  multiple
                  value={resolvedMatterAssigneeIds}
                  onChange={(value) => { void handleMatterPatchChange({ assigneeIds: value }); }}
                  options={matterAssigneeOptions}
                  searchable
                  defaultOpen
                  hideTrigger
                  placeholder="Select team members"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Responsible Attorney"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'responsible' ? null : 'responsible'))
              : undefined}
            isOpen={activeMatterEditor === 'responsible'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={renderCompactIdentity(resolveAttorneyIdentity(resolvedMatterResponsibleAttorneyId))}
              summaryMuted={!resolvedMatterResponsibleAttorneyId}
              isOpen={activeMatterEditor === 'responsible'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterResponsibleAttorneyId ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ responsibleAttorneyId: value === '' ? null : value }); }}
                  options={[{ value: '', label: 'Not set' }, ...matterAssigneeOptions]}
                  searchable
                  defaultOpen
                  hideTrigger
                  placeholder="Select attorney"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Originating Attorney"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'originating' ? null : 'originating'))
              : undefined}
            isOpen={activeMatterEditor === 'originating'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={renderCompactIdentity(resolveAttorneyIdentity(resolvedMatterOriginatingAttorneyId)) ?? resolveAttorneyLabel(resolvedMatterOriginatingAttorneyId)}
              summaryMuted={!resolvedMatterOriginatingAttorneyId}
              isOpen={activeMatterEditor === 'originating'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterOriginatingAttorneyId ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ originatingAttorneyId: value === '' ? null : value }); }}
                  options={[{ value: '', label: 'Not set' }, ...matterAssigneeOptions]}
                  searchable
                  defaultOpen
                  hideTrigger
                  placeholder="Select attorney"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Urgency"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'urgency' ? null : 'urgency'))
              : undefined}
            isOpen={activeMatterEditor === 'urgency'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={matterUrgencyLabel}
              summaryMuted={!resolvedMatterUrgency}
              isOpen={activeMatterEditor === 'urgency'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterUrgency ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ urgency: value === '' ? null : value }); }}
                  options={urgencyOptions}
                  searchable={false}
                  defaultOpen
                  hideTrigger
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Case Number"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'caseNumber' ? null : 'caseNumber'))
              : undefined}
            isOpen={activeMatterEditor === 'caseNumber'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterCaseNumber ?? 'Not set'}
              summaryMuted={!resolvedMatterCaseNumber}
              isOpen={activeMatterEditor === 'caseNumber'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterCaseNumber ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ caseNumber: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set case number"
                  placeholder="Enter case number"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Matter Type"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'matterType' ? null : 'matterType'))
              : undefined}
            isOpen={activeMatterEditor === 'matterType'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterType ?? 'Not set'}
              summaryMuted={!resolvedMatterType}
              isOpen={activeMatterEditor === 'matterType'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterType ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ matterType: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set matter type"
                  placeholder="Enter matter type"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Court"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'court' ? null : 'court'))
              : undefined}
            isOpen={activeMatterEditor === 'court'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterCourt ?? 'Not set'}
              summaryMuted={!resolvedMatterCourt}
              isOpen={activeMatterEditor === 'court'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterCourt ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ court: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set court"
                  placeholder="Enter court"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Judge"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'judge' ? null : 'judge'))
              : undefined}
            isOpen={activeMatterEditor === 'judge'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterJudge ?? 'Not set'}
              summaryMuted={!resolvedMatterJudge}
              isOpen={activeMatterEditor === 'judge'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterJudge ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ judge: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set judge"
                  placeholder="Enter judge"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Opposing Party"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'opposingParty' ? null : 'opposingParty'))
              : undefined}
            isOpen={activeMatterEditor === 'opposingParty'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterOpposingParty ?? 'Not set'}
              summaryMuted={!resolvedMatterOpposingParty}
              isOpen={activeMatterEditor === 'opposingParty'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterOpposingParty ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ opposingParty: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set opposing party"
                  placeholder="Enter opposing party"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup
            label="Opposing Counsel"
            onToggle={canEditMatterFields
              ? () => setActiveMatterEditor((prev) => (prev === 'opposingCounsel' ? null : 'opposingCounsel'))
              : undefined}
            isOpen={activeMatterEditor === 'opposingCounsel'}
            disabled={isSavingMatterField}
          >
            <InspectorEditableRow
              label=""
              summary={resolvedMatterOpposingCounsel ?? 'Not set'}
              summaryMuted={!resolvedMatterOpposingCounsel}
              isOpen={activeMatterEditor === 'opposingCounsel'}
            >
              <div className="relative z-30">
                <Combobox
                  value={resolvedMatterOpposingCounsel ?? ''}
                  onChange={(value) => { void handleMatterPatchChange({ opposingCounsel: value }); }}
                  options={[]}
                  allowCustomValues
                  defaultOpen
                  hideTrigger
                  addNewLabel="Set opposing counsel"
                  placeholder="Enter opposing counsel"
                  disabled={isSavingMatterField || !canEditMatterFields}
                />
              </div>
            </InspectorEditableRow>
          </InspectorGroup>
          <InspectorGroup label="Files & Media">
            <MatterFilesSection
              practiceId={practiceId}
              matterId={entityId}
            />
          </InspectorGroup>
          <InspectorGroup label="Record">
            <InfoRow label="Created" value={resolvedMatterCreatedLabel ?? undefined} />
            <InfoRow label="Updated" value={resolvedMatterUpdatedLabel ?? undefined} />
          </InspectorGroup>
        </div>
      </div>
    </>
  );
};
