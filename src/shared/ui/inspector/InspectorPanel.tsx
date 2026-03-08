import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import { getUserDetail, updateConversationMatter, getPracticeDetails, type UserDetailRecord, type PracticeDetails } from '@/shared/lib/apiClient';
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
import { useSessionContext } from '@/shared/contexts/SessionContext';

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
  onConversationMatterChange?: (matterId: string | null) => Promise<void> | void;
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
  matters?: BackendMatter[];
  isClientView?: boolean;
  practiceName?: string;
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
  onConversationMatterChange,
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
  matters = [],
  isClientView,
  practiceName,
}: InspectorPanelProps) => {
  const { session } = useSessionContext();
  const userCacheRef = useRef<Map<string, UserDetailRecord | null>>(new Map());
  const practiceCacheRef = useRef<Map<string, PracticeDetails | null>>(new Map());
  const matterCacheRef = useRef<Map<string, BackendMatter | null>>(new Map());
  const [userDetail, setUserDetail] = useState<UserDetailRecord | null>(null);
  const [practiceDetail, setPracticeDetail] = useState<PracticeDetails | null>(null);
  const [matterDetail, setMatterDetail] = useState<BackendMatter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSavingMatter, setIsSavingMatter] = useState(false);
  const [notesDraft, setNotesDraft] = useState(conversation?.internal_notes ?? '');
  const [activeConversationEditor, setActiveConversationEditor] = useState<'assignment' | 'priority' | 'tags' | 'notes' | 'matter' | null>(null);
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
  const matterOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Unlinked' },
      ...matters.map((m) => ({ value: m.id, label: m.title ?? 'Untitled Matter' })),
    ],
    [matters]
  );
  const assignedMemberLabel = useMemo(() => {
    const assignedTo = conversation?.assigned_to;
    if (!assignedTo) return null;
    const member = conversationMembers.find((entry) => entry.userId === assignedTo);
    return member?.name ?? assignedTo;
  }, [conversation?.assigned_to, conversationMembers]);

  const currentAssignedLabel = assignedMemberLabel ?? (
    <span className="flex items-center gap-1">
      No one —{' '}
      {session?.user?.id ? (
        <button 
          type="button" 
          className="text-accent-500 transition-colors hover:text-accent-600 hover:underline focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            void handleConversationAssignmentChange(session.user.id);
          }}
        >
          Assign yourself
        </button>
      ) : (
        'Assign yourself'
      )}
    </span>
  );
  const currentMatterLabel = matterDetail?.title ?? 'Not linked';
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
      practiceCacheRef.current.clear();
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
    setPracticeDetail(null);
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
            if (isClientView) {
              if (practiceCacheRef.current.has(practiceId)) {
                setPracticeDetail(practiceCacheRef.current.get(practiceId) ?? null);
              } else {
                const detail = await getPracticeDetails(practiceId, { signal: controller.signal });
                practiceCacheRef.current.set(practiceId, detail);
                setPracticeDetail(detail);
              }
            } else {
              const cacheKey = makeCacheKey(practiceId, userId);
              if (userCacheRef.current.has(cacheKey)) {
                setUserDetail(userCacheRef.current.get(cacheKey) ?? null);
              } else {
                const detail = await getUserDetail(practiceId, userId, { signal: controller.signal });
                userCacheRef.current.set(cacheKey, detail);
                setUserDetail(detail);
              }
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
  }, [conversationMatterId, conversationUserId, entityId, entityType, practiceId, isClientView]);

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
  const handleConversationMatterChange = async (value: string) => {
    if (!practiceId || !conversation?.id) return;
    setError(null);
    setIsSavingMatter(true);
    try {
      const nextId = value.trim().length > 0 ? value.trim() : null;
      if (onConversationMatterChange) {
        await onConversationMatterChange(nextId);
      } else {
        await updateConversationMatter(conversation.id, nextId);
      }
      setActiveConversationEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update linked matter');
    } finally {
      setIsSavingMatter(false);
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
            {isClientView ? (
              <>
                <InspectorHeaderPerson
                  name={practiceName ?? 'Practice'}
                  secondaryLine={practiceDetail?.businessEmail ?? undefined}
                />
                <div className="">
                  <InspectorGroup label="Practice Details">
                    <InfoRow label="Phone" value={practiceDetail?.businessPhone ?? undefined} muted={!practiceDetail?.businessPhone} />
                    <InfoRow label="Email" value={practiceDetail?.businessEmail ?? undefined} muted={!practiceDetail?.businessEmail} />
                    <InfoRow label="Website" value={practiceDetail?.website ?? undefined} muted={!practiceDetail?.website} />
                  </InspectorGroup>
                </div>
              </>
            ) : (
              <>
                <InspectorHeaderPerson
                  name={userDetail?.user?.name ?? userDetail?.user?.email ?? 'Unknown'}
                  secondaryLine={userDetail?.user?.email ?? undefined}
                />
                <div className="">
                  <InspectorGroup label="Client Details">
                    <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
                    <InfoRow label="Status" value={userDetail?.status ?? undefined} />
                  </InspectorGroup>
                </div>
              </>
            )}

            {!isClientView && (
              <div className="">
                <InspectorGroup
                  label="Linked Matter"
                  onToggle={() => setActiveConversationEditor((prev) => (prev === 'matter' ? null : 'matter'))}
                  isOpen={activeConversationEditor === 'matter'}
                  disabled={isSavingMatter}
                >
                <InspectorEditableRow
                  label=""
                  summary={currentMatterLabel}
                  summaryMuted={!matterDetail}
                  isOpen={activeConversationEditor === 'matter'}
                >
                  <div className="relative z-40">
                    <Combobox
                      value={conversation?.matter_id ?? ''}
                      onChange={(value) => { void handleConversationMatterChange(value); }}
                      options={matterOptions}
                      searchable
                      autoFocus
                      defaultOpen
                      hideTrigger
                      placeholder="Search matters"
                      disabled={isSavingMatter}
                    />
                  </div>
                </InspectorEditableRow>
              </InspectorGroup>
              <InspectorGroup
                label="Assignee"
                onToggle={onConversationAssignedToChange
                  ? () => setActiveConversationEditor((prev) => prev === 'assignment' ? null : 'assignment')
                  : undefined}
                isOpen={activeConversationEditor === 'assignment'}
                disabled={isSavingAssignment}
              >
                <InspectorEditableRow
                  label=""
                  summary={currentAssignedLabel}
                  summaryMuted={!assignedMemberLabel}
                  isOpen={activeConversationEditor === 'assignment'}
                >
                  <div className="relative z-30">
                    <Combobox
                      value={conversation?.assigned_to ?? ''}
                      onChange={(value) => { void handleConversationAssignmentChange(value); }}
                      options={assignedToOptions}
                      searchable
                      autoFocus
                      defaultOpen
                      hideTrigger
                      placeholder="Assign owner"
                      disabled={isSavingAssignment}
                    />
                  </div>
                </InspectorEditableRow>
              </InspectorGroup>
              <InspectorGroup
                label="Priority"
                onToggle={onConversationPriorityChange
                  ? () => setActiveConversationEditor((prev) => prev === 'priority' ? null : 'priority')
                  : undefined}
                isOpen={activeConversationEditor === 'priority'}
                disabled={isSavingPriority}
              >
                <InspectorEditableRow
                  label=""
                  summary={currentPriorityLabel}
                  isOpen={activeConversationEditor === 'priority'}
                >
                  <div className="relative z-20">
                    <Combobox
                      value={conversation?.priority ?? 'normal'}
                      onChange={(value) => { void handleConversationPriorityChange(value); }}
                      options={priorityOptions}
                      searchable={false}
                      autoFocus
                      defaultOpen
                      hideTrigger
                      disabled={isSavingPriority}
                    />
                  </div>
                </InspectorEditableRow>
              </InspectorGroup>

              <InspectorGroup
                label="Tags"
                onToggle={onConversationTagsChange
                  ? () => setActiveConversationEditor((prev) => prev === 'tags' ? null : 'tags')
                  : undefined}
                isOpen={activeConversationEditor === 'tags'}
                disabled={isSavingTags}
              >
                <InspectorEditableRow
                  label=""
                  summary={currentTagsLabel}
                  summaryMuted={currentTags.length === 0}
                  isOpen={activeConversationEditor === 'tags'}
                >
                  <div className="relative z-10">
                    <Combobox
                      multiple
                      value={currentTags}
                      onChange={(values) => { void handleConversationTagsChange(values); }}
                      options={tagOptions}
                      allowCustomValues
                      autoFocus
                      defaultOpen
                      hideTrigger
                      placeholder="Add tags"
                      disabled={isSavingTags}
                    />
                    </div>
                  </InspectorEditableRow>
                </InspectorGroup>

                <InspectorGroup
                  label="Internal Notes"
                  onToggle={() => setActiveConversationEditor((prev) => prev === 'notes' ? null : 'notes')}
                  isOpen={activeConversationEditor === 'notes'}
                  disabled={isSavingNotes}
                >
                  <InspectorEditableRow
                    label=""
                    summary={currentNotesLabel}
                    summaryMuted={!notesDraft}
                    isOpen={activeConversationEditor === 'notes'}
                  >
                    <Textarea
                      className="w-full relative z-10"
                      value={notesDraft}
                      onChange={(value) => onConversationInternalNotesChange?.(value)}
                      onBlur={() => { void handleConversationNotesBlur(); }}
                      placeholder="Add internal notes..."
                      disabled={isSavingNotes}
                      autoFocus
                    />
                  </InspectorEditableRow>
                </InspectorGroup>
              </div>
            )}
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
            <div className="">
              <InspectorGroup label="Matter Details">
                <InfoRow label="Client" value={matterClientName ?? undefined} muted={!matterClientName} />
                <InfoRow
                  label="Assignees"
                  value={matterAssigneeNames && matterAssigneeNames.length > 0 ? matterAssigneeNames.join(', ') : undefined}
                  muted={!matterAssigneeNames?.length}
                />
                <InfoRow label="Billing Type" value={matterBillingLabel ?? undefined} muted={!matterBillingLabel} />
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
            <div className="">
              <InspectorGroup label="Contact Information">
                <InfoRow label="Email" value={userDetail?.user?.email ?? undefined} muted={!userDetail?.user?.email} />
                <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
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
            <div className="">
              <InspectorGroup label="Invoice Details">
                <InfoRow label="Client" value={invoiceClientName ?? undefined} muted={!invoiceClientName} />
                <InfoRow label="Matter" value={invoiceMatterTitle ?? undefined} muted={!invoiceMatterTitle} />
                <InfoRow label="Due Date" value={invoiceDueDate ?? undefined} muted={!invoiceDueDate} />
                <InfoRow label="Total Amount" value={invoiceTotal ?? undefined} muted={!invoiceTotal} />
                <InfoRow label="Amount Due" value={invoiceAmountDue ?? undefined} muted={!invoiceAmountDue} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
