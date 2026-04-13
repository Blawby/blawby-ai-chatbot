import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation, ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { getUserDetail, updateConversationMatter, updateUserDetail, getPracticeDetails, type UserDetailRecord, type PracticeDetails } from '@/shared/lib/apiClient';
import { getMatter, type BackendMatter } from '@/features/matters/services/mattersApi';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceStatus } from '@/features/invoices/types';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption, Input, Textarea } from '@/shared/ui/input';
import { StackedAvatars, UserCard } from '@/shared/ui/profile';
import { invalidateClientsForPractice } from '@/shared/stores/clientsStore';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { Dialog } from '@/shared/ui/dialog';
import { InspectorSectionSkeleton } from '@/shared/ui/layout/skeleton-presets/InspectorSectionSkeleton';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
  InspectorHeaderEntity,
  InspectorHeaderPerson,
  InspectorHeaderHero,
} from './InspectorPrimitives';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { PERSON_RELATIONSHIP_STATUS_LABELS } from '@/shared/domain/people';
import type { Address } from '@/shared/types/address';
import type { IntakeConversationState, DerivedIntakeStatus } from '@/shared/types/intake';
import { resolveStrengthTier, resolveStrengthLabel, resolveStrengthStyle, resolveStrengthDescription } from '@/shared/utils/intakeStrength';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import { SetupInspectorContent } from './SetupInspectorContent';

type InspectorConfig =
  | { type: 'conversation' }
  | { type: 'matter' }
  | { type: 'client' }
  | { type: 'invoice' };

type InspectorEntityType = InspectorConfig['type'];

type InspectorIdentity = {
  userId: string;
  name: string;
  email?: string;
  image?: string | null;
  role: string;
};

type InspectorPanelProps = {
  entityType: InspectorEntityType;
  entityId: string;
  practiceId: string;
  onClose: () => void;
  conversation?: Conversation | null;
  conversationMembers?: InspectorIdentity[];
  onConversationAssignedToChange?: (assignedTo: string | null) => Promise<void> | void;
  onConversationPriorityChange?: (priority: 'low' | 'normal' | 'high' | 'urgent') => Promise<void> | void;
  onConversationTagsChange?: (tags: string[]) => Promise<void> | void;
  onConversationMatterChange?: (matterId: string | null) => Promise<void> | void;
  matterClientName?: string | null;
  matterAssigneeNames?: string[];
  matterBillingLabel?: string | null;
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
  onMatterStatusChange?: (status: MatterStatus) => void;
  onMatterPatchChange?: (patch: Record<string, unknown>) => Promise<void> | void;
  matterClientOptions?: ComboboxOption[];
  matterClients?: InspectorIdentity[];
  matterAssigneeOptions?: ComboboxOption[];
  invoiceClientName?: string | null;
  invoiceMatterTitle?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: string | null;
  invoiceAmountDue?: string | null;
  invoiceDueDate?: string | null;
  matters?: BackendMatter[];
  isClientView?: boolean;
  practiceName?: string;
  practiceLogo?: string;
  intakeConversationState?: IntakeConversationState | null;
  intakeStatus?: DerivedIntakeStatus | null;
  onIntakeFieldsChange?: (patch: Partial<IntakeConversationState>, options?: import('@/shared/types/intake').IntakeFieldChangeOptions) => Promise<void> | void;
  practiceDetails?: PracticeDetails | null;
  intakeSlimContactDraft?: import('@/shared/types/intake').SlimContactDraft | null;
  conversationMode?: ConversationMode;
  setupFields?: SetupFieldsPayload;
  onSetupFieldsChange?: (patch: Partial<SetupFieldsPayload>, options?: { sendSystemAck?: boolean }) => Promise<void> | void;
  setupStatus?: PracticeSetupStatus;
  onStartStripeOnboarding?: () => void;
  isStripeSubmitting?: boolean;
  practiceSlug?: string | null;
  businessOnboardingStatus?: BusinessOnboardingStatus | null;
  showCloseButton?: boolean;
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
  onMatterStatusChange,
  onMatterPatchChange,
  matterClientOptions = [],
  matterClients = [],
  matterAssigneeOptions = [],
  invoiceClientName,
  invoiceMatterTitle,
  invoiceStatus,
  invoiceTotal,
  invoiceAmountDue,
  invoiceDueDate,
  matters = [],
  isClientView,
  practiceName,
  practiceLogo,
  intakeConversationState,
  intakeStatus,
  onIntakeFieldsChange,
  practiceDetails: propPracticeDetails,
  intakeSlimContactDraft,
  conversationMode,
  setupFields,
  onSetupFieldsChange,
  setupStatus,
  onStartStripeOnboarding,
  isStripeSubmitting = false,
  practiceSlug,
  businessOnboardingStatus,
  showCloseButton = true,
}: InspectorPanelProps) => {
  const resolveString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  const { session } = useSessionContext();
  const userCacheRef = useRef<Map<string, UserDetailRecord | null>>(new Map());
  const practiceCacheRef = useRef<Map<string, PracticeDetails | null>>(new Map());
  const matterCacheRef = useRef<Map<string, BackendMatter | null>>(new Map());
  const [userDetail, setUserDetail] = useState<UserDetailRecord | null>(null);
  const [practiceDetail, setPracticeDetail] = useState<PracticeDetails | null>(propPracticeDetails ?? null);
  const [matterDetail, setMatterDetail] = useState<BackendMatter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [isSavingPriority, setIsSavingPriority] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSavingMatter, setIsSavingMatter] = useState(false);
  const [activeConversationEditor, setActiveConversationEditor] = useState<'assignment' | 'priority' | 'tags' | 'matter' | 'intakePracticeArea' | 'intakeCity' | 'intakeState' | 'intakeOpposingParty' | 'intakeDesiredOutcome' | 'intakeDescription' | 'intakeName' | 'intakeEmail' | 'intakePhone' | null>(null);
  const [activeMatterEditor, setActiveMatterEditor] = useState<
    'status' | 'person' | 'responsible' | 'originating' | 'urgency' | 'caseNumber' | 'matterType' | 'court' | 'judge' | 'opposingParty' | 'opposingCounsel' | 'team' | null
  >(null);
  const [isSavingMatterStatus, setIsSavingMatterStatus] = useState(false);
  const [isSavingMatterField, setIsSavingMatterField] = useState(false);
  const [activePersonEditor, setActivePersonEditor] = useState<'address' | null>(null);
  const [isSavingPersonField, setIsSavingPersonField] = useState(false);
  const [isArchivingPerson, setIsArchivingPerson] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [localIntakeDraft, setLocalIntakeDraft] = useState<string | null>(null);
  const [personAddressDraft, setPersonAddressDraft] = useState<Address>({
    address: '',
    apartment: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });
  const skipBlurRef = useRef(false);
  const lastPracticeIdRef = useRef<string | null>(practiceId);

  const conversationUserId = conversation?.user_id ?? null;
  const conversationMatterId = conversation?.matter_id ?? null;
  const resolvedConversationMode = conversationMode ?? conversation?.user_info?.mode;

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
  const matterStatusOptions = useMemo<ComboboxOption[]>(
    () => MATTER_WORKFLOW_STATUSES.map((status) => ({
      value: status,
      label: MATTER_STATUS_LABELS[status],
    })),
    []
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
  const intakeServiceOptions = useMemo<ComboboxOption[]>(() => {
    if (!practiceDetail?.services) return [];
    
    const rawOptions = (practiceDetail.services as Array<{ id?: string; name?: string; title?: string }>).map((s, idx) => ({
      value: s.id || '',
      label: s.name || s.title || `Service ${idx + 1}`,
    }));

    // Deduplicate by value
    const seenValues = new Set<string>();
    return rawOptions.filter(opt => {
      if (opt.value && !seenValues.has(opt.value)) {
        seenValues.add(opt.value);
        return true;
      }
      return false;
    });
  }, [practiceDetail?.services]);
  const assignedMemberLabel = useMemo(() => {
    const assignedTo = conversation?.assigned_to;
    if (!assignedTo) return null;
    const member = conversationMembers.find((entry) => entry.userId === assignedTo);
    return member?.name ?? assignedTo;
  }, [conversation?.assigned_to, conversationMembers]);
  const assignedConversationMember = useMemo(() => {
    const assignedTo = conversation?.assigned_to;
    if (!assignedTo) return null;
    return conversationMembers.find((entry) => entry.userId === assignedTo) ?? null;
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
    setActiveMatterEditor(null);
    setActivePersonEditor(null);
    setLocalIntakeDraft(null);
  }, [conversation?.id, entityId, entityType]);

  useEffect(() => {
    setLocalIntakeDraft(null);
  }, [activeConversationEditor]);

  useEffect(() => {
    setUserDetail(null);
    setPracticeDetail(propPracticeDetails ?? null);
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

          // Handle practice details independently from user details
          if (propPracticeDetails) {
            setPracticeDetail(propPracticeDetails);
          } else if (!isClientView) {
            // Only attempt to load practice details in non-client view
            try {
              const practiceDetail = await getPracticeDetails(practiceId, { signal: controller.signal });
              setPracticeDetail(practiceDetail);
            } catch (err: unknown) {
              const error = err as Error;
              // Only clear state for real errors, not aborted requests
              if (!controller.signal.aborted && error?.name !== 'AbortError') {
                setPracticeDetail(null);
              }
            }
          } else {
            // Client view - set null if no prop details provided
            setPracticeDetail(null);
          }

          // Handle user details separately, regardless of practice details
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
  }, [conversationMatterId, conversationUserId, entityId, entityType, practiceId, isClientView, propPracticeDetails]);

  const [inspectorMatterStatus, setInspectorMatterStatus] = useState<MatterStatus | null>(
    isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null
  );
  useEffect(() => {
    setInspectorMatterStatus(isValidMatterStatus(matterDetail?.status) ? matterDetail.status : null);
  }, [entityId, entityType, matterDetail?.status]);
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
  const _resolvedMatterBillingLabel = matterBillingLabel
    ?? resolveString(matterDetailRecord?.billing_type)
    ?? null;
  const resolvedMatterCreatedLabel = matterCreatedLabel
    ?? resolveString(matterDetailRecord?.created_at)
    ?? null;
  const resolvedMatterUpdatedLabel = matterUpdatedLabel
    ?? resolveString(matterDetailRecord?.updated_at)
    ?? null;
  const resolvedMatterAssigneeIds = useMemo(() => {
    // Prefer assignee_ids if present and non-empty
    if (Array.isArray(matterDetailRecord?.assignee_ids) && matterDetailRecord.assignee_ids.length > 0) {
      return matterDetailRecord.assignee_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    // Fallback: extract ids from assignees array if available
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
  const conversationPeople = useMemo(() => {
    const people = new Map<string, { id: string; name: string; image?: string | null }>();
    const clientId = resolveString(userDetail?.user_id) ?? resolveString(userDetail?.id);
    const clientName = resolveString(userDetail?.user?.name) ?? resolveString(userDetail?.user?.email) ?? 'Unknown';
    if (clientId) {
      people.set(clientId, {
        id: clientId,
        name: clientName,
        image: null,
      });
    }
    if (assignedConversationMember) {
      people.set(assignedConversationMember.userId, {
        id: assignedConversationMember.userId,
        name: assignedConversationMember.name,
        image: assignedConversationMember.image ?? null,
      });
    } else if (conversation?.assigned_to) {
      // Fallback when member lookup fails but assigned_to exists
      people.set(conversation.assigned_to, {
        id: conversation.assigned_to,
        name: assignedMemberLabel ?? `User ${conversation.assigned_to.slice(0, 6)}`,
        image: null,
      });
    }
    return [...people.values()];
  }, [assignedConversationMember, userDetail, conversation, assignedMemberLabel]);
  const resolveAttorneyLabel = useCallback((id: string | null) => {
    if (!id) return 'Not set';
    const option = matterAssigneeOptions.find((entry) => entry.value === id);
    return option?.label ?? `User ${id.slice(0, 6)}`;
  }, [matterAssigneeOptions]);
  const resolveAttorneyIdentity = useCallback((id: string | null) => {
    if (!id) return null;
    const member = conversationMembers.find((entry) => entry.userId === id);
    if (member) return member;
    const option = matterAssigneeOptions.find((entry) => entry.value === id);
    if (option?.label) {
      return {
        userId: id,
        name: option.label,
        email: option.meta,
        image: null,
        role: 'member',
      };
    }
    return {
      userId: id,
      name: `User ${id.slice(0, 6)}`,
      image: null,
      role: 'member',
    };
  }, [conversationMembers, matterAssigneeOptions]);
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

    // Always add fallback identities for non-empty names that aren't already present
    resolvedMatterAssigneeNames.forEach((name, index) => {
      if (!name.trim()) return;
      
      // Check if this name is already present in existing identities
      const nameAlreadyExists = [...identities.values()].some(identity => identity.name === name);
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
  const renderCompactIdentity = useCallback((identity: Pick<InspectorIdentity, 'name' | 'image'> | null) => {
    if (!identity) return null;
    return (
      <UserCard
        name={identity.name}
        image={identity.image ?? null}
        size="sm"
        className="px-0 py-0"
      />
    );
  }, []);
  const renderIdentityStack = useCallback((
    users: Array<{ id: string; name: string; image?: string | null }>,
    emptyLabel: string,
    singularLabel: string,
    pluralLabel: string,
  ) => {
    if (users.length === 0) {
      return <span className="text-input-placeholder">{emptyLabel}</span>;
    }

    return (
      <div className="flex items-center gap-3">
        <StackedAvatars users={users} size="sm" max={4} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-[14px] text-input-text">
            {users.map((user) => user.name).join(', ')}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-input-placeholder">
            {users.length} {users.length === 1 ? singularLabel : pluralLabel}
          </p>
        </div>
      </div>
    );
  }, []);
  const matterUrgencyLabel = useMemo(() => {
    if (!resolvedMatterUrgency) return 'Not set';
    return resolvedMatterUrgency.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }, [resolvedMatterUrgency]);
  const urgencyOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Not set' },
      { value: 'routine', label: 'Routine' },
      { value: 'time_sensitive', label: 'Time Sensitive' },
      { value: 'emergency', label: 'Emergency' },
    ],
    []
  );
  const handleMatterStatusChange = async (value: string) => {
    if (!canEditMatterStatus || !onMatterStatusChange || !isMatterStatus(value)) return;
    setError(null);
    setIsSavingMatterStatus(true);
    try {
      await Promise.resolve(onMatterStatusChange(value));
      setInspectorMatterStatus(value);
      setActiveMatterEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update matter status');
    } finally {
      setIsSavingMatterStatus(false);
    }
  };
  const handleMatterPatchChange = async (patch: Record<string, unknown>) => {
    if (!canEditMatterFields || !onMatterPatchChange) return;
    setError(null);
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
        Object.entries(patch).map(([key, value]) => [keyMap[key] ?? key, value])
      );
      await Promise.resolve(onMatterPatchChange(normalizedPatch));
      setActiveMatterEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update matter');
    } finally {
      setIsSavingMatterField(false);
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
  
  const handleIntakeFieldChange = async (patch: Partial<IntakeConversationState>, shouldClose = true) => {
    if (!onIntakeFieldsChange || !intakeConversationState) return;
    setError(null);
    try {
      await onIntakeFieldsChange(patch, { sendSystemAck: true });
      if (shouldClose) setActiveConversationEditor(null);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : `Failed to update fields`);
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
        {showCloseButton ? (
          <Button
            variant="icon"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close inspector"
            icon={XMarkIcon} iconClassName="h-4 w-4"
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && entityType === 'conversation' ? (
          <div className="py-3">
            <InspectorSectionSkeleton wideRows={[true, false, true, false]} />
          </div>
        ) : null}
        {isLoading && entityType === 'client' ? (
          <div className="py-3">
            <InspectorSectionSkeleton wideRows={[true, false, false]} />
          </div>
        ) : null}
        {isLoading && entityType === 'matter' ? (
          <div className="py-3">
            <InspectorSectionSkeleton wideRows={[true, false, true, false]} />
          </div>
        ) : null}
        {error ? <p className="px-4 py-3 text-sm text-red-400">{error}</p> : null}

        {entityType === 'conversation' && !isLoading ? (
          <div className="pb-4">
            {resolvedConversationMode === 'PRACTICE_ONBOARDING' ? (
              <SetupInspectorContent
                practiceName={practiceName}
                practiceSlug={practiceSlug}
                practiceDetails={practiceDetail}
                businessOnboardingStatus={businessOnboardingStatus}
                setupFields={setupFields}
                onSetupFieldsChange={onSetupFieldsChange}
                setupStatus={setupStatus}
                onStartStripeOnboarding={onStartStripeOnboarding}
                isStripeSubmitting={isStripeSubmitting}
              />
            ) : isClientView ? (
              <>
                <InspectorHeaderHero
                  name={practiceName ?? 'Practice'}
                  avatarUrl={practiceLogo || undefined}
                  subtitle={practiceDetail?.description}
                  email={practiceDetail?.businessEmail}
                  phone={practiceDetail?.businessPhone}
                  website={practiceDetail?.website}
                />
                <div className="mt-2">
                  {intakeConversationState ? (
                    <div className="mt-4">
                      {(() => {
                        const tier = resolveStrengthTier(intakeConversationState);
                        const label = resolveStrengthLabel(tier);
                        const description = resolveStrengthDescription(tier, intakeConversationState);
                        const { bgClass } = resolveStrengthStyle(tier);
                        const canEditIntake = !intakeStatus?.intakeUuid;

                        return (
                          <>
                            <div className="px-5 pt-6 pb-2">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-input-placeholder">Consultation Details</h4>
                            </div>
                            <div className="px-5 py-4 flex items-center gap-3 group/strength" title={description}>
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${bgClass} ring-2 ring-white/10`} />
                              <h3 className="text-[14px] font-semibold text-input-text">{label.replace(' Brief', '').replace(' Status', '')}</h3>
                            </div>

                            {/* Contact Information */}
                            <InspectorGroup 
                              label="Name" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeName' ? null : 'intakeName') : undefined}
                              isOpen={activeConversationEditor === 'intakeName'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeSlimContactDraft?.name || 'Not set'}
                                summaryMuted={!intakeSlimContactDraft?.name}
                                isOpen={activeConversationEditor === 'intakeName'}
                              >
                                <Input
                                  value={intakeSlimContactDraft?.name ?? ''}
                                  placeholder="Full name"
                                  readOnly
                                  className="w-full"
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup 
                              label="Email" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeEmail' ? null : 'intakeEmail') : undefined}
                              isOpen={activeConversationEditor === 'intakeEmail'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeSlimContactDraft?.email || 'Not set'}
                                summaryMuted={!intakeSlimContactDraft?.email}
                                isOpen={activeConversationEditor === 'intakeEmail'}
                              >
                                <Input
                                  value={intakeSlimContactDraft?.email ?? ''}
                                  placeholder="Email address"
                                  readOnly
                                  className="w-full"
                                  type="email"
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup 
                              label="Phone" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakePhone' ? null : 'intakePhone') : undefined}
                              isOpen={activeConversationEditor === 'intakePhone'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeSlimContactDraft?.phone || 'Not set'}
                                summaryMuted={!intakeSlimContactDraft?.phone}
                                isOpen={activeConversationEditor === 'intakePhone'}
                              >
                                <Input
                                  value={intakeSlimContactDraft?.phone ?? ''}
                                  placeholder="Phone number"
                                  readOnly
                                  className="w-full"
                                  type="tel"
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            {(() => {
                              const rawPracticeServiceUuid = intakeConversationState.practiceServiceUuid;
                              const resolvedOpt = rawPracticeServiceUuid
                                ? intakeServiceOptions.find((opt) => opt.value === rawPracticeServiceUuid)
                                : null;
                              const resolvedLabel = resolvedOpt ? resolvedOpt.label : rawPracticeServiceUuid;
                              return (
                                <InspectorGroup 
                                  label="Practice Area" 
                                  onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakePracticeArea' ? null : 'intakePracticeArea') : undefined}
                                  isOpen={activeConversationEditor === 'intakePracticeArea'}
                                >
                                  <InspectorEditableRow
                                    label=""
                                    summary={resolvedLabel || 'Not set'}
                                    summaryMuted={!resolvedLabel}
                                    isOpen={activeConversationEditor === 'intakePracticeArea'}
                                  >
                                    <Combobox
                                      value={rawPracticeServiceUuid ?? ''}
                                      onChange={(v) => {
                                        void handleIntakeFieldChange({ practiceServiceUuid: v }, true);
                                      }}
                                      options={intakeServiceOptions}
                                      placeholder="Select Practice Area"
                                      searchable
                                      
                                    />
                                  </InspectorEditableRow>
                                </InspectorGroup>
                              );
                            })()}
                            <InspectorGroup 
                              label="City" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeCity' ? null : 'intakeCity') : undefined}
                              isOpen={activeConversationEditor === 'intakeCity'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeConversationState.city || 'Not set'}
                                summaryMuted={!intakeConversationState.city}
                                isOpen={activeConversationEditor === 'intakeCity'}
                              >
                                <Input
                                  value={localIntakeDraft ?? intakeConversationState.city ?? ''}
                                  onChange={setLocalIntakeDraft}
                                  placeholder="City"
                                  
                                  className="w-full"
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false;
                                      return;
                                    }
                                    if (localIntakeDraft !== null) {
                                      void handleIntakeFieldChange({ city: localIntakeDraft }, false);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      skipBlurRef.current = true;
                                      void handleIntakeFieldChange({ city: localIntakeDraft ?? intakeConversationState.city ?? '' }, true);
                                    }
                                    if (e.key === 'Escape') {
                                      skipBlurRef.current = true;
                                      setActiveConversationEditor(null);
                                    }
                                  }}
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup 
                              label="State" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeState' ? null : 'intakeState') : undefined}
                              isOpen={activeConversationEditor === 'intakeState'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeConversationState.state || 'Not set'}
                                summaryMuted={!intakeConversationState.state}
                                isOpen={activeConversationEditor === 'intakeState'}
                              >
                                <Combobox
                                  value={intakeConversationState.state ?? ''}
                                  onChange={(v) => void handleIntakeFieldChange({ state: v })}
                                  options={STATE_OPTIONS}
                                  placeholder="Select State"
                                  searchable
                                  
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup 
                              label="Opposing Party/Counsel" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeOpposingParty' ? null : 'intakeOpposingParty') : undefined}
                              isOpen={activeConversationEditor === 'intakeOpposingParty'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeConversationState.opposingParty || 'Not set'}
                                summaryMuted={!intakeConversationState.opposingParty}
                                isOpen={activeConversationEditor === 'intakeOpposingParty'}
                              >
                                <Input
                                  value={localIntakeDraft ?? intakeConversationState.opposingParty ?? ''}
                                  onChange={setLocalIntakeDraft}
                                  placeholder="Opposing party"
                                  
                                  className="w-full"
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false;
                                      return;
                                    }
                                    if (localIntakeDraft !== null) {
                                      void handleIntakeFieldChange({ opposingParty: localIntakeDraft }, false);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      skipBlurRef.current = true;
                                      void handleIntakeFieldChange({ opposingParty: localIntakeDraft ?? intakeConversationState.opposingParty ?? '' }, true);
                                    }
                                    if (e.key === 'Escape') {
                                      skipBlurRef.current = true;
                                      setActiveConversationEditor(null);
                                    }
                                  }}
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup
                              label="Desired Outcome"
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeDesiredOutcome' ? null : 'intakeDesiredOutcome') : undefined}
                              isOpen={activeConversationEditor === 'intakeDesiredOutcome'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeConversationState.desiredOutcome || 'Not set'}
                                summaryMuted={!intakeConversationState.desiredOutcome}
                                isOpen={activeConversationEditor === 'intakeDesiredOutcome'}
                              >
                                <Textarea
                                  value={localIntakeDraft ?? intakeConversationState.desiredOutcome ?? ''}
                                  onChange={setLocalIntakeDraft}
                                  placeholder="Desired outcome"
                                  
                                  className="w-full"
                                  rows={3}
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false;
                                      return;
                                    }
                                    if (localIntakeDraft !== null) {
                                      void handleIntakeFieldChange({ desiredOutcome: localIntakeDraft }, false);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                      skipBlurRef.current = true;
                                      void handleIntakeFieldChange({ desiredOutcome: localIntakeDraft ?? intakeConversationState.desiredOutcome ?? '' }, true);
                                    }
                                    if (e.key === 'Escape') {
                                      skipBlurRef.current = true;
                                      setActiveConversationEditor(null);
                                    }
                                  }}
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>

                            <InspectorGroup label="Has Documents">
                              <InfoRow
                                label=""
                                value={
                                  intakeConversationState.hasDocuments === true
                                    ? 'Yes'
                                    : intakeConversationState.hasDocuments === false
                                      ? 'No'
                                      : 'Not set'
                                }
                                muted={
                                  intakeConversationState.hasDocuments === null
                                  || intakeConversationState.hasDocuments === undefined
                                }
                              />
                            </InspectorGroup>

                            {typeof intakeConversationState.householdSize === 'number' ? (
                              <InspectorGroup label="Household Size">
                                <InfoRow label="" value={String(intakeConversationState.householdSize)} />
                              </InspectorGroup>
                            ) : null}

                            {intakeConversationState.courtDate ? (
                              <InspectorGroup label="Court Date">
                                <InfoRow label="" value={intakeConversationState.courtDate} />
                              </InspectorGroup>
                            ) : null}

                            <InspectorGroup 
                              label="Case Summary" 
                              onToggle={canEditIntake ? () => setActiveConversationEditor(prev => prev === 'intakeDescription' ? null : 'intakeDescription') : undefined}
                              isOpen={activeConversationEditor === 'intakeDescription'}
                            >
                              <InspectorEditableRow
                                label=""
                                summary={intakeConversationState.description || 'Not set'}
                                summaryMuted={!intakeConversationState.description}
                                isOpen={activeConversationEditor === 'intakeDescription'}
                              >
                                <Textarea
                                  value={localIntakeDraft ?? intakeConversationState.description ?? ''}
                                  onChange={setLocalIntakeDraft}
                                  placeholder="Summary of the situation"
                                  
                                  className="w-full"
                                  rows={4}
                                  onBlur={() => {
                                    if (skipBlurRef.current) {
                                      skipBlurRef.current = false;
                                      return;
                                    }
                                    if (localIntakeDraft !== null) {
                                      void handleIntakeFieldChange({ description: localIntakeDraft }, false);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      skipBlurRef.current = true;
                                      setActiveConversationEditor(null);
                                    }
                                  }}
                                />
                              </InspectorEditableRow>
                            </InspectorGroup>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
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

            {!isClientView && resolvedConversationMode !== 'PRACTICE_ONBOARDING' && (
              <div className="">
                <InspectorGroup label="People">
                  <InfoRow
                    label=""
                    valueNode={renderIdentityStack(
                      conversationPeople,
                      'No people linked',
                      'person linked',
                      'people linked',
                    )}
                  />
                </InspectorGroup>
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
                  summary={assignedConversationMember
                    ? renderCompactIdentity(assignedConversationMember)
                    : currentAssignedLabel}
                  summaryMuted={!assignedMemberLabel}
                  isOpen={activeConversationEditor === 'assignment'}
                >
                  <div className="relative z-30">
                    <Combobox
                      value={conversation?.assigned_to ?? ''}
                      onChange={(value) => { void handleConversationAssignmentChange(value); }}
                      options={assignedToOptions}
                      searchable
                      
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
              subtitle={undefined}
              statusBadge={null}
            />
            <div className="">
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
              <InspectorGroup label="Record">
                <InfoRow label="Created" value={resolvedMatterCreatedLabel ?? undefined} />
                <InfoRow label="Updated" value={resolvedMatterUpdatedLabel ?? undefined} />
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
      <Dialog
        isOpen={isArchiveConfirmOpen}
        onClose={() => {
          if (isArchivingPerson) return;
          setIsArchiveConfirmOpen(false);
        }}
        title="Archive person"
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
      </Dialog>
    </div>
  );
};

export default InspectorPanel;
