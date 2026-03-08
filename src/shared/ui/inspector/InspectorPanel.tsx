import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import { getUserDetail, type UserDetailRecord } from '@/shared/lib/apiClient';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';
import { MatterStatusPopover } from '@/features/matters/components/MatterStatusPopover';
import { isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption, Textarea } from '@/shared/ui/input';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
  InspectorHeaderEntity,
  InspectorHeaderPerson,
  SkeletonRow,
} from './InspectorPrimitives';
import { XMarkIcon } from '@heroicons/react/24/outline';

type InspectorConfig =
  | { type: 'conversation' }
  | { type: 'matter' }
  | { type: 'client' }
  | { type: 'invoice' };

type InspectorEntityType = InspectorConfig['type'];

type InspectorPanelProps = {
  entityType: InspectorEntityType;
  entityId: string;
  practiceId: string;
  onClose: () => void;
  conversation?: Conversation | null;
  conversationMembers?: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
  }>;
  onConversationAssignedToChange?: (assignedTo: string | null) => Promise<void> | void;
  onConversationPriorityChange?: (priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void> | void;
  onConversationTagsChange?: (tags: string[]) => Promise<void> | void;
  onConversationInternalNotesChange?: (internalNotes: string | null) => Promise<void> | void;
  matterClientName?: string | null;
  matterAssigneeNames?: string[];
  matterBillingLabel?: string | null;
  matterCreatedLabel?: string | null;
  matterUpdatedLabel?: string | null;
  onMatterStatusChange?: (status: MatterStatus) => void;
  invoiceClientName?: string | null;
  invoiceMatterTitle?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: string | null;
  invoiceAmountDue?: string | null;
  invoiceDueDate?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const isValidMatterStatus = (value: unknown): value is MatterStatus =>
  typeof value === 'string' && isMatterStatus(value);

const isValidInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === 'string' && ['draft', 'pending', 'sent', 'open', 'overdue', 'paid', 'void', 'cancelled'].includes(value);

export const InspectorPanel = ({
  entityType,
  entityId,
  practiceId,
  onClose,
  conversation,
  conversationMembers = [],
  onConversationAssignedToChange,
  onConversationPriorityChange,
  onConversationTagsChange,
  onConversationInternalNotesChange,
  matterClientName,
  matterAssigneeNames,
  matterBillingLabel,
  matterCreatedLabel,
  matterUpdatedLabel,
  onMatterStatusChange,
  invoiceClientName,
  invoiceMatterTitle,
  invoiceStatus,
  invoiceTotal,
  invoiceAmountDue,
  invoiceDueDate,
}: InspectorPanelProps) => {
  const userCacheRef = useRef<Map<string, UserDetailRecord | null>>(new Map());
  const matterCacheRef = useRef<Map<string, BackendMatter | null>>(new Map());
  const [userDetail, setUserDetail] = useState<UserDetailRecord | null>(null);
  const [matterDetail, setMatterDetail] = useState<BackendMatter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(conversation?.internal_notes ?? '');
  const [activeConversationEditor, setActiveConversationEditor] = useState<'assignment' | 'priority' | 'tags' | 'notes' | null>(null);
  const lastPracticeIdRef = useRef<string | null>(practiceId);

  const conversationUserId = conversation?.user_id ?? null;
  const conversationMatterId = conversation?.matter_id ?? null;

  const makeCacheKey = (pId: string, eId: string) => `${pId}:${eId}`;
  const priorityOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' },
    ],
    []
  );
  const assignedToOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Unassigned' },
      ...conversationMembers.map((member) => ({
        value: member.userId,
        label: member.name,
        meta: member.email,
      })),
    ],
    [conversationMembers]
  );
  const currentTags = useMemo(
    () => Array.isArray(conversation?.tags) ? conversation.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0) : [],
    [conversation?.tags]
  );
  const tagOptions = useMemo<ComboboxOption[]>(
    () => currentTags.map((tag) => ({ value: tag, label: tag })),
    [currentTags]
  );
  const assignedMemberLabel = useMemo(() => {
    const assignedTo = conversation?.assigned_to;
    if (!assignedTo) return null;
    const member = conversationMembers.find((entry) => entry.userId === assignedTo);
    return member?.name ?? assignedTo;
  }, [conversation?.assigned_to, conversationMembers]);
  const currentPriorityLabel = useMemo(() => {
    const raw = conversation?.priority ?? 'normal';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [conversation?.priority]);
  const currentTagsLabel = useMemo(
    () => (currentTags.length > 0 ? currentTags.join(', ') : 'No tags'),
    [currentTags]
  );
  const currentNotesLabel = useMemo(() => {
    const raw = conversation?.internal_notes?.trim();
    if (!raw) return 'No notes';
    if (raw.length <= 72) return raw;
    return `${raw.slice(0, 69)}...`;
  }, [conversation?.internal_notes]);

  useEffect(() => {
    if (lastPracticeIdRef.current !== practiceId) {
      userCacheRef.current.clear();
      matterCacheRef.current.clear();
      lastPracticeIdRef.current = practiceId;
    }
  }, [practiceId]);

  useEffect(() => {
    setActiveConversationEditor(null);
  }, [conversation?.id, entityId, entityType]);

  useEffect(() => {
    setNotesDraft(conversation?.internal_notes ?? '');
  }, [conversation?.id, conversation?.internal_notes]);

  useEffect(() => {
    setUserDetail(null);
    setMatterDetail(null);
    if (!practiceId || !entityId) return;
    const controller = new AbortController();
    setError(null);
    setIsLoading(true);

    const load = async () => {
      try {
        if (entityType === 'invoice') {
          return;
        }

        if (entityType === 'conversation') {
          const userId = conversationUserId;
          const matterId = conversationMatterId;

          if (userId) {
            const cacheKey = makeCacheKey(practiceId, userId);
            if (userCacheRef.current.has(cacheKey)) {
              setUserDetail(userCacheRef.current.get(cacheKey) ?? null);
            } else {
              const detail = await getUserDetail(practiceId, userId, { signal: controller.signal });
              userCacheRef.current.set(cacheKey, detail);
              setUserDetail(detail);
            }
          }

          if (matterId) {
            const cacheKey = makeCacheKey(practiceId, matterId);
            if (matterCacheRef.current.has(cacheKey)) {
              setMatterDetail(matterCacheRef.current.get(cacheKey) ?? null);
            } else {
              const detail = await getMatter(practiceId, matterId, { signal: controller.signal });
              matterCacheRef.current.set(cacheKey, detail);
              setMatterDetail(detail);
            }
          }
          return;
        }

        const cacheKey = makeCacheKey(practiceId, entityId);
        if (entityType === 'matter') {
          if (matterCacheRef.current.has(cacheKey)) {
            setMatterDetail(matterCacheRef.current.get(cacheKey) ?? null);
          } else {
            const detail = await getMatter(practiceId, entityId, { signal: controller.signal });
            matterCacheRef.current.set(cacheKey, detail);
            setMatterDetail(detail);
          }
          return;
        }

        if (userCacheRef.current.has(cacheKey)) {
          setUserDetail(userCacheRef.current.get(cacheKey) ?? null);
        } else {
          const detail = await getUserDetail(practiceId, entityId, { signal: controller.signal });
          userCacheRef.current.set(cacheKey, detail);
          setUserDetail(detail);
        }
      } catch (nextError: unknown) {
        if ((nextError as DOMException)?.name === 'AbortError') return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load inspector data');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [conversationMatterId, conversationUserId, entityId, entityType, practiceId]);

  const conversationSkeletonRows = useMemo(() => [0, 1, 2, 3], []);
  const clientSkeletonRows = useMemo(() => [0, 1, 2], []);
  const matterSkeletonRows = useMemo(() => [0, 1, 2, 3], []);
  const matterStatus = isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null;
  const canEditMatterStatus = Boolean(onMatterStatusChange && matterDetail && !isLoading && matterStatus);
  const handleMatterStatusSelect = (status: MatterStatus) => {
    if (canEditMatterStatus && onMatterStatusChange) {
      onMatterStatusChange(status);
    }
  };
  const handleConversationAssignmentChange = async (value: string) => {
    if (!onConversationAssignedToChange) return;
    setError(null);
    setIsSavingAssignment(true);
    try {
      await onConversationAssignedToChange(value.trim().length > 0 ? value : null);
      setActiveConversationEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update assignee');
    } finally {
      setIsSavingAssignment(false);
    }
  };
  const handleConversationPriorityChange = async (value: string) => {
    if (!onConversationPriorityChange) return;
    if (value !== 'low' && value !== 'normal' && value !== 'high' && value !== 'urgent') return;
    setError(null);
    setIsSavingPriority(true);
    try {
      await onConversationPriorityChange(value);
      setActiveConversationEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update priority');
    } finally {
      setIsSavingPriority(false);
    }
  };
  const handleConversationTagsChange = async (values: string[]) => {
    if (!onConversationTagsChange) return;
    setError(null);
    setIsSavingTags(true);
    try {
      await onConversationTagsChange(values);
      setActiveConversationEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update tags');
    } finally {
      setIsSavingTags(false);
    }
  };
  const handleConversationNotesBlur = async (value: string) => {
    if (!onConversationInternalNotesChange) return;
    const nextValue = value.trim().length > 0 ? value.trim() : null;
    const previousValue = conversation?.internal_notes?.trim() || null;
    if (nextValue === previousValue) return;
    setError(null);
    setIsSavingNotes(true);
    try {
      await onConversationInternalNotesChange(nextValue);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update internal notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-line-glass/30 px-4 py-3">
        <h2 className="text-sm font-semibold text-input-text">
          {entityType === 'conversation'
            ? 'Conversation Info'
            : entityType === 'matter'
              ? 'Matter Info'
              : entityType === 'invoice'
                ? 'Invoice Info'
                : 'Client Info'}
        </h2>
        <Button
          variant="icon"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
          icon={XMarkIcon} iconClassName="h-4 w-4"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && entityType === 'conversation' ? (
          <div className="py-3">
            {conversationSkeletonRows.map((row) => (
              <SkeletonRow key={`conversation-skeleton-${row}`} wide={row % 2 === 0} />
            ))}
          </div>
        ) : null}
        {isLoading && entityType === 'client' ? (
          <div className="py-3">
            {clientSkeletonRows.map((row) => (
              <SkeletonRow key={`client-skeleton-${row}`} wide={row === 0} />
            ))}
          </div>
        ) : null}
        {isLoading && entityType === 'matter' ? (
          <div className="py-3">
            {matterSkeletonRows.map((row) => (
              <SkeletonRow key={`matter-skeleton-${row}`} wide={row === 0 || row === 2} />
            ))}
          </div>
        ) : null}
        {error ? <p className="px-4 py-3 text-sm text-red-400">{error}</p> : null}

        {entityType === 'conversation' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderPerson
              name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
              secondaryLine={userDetail?.user?.email ?? undefined}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="CONTACT">
                <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
                <InfoRow label="Status" value={userDetail?.status ?? undefined} />
              </InspectorGroup>
              <InspectorGroup label="MATTER">
                <InfoRow label="Linked" value={matterDetail?.title ?? undefined} muted={!matterDetail} />
                <InfoRow label="Status" value={matterDetail?.status ?? undefined} muted={!matterDetail?.status} />
              </InspectorGroup>
              <InspectorGroup label="ASSIGNMENT">
                <InspectorEditableRow
                  label="Assignee"
                  summary={assignedMemberLabel ?? 'Unassigned'}
                  summaryMuted={!assignedMemberLabel}
                  isOpen={activeConversationEditor === 'assignment'}
                  onToggle={onConversationAssignedToChange
                    ? () => setActiveConversationEditor((prev) => prev === 'assignment' ? null : 'assignment')
                    : undefined}
                  disabled={isSavingAssignment}
                >
                  <div className="relative z-30">
                    <Combobox
                      value={conversation?.assigned_to ?? ''}
                      onChange={(value) => { void handleConversationAssignmentChange(value); }}
                      options={assignedToOptions}
                      searchable
                      placeholder="Assign owner"
                      disabled={isSavingAssignment}
                    />
                  </div>
                </InspectorEditableRow>
              </InspectorGroup>
              <InspectorGroup label="TRIAGE">
                <InspectorEditableRow
                  label="Priority"
                  summary={currentPriorityLabel}
                  isOpen={activeConversationEditor === 'priority'}
                  onToggle={onConversationPriorityChange
                    ? () => setActiveConversationEditor((prev) => prev === 'priority' ? null : 'priority')
                    : undefined}
                  disabled={isSavingPriority}
                >
                  <div className="relative z-20">
                    <Combobox
                      value={conversation?.priority ?? 'normal'}
                      onChange={(value) => { void handleConversationPriorityChange(value); }}
                      options={priorityOptions}
                      searchable={false}
                      disabled={isSavingPriority}
                    />
                  </div>
                </InspectorEditableRow>
                <InspectorEditableRow
                  label="Tags"
                  summary={currentTagsLabel}
                  summaryMuted={currentTags.length === 0}
                  isOpen={activeConversationEditor === 'tags'}
                  onToggle={onConversationTagsChange
                    ? () => setActiveConversationEditor((prev) => prev === 'tags' ? null : 'tags')
                    : undefined}
                  disabled={isSavingTags}
                >
                  <div className="relative z-10">
                    <Combobox
                      multiple
                      value={currentTags}
                      onChange={(values) => { void handleConversationTagsChange(values); }}
                      options={tagOptions}
                      allowCustomValues
                      placeholder="Add tags"
                      disabled={isSavingTags}
                    />
                  </div>
                </InspectorEditableRow>
                <InspectorEditableRow
                  label="Internal notes"
                  summary={currentNotesLabel}
                  summaryMuted={!conversation?.internal_notes?.trim()}
                  isOpen={activeConversationEditor === 'notes'}
                  onToggle={onConversationInternalNotesChange
                    ? () => setActiveConversationEditor((prev) => prev === 'notes' ? null : 'notes')
                    : undefined}
                  disabled={isSavingNotes}
                >
                  <Textarea
                    key={`${conversation?.id ?? 'conversation'}-internal-notes`}
                    value={notesDraft}
                    onChange={setNotesDraft}
                    rows={3}
                    placeholder="Notes visible to practice staff only"
                    onBlur={() => { void handleConversationNotesBlur(notesDraft); }}
                    disabled={isSavingNotes}
                  />
                </InspectorEditableRow>
              </InspectorGroup>
              <InspectorGroup label="METADATA">
                <InfoRow label="Created" value={formatDate(conversation?.created_at)} />
                <InfoRow label="Last active" value={formatDate(conversation?.last_message_at ?? conversation?.updated_at)} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'matter' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderEntity
              chip="MATTER"
              title={matterDetail?.title ?? 'Matter'}
              subtitle={matterClientName ?? undefined}
              statusBadge={(
                matterStatus ? (
                  <MatterStatusPopover
                    currentStatus={matterStatus}
                    onSelect={handleMatterStatusSelect}
                    disabled={!canEditMatterStatus}
                  />
                ) : (
                  <span className="text-[11px] text-input-placeholder">—</span>
                )
              )}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="PEOPLE">
                <InfoRow label="Client" value={matterClientName ?? undefined} muted={!matterClientName} />
                <InfoRow
                  label="Assignees"
                  value={matterAssigneeNames && matterAssigneeNames.length > 0 ? matterAssigneeNames.join(', ') : undefined}
                  muted={!matterAssigneeNames?.length}
                />
              </InspectorGroup>
              <InspectorGroup label="BILLING">
                <InfoRow label="Type" value={matterBillingLabel ?? undefined} muted={!matterBillingLabel} />
              </InspectorGroup>
              <InspectorGroup label="DATES">
                <InfoRow label="Created" value={matterCreatedLabel ?? undefined} />
                <InfoRow label="Updated" value={matterUpdatedLabel ?? undefined} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'client' && !isLoading ? (
          <div className="pb-4">
            <InspectorHeaderPerson
              name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
              secondaryLine={userDetail?.user?.email ?? undefined}
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="CONTACT">
                <InfoRow label="Email" value={userDetail?.user?.email ?? undefined} muted={!userDetail?.user?.email} />
                <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
              </InspectorGroup>
              <InspectorGroup label="DETAILS">
                <InfoRow label="Status" value={userDetail?.status ?? undefined} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}

        {entityType === 'invoice' ? (
          <div className="pb-4">
            <InspectorHeaderEntity
              chip="INVOICE"
              title={invoiceMatterTitle ?? 'Invoice'}
              subtitle={invoiceClientName ?? undefined}
              statusBadge={
                isValidInvoiceStatus(invoiceStatus)
                  ? <InvoiceStatusBadge status={invoiceStatus} />
                  : <span className="text-[11px] text-input-placeholder">—</span>
              }
            />
            <div className="border-t border-white/[0.06]">
              <InspectorGroup label="DETAILS">
                <InfoRow label="Client" value={invoiceClientName ?? undefined} muted={!invoiceClientName} />
                <InfoRow label="Matter" value={invoiceMatterTitle ?? undefined} muted={!invoiceMatterTitle} />
                <InfoRow label="Due" value={invoiceDueDate ?? undefined} muted={!invoiceDueDate} />
              </InspectorGroup>
              <InspectorGroup label="BILLING">
                <InfoRow label="Total" value={invoiceTotal ?? undefined} muted={!invoiceTotal} />
                <InfoRow label="Amount due" value={invoiceAmountDue ?? undefined} muted={!invoiceAmountDue} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
