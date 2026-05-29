import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation, ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { updateConversationMatter, type PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import { useUserDetail } from '@/shared/hooks/useUserDetail';
import { useMatterDetail } from '@/shared/hooks/useMatterDetail';
import { usePracticeDetail } from '@/shared/hooks/usePracticeDetail';
import { MATTER_STATUS_LABELS, MATTER_WORKFLOW_STATUSES, isMatterStatus, type MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceInspector } from '@/features/invoices/components/InvoiceInspector';
import { ClientInspector } from '@/features/clients/components/ClientInspector';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption, Input, Textarea } from '@/shared/ui/input';
import {
  InspectorIdentity,
  resolveAttorneyLabel as resolveAttorneyLabelHelper,
  resolveAttorneyIdentity as resolveAttorneyIdentityHelper,
  renderCompactIdentity,
  renderIdentityStack,
} from './identityHelpers';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { InspectorSectionSkeleton } from '@/shared/ui/layout';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
  InspectorHeaderEntity,
  InspectorHeaderPerson,
  InspectorHeaderHero,
} from './InspectorPrimitives';
import { X } from 'lucide-preact';

import { useSessionContext } from '@/shared/contexts/SessionContext';
import { CONTACT_RELATIONSHIP_STATUS_LABELS } from '@/shared/domain/contacts';
import type { IntakeConversationState, DerivedIntakeStatus } from '@/shared/types/intake';
import type { PracticeIntakeDetail } from '@/features/intake/api/intakesApi';
import { resolveStrengthTier, resolveStrengthLabel, resolveStrengthStyle, resolveStrengthDescription } from '@/shared/utils/intakeStrength';
import type { PracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { BusinessOnboardingStatus } from '@/shared/hooks/usePracticeManagement';
import { SetupInspectorContent } from './SetupInspectorContent';
import { MatterFilesSection } from './MatterFilesSection';

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
  intake?: PracticeIntakeDetail | null;
  onIntakeFieldsChange?: (patch: Partial<IntakeConversationState>, options?: import('@/shared/types/intake').IntakeFieldChangeOptions) => Promise<void> | void;
  practiceDetails?: PracticeDetails | null;
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
  intake,
  onIntakeFieldsChange,
  practiceDetails: propPracticeDetails,
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
  const [localError, setLocalError] = useState<string | null>(null);
  const setError = setLocalError;
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
  const [localIntakeDraft, setLocalIntakeDraft] = useState<string | null>(null);
  const skipBlurRef = useRef(false);

  const conversationUserId = conversation?.user_id ?? null;
  const conversationMatterId = conversation?.matter_id ?? null;
  const resolvedConversationMode = conversationMode ?? conversation?.user_info?.mode;

  // Drive the per-entity data hooks from entityType.
  const targetUserId = entityType === 'conversation'
    ? conversationUserId
    : entityType === 'client'
      ? entityId
      : null;
  const targetMatterId = entityType === 'conversation'
    ? conversationMatterId
    : entityType === 'matter'
      ? entityId
      : null;

  const userResult = useUserDetail(practiceId, targetUserId, {
    enabled: entityType === 'conversation' || entityType === 'client',
  });
  const matterResult = useMatterDetail(practiceId, targetMatterId, {
    enabled: entityType === 'conversation' || entityType === 'matter',
  });
  const practiceResult = usePracticeDetail(practiceId, {
    enabled: entityType === 'conversation' && !isClientView,
    fallback: propPracticeDetails ?? null,
  });

  const userDetail = userResult.data;
  const matterDetail = matterResult.data;
  const practiceDetail = practiceResult.data;
  const isLoading = userResult.isLoading || matterResult.isLoading || practiceResult.isLoading;
  // Local mutation errors take precedence; fall back to fetch errors from any hook.
  const error = localError ?? userResult.error ?? matterResult.error ?? practiceResult.error;
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

  const currentUserId = session?.user?.id ?? undefined;

  const currentAssignedLabel = assignedMemberLabel ?? (
    <span className="flex items-center gap-1">
      No one —{' '}
      {currentUserId ? (
        <Button
          variant="link"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            void handleConversationAssignmentChange(currentUserId);
          }}
        >
          Assign yourself
        </Button>
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

  // Reset editor state when the entity changes — the hooks themselves swap
  // their data on the new key, but UI editor state is per-entity-instance.
  useEffect(() => {
    setActiveConversationEditor(null);
    setActiveMatterEditor(null);
    setLocalIntakeDraft(null);
    setLocalError(null);
  }, [conversation?.id, entityId, entityType]);

  useEffect(() => {
    setLocalIntakeDraft(null);
  }, [activeConversationEditor]);

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
  // renderCompactIdentity and renderIdentityStack now imported from identityHelpers
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-input-text">
          {entityType === 'conversation'
            ? 'Conversation Info'
            : entityType === 'matter'
              ? 'Matter Info'
              : entityType === 'invoice'
                ? 'Invoice Info'
                : 'Contact Info'}
        </h2>
        {showCloseButton ? (
          <Button
            variant="icon"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close inspector"
            icon={X} iconClassName="h-4 w-4"
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && entityType === 'conversation' ? (
          <div className="py-3">
            <InspectorSectionSkeleton wideRows={[true, false, true, false]} />
          </div>
        ) : null}
        {/* Client loading skeleton is rendered by ClientInspector itself */}
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
                  email={practiceDetail?.businessEmail}
                  phone={practiceDetail?.businessPhone}
                  website={practiceDetail?.website}
                />
                <div className="mt-2">
                  {/* Canonical Intake Status from backend */}
                  {intake ? (
                    <div className="mt-4">
                      <InspectorGroup label="Intake Status">
                        <InfoRow
                          label="Status"
                          value={intake.status || '—'}
                        />
                        <InfoRow
                          label="Triage Status"
                          value={intake.triage_status || '—'}
                        />
                      </InspectorGroup>
                    </div>
                  ) : null}
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
                            {canEditIntake ? null : (
                              <>
                                <InspectorGroup label="Name">
                                  <InspectorEditableRow
                                    label=""
                                    summary={conversation?.user_info?.consultation?.contact?.name || 'Not set'}
                                    summaryMuted={!conversation?.user_info?.consultation?.contact?.name}
                                    isOpen={false}
                                  >
                                    <Input
                                      value={conversation?.user_info?.consultation?.contact?.name ?? ''}
                                      placeholder="Full name"
                                      readOnly
                                      className="w-full"
                                    />
                                  </InspectorEditableRow>
                                </InspectorGroup>
                                <InspectorGroup label="Email">
                                  <InspectorEditableRow
                                    label=""
                                    summary={conversation?.user_info?.consultation?.contact?.email || 'Not set'}
                                    summaryMuted={!conversation?.user_info?.consultation?.contact?.email}
                                    isOpen={false}
                                  >
                                    <Input
                                      value={conversation?.user_info?.consultation?.contact?.email ?? ''}
                                      placeholder="Email address"
                                      readOnly
                                      className="w-full"
                                      type="email"
                                    />
                                  </InspectorEditableRow>
                                </InspectorGroup>
                                <InspectorGroup label="Phone">
                                  <InspectorEditableRow
                                    label=""
                                    summary={conversation?.user_info?.consultation?.contact?.phone || 'Not set'}
                                    summaryMuted={!conversation?.user_info?.consultation?.contact?.phone}
                                    isOpen={false}
                                  >
                                    <Input
                                      value={conversation?.user_info?.consultation?.contact?.phone ?? ''}
                                      placeholder="Phone number"
                                      readOnly
                                      className="w-full"
                                      type="tel"
                                    />
                                  </InspectorEditableRow>
                                </InspectorGroup>
                              </>
                            )}

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
                  <InspectorGroup label="Contact Details">
                    <InfoRow label="Phone" value={userDetail?.user?.phone ?? undefined} muted={!userDetail?.user?.phone} />
                    <InfoRow
                      label="Relationship status"
                      value={userDetail?.status ? CONTACT_RELATIONSHIP_STATUS_LABELS[userDetail.status] : undefined}
                    />
                  </InspectorGroup>
                </div>
              </>
            )}

            {!isClientView && resolvedConversationMode !== 'PRACTICE_ONBOARDING' && (
              <div className="">
                <InspectorGroup label="Contacts">
                  <InfoRow
                    label=""
                    valueNode={renderIdentityStack(
                      conversationPeople,
                      'No contacts linked',
                      'contact linked',
                      'contacts linked',
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
        ) : null}

        {entityType === 'client' && practiceId && entityId ? (
          <ClientInspector practiceId={practiceId} entityId={entityId} />
        ) : null}

        {entityType === 'invoice' ? (
          <InvoiceInspector
            clientName={invoiceClientName}
            matterTitle={invoiceMatterTitle}
            status={invoiceStatus}
            total={invoiceTotal}
            amountDue={invoiceAmountDue}
            dueDate={invoiceDueDate}
          />
        ) : null}
      </div>
    </div>
  );
};

export default InspectorPanel;
