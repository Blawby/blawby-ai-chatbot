import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Conversation, ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { updateConversationMatter, type PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import { useUserDetail } from '@/shared/hooks/useUserDetail';
import { useMatterDetail } from '@/shared/hooks/useMatterDetail';
import { usePracticeDetail } from '@/shared/hooks/usePracticeDetail';
import type { MatterStatus } from '@/shared/types/matterStatus';
import { InvoiceInspector } from '@/features/invoices/components/InvoiceInspector';
import { ClientInspector } from '@/features/clients/components/ClientInspector';
import { MatterInspector } from '@/features/matters/components/MatterInspector';
import { Button } from '@/shared/ui/Button';
import { Combobox, type ComboboxOption, Input, Textarea } from '@/shared/ui/input';
import {
  InspectorIdentity,
  renderCompactIdentity,
  renderIdentityStack,
} from './identityHelpers';
import { STATE_OPTIONS } from '@/shared/ui/address/AddressFields';
import { InspectorSectionSkeleton } from '@/shared/ui/layout';
import {
  InfoRow,
  InspectorEditableRow,
  InspectorGroup,
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
  matterBillingLabel: _matterBillingLabel,
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
    setLocalIntakeDraft(null);
    setLocalError(null);
  }, [conversation?.id, entityId, entityType]);

  useEffect(() => {
    setLocalIntakeDraft(null);
  }, [activeConversationEditor]);

  // matter-specific resolved fields, identity helpers, and matterTeamIdentities
  // all live inside MatterInspector now.
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
  // matterTeamIdentities, matterUrgencyLabel, and the matter-specific resolved
  // fields live inside MatterInspector now. renderCompactIdentity and
  // renderIdentityStack are imported from identityHelpers.
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
        {/* Client + matter loading skeletons are rendered by their per-feature inspectors */}
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

        {entityType === 'matter' && practiceId && entityId ? (
          <MatterInspector
            practiceId={practiceId}
            entityId={entityId}
            matterClientName={matterClientName}
            matterAssigneeNames={matterAssigneeNames}
            matterCreatedLabel={matterCreatedLabel}
            matterUpdatedLabel={matterUpdatedLabel}
            matterClientId={matterClientId}
            matterUrgency={matterUrgency}
            matterResponsibleAttorneyId={matterResponsibleAttorneyId}
            matterOriginatingAttorneyId={matterOriginatingAttorneyId}
            matterCaseNumber={matterCaseNumber}
            matterType={matterType}
            matterCourt={matterCourt}
            matterJudge={matterJudge}
            matterOpposingParty={matterOpposingParty}
            matterOpposingCounsel={matterOpposingCounsel}
            matterClientOptions={matterClientOptions}
            matterClients={matterClients}
            matterAssigneeOptions={matterAssigneeOptions}
            conversationMembers={conversationMembers}
            onMatterStatusChange={onMatterStatusChange}
            onMatterPatchChange={onMatterPatchChange}
          />
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
