import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Plus } from 'lucide-preact';

import { useNavigation } from '@/shared/utils/navigation';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { WorkspaceHomeSection } from '@/features/chat/components/WorkspaceHomeSection';
import { WorkspaceSetupSection } from '@/features/chat/components/WorkspaceSetupSection';
import MessagesListPanel from '@/features/chat/components/MessagesListPanel';
import ConversationContextPanel from '@/features/chat/components/ConversationContextPanel';
import { type ComboboxOption } from '@/shared/ui/input/Combobox';
import { deleteConversation, markAsRead, postConversationMessage, updateConversationTriage } from '@/shared/lib/conversationApi';
import { AddContactDialog } from '@/shared/ui/contacts/AddContactDialog';
import { Dialog } from '@/shared/ui/dialog/Dialog';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeInvitations } from '@/shared/hooks/usePracticeInvitations';
import { DraftConversationView } from '@/features/chat/components/DraftConversationView';
import { getPracticeRoleLabel } from '@/shared/utils/practiceRoles';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { WorkspaceShellHeader } from '@/shared/ui/layout/WorkspaceShellHeader';
import { WorkspaceMainPane } from '@/shared/ui/layout/WorkspaceMainPane';
import type { WorkspaceMainPaneLayout } from '@/shared/ui/layout/WorkspaceMainPane';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { useWorkspaceConversations } from './hooks/useWorkspaceConversations';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { resolveConversationContactName, resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { useWorkspaceSetup } from './hooks/useWorkspaceSetup';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { useConversationPreviews } from './hooks/useConversationPreviews';
import { useWorkspaceInspectorActions } from './hooks/useWorkspaceInspectorActions';
import { useInvoiceBuilderTopBar } from './hooks/useInvoiceBuilderTopBar';
import { useWorkspaceAutoNavigation } from './hooks/useWorkspaceAutoNavigation';
import { useRecentMessage } from './hooks/useRecentMessage';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import {
  getWorkspaceActiveHref,
  shouldShowWorkspaceBottomNav,
  shouldShowWorkspaceMobileMenuButton,
  WORKSPACE_REPORT_SECTION_TITLES,
} from '@/shared/utils/workspaceShell';
import {
  type SecondaryNavItem,
  type WorkspaceSection,
  buildSidebarConfig,
} from '@/shared/config/navConfig';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
import NavRail from '@/shared/ui/nav/NavRail';
import { PracticeSidebar } from '@/shared/ui/nav/PracticeSidebar';
import { ClientSidebar } from '@/shared/ui/nav/ClientSidebar';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import { SettingsContent, type SettingsView } from '@/features/settings/pages/SettingsContent';
import { PracticeCoveragePage } from '@/features/settings/pages/PracticeCoveragePage';
import { mockApps } from '@/features/settings/pages/appsData';
import type { ChatMessageUI, FileAttachment } from '../../../../worker/types';
import type { Conversation, ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode, WorkspaceView } from '@/app/MainApp';
import type { UserDetailRecord, UserDetailStatus, PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeConversationState, DerivedIntakeStatus, IntakeFieldChangeOptions } from '@/shared/types/intake';
import { features } from '@/config/features';

type PreviewTab = 'home' | 'messages' | 'intake';
const previewTabOptions: Array<{ id: PreviewTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'messages', label: 'Messages' },
  { id: 'intake', label: 'Intake form' },
];
type WorkspacePrefetchData = {
  mattersData?: {
    items: BackendMatter[];
    isLoading: boolean;
    error: string | null;
    refetch: (signal?: AbortSignal) => Promise<void>;
  };
  contactsData?: {
    items: UserDetailRecord[];
    isLoading: boolean;
    error: string | null;
    refetch: (signal?: AbortSignal) => Promise<void>;
  };
};

type WorkspacePrimaryCreateAction = WorkspacePlaceholderAction;

interface WorkspacePageProps {
  view: WorkspaceView;
  practiceId: string;
  practiceSlug: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  messages: ChatMessageUI[];
  layoutMode: LayoutMode;
  workspace?: 'public' | 'practice' | 'client';
  settingsView?: SettingsView;
  settingsAppId?: string;
  settingsIntakeTemplateSlug?: string;
  routeInvoiceId?: string | null;
  onStartNewConversation: (
    mode: ConversationMode,
    preferredConversationId?: string,
    options?: {
      forceCreate?: boolean;
      silentSessionNotReady?: boolean;
      additionalParticipantUserIds?: string[];
      additionalMetadata?: Record<string, unknown>;
    }
  ) => Promise<string>;
  activeConversationId?: string | null;
  chatView: ComponentChildren;
  /** File-upload state from MainApp's useFileUpload, passed through so the
   *  draft composer reuses the same upload pipeline + preview state as the
   *  main chat composer. Optional — when omitted, the draft composer falls
   *  back to a no-attachments mode. */
  fileUploadProps?: {
    previewFiles: import('../../../../worker/types').FileAttachment[];
    uploadingFiles: import('@/shared/types/upload').UploadingFile[];
    isReadyToUpload: boolean;
    handleFileSelect: (files: File[]) => Promise<unknown>;
    handleCameraCapture: (file: File) => Promise<void>;
    removePreviewFile: (index: number) => void;
    clearPreviewFiles: () => void;
    cancelUpload: (fileId: string) => void;
    handleMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
    isRecording: boolean;
    setIsRecording: (recording: boolean) => void;
  };
  mattersView?: ComponentChildren | ((statusFilter: string[], prefetchData?: WorkspacePrefetchData, onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  mattersListContent?: ComponentChildren | ((statusFilter: string[], prefetchData?: WorkspacePrefetchData) => ComponentChildren);
  contactsView?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData, onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  contactsListContent?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData) => ComponentChildren);
  invoicesView?: ComponentChildren | ((statusFilter: string[], onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  invoicesListContent?: ComponentChildren | ((statusFilter: string[]) => ComponentChildren);
  reportsView?: ComponentChildren | ((title: string) => ComponentChildren);
  intakesView?: ComponentChildren | ((activeFilter: string | null) => ComponentChildren);
  engagementsView?: ComponentChildren | ((activeFilter: string | null) => ComponentChildren);
  primaryCreateAction?: WorkspacePrimaryCreateAction | null;
  mockConversations?: Conversation[] | null;
  mockConversationPreviews?: Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }> | null;
  onSelectConversationOverride?: (conversationId: string) => void;
  intakeConversationState?: IntakeConversationState | null;
  intakeStatus?: DerivedIntakeStatus | null;
  onIntakeFieldsChange?: (patch: Partial<IntakeConversationState>, options?: IntakeFieldChangeOptions) => Promise<void> | void;
  practiceDetails?: PracticeDetails | null;
}

// Resolves a view prop that may be either ComponentChildren or a render function
// taking some args, falling back to a default when neither produces output.
const resolveViewContent = <TArgs extends unknown[]>(
  source: ComponentChildren | ((...args: TArgs) => ComponentChildren) | undefined,
  args: TArgs,
  fallback: ComponentChildren = null
): ComponentChildren => {
  if (typeof source === 'function') return (source as (...a: TArgs) => ComponentChildren)(...args);
  return source ?? fallback;
};

const filterWorkspaceMessages = (messages: ChatMessageUI[]) => {
  const base = messages.filter(
    (message) =>
      message.metadata?.systemMessageKey !== 'ask_question_help'
  );
  const hasNonSystemMessages = base.some((message) => message.role !== 'system');
  return hasNonSystemMessages ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
};

const hasIntakeContactStarted = (messages: ChatMessageUI[]): boolean => {
  return messages.some((message) => {
    const meta = message.metadata;
    if (meta?.isContactFormSubmission === true) return true;
    if (meta?.intakeOpening === true) return true;
    if (meta?.intakeDecisionPrompt === true) return true;
    if (meta?.intakeSubmitted === true) return true;
    if (meta?.contactDetails && typeof meta.contactDetails === 'object') return true;
    if (meta?.intakeComplete === true) return true;
    return false;
  });
};

const WorkspacePage: FunctionComponent<WorkspacePageProps> = ({
  view,
  practiceId,
  practiceSlug,
  practiceName,
  practiceLogo,
  messages,
  layoutMode,
  workspace = 'public',
  settingsView = 'general',
  settingsAppId,
  settingsIntakeTemplateSlug,
  routeInvoiceId: _,
  onStartNewConversation,
  activeConversationId = null,
  chatView,
  fileUploadProps,
  mattersView,
  mattersListContent,
  contactsView,
  contactsListContent,
  invoicesView,
  invoicesListContent,
  intakesView,
  engagementsView,
  reportsView,
  primaryCreateAction = null,
  mockConversations = null,
  mockConversationPreviews = null,
  onSelectConversationOverride,
  intakeConversationState,
  intakeStatus,
  onIntakeFieldsChange,
  practiceDetails,
}) => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const [previewTab, setPreviewTab] = useState<PreviewTab>('home');
  const [setupSidebarView, setSetupSidebarView] = useState<'info' | 'preview'>('info');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Persist desktop sidebar collapsed state across reloads/visits.
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('blawby:sidebar:collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('blawby:sidebar:collapsed', isDesktopSidebarCollapsed ? '1' : '0');
    } catch {
      // localStorage may be disabled (private mode, quota); persistence is best-effort.
    }
  }, [isDesktopSidebarCollapsed]);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [conversationPendingDelete, setConversationPendingDelete] = useState<Conversation | null>(null);
  const [optimisticallyReadConversationIds, setOptimisticallyReadConversationIds] = useState<Set<string>>(new Set());
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false);
  // Draft conversation state. When non-null, the chat area renders
  // DraftConversationView and the messages list shows a synthetic "Draft"
  // entry pinned at the top. POST + assignment + first message are deferred
  // until the user actually sends from the draft view.
  const [draftConversation, setDraftConversation] = useState<{
    contactUserId?: string | null;
    contactName?: string;
    contactEmail?: string;
  } | null>(null);
  const [pendingInviteOption, setPendingInviteOption] = useState<{ name: string; email: string } | null>(null);
  const navigationInitiatedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(false);
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const intakeContactStarted = useMemo(
    () => hasIntakeContactStarted(messages),
    [messages]
  );
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';

  const { session, isPending: isSessionPending, isAnonymous } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const sessionUserId = session?.user?.id ?? null;
  const normalizedRole = normalizePracticeRole(activeMemberRole);

  const {
    normalizedBase,
    conversationsPath,
    withWidgetQuery,
    isIntakeTemplateEditorRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    previewUrls,
    handleDashboardCreateInvoice,
    workspaceSection,
    navConfig,
    activeSecondaryFilter,
    handleSecondaryFilterSelect,
  } = useWorkspaceNavigation({
    view,
    workspace,
    practiceSlug,
    layoutMode,
    location,
    navigate,
    isPracticeWorkspace,
    isClientWorkspace,
    normalizedRole,
  });
  const {
    isConversationsLoading,
    refreshConversations,
    resolvedConversations,
    resolvedConversationsLoading,
    acceptedIntakeConversationsRef,
    isInitialConversationCheckRef,
    activeConversationMissingNotification,
    setActiveConversationMissingNotification,
    allIntakes,
    intakeTriageStatusLookup,
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsLoading,
    intakeLookupLoaded,
    filteredConversations,
    selectedConversation,
    combinedResolvedConversationsLoading,
    combinedResolvedConversationsError,
  } = useWorkspaceConversations({
    practiceId,
    workspace,
    isPracticeWorkspace,
    isClientWorkspace,
    view,
    workspaceSection,
    activeSecondaryFilter,
    activeConversationId,
    sessionUserId,
    mockConversations,
  });
  const inspectorTarget = useMemo(() => {
    if (workspaceSection === 'conversations' && activeConversationId) {
      return { entityType: 'conversation' as const, entityId: activeConversationId };
    }
    if (workspaceSection === 'matters' && selectedMatterIdFromPath) {
      return { entityType: 'matter' as const, entityId: selectedMatterIdFromPath };
    }
    if (view === 'contacts' && selectedContactIdFromPath) {
      return { entityType: 'client' as const, entityId: selectedContactIdFromPath };
    }
    return null;
  }, [activeConversationId, selectedContactIdFromPath, selectedMatterIdFromPath, view, workspaceSection]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOpenInspector = () => {
      if (!inspectorTarget) return;
      setIsInspectorOpen(true);
    };
    window.addEventListener('workspace:open-inspector', handleOpenInspector);
    return () => window.removeEventListener('workspace:open-inspector', handleOpenInspector);
  }, [inspectorTarget]);
  // Practice Messages design (Pencil rxzde) keeps the 320px context panel visible
  // by default. Auto-open the inspector when a practice user lands on a
  // conversation on desktop. Re-fires on conversation switch so flipping between
  // threads brings the panel back even if it was closed for a previous one.
  const inspectorTargetId = inspectorTarget?.entityType === 'conversation' ? inspectorTarget.entityId : null;
  useEffect(() => {
    if (!isPracticeWorkspace) return;
    if (layoutMode !== 'desktop') return;
    if (workspaceSection !== 'conversations') return;
    if (!inspectorTargetId) return;
    setIsInspectorOpen(true);
  }, [isPracticeWorkspace, layoutMode, workspaceSection, inspectorTargetId]);
  const {
    mattersStatusFilter,
    contactsStatusFilter,
    invoicesStatusFilter,
    mattersData,
    mattersDataForView,
    contactsData,
    matterClientOptions,
    matterClientPeople,
    selectedMatterInspectorData,
    hasDesktopInvoiceListItems,
  } = useWorkspaceData({
    practiceId,
    isPracticeWorkspace,
    isClientWorkspace,
    view,
    layoutMode,
    workspaceSection,
    activeSecondaryFilter,
    selectedMatterIdFromPath,
    sessionUserId,
  });
  const isMobileLayout = layoutMode !== 'desktop';

  const { showSuccess, showError } = useToastContext();

  const setup = useWorkspaceSetup({
    practiceId,
    practiceSlug,
    isPracticeWorkspace,
    view,
    sessionUserId,
    isAnonymous,
    isSessionPending,
    isConversationsLoading,
    resolvedConversations,
    refreshConversations,
    workspaceSection,
    session,
    mattersData,
    showError,
    showSuccess,
  });

  useEffect(() => {
    setup.resetForPracticeId();
  }, [practiceId, setup]);

  const { conversationPreviews } = useConversationPreviews({
    practiceId,
    view,
    workspace,
    filteredConversations,
    isSessionPending,
    isAnonymous,
    sessionUserId,
    mockConversationPreviews,
    mockConversations,
  });

  const handleSelectConversation = useCallback((conversationId: string) => {
    hasAutoNavigatedRef.current = true;
    // Selecting a real conversation always exits draft mode — otherwise the
    // draft view stays mounted on top of the chosen thread on mobile and the
    // pinned "Draft" entry stays in the list.
    setDraftConversation(null);
    setPendingInviteOption(null);

    // Mark conversation as read if it has unread messages
    const conversation = resolvedConversations.find((c) => c.id === conversationId);
    if (conversation && practiceId && Number(conversation.unread_count ?? 0) > 0) {
      // Optimistically update UI immediately
      setOptimisticallyReadConversationIds((prev) => new Set([...prev, conversationId]));
      // Then call the backend
      void markAsRead(conversationId, practiceId).catch((error) => {
        console.warn('[WorkspacePage] Failed to mark conversation as read', error);
        // Remove from optimistic set on failure
        setOptimisticallyReadConversationIds((prev) => {
          const next = new Set(prev);
          next.delete(conversationId);
          return next;
        });
      });
    }

    if (onSelectConversationOverride) {
      onSelectConversationOverride(conversationId);
      return;
    }
    navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
  }, [conversationsPath, navigate, onSelectConversationOverride, withWidgetQuery, resolvedConversations, practiceId]);


  useWorkspaceAutoNavigation({
    view,
    workspaceSection,
    activeConversationId,
    practiceId,
    isPracticeWorkspace,
    isClientWorkspace,
    layoutMode,
    filteredConversations,
    resolvedConversations,
    resolvedConversationsLoading,
    intakeLookupLoaded,
    acceptedIntakeConversationsLoading,
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsRef,
    intakeTriageStatusLookup,
    isInitialConversationCheckRef,
    navigationInitiatedRef,
    hasAutoNavigatedRef,
    conversationsPath,
    navigate,
    withWidgetQuery,
    handleSelectConversation,
    setActiveConversationMissingNotification,
    activeConversationMissingNotification,
    showError,
  });

  const recentMessage = useRecentMessage({
    practiceName,
    practiceLogo,
    conversationPreviews,
    filteredConversations,
    filteredMessages,
  });


  const {
    setDraftBasics,
    onboardingProgress,
    setOnboardingProgress,
    onboardingConversationId,
    currentPractice,
    setupDetails,
    setupStatus,
    setupFields,
    applySetupFields,
    conversationMemberOptions,
    matterAssigneeOptions,
    dashboardWindow,
    setDashboardWindow,
    summaryStats,
    recentActivity,
    practiceBillingLoading,
    practiceBillingError,
    logoUploading,
    logoUploadProgress,
    stripeHasAccount,
    payoutDetailsSubmitted,
    isStripeSubmitting,
    previewStrongReady,
    previewReloadKey,
    forcePreviewReload,
    onboardingMessageHandling,
    workspacePracticeId,
    handleSaveBasics,
    handleSaveContact,
    handleLogoChange,
    handleSaveOnboardingServices,
    handleStartStripeOnboarding,
  } = setup;

  const inspectorActions = useWorkspaceInspectorActions({
    practiceId: workspacePracticeId,
    isPracticeWorkspace,
    selectedConversation,
    selectedMatterIdFromPath,
    refreshConversations,
    showError,
  });

  const recentIntakes = useMemo(() => {
    return allIntakes.slice(0, 3);
  }, [allIntakes]);

  const handleIntakePreviewSubmit = useCallback(async () => {
    showSuccess('Intake preview submitted', 'This submission is for preview only.');
    forcePreviewReload();
  }, [showSuccess, forcePreviewReload]);

  // ── compose picker data ──────────────────────────────────────────────
  // Loaded as soon as the user enters draft mode so the inline Combobox in
  // DraftConversationView populates without a perceptible delay.
  const composePickerEnabled = isPracticeWorkspace && draftConversation !== null;
  const composeClientsData = useClientsData(practiceId, null, sessionUserId, {
    enabled: composePickerEnabled,
  });
  const composeTeamData = usePracticeTeam(practiceId, sessionUserId, {
    enabled: composePickerEnabled,
  });
  const composePracticeInvitations = usePracticeInvitations(composePickerEnabled ? practiceId : null);

  const composePickerOptions = useMemo<ComboboxOption[]>(() => {
    if (!composePickerEnabled) return [];
    const seen = new Set<string>();
    const rows: ComboboxOption[] = [];
    // Clients with an account get added to the picker; ones without are
    // not selectable and are surfaced via the "Invite client" footer action.
    for (const client of composeClientsData.items) {
      const userId = (client.user_id ?? client.user?.id ?? '').trim();
      if (!userId || userId === sessionUserId || seen.has(userId)) continue;
      seen.add(userId);
      const name = client.user?.name?.trim() || client.user?.email?.trim() || 'Unnamed client';
      const email = client.user?.email?.trim() ?? '';
      rows.push({
        value: userId,
        label: name,
        meta: email,
        description: 'Client',
      });
    }
    for (const member of composeTeamData.members) {
      const userId = member.userId?.trim() ?? '';
      if (!userId || userId === sessionUserId || seen.has(userId)) continue;
      seen.add(userId);
      const name = member.name?.trim() || member.email;
      rows.push({
        value: userId,
        label: name,
        meta: member.email,
        description: getPracticeRoleLabel(member.role),
      });
    }
    return rows;
  }, [
    composePickerEnabled,
    composeClientsData.items,
    composeTeamData.members,
    sessionUserId,
  ]);

  // Pending invitations: invitees haven't accepted yet so they have no userId
  // and can't actually receive a message. Surface them in the picker as
  // distinguished rows so the user knows the invite is in flight.
  const composePendingInviteOptions = useMemo<ComboboxOption[]>(() => {
    if (!composePickerEnabled) return [];
    const pending = composePracticeInvitations.invitations.filter((inv) => inv.status === 'pending');
    return pending.map((invitation) => ({
      value: invitation.id,
      label: invitation.email,
      description: 'Pending invite',
      meta: 'Waiting for accept',
    }));
  }, [composePickerEnabled, composePracticeInvitations.invitations]);

  const showSidebarPreview = (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) && setupSidebarView === 'preview';

  // Apply optimistic read state to conversations for immediate UI feedback
  const filteredConversationsWithOptimisticRead = useMemo(() => {
    if (optimisticallyReadConversationIds.size === 0) return filteredConversations;
    return filteredConversations.map((conversation) =>
      optimisticallyReadConversationIds.has(conversation.id)
        ? { ...conversation, unread_count: 0 }
        : conversation
    );
  }, [filteredConversations, optimisticallyReadConversationIds]);

  useEffect(() => {
    if (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) {
      setSetupSidebarView((prev) => (prev === 'info' || prev === 'preview' ? prev : 'preview'));
      return;
    }
    setSetupSidebarView('info');
  }, [previewStrongReady, onboardingProgress?.completionScore]);

  const handleStartConversation = async (
    mode: ConversationMode,
    options?: {
      forceNew?: boolean;
      additionalParticipantUserIds?: string[];
      additionalMetadata?: Record<string, unknown>;
      /** Runs after the conversation is created but BEFORE the list refresh
       *  and URL navigate. Use for follow-up writes (assign, send first
       *  message, etc.) that need to land before useWorkspaceAutoNavigation
       *  observes the new active conversation id — otherwise the new thread
       *  isn't yet in the filtered list and the auto-nav toast fires. */
      afterCreate?: (conversationId: string) => Promise<void>;
    }
  ): Promise<string | undefined> => {
    try {
      const shouldReuseConversation = mode !== 'REQUEST_CONSULTATION' && !options?.forceNew;
      const reusableAskQuestionConversations = shouldReuseConversation
        ? resolvedConversations.filter((conversation) => {
            const metadata = conversation.user_info ?? null;
            if (resolveConsultationState(metadata)) return false;
            return metadata?.mode !== 'REQUEST_CONSULTATION';
          })
        : [];
      const latestConversation = shouldReuseConversation && reusableAskQuestionConversations.length > 0
        ? [...reusableAskQuestionConversations].sort((a, b) => {
            const aTime = new Date(a.updated_at).getTime();
            const bTime = new Date(b.updated_at).getTime();
            return bTime - aTime;
          })[0]
        : null;

      const preferredConversationId = shouldReuseConversation ? latestConversation?.id : undefined;
      // In embedded public widget mode, reuse the bootstrapped/current conversation
      // to avoid an extra create-conversation round-trip right after bootstrap.
      // Other surfaces keep the fresh-thread behavior for consultation CTA.
      const forceCreate = options?.forceNew
        ? true
        : mode === 'REQUEST_CONSULTATION'
          ? !(workspace === 'public' && layoutMode === 'widget')
          : !preferredConversationId;

      const conversationId = await onStartNewConversation(
        mode,
        preferredConversationId,
        forceCreate
          ? {
              forceCreate: true,
              additionalParticipantUserIds: options?.additionalParticipantUserIds,
              additionalMetadata: options?.additionalMetadata,
            }
          : undefined
      );
      // Run caller-provided follow-up writes (assign, post first message, etc.)
      // before the list refresh + navigate so useWorkspaceAutoNavigation sees a
      // fully-formed conversation in the filtered inbox.
      if (options?.afterCreate) {
        try {
          await options.afterCreate(conversationId);
        } catch (afterCreateError) {
          console.warn('[WorkspacePage] afterCreate hook failed', afterCreateError);
        }
      }
      // When we just forced a brand-new conversation in the practice workspace,
      // refresh the list before navigating. Otherwise useWorkspaceAutoNavigation
      // sees a stale list (without the new id) and bumps us to filteredConversations[0].
      if (options?.forceNew && isPracticeWorkspace) {
        await refreshConversations();
      }
      navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
      return conversationId;
    } catch (error) {
      // "Session not ready" — the toast was already shown by MainApp, so finish gracefully.
      if (error instanceof SessionNotReadyError) return undefined;
      console.error('[WorkspacePage] Failed to start conversation:', error);
      showError('Unable to start conversation', 'Please try again in a moment.');
      return undefined;
    }
  };

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`));
      return;
    }
    navigate(withWidgetQuery(conversationsPath));
  };

  const handleEnterDraftMode = () => {
    setDraftConversation((prev) => prev ?? { contactUserId: null });
  };

  const handleCancelDraft = () => {
    setDraftConversation(null);
    setPendingInviteOption(null);
  };

  const handleDraftContactChange = (next: { userId: string; name: string; email?: string } | null) => {
    if (!next) {
      setDraftConversation((prev) => prev ? { ...prev, contactUserId: null, contactName: undefined, contactEmail: undefined } : null);
      return;
    }
    // If an existing conversation with this contact is already in the
    // resolved list, jump into it instead of creating a duplicate. We match
    // any conversation whose participant set includes the picked user — the
    // current user is always a participant, so a hit means it's a 1-on-1
    // (or a group containing them) we should reuse.
    if (sessionUserId) {
      const existing = resolvedConversations.find((conversation) => {
        const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
        return participants.length === 2 && participants.includes(sessionUserId) && participants.includes(next.userId);
      });
      if (existing) {
        setDraftConversation(null);
        navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(existing.id)}`));
        return;
      }
    }
    setDraftConversation({
      contactUserId: next.userId,
      contactName: next.name,
      contactEmail: next.email,
    });
  };

  const handleDraftSendFirstMessage = async (message: string, attachments: FileAttachment[] = []) => {
    if (!draftConversation?.contactUserId || !practiceId) return;
    const contactName = draftConversation.contactName?.trim();
    const contactEmail = draftConversation.contactEmail?.trim();
    const additionalMetadata = (contactName || contactEmail)
      ? {
          contactDetails: {
            ...(contactName ? { name: contactName } : {}),
            ...(contactEmail ? { email: contactEmail } : {}),
          },
        }
      : undefined;
    // Attachments go through the same metadata.attachments shape the
    // WebSocket path uses (see useChatComposer.sendMessageOverWs) so the
    // worker stores file ids consistently regardless of transport.
    const attachmentIds = attachments
      .map((file) => file.id || file.storageKey || '')
      .filter(Boolean);
    const messageMetadata: Record<string, unknown> | undefined = attachmentIds.length > 0
      ? { attachments: attachmentIds }
      : undefined;
    let postFailed = false;
    const newConversationId = await handleStartConversation('ASK_QUESTION', {
      forceNew: true,
      additionalParticipantUserIds: [draftConversation.contactUserId],
      additionalMetadata,
      // Send the first message AND assign the creator before navigation so the
      // resulting thread is already in "Your inbox" when useWorkspaceAutoNavigation
      // observes the new active id. Otherwise the toast "currently hidden by
      // filters or still loading" fires.
      afterCreate: async (newId) => {
        try {
          await postConversationMessage(newId, practiceId, {
            content: message,
            metadata: messageMetadata,
          });
        } catch (error) {
          postFailed = true;
          console.warn('[WorkspacePage] Failed to send draft first message', error);
          throw error;
        }
        if (sessionUserId) {
          try {
            await updateConversationTriage(newId, practiceId, { assignedTo: sessionUserId });
          } catch (error) {
            console.warn('[WorkspacePage] Failed to assign new conversation', error);
          }
        }
      },
    });
    if (newConversationId && postFailed) {
      showError('Conversation created, but the first message did not send', 'Try sending it again from the thread.');
      // Keep the draft alive so the user's typed message + attachments don't
      // vanish — the conversation now exists, but the composer state still
      // belongs to the draft view until the user retries successfully.
      return;
    }
    if (newConversationId) {
      setDraftConversation(null);
    }
  };

  const draftView = draftConversation ? (
    <DraftConversationView
      contactOptions={composePickerOptions}
      pendingInviteOptions={composePendingInviteOptions}
      isLoadingContacts={composeClientsData.isLoading || composeTeamData.isLoading}
      draftContact={draftConversation.contactUserId
        ? {
          userId: draftConversation.contactUserId,
          name: draftConversation.contactName ?? '',
          email: draftConversation.contactEmail,
        }
        : null}
      onChangeContact={handleDraftContactChange}
      onSendFirstMessage={handleDraftSendFirstMessage}
      onCancel={handleCancelDraft}
      onInviteContact={() => setIsAddClientDialogOpen(true)}
      onClickPendingInvite={(option) => setPendingInviteOption({
        name: option.label,
        email: typeof option.meta === 'string' && option.meta && option.meta !== 'Waiting for accept' ? option.meta : option.label,
      })}
      fileUploadProps={fileUploadProps}
    />
  ) : null;

  const workspaceFallbackHome = (
    <WorkspaceHomeView
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      onSendMessage={() => handleStartConversation('ASK_QUESTION')}
      onRequestConsultation={() => handleStartConversation('REQUEST_CONSULTATION')}
      recentMessage={recentMessage}
      onOpenRecentMessage={handleOpenRecentMessage}
      consultationTitle={undefined}
      consultationDescription={undefined}
      consultationCta={undefined}
      showConsultationCard={!intakeContactStarted}
    />
  );
  const setupContent = (
    <WorkspaceSetupSection
      workspace={workspace}
      showSidebarPreview={showSidebarPreview}
      completionScore={onboardingProgress?.completionScore ?? 0}
      previewTab={previewTab}
      previewTabOptions={previewTabOptions}
      onPreviewTabChange={setPreviewTab}
      previewSrcs={previewUrls}
      previewReloadKey={previewReloadKey}
      onPreviewSubmit={handleIntakePreviewSubmit}
      setupStatus={setupStatus}
      payoutsCompleteOverride={stripeHasAccount || payoutDetailsSubmitted}
      practice={currentPractice}
      details={setupDetails ?? null}
      setupConversationId={onboardingConversationId}
      setupFields={setupFields}
      applySetupFields={applySetupFields}
      onStartStripeOnboarding={handleStartStripeOnboarding}
      isStripeSubmitting={isStripeSubmitting}
      onSaveBasics={handleSaveBasics}
      onSaveContact={handleSaveContact}
      onSaveServices={handleSaveOnboardingServices}
      logoUploading={logoUploading}
      logoUploadProgress={logoUploadProgress}
      onLogoChange={handleLogoChange}
      onBasicsDraftChange={setDraftBasics}
      onProgressChange={setOnboardingProgress}
      chatAdapter={onboardingConversationId ? {
        messages: onboardingMessageHandling.messages,
        sendMessage: onboardingMessageHandling.sendMessage,
        messagesReady: onboardingMessageHandling.messagesReady,
        isSocketReady: onboardingMessageHandling.isSocketReady,
        hasMoreMessages: onboardingMessageHandling.hasMoreMessages,
        isLoadingMoreMessages: onboardingMessageHandling.isLoadingMoreMessages,
        onLoadMoreMessages: onboardingMessageHandling.loadMoreMessages,
        onToggleReaction: features.enableMessageReactions ? onboardingMessageHandling.toggleMessageReaction : undefined,
        onRequestReactions: onboardingMessageHandling.requestMessageReactions,
      } : null}
      fallbackContent={workspaceFallbackHome}
    />
  );
  const homeContent = (
    <WorkspaceHomeSection
      workspace={workspace}
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      recentMessage={recentMessage}
      intakeContactStarted={intakeContactStarted}
      onOpenRecentMessage={handleOpenRecentMessage}
      onSendMessage={() => handleStartConversation('ASK_QUESTION')}
      onRequestConsultation={() => handleStartConversation('REQUEST_CONSULTATION')}
      dashboardWindow={dashboardWindow}
      summaryStats={summaryStats}
      practiceBillingLoading={practiceBillingLoading}
      practiceBillingError={practiceBillingError}
      recentActivity={recentActivity}
      recentIntakes={recentIntakes}
      onDashboardWindowChange={setDashboardWindow}
      onCreateInvoice={handleDashboardCreateInvoice}
      onOpenInvoice={(invoiceId) => navigate(`${normalizedBase}/invoices/${encodeURIComponent(invoiceId)}`)}
      onViewAllIntakes={() => navigate(`${normalizedBase}/intakes/responses`)}
      onViewIntake={(intakeId) => navigate(`${normalizedBase}/intakes/responses/${encodeURIComponent(intakeId)}`)}
    />
  );
  const showBottomNav = !isIntakeTemplateEditorRoute && shouldShowWorkspaceBottomNav({
    isMobileLayout,
    workspace,
    view,
  });
  const activeHref = getWorkspaceActiveHref({
    view,
    normalizedBase,
    path: location.path,
  });

  const handleNavActivate = () => {
    setIsMobileNavOpen(false);
    setIsInspectorOpen(false);
  };
  const bottomNav = showBottomNav && navConfig.rail.length > 0 ? (
    <NavRail
      variant="bottom"
      items={navConfig.rail}
      activeHref={activeHref}
      onItemActivate={handleNavActivate}
      maxItems={5}
      onOverflowClick={() => setIsMobileNavOpen(true)}
    />
  ) : undefined;

  const sidebarConfig = navConfig.rail.length > 0 && !isIntakeTemplateEditorRoute
    ? buildSidebarConfig(navConfig, workspaceSection)
    : null;

  // Active item resolution for the unified Sidebar:
  // 1. Settings: match path against secondary items by href.
  // 2. If the rail item matching the current path has expandable children, use the
  //    active sub-filter.
  // 3. Else, use the best-matching rail item id (longest matching prefix, so
  //    /matters wins over Home's basePath even though both technically match).
  const sidebarActiveItemId = (() => {
    let bestRailId: string | null = null;
    let bestRailScore = -1;
    for (const item of navConfig.rail) {
      const targets = item.matchHrefs ?? [item.href];
      for (const target of targets) {
        const matches = activeHref === target || activeHref.startsWith(`${target}/`);
        if (!matches) continue;
        if (target.length > bestRailScore) {
          bestRailScore = target.length;
          bestRailId = item.id;
        }
      }
    }

    if (workspaceSection === 'settings' && navConfig.secondary) {
      // Longest-prefix-match: nested settings (e.g. practice/team) must beat
      // their parent (practice). Plain startsWith would always pick whichever
      // item appears first in the array, which is the parent.
      let bestSettingsId: string | null = null;
      let bestSettingsScore = -1;
      for (const section of navConfig.secondary) {
        for (const item of section.items) {
          if (!item.href) continue;
          const matches = activeHref === item.href || activeHref.startsWith(`${item.href}/`);
          if (!matches) continue;
          if (item.href.length > bestSettingsScore) {
            bestSettingsScore = item.href.length;
            bestSettingsId = item.id;
          }
        }
      }
      if (bestSettingsId) return bestSettingsId;
    }

    const matchedSidebarItem = sidebarConfig?.sections
      .flatMap((s) => s.items)
      .find((i) => i.id === bestRailId);
    if (matchedSidebarItem?.children?.length && activeSecondaryFilter) {
      return activeSecondaryFilter;
    }

    return bestRailId ?? workspaceSection;
  })();

  const handleSidebarSubItemSelect = (id: string, item: SecondaryNavItem) => {
    if (workspaceSection === 'settings') {
      if (item.href) navigate(item.href);
      handleNavActivate();
      return;
    }
    // Matters > Engagements is a peer route, not a filter; navigate explicitly.
    if (workspaceSection === 'matters' && id === 'engagements' && item.href) {
      navigate(item.href);
      handleNavActivate();
      return;
    }
    // On /engagements, the Matters sub-items still render (Matters owns the rail
    // section) but selecting one only flips the filter — it doesn't navigate.
    // Force a route back to /matters so the filter actually takes effect.
    if (workspaceSection === 'matters' && view === 'engagements' && item.href) {
      navigate(item.href);
    }
    handleSecondaryFilterSelect(id);
    handleNavActivate();
  };

  const sidebarUser = session?.user
    ? {
        name: session.user.name || session.user.email || 'User',
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }
    : null;

  // Org row data; falls back to the practice slug while the practice record loads
  // so the sidebar always renders an org header on practice/client workspaces.
  const orgDisplayName = currentPractice?.name?.trim() || practiceSlug || null;
  const sidebarOrg = orgDisplayName
    ? {
        name: orgDisplayName,
        plan: 'Practice',
        initial: orgDisplayName.charAt(0).toUpperCase() || 'W',
      }
    : null;

  // Workspace shell header (Pencil rt13A / RuuTq).
  const SECTION_TITLES: Record<WorkspaceSection, string> = {
    home: 'Home',
    conversations: 'Messages',
    intakes: 'Intakes',
    engagements: 'Engagements',
    matters: 'Matters',
    invoices: 'Payments',
    reports: 'Reports',
    settings: 'Settings',
    coverage: 'Coverage',
  };
  const baseHeaderTitle = SECTION_TITLES[workspaceSection] ?? 'Home';
  // Reflect draft state in the shell header so the user has a clear visual
  // anchor for "I'm composing a new conversation" — important on mobile where
  // the listPanel isn't visible alongside the draft view.
  const draftHeaderLabel = draftConversation
    ? (draftConversation.contactName?.trim() || 'New conversation')
    : null;
  const headerTitle = draftHeaderLabel ?? baseHeaderTitle;
  const headerBreadcrumb = orgDisplayName
    ? draftHeaderLabel
      ? [orgDisplayName, baseHeaderTitle, draftHeaderLabel]
      : [orgDisplayName, baseHeaderTitle]
    : undefined;
  const shellHeader = sidebarOrg ? (
    <WorkspaceShellHeader
      orgInitial={sidebarOrg.initial}
      title={headerTitle}
      breadcrumb={headerBreadcrumb}
      onMenuClick={() => setIsMobileNavOpen(true)}
      onSearchClick={() => {
        // TODO: open global search modal; mobile icon-button placeholder.
      }}
      onSearchChange={() => {
        // TODO: wire to global search; desktop input is a placeholder for now.
      }}
    />
  ) : undefined;

  // Sidebar counts come from the /api/practice/:id/sidebar/counts worker
  // endpoint (Pencil GtRGH badges). All sections — matters, intakes, inbox,
  // payments, files — are computed server-side; the active workspaceSection
  // determines which sub-counts (active/closed/pending/etc.) get written into
  // the map for the visible expanded rail item.
  const { counts: sidebarCounts } = useSidebarCounts(
    isPracticeWorkspace ? practiceId : null,
    workspaceSection,
    { enabled: isPracticeWorkspace },
  );

  // Build the per-workspace sidebar as a function so we can render it twice —
  // once for the desktop column (respects collapsed state) and once for the
  // mobile drawer (always expanded so the rail icons don't show in the overlay).
  const renderSidebarTree = (forceExpanded: boolean) => {
    if (!sidebarConfig || !sidebarOrg || !practiceSlug) return undefined;
    const commonProps = {
      org: { name: sidebarOrg.name, initial: sidebarOrg.initial, subtitle: sidebarOrg.plan },
      user: sidebarUser,
      collapsed: isDesktopSidebarCollapsed,
      forceExpanded,
      onToggleCollapsed: () => setIsDesktopSidebarCollapsed((v) => !v),
      onItemActivate: handleNavActivate,
      activeItemId: sidebarActiveItemId,
      workspaceSection,
      onSecondaryItemClick: handleSidebarSubItemSelect,
    };
    return isPracticeWorkspace ? (
      <PracticeSidebar
        {...commonProps}
        practiceSlug={practiceSlug}
        services={practiceDetails?.services ?? currentPractice?.services}
        counts={sidebarCounts}
      />
    ) : (
      <ClientSidebar {...commonProps} practiceSlug={practiceSlug} />
    );
  };
  const sidebarNav = renderSidebarTree(false);
  const mobileSidebarNav = renderSidebarTree(true);
  const showMobileMenuButton = shouldShowWorkspaceMobileMenuButton({
    isMobileLayout,
    hasSecondaryNav: Boolean(navConfig.secondary?.length),
    workspaceSection,
    view,
    isPracticeWorkspace,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
  });
  // The global WorkspaceShellHeader provides the mobile menu button now, so the
  // per-section mobile top bar no longer needs its own hamburger.
  void showMobileMenuButton;
  const suppressShellCreateButton = view === 'matters';
  const mobileCreateButton = primaryCreateAction && showMobileMenuButton && !suppressShellCreateButton ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={primaryCreateAction.onClick}
      aria-label={primaryCreateAction.label}
      icon={primaryCreateAction.icon ?? Plus}
      iconClassName="h-5 w-5"
    />
  ) : null;
  const desktopCreateButton = primaryCreateAction && !suppressShellCreateButton ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={primaryCreateAction.onClick}
      aria-label={primaryCreateAction.label}
      icon={primaryCreateAction.icon ?? Plus}
      iconClassName="h-5 w-5"
    />
  ) : null;
  const detailInspectorOpen = Boolean(inspectorTarget) && isInspectorOpen;
  const toggleDetailInspector = inspectorTarget ? () => setIsInspectorOpen((prev) => !prev) : undefined;
  const workspacePrefetchData: WorkspacePrefetchData = {
    mattersData: mattersDataForView, // filtered for the list view
    contactsData,
  };
  // First load done implied by `!isLoading` post-Phase-C3 (isLoading is permanently
  // false after the first response, so a falsy isLoading equals "have loaded").
  const shouldShowDesktopMattersListPanel = !(
    layoutMode === 'desktop'
    && view === 'matters'
    && !mattersDataForView.isLoading
    && !mattersDataForView.error
    && mattersDataForView.items.length === 0
  );
  const shouldShowDesktopContactsListPanel = !(
    layoutMode === 'desktop'
    && view === 'contacts'
    && activeSecondaryFilter !== 'contacts-pending'
    && !contactsData.isLoading
    && !contactsData.error
    && contactsData.items.length === 0
  );
  const shouldShowDesktopInvoicesListPanel = view === 'invoices' && hasDesktopInvoiceListItems !== false;
  const matterListIsEmpty = layoutMode === 'desktop'
    && view === 'matters'
    && !mattersDataForView.isLoading
    && !mattersDataForView.error
    && mattersDataForView.items.length === 0;
  // Pencil oYsFt mobile tab bar — practice mobile sees segmented filters
  // (Your Messages / Unassigned / All) above the search input. On desktop the
  // same filters live in the sidebar's secondary nav, so tabs are mobile-only.
  const mobileMessageTabs = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    if (layoutMode === 'desktop') return null;
    // Short single-word labels keep all three tabs visible without truncation
    // on a 390-wide viewport ("Your Messages" + "Unassigned" used to overflow).
    const options = [
      { value: 'your-inbox', label: 'Yours' },
      { value: 'unassigned', label: 'Unassigned' },
      { value: 'all', label: 'All' },
    ] as const;
    const value = activeSecondaryFilter && options.some((o) => o.value === activeSecondaryFilter)
      ? activeSecondaryFilter
      : 'your-inbox';
    return {
      value,
      options,
      onChange: (next: string) => handleSecondaryFilterSelect(next),
    };
  }, [isPracticeWorkspace, layoutMode, activeSecondaryFilter, handleSecondaryFilterSelect]);

  const listContent = (
    <MessagesListPanel
      conversations={filteredConversationsWithOptimisticRead}
      previews={conversationPreviews}
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      isLoading={combinedResolvedConversationsLoading}
      error={combinedResolvedConversationsError}
      onSelectConversation={handleSelectConversation}
      onCompose={handleEnterDraftMode}
      draftEntry={draftConversation
        ? { contactName: draftConversation.contactName, contactEmail: draftConversation.contactEmail }
        : null}
      onSelectDraftEntry={handleEnterDraftMode}
      activeConversationId={activeConversationId}
      tabs={mobileMessageTabs}
    />
  );
  const desktopCreate = layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined;
  const mattersContent = resolveViewContent(
    mattersView,
    [mattersStatusFilter, workspacePrefetchData, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <div className="text-sm text-input-placeholder">
          Your active matters will appear here once a practice connects them to your account.
        </div>
        <div className="mt-2 text-sm text-input-placeholder">
          Start a conversation to open a new matter with the practice.
        </div>
      </div>
    </div>
  );
  const intakesContent = resolveViewContent(intakesView, [activeSecondaryFilter] as const);
  const engagementsContent = resolveViewContent(engagementsView, [activeSecondaryFilter] as const);
  const contactsContent = resolveViewContent(
    contactsView,
    [contactsStatusFilter, workspacePrefetchData, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <p className="text-sm text-input-placeholder">
          Manage contacts and relationship statuses here.
        </p>
      </div>
    </div>
  );
  const invoicesContent = resolveViewContent(
    invoicesView,
    [invoicesStatusFilter, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <p className="text-sm text-input-placeholder">
          Invoice details and payments will appear here.
        </p>
      </div>
    </div>
  );
  const reportsTitle = WORKSPACE_REPORT_SECTION_TITLES[activeSecondaryFilter ?? 'all-reports'] ?? WORKSPACE_REPORT_SECTION_TITLES['all-reports'];
  const reportsContent = resolveViewContent(reportsView, [reportsTitle] as const);
  const settingsContent = practiceSlug ? (
    <SettingsContent
      workspace={workspace === 'practice' ? 'practice' : 'client'}
      practiceSlug={practiceSlug}
      view={settingsView}
      appId={settingsAppId}
      intakeTemplateSlug={settingsIntakeTemplateSlug}
      apps={mockApps}
      className="h-full"
    />
  ) : null;
  const coverageContent = (
    <PracticeCoveragePage className="h-full" />
  );
  const chatContent = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {draftView ?? chatView}
    </div>
  );
  const matterListPanel = layoutMode === 'desktop' && (isPracticeWorkspace || isClientWorkspace) && view === 'matters' && shouldShowDesktopMattersListPanel
    ? resolveViewContent(mattersListContent, [mattersStatusFilter, workspacePrefetchData] as const)
    : undefined;
  const contactsListPanel = layoutMode === 'desktop' && isPracticeWorkspace && view === 'contacts' && shouldShowDesktopContactsListPanel
    ? resolveViewContent(contactsListContent, [contactsStatusFilter, workspacePrefetchData] as const)
    : undefined;
  const invoicesListPanel = layoutMode === 'desktop' && (isPracticeWorkspace || isClientWorkspace) && view === 'invoices' && shouldShowDesktopInvoicesListPanel
    ? resolveViewContent(invoicesListContent, [invoicesStatusFilter] as const)
    : undefined;

  const conversationListView = (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <MessagesListPanel
          conversations={filteredConversationsWithOptimisticRead}
          previews={conversationPreviews}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          isLoading={combinedResolvedConversationsLoading}
          error={combinedResolvedConversationsError}
          onSelectConversation={handleSelectConversation}
          onCompose={handleEnterDraftMode}
          draftEntry={draftConversation
            ? { contactName: draftConversation.contactName, contactEmail: draftConversation.contactEmail }
            : null}
          onSelectDraftEntry={handleEnterDraftMode}
          activeConversationId={activeConversationId}
        />
      </Panel>
    </div>
  );
  const conversationListPanel = layoutMode === 'desktop' && (view === 'list' || view === 'conversation')
    ? conversationListView
    : undefined;
  const mobileSectionTitle = (() => {
    if (view === 'conversation') return null;
    if (view === 'reports') {
      return WORKSPACE_REPORT_SECTION_TITLES[activeSecondaryFilter ?? 'all-reports'] ?? WORKSPACE_REPORT_SECTION_TITLES['all-reports'];
    }
    switch (view) {
      case 'list':
        return 'Messages';
      case 'intakes':
        return 'Intakes';
      case 'intakeDetail':
        return null;
      case 'matters':
        return selectedMatterIdFromPath || isMatterNonListRoute ? null : 'Matters';
      case 'contacts':
        return selectedContactIdFromPath ? null : 'Contacts';
      case 'invoices':
        return 'Invoices';
      case 'invoiceCreate':
      case 'invoiceEdit':
      case 'invoiceDetail':
        return null;
      case 'engagements':
        return 'Engagements';
      case 'settings':
        return 'Settings';
      case 'coverage':
        return 'Coverage';
      case 'home':
        return 'Home';
      case 'setup':
        return 'Setup';
      default:
        return null;
    }
  })();
  const mobileSectionTopBar = layoutMode !== 'desktop' && view !== 'conversation' && !isIntakeTemplateEditorRoute && (mobileCreateButton || mobileSectionTitle)
    ? (
      <WorkspaceListHeader
        title={mobileSectionTitle ? <h1 className="workspace-header__title">{mobileSectionTitle}</h1> : undefined}
        centerTitle={Boolean(mobileSectionTitle)}
        controls={mobileCreateButton ?? undefined}
        className="px-1 py-1"
      />
    )
    : undefined;
  const invoiceBuilderTopBar = useInvoiceBuilderTopBar({
    view,
    workspace,
    practiceSlug,
    navigate,
    layoutMode,
    primaryCreateAction,
  });
  const sectionContent = (() => {
    // On mobile the listPanel is hidden — when in draft mode we want the
    // draft view to take over the main pane instead of staying on the list.
    // Desktop keeps the list visible alongside via the dedicated listPanel.
    if (draftView && layoutMode !== 'desktop' && (view === 'list' || view === 'conversation')) {
      return draftView;
    }
    switch (view) {
      case 'setup':
        return setupContent;
      case 'home':
        return homeContent;
      case 'list':
        return listContent;
      case 'intakes':
      case 'intakeDetail':
        return intakesContent;
      case 'engagements':
        return engagementsContent;
      case 'matters':
        return mattersContent;
      case 'contacts':
        return contactsContent;
      case 'invoices':
      case 'invoiceCreate':
      case 'invoiceEdit':
      case 'invoiceDetail':
        return invoicesContent;
      case 'reports':
        return reportsContent;
      case 'settings':
        return settingsContent;
      case 'coverage':
        return coverageContent;
      case 'conversation':
      default:
        return chatContent;
    }
  })();
  const sectionLayout: WorkspaceMainPaneLayout = (() => {
    if (view === 'list' || view === 'conversation') {
      return { kind: 'conversation-shell' };
    }
    if (view === 'intakes' || view === 'intakeDetail' || view === 'engagements') {
      return { kind: 'full-page', overflow: 'hidden' };
    }
    if (view === 'matters') {
      // Practice matters renders a full-width table in the main pane
      // (no master/detail rail); client matters retains the split-detail
      // rail + placeholder pattern.
      if (isPracticeWorkspace) {
        return { kind: 'full-page', overflow: selectedMatterIdFromPath ? 'hidden' : 'auto' };
      }
      return {
        kind: 'split-detail',
        hasSelection: Boolean(selectedMatterIdFromPath || isMatterNonListRoute),
        overflow: selectedMatterIdFromPath ? 'hidden' : 'auto',
        placeholder: {
          titleKey: 'workspace.empty.matter.title',
          descriptionKey: 'workspace.empty.matter.description',
          emptyTitleKey: 'workspace.empty.matterEmpty.title',
          emptyDescriptionKey: 'workspace.empty.matterEmpty.description',
          action: layoutMode === 'desktop' ? primaryCreateAction ?? undefined : undefined,
          isEmpty: matterListIsEmpty,
        },
      };
    }
    if (view === 'contacts') {
      return { kind: 'full-page', overflow: 'hidden' };
    }
    if (view === 'invoices' || view === 'invoiceDetail' || view === 'invoiceCreate' || view === 'invoiceEdit') {
      return { kind: 'full-page', overflow: 'auto' };
    }
    if (view === 'reports') {
      return { kind: 'full-page', overflow: 'hidden' };
    }
    return { kind: 'full-page', overflow: 'auto' };
  })();
  const unifiedMainShell = (
    <WorkspaceMainPane
      layoutMode={layoutMode}
      view={view}
      content={sectionContent}
      chatView={draftView ?? chatView}
      layout={sectionLayout}
      topBar={invoiceBuilderTopBar ?? (layoutMode === 'desktop' ? undefined : mobileSectionTopBar)}
      bottomNav={bottomNav}
    />
  );
  // Pencil rxzde context panel: when viewing a practice conversation, render a
  // dedicated three-section panel (Contact / Linked Matter / Recent Activity)
  // instead of the generic InspectorPanel surface. Other entity types keep
  // using InspectorPanel.
  const linkedMatter = useMemo(() => {
    if (!selectedConversation?.matter_id) return null;
    return mattersData.items.find((m) => m.id === selectedConversation.matter_id) ?? null;
  }, [mattersData.items, selectedConversation?.matter_id]);
  const conversationContextPanel = isPracticeWorkspace
    && inspectorTarget?.entityType === 'conversation'
    ? (
      <ConversationContextPanel
        conversation={selectedConversation}
        matter={linkedMatter}
        practiceName={practiceName}
        onOpenMatter={(matterId) => navigate(`${normalizedBase}/matters/${encodeURIComponent(matterId)}`)}
        onDeleteConversation={selectedConversation
          ? () => setConversationPendingDelete(selectedConversation)
          : undefined}
      />
    )
    : null;
  const inspectorPanel = conversationContextPanel ?? (inspectorTarget ? (
    <InspectorPanel
      key={`${inspectorTarget.entityType}:${inspectorTarget.entityId}`}
      entityType={inspectorTarget.entityType}
      entityId={inspectorTarget.entityId}
      practiceId={workspacePracticeId}
      conversation={selectedConversation}
      conversationMembers={isPracticeWorkspace ? conversationMemberOptions : []}
      isClientView={!isPracticeWorkspace}
      practiceName={practiceName ?? undefined}
      practiceLogo={practiceLogo ?? undefined}
      intakeConversationState={intakeConversationState}
      intakeStatus={intakeStatus}
      onIntakeFieldsChange={onIntakeFieldsChange}
      practiceDetails={practiceDetails}
      {...inspectorActions}
      onClose={() => setIsInspectorOpen(false)}
      matters={mattersData.items}
      matterClientOptions={matterClientOptions}
      matterClients={matterClientPeople}
      matterAssigneeOptions={matterAssigneeOptions}
      {...(inspectorTarget.entityType === 'matter' && selectedMatterInspectorData ? {
        matterClientName: selectedMatterInspectorData.matterClientName,
        matterAssigneeNames: selectedMatterInspectorData.matterAssigneeNames,
        matterBillingLabel: selectedMatterInspectorData.matterBillingLabel,
        matterCreatedLabel: selectedMatterInspectorData.matterCreatedLabel,
        matterUpdatedLabel: selectedMatterInspectorData.matterUpdatedLabel,
        matterClientId: selectedMatterInspectorData.matterClientId,
        matterUrgency: selectedMatterInspectorData.matterUrgency,
        matterResponsibleAttorneyId: selectedMatterInspectorData.matterResponsibleAttorneyId,
        matterOriginatingAttorneyId: selectedMatterInspectorData.matterOriginatingAttorneyId,
        matterCaseNumber: selectedMatterInspectorData.matterCaseNumber,
        matterType: selectedMatterInspectorData.matterType,
        matterCourt: selectedMatterInspectorData.matterCourt,
        matterJudge: selectedMatterInspectorData.matterJudge,
        matterOpposingParty: selectedMatterInspectorData.matterOpposingParty,
        matterOpposingCounsel: selectedMatterInspectorData.matterOpposingCounsel,
      } : {})}
    />
  ) : null);
  const activeInspector = detailInspectorOpen ? inspectorPanel : null;

  const handleConfirmDeleteConversation = async () => {
    const target = conversationPendingDelete;
    if (!target || !practiceId || isDeletingConversation) return;
    try {
      setIsDeletingConversation(true);
      await deleteConversation(target.id, practiceId);
      setConversationPendingDelete(null);
      // If the user is currently viewing the deleted conversation, send them
      // back to the list so we don't 404 on the next /messages call.
      if (activeConversationId === target.id) {
        navigate(withWidgetQuery(conversationsPath));
      }
      await refreshConversations();
    } catch (error) {
      console.error('[WorkspacePage] Failed to delete conversation', error);
      showError('Could not delete conversation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  // Editor views should be full-page without the persistent app navigation sidebar
  const isEditorView = (view === 'settings' && settingsView === 'intake-forms-editor') || view === 'invoiceEdit';
  
  return (
    <>
      <AppShell
        className="bg-transparent h-dvh"
        accentBackdropVariant="none"
        header={shellHeader}
        sidebar={isEditorView ? undefined : sidebarNav}
        desktopSidebarCollapsed={isDesktopSidebarCollapsed}
        mobileSidebar={isEditorView ? undefined : mobileSidebarNav}
        listPanel={conversationListPanel ?? matterListPanel ?? contactsListPanel ?? invoicesListPanel}
        inspector={activeInspector ?? undefined}
        inspectorMobileOpen={detailInspectorOpen && isMobileLayout}
        onInspectorMobileClose={() => setIsInspectorOpen(false)}
        mobileSidebarOpen={isMobileNavOpen}
        onMobileSidebarClose={() => setIsMobileNavOpen(false)}
        main={unifiedMainShell}
        mainClassName="min-h-0 h-full overflow-hidden"
        bottomBar={layoutMode === 'desktop' ? bottomNav : undefined}
        bottomBarClassName={layoutMode === 'desktop' && showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40 bg-transparent' : undefined}
      />
      <AddContactDialog
        practiceId={practiceId ?? null}
        isOpen={isAddClientDialogOpen}
        onClose={() => setIsAddClientDialogOpen(false)}
        onSuccess={async () => {
          // Refresh the picker data so the just-invited contact shows up. The
          // draft view stays open underneath; the invite is also reflected in
          // the pending-invitations section since they haven't accepted yet.
          await composeClientsData.refetch();
          await composePracticeInvitations.refetch();
        }}
      />
      <Dialog
        isOpen={Boolean(pendingInviteOption)}
        onClose={() => setPendingInviteOption(null)}
        title="Invite still pending"
        description={pendingInviteOption
          ? `${pendingInviteOption.email} hasn't accepted the invite yet. They'll be able to chat once they accept.`
          : ''}
      >
        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setPendingInviteOption(null)}
          >
            Got it
          </Button>
        </div>
      </Dialog>
      <Dialog
        isOpen={Boolean(conversationPendingDelete)}
        onClose={() => {
          if (isDeletingConversation) return;
          setConversationPendingDelete(null);
        }}
        title="Delete conversation"
        description="This permanently removes the conversation, its messages, reactions, and audit history. This action cannot be undone."
      >
        <div className="flex flex-col gap-4 px-6 pb-6">
          <p className="text-sm text-input-text">
            Are you sure you want to delete{' '}
            <span className="font-semibold">
              {conversationPendingDelete
                ? (resolveConversationContactName(conversationPendingDelete)
                  || resolveConversationDisplayTitle(conversationPendingDelete, practiceName ?? 'this conversation'))
                : 'this conversation'}
            </span>?
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConversationPendingDelete(null)}
              disabled={isDeletingConversation}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => { void handleConfirmDeleteConversation(); }}
              disabled={isDeletingConversation}
            >
              {isDeletingConversation ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default WorkspacePage;
