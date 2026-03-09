import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation } from '@/shared/types/conversation';
import { getUserDetail, updateConversationMatter, updateUserDetail, getPracticeDetails, type UserDetailRecord, type PracticeDetails } from '@/shared/lib/apiClient';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';
import { MatterStatusPopover } from '@/features/matters/components/MatterStatusPopover';
import { isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption } from '@/shared/ui/input';
import { invalidateClientsForPractice } from '@/shared/stores/clientsStore';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import Modal from '@/shared/components/Modal';
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
import { PERSON_RELATIONSHIP_STATUS_LABELS } from '@/shared/domain/people';
import type { Address } from '@/shared/types/address';

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
  const [isSavingMatter, setIsSavingMatter] = useState(false);
  const [activeConversationEditor, setActiveConversationEditor] = useState<'assignment' | 'priority' | 'tags' | 'matter' | null>(null);
  const [activePersonEditor, setActivePersonEditor] = useState<'address' | null>(null);
  const [isSavingPersonField, setIsSavingPersonField] = useState(false);
  const [isArchivingPerson, setIsArchivingPerson] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [personAddressDraft, setPersonAddressDraft] = useState<Address>({
    address: '',
    apartment: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });
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

  const currentUserId = session?.transformError ? undefined : session?.user?.id;

  const currentAssignedLabel = assignedMemberLabel ?? (
    <span className="flex items-center gap-1">
      No one —{' '}
      {currentUserId ? (
        <button 
          type="button" 
          className="text-accent-500 transition-colors hover:text-accent-600 hover:underline focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            void handleConversationAssignmentChange(currentUserId);
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
    setActivePersonEditor(null);
  }, [conversation?.id, entityId, entityType]);

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
  const readAddressFromDetail = (detail: UserDetailRecord | null): Address => {
    const record = detail as unknown as Record<string, unknown> | null;
    const addressValue = record?.address;
    const address = (addressValue && typeof addressValue === 'object')
      ? addressValue as Record<string, unknown>
      : {};
    const line1 = typeof address.address === 'string'
      ? address.address
      : (typeof address.line1 === 'string' ? address.line1 : '');
    const line2 = typeof address.apartment === 'string'
      ? address.apartment
      : (typeof address.line2 === 'string' ? address.line2 : '');
    const city = typeof address.city === 'string' ? address.city : '';
    const state = typeof address.state === 'string' ? address.state : '';
    const postalCode = typeof address.postalCode === 'string'
      ? address.postalCode
      : (typeof address.postal_code === 'string' ? address.postal_code : '');
    const country = typeof address.country === 'string' && address.country.trim().length > 0
      ? address.country
      : 'US';
    return {
      address: line1,
      apartment: line2,
      city,
      state,
      postalCode,
      country,
    };
  };
  const formatAddressSummary = (detail: UserDetailRecord | null): string => {
    const value = readAddressFromDetail(detail);
    const parts = [
      value.address,
      value.apartment ?? '',
      [value.city, value.state, value.postalCode].filter(Boolean).join(' '),
      value.country
    ].map((part) => part.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  };
  const openPersonEditor = (editor: 'address') => {
    setError(null);
    setPersonAddressDraft(readAddressFromDetail(userDetail));
    setActivePersonEditor((prev) => (prev === editor ? null : editor));
  };
  const handlePersonFieldUpdate = async (
    payload: Partial<{ address: Partial<Address> }>
  ) => {
    if (!practiceId || !entityId) return;
    setError(null);
    setIsSavingPersonField(true);
    try {
      await updateUserDetail(practiceId, entityId, payload);
      setUserDetail((prev) => {
        if (!prev) return prev;
        const previousUser = prev.user;
        return {
          ...prev,
          ...(payload.address ? { address: payload.address } as Record<string, unknown> : {}),
          user: previousUser
        };
      });
      const cacheKey = makeCacheKey(practiceId, entityId);
      const cached = userCacheRef.current.get(cacheKey);
      if (cached) {
        userCacheRef.current.set(cacheKey, {
          ...cached,
          ...(payload.address ? { address: payload.address } as Record<string, unknown> : {}),
          user: cached.user
        });
      }
      setActivePersonEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update person');
    } finally {
      setIsSavingPersonField(false);
    }
  };
  const handlePersonStatusChange = async (
    status: 'archived' | 'active',
    eventName: 'Archive Person' | 'Restore Person'
  ) => {
    if (!practiceId || !entityId) return;
    setError(null);
    setIsArchivingPerson(true);
    try {
      await updateUserDetail(practiceId, entityId, { status, event_name: eventName });
      setUserDetail((prev) => {
        if (!prev) return prev;
        return { ...prev, status };
      });
      const cacheKey = makeCacheKey(practiceId, entityId);
      const cached = userCacheRef.current.get(cacheKey);
      if (cached) {
        userCacheRef.current.set(cacheKey, {
          ...cached,
          status
        });
      }
      setActivePersonEditor(null);
      setIsArchiveConfirmOpen(false);
      invalidateClientsForPractice(practiceId);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update person status');
    } finally {
      setIsArchivingPerson(false);
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
                : 'Person Info'}
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
                  <InspectorGroup label="Person Details">
                    <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
                    <InfoRow
                      label="Relationship status"
                      value={userDetail?.status ? PERSON_RELATIONSHIP_STATUS_LABELS[userDetail.status] : undefined}
                    />
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
                <InfoRow label="Person" value={matterClientName ?? undefined} muted={!matterClientName} />
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
              <InspectorGroup label="Email">
                <InfoRow label="" value={userDetail?.user?.email ?? undefined} muted={!userDetail?.user?.email} />
              </InspectorGroup>
              <InspectorGroup label="Phone">
                <InfoRow label="" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
              </InspectorGroup>
              <InspectorGroup label="Relationship status">
                <InfoRow
                  label=""
                  value={userDetail?.status ? PERSON_RELATIONSHIP_STATUS_LABELS[userDetail.status] : undefined}
                  muted={!userDetail?.status}
                />
              </InspectorGroup>
              <InspectorGroup
                label="Address"
                onToggle={() => openPersonEditor('address')}
                isOpen={activePersonEditor === 'address'}
                disabled={isSavingPersonField}
              >
                <InspectorEditableRow
                  label=""
                  summary={formatAddressSummary(userDetail)}
                  summaryMuted={formatAddressSummary(userDetail) === '—'}
                  isOpen={activePersonEditor === 'address'}
                >
                  <div className="space-y-2">
                    <AddressExperienceForm
                      initialValues={{ address: personAddressDraft }}
                      fields={['address']}
                      required={[]}
                      variant="plain"
                      showSubmitButton={false}
                      disabled={isSavingPersonField}
                      onValuesChange={(updates) => {
                        const nextAddress = updates.address;
                        if (!nextAddress || typeof nextAddress !== 'object') return;
                        setPersonAddressDraft((prev) => ({
                          ...prev,
                          ...nextAddress,
                        }));
                      }}
                      addressOptions={{
                        enableAutocomplete: true,
                        showCountry: true,
                        stackedFields: true,
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActivePersonEditor(null)}
                        disabled={isSavingPersonField}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handlePersonFieldUpdate({ address: personAddressDraft })}
                        disabled={isSavingPersonField}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </InspectorEditableRow>
              </InspectorGroup>
              <InspectorGroup label="Record">
                <div className="px-5 py-1.5">
                  {userDetail?.status === 'archived' ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] text-input-placeholder">This person is archived.</p>
                      <Button
                        size="sm"
                        onClick={() => { void handlePersonStatusChange('active', 'Restore Person'); }}
                        disabled={isArchivingPerson || isSavingPersonField}
                      >
                        {isArchivingPerson ? 'Restoring...' : 'Restore'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setIsArchiveConfirmOpen(true)}
                      disabled={isArchivingPerson || isSavingPersonField}
                    >
                      {isArchivingPerson ? 'Archiving...' : 'Archive'}
                    </Button>
                  )}
                </div>
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
                <InfoRow label="Person" value={invoiceClientName ?? undefined} muted={!invoiceClientName} />
                <InfoRow label="Matter" value={invoiceMatterTitle ?? undefined} muted={!invoiceMatterTitle} />
                <InfoRow label="Due Date" value={invoiceDueDate ?? undefined} muted={!invoiceDueDate} />
                <InfoRow label="Total Amount" value={invoiceTotal ?? undefined} muted={!invoiceTotal} />
                <InfoRow label="Amount Due" value={invoiceAmountDue ?? undefined} muted={!invoiceAmountDue} />
              </InspectorGroup>
            </div>
          </div>
        ) : null}
      </div>
      <Modal
        isOpen={isArchiveConfirmOpen}
        onClose={() => {
          if (isArchivingPerson) return;
          setIsArchiveConfirmOpen(false);
        }}
        title="Archive person"
        type="modal"
      >
        <div className="space-y-4">
          <p className="text-sm text-input-placeholder">
            Archive this person? They will move to the Archived list and can be restored later.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsArchiveConfirmOpen(false)}
              disabled={isArchivingPerson}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { void handlePersonStatusChange('archived', 'Archive Person'); }}
              disabled={isArchivingPerson}
            >
              {isArchivingPerson ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default InspectorPanel;
