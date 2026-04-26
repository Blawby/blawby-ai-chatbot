import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { WorkspaceHomeSection } from '@/features/chat/components/WorkspaceHomeSection';
import { WorkspaceSetupSection } from '@/features/chat/components/WorkspaceSetupSection';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { WorkspaceMainPane } from '@/shared/ui/layout/WorkspaceMainPane';
import type { WorkspaceMainPaneLayout } from '@/shared/ui/layout/WorkspaceMainPane';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { useWorkspaceConversations } from './hooks/useWorkspaceConversations';
import { useWorkspaceNavigation, previewTabOptions } from './hooks/useWorkspaceNavigation';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { useWorkspaceSetup } from './hooks/useWorkspaceSetup';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { useConversationPreviews } from './hooks/useConversationPreviews';
import { useWorkspaceInspectorActions } from './hooks/useWorkspaceInspectorActions';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import {
  getWorkspaceActiveHref,
  shouldShowWorkspaceBottomNav,
  shouldShowWorkspaceMobileMenuButton,
  WORKSPACE_REPORT_SECTION_TITLES,
} from '@/shared/utils/workspaceShell';
import {
  type SecondaryNavItem,
} from '@/shared/config/navConfig';
import NavRail from '@/shared/ui/nav/NavRail';
import SecondaryPanel from '@/shared/ui/nav/SecondaryPanel';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import { SettingsContent, type SettingsView } from '@/features/settings/pages/SettingsContent';
import { mockApps } from '@/features/settings/pages/appsData';
import type { ChatMessageUI } from '../../../../worker/types';
import type { Conversation, ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';
import type { UserDetailRecord, UserDetailStatus, PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeConversationState, DerivedIntakeStatus, IntakeFieldChangeOptions } from '@/shared/types/intake';
import { features } from '@/config/features';

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'intakes' | 'intakeDetail' | 'engagements' | 'matters' | 'contacts' | 'invoices' | 'invoiceCreate' | 'invoiceEdit' | 'invoiceDetail' | 'reports' | 'settings';
type PreviewTab = 'home' | 'messages' | 'intake';
type WorkspacePrefetchData = {
  mattersData?: {
    items: BackendMatter[];
    isLoaded: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: (signal?: AbortSignal) => Promise<void>;
  };
  contactsData?: {
    items: UserDetailRecord[];
    isLoaded: boolean;
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
  routeInvoiceId?: string | null;
  onStartNewConversation: (
    mode: ConversationMode,
    preferredConversationId?: string,
    options?: { forceCreate?: boolean; silentSessionNotReady?: boolean }
  ) => Promise<string>;
  activeConversationId?: string | null;
  chatView: ComponentChildren;
  mattersView?: ComponentChildren | ((statusFilter: string[], prefetchData?: WorkspacePrefetchData, onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  mattersListContent?: ComponentChildren | ((statusFilter: string[], prefetchData?: WorkspacePrefetchData) => ComponentChildren);
  contactsView?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData, onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  contactsListContent?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData) => ComponentChildren);
  invoicesView?: ComponentChildren | ((statusFilter: string[], onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  invoicesListContent?: ComponentChildren | ((statusFilter: string[]) => ComponentChildren);
  reportsView?: ComponentChildren | ((title: string) => ComponentChildren);
  intakesView?: ComponentChildren | ((activeFilter: string | null) => ComponentChildren);
  engagementsView?: ComponentChildren | (() => ComponentChildren);
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
  routeInvoiceId: _,
  onStartNewConversation,
  activeConversationId = null,
  chatView,
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
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const handleSettingsActionItemClick = useCallback((item: SecondaryNavItem) => {
    if (item.id === 'sign-out') {
      void signOut({ navigate });
    }
  }, [navigate]);
  const navigationInitiatedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(false);
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const intakeContactStarted = useMemo(
    () => hasIntakeContactStarted(messages),
    [messages]
  );
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';

  const { session, isPending: isSessionPending, isAnonymous, activeMemberRole } = useSessionContext();
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
    navigationInitiatedRef.current = false;
    hasAutoNavigatedRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId]);

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
    if (onSelectConversationOverride) {
      onSelectConversationOverride(conversationId);
      return;
    }
    navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
  }, [conversationsPath, navigate, onSelectConversationOverride, withWidgetQuery]);

  // Reset the initial-check ref as we enter the conversations view or when the
  // active conversation changes. This must run before the auto-navigation
  // effect so that the navigation logic sees the reset on view entry / id changes.
  useEffect(() => {
    isInitialConversationCheckRef.current = true;
  }, [view, workspaceSection, activeConversationId, isInitialConversationCheckRef]);

  useEffect(() => {
    if (!isPracticeWorkspace || workspaceSection !== 'conversations' || view !== 'conversation') {
      return;
    }
    // Only perform the auto-navigation on the initial check for this view to
    // avoid background refreshes or later filter changes forcing navigation.
    if (!isInitialConversationCheckRef.current) return;

    if (!activeConversationId || resolvedConversationsLoading || !intakeLookupLoaded || acceptedIntakeConversationsLoading) {
      // Still loading data — defer the initial check until data is ready.
      return;
    }

    if (filteredConversations.some((conversation) => conversation.id === activeConversationId)) {
      isInitialConversationCheckRef.current = false;
      return;
    }

    // Verify whether the conversation truly no longer exists anywhere before
    // navigating. If it still exists in the full resolved list or intake lookup
    // (but is just hidden by filters), surface a non-disruptive notification
    // instead of forcing navigation.
    const existsInResolved = resolvedConversations.some((c) => c.id === activeConversationId);
    const existsInAcceptedIntakes = intakeTriageStatusLookup.byConversationId.has(activeConversationId)
      || acceptedIntakeConversationIds.includes(activeConversationId)
      || acceptedIntakeConversationsRef.current.some((c) => c.id === activeConversationId);

    if (existsInResolved || existsInAcceptedIntakes || resolvedConversationsLoading || !intakeLookupLoaded) {
      setActiveConversationMissingNotification('The selected conversation is currently hidden by filters or still loading.');
      isInitialConversationCheckRef.current = false;
      return;
    }

    const firstConversationId = filteredConversations[0]?.id;
    if (!firstConversationId) {
      navigate(withWidgetQuery(conversationsPath));
      isInitialConversationCheckRef.current = false;
      return;
    }
    handleSelectConversation(firstConversationId);
    isInitialConversationCheckRef.current = false;
  }, [
    activeConversationId,
    acceptedIntakeConversationIds,
    acceptedIntakeConversationsLoading,
    acceptedIntakeConversationsRef,
    conversationsPath,
    filteredConversations,
    handleSelectConversation,
    intakeTriageStatusLookup.byConversationId,
    intakeLookupLoaded,
    isInitialConversationCheckRef,
    isPracticeWorkspace,
    navigate,
    resolvedConversations,
    resolvedConversationsLoading,
    setActiveConversationMissingNotification,
    view,
    withWidgetQuery,
    workspaceSection,
  ]);

  

  useEffect(() => {
    if (!isClientWorkspace || layoutMode !== 'desktop') {
      return;
    }
    if (activeConversationId || hasAutoNavigatedRef.current) {
      return;
    }
    if (resolvedConversationsLoading) return;
    if (navigationInitiatedRef.current) return;

    const firstConversationId = filteredConversations[0]?.id;
    if (!firstConversationId) return;

    navigationInitiatedRef.current = true;
    hasAutoNavigatedRef.current = true;
    handleSelectConversation(firstConversationId);
  }, [
    isClientWorkspace,
    layoutMode,
    activeConversationId,
    resolvedConversationsLoading,
    filteredConversations,
    handleSelectConversation,
  ]);

  const recentMessage = useMemo(() => {
    const fallbackPracticeName = typeof practiceName === 'string'
      ? practiceName.trim()
      : '';
    if (filteredConversations.length > 0) {
      const sorted = [...filteredConversations].sort((a, b) => {
        const aTime = new Date(a.updated_at).getTime();
        const bTime = new Date(b.updated_at).getTime();
        return bTime - aTime;
      });
      const top = sorted.find((conversation) => {
        const preview = conversationPreviews[conversation.id];
        return typeof preview?.content === 'string' && preview.content.trim().length > 0;
      });
      if (top) {
        const preview = conversationPreviews[top.id];
        const previewText = typeof preview?.content === 'string' ? preview.content.trim() : '';
        const clipped = previewText
          ? (previewText.length > 90 ? `${previewText.slice(0, 90)}…` : previewText)
          : 'Open to view messages.';
        const title = resolveConversationDisplayTitle(top, fallbackPracticeName);
        const timestampLabel = formatRelativeTime(top.updated_at);
        return {
          preview: clipped,
          timestampLabel,
          senderLabel: title,
          avatarSrc: practiceLogo ?? null,
          conversationId: top.id
        };
      }
    }
    if (filteredMessages.length === 0) {
      return null;
    }
    const candidate = [...filteredMessages]
      .reverse()
      .find((message) => message.role !== 'system' && typeof message.content === 'string' && message.content.trim().length > 0);
    if (!candidate) {
      return null;
    }
    const trimmedContent = candidate.content.trim();
    const preview = trimmedContent.length > 90
      ? `${trimmedContent.slice(0, 90)}…`
      : trimmedContent;
    const timestampLabel = candidate.timestamp
      ? formatRelativeTime(new Date(candidate.timestamp))
      : '';
    return {
      preview,
      timestampLabel,
      senderLabel: fallbackPracticeName,
      avatarSrc: practiceLogo ?? null,
      conversationId: null
    };
  }, [practiceLogo, practiceName, conversationPreviews, filteredConversations, filteredMessages]);

  useEffect(() => {
    if (!activeConversationMissingNotification) return;
    showError('Conversation', activeConversationMissingNotification);
    setActiveConversationMissingNotification(null);
  }, [activeConversationMissingNotification, setActiveConversationMissingNotification, showError]);

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

  const showSidebarPreview = (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) && setupSidebarView === 'preview';

  useEffect(() => {
    if (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) {
      setSetupSidebarView((prev) => (prev === 'info' || prev === 'preview' ? prev : 'preview'));
      return;
    }
    setSetupSidebarView('info');
  }, [previewStrongReady, onboardingProgress?.completionScore]);

  const handleStartConversation = async (mode: ConversationMode) => {
    try {
      const shouldReuseConversation = mode !== 'REQUEST_CONSULTATION';
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
      const forceCreate = mode === 'REQUEST_CONSULTATION'
        ? !(workspace === 'public' && layoutMode === 'widget')
        : !preferredConversationId;

      const conversationId = await onStartNewConversation(
        mode,
        preferredConversationId,
        forceCreate ? { forceCreate: true } : undefined
      );
      navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
    } catch (error) {
      // "Session not ready" — the toast was already shown by MainApp, so finish gracefully.
      if (error instanceof SessionNotReadyError) return;
      console.error('[WorkspacePage] Failed to start conversation:', error);
      showError('Unable to start conversation', 'Please try again in a moment.');
    }
  };

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`));
      return;
    }
    navigate(withWidgetQuery(conversationsPath));
  };

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
    />
  ) : undefined;

  const sidebarNav = layoutMode === 'desktop' && navConfig.rail.length > 0 && !isIntakeTemplateEditorRoute ? (
    <NavRail
      variant="rail"
      items={navConfig.rail}
      activeHref={activeHref}
      onItemActivate={handleNavActivate}
    />
  ) : undefined;
  const secondaryPanel = navConfig.secondary && navConfig.secondary.length > 0 && !isIntakeTemplateEditorRoute ? (
    <SecondaryPanel
      sections={navConfig.secondary}
      activeHref={activeHref}
      activeItemId={workspaceSection === 'settings' ? undefined : activeSecondaryFilter}
      onActionItemClick={workspaceSection === 'settings' ? handleSettingsActionItemClick : undefined}
      onSelect={workspaceSection === 'settings'
        ? undefined
        : (id) => {
            handleSecondaryFilterSelect(id);
            setIsMobileNavOpen(false);
            setIsInspectorOpen(false);
          }}
      onItemActivate={() => {
        setIsMobileNavOpen(false);
        setIsInspectorOpen(false);
      }}
    />
  ) : undefined;
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
  const mobileMenuButton = showMobileMenuButton ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={() => setIsMobileNavOpen(true)}
      aria-label="Open navigation menu"
      icon={Bars3Icon} iconClassName="h-5 w-5"
    />
  ) : null;
  const mobileCreateButton = primaryCreateAction && showMobileMenuButton ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={primaryCreateAction.onClick}
      aria-label={primaryCreateAction.label}
      icon={primaryCreateAction.icon ?? PlusIcon}
      iconClassName="h-5 w-5"
    />
  ) : null;
  const desktopCreateButton = primaryCreateAction ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={primaryCreateAction.onClick}
      aria-label={primaryCreateAction.label}
      icon={primaryCreateAction.icon ?? PlusIcon}
      iconClassName="h-5 w-5"
    />
  ) : null;
  const detailInspectorOpen = Boolean(inspectorTarget) && isInspectorOpen;
  const toggleDetailInspector = inspectorTarget ? () => setIsInspectorOpen((prev) => !prev) : undefined;
  const workspacePrefetchData: WorkspacePrefetchData = {
    mattersData: mattersDataForView, // filtered for the list view
    contactsData,
  };
  const shouldShowDesktopMattersListPanel = !(
    layoutMode === 'desktop'
    && view === 'matters'
    && mattersDataForView.isLoaded
    && !mattersDataForView.isLoading
    && !mattersDataForView.error
    && mattersDataForView.items.length === 0
  );
  const shouldShowDesktopContactsListPanel = !(
    layoutMode === 'desktop'
    && view === 'contacts'
    && activeSecondaryFilter !== 'contacts-pending'
    && contactsData.isLoaded
    && !contactsData.isLoading
    && !contactsData.error
    && contactsData.items.length === 0
  );
  const shouldShowDesktopInvoicesListPanel = view === 'invoices' && hasDesktopInvoiceListItems !== false;
  const matterListIsEmpty = layoutMode === 'desktop'
    && view === 'matters'
    && mattersDataForView.isLoaded
    && !mattersDataForView.isLoading
    && !mattersDataForView.error
    && mattersDataForView.items.length === 0;
  const listContent = (
    <ConversationListView
      conversations={filteredConversations}
      previews={conversationPreviews}
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      isLoading={combinedResolvedConversationsLoading}
      error={combinedResolvedConversationsError}
      onSelectConversation={handleSelectConversation}
      onSendMessage={() => handleStartConversation('ASK_QUESTION')}
      showSendMessageButton={false /* Permanent UX decision: conversation creation is initiated from guided entry points, not from list headers. */}
      activeConversationId={activeConversationId}
    />
  );
  const mattersContent = (typeof mattersView === 'function'
    ? mattersView(
      mattersStatusFilter,
      workspacePrefetchData,
      toggleDetailInspector,
      detailInspectorOpen,
      layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined
    )
    : mattersView) ?? (
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
  const intakesContent = (typeof intakesView === 'function'
    ? intakesView(activeSecondaryFilter)
    : intakesView) ?? null;
  const engagementsContent = (typeof engagementsView === 'function'
    ? engagementsView()
    : engagementsView) ?? null;
  const contactsContent = (typeof contactsView === 'function'
    ? contactsView(
      contactsStatusFilter,
      workspacePrefetchData,
      toggleDetailInspector,
      detailInspectorOpen,
      layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined
    )
    : contactsView) ?? (
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <p className="text-sm text-input-placeholder">
          Manage contacts and relationship statuses here.
        </p>
      </div>
    </div>
  );
  const invoicesContent = (typeof invoicesView === 'function'
    ? invoicesView(
      invoicesStatusFilter,
      toggleDetailInspector,
      detailInspectorOpen,
      layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined
    )
    : invoicesView) ?? (
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <p className="text-sm text-input-placeholder">
          Invoice details and payments will appear here.
        </p>
      </div>
    </div>
  );
  const reportsTitle = WORKSPACE_REPORT_SECTION_TITLES[activeSecondaryFilter ?? 'all-reports'] ?? WORKSPACE_REPORT_SECTION_TITLES['all-reports'];
  const reportsContent = (typeof reportsView === 'function' ? reportsView(reportsTitle) : reportsView) ?? null;
  const settingsContent = practiceSlug ? (
    <SettingsContent
      workspace={workspace === 'practice' ? 'practice' : 'client'}
      practiceSlug={practiceSlug}
      view={settingsView}
      appId={settingsAppId}
      apps={mockApps}
      className="h-full"
    />
  ) : null;
  const chatContent = (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {chatView}
    </div>
  );
  const matterListPanel = layoutMode === 'desktop' && (isPracticeWorkspace || isClientWorkspace) && view === 'matters' && shouldShowDesktopMattersListPanel
    ? (typeof mattersListContent === 'function'
      ? mattersListContent(mattersStatusFilter, workspacePrefetchData)
      : mattersListContent)
    : undefined;
  const contactsListPanel = layoutMode === 'desktop' && isPracticeWorkspace && view === 'contacts' && shouldShowDesktopContactsListPanel
    ? (typeof contactsListContent === 'function'
      ? contactsListContent(contactsStatusFilter, workspacePrefetchData)
      : contactsListContent)
    : undefined;
  const invoicesListPanel = layoutMode === 'desktop' && (isPracticeWorkspace || isClientWorkspace) && view === 'invoices' && shouldShowDesktopInvoicesListPanel
    ? (typeof invoicesListContent === 'function' ? invoicesListContent(invoicesStatusFilter) : invoicesListContent)
    : undefined;

  const conversationListView = (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <ConversationListView
          conversations={filteredConversations}
          previews={conversationPreviews}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          isLoading={combinedResolvedConversationsLoading}
          error={combinedResolvedConversationsError}
          onSelectConversation={handleSelectConversation}
          onSendMessage={() => handleStartConversation('ASK_QUESTION')}
          showSendMessageButton={false /* Permanent UX decision: conversation creation is initiated from guided entry points, not from list headers. */}
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
      case 'home':
        return 'Home';
      case 'setup':
        return 'Setup';
      default:
        return null;
    }
  })();
  const mobileSectionTopBar = layoutMode !== 'desktop' && view !== 'conversation' && !isIntakeTemplateEditorRoute && (mobileMenuButton || mobileCreateButton || mobileSectionTitle)
    ? (
      <WorkspaceListHeader
        leftControls={mobileMenuButton ?? undefined}
        title={mobileSectionTitle ? <h1 className="workspace-header__title">{mobileSectionTitle}</h1> : undefined}
        centerTitle={Boolean(mobileSectionTitle)}
        controls={mobileCreateButton ?? undefined}
        className="px-1 py-1"
      />
    )
    : undefined;
  // Global invoice draft timestamp shown in the top bar for invoice builder routes.
  const [invoiceDraftSavedAt, setInvoiceDraftSavedAt] = useState<string | null>(null);
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent;
      try {
        const ts = ce?.detail?.timestamp;
        if (!ts) return;
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          setInvoiceDraftSavedAt(d.toLocaleString());
        }
      } catch (_e) {
        // ignore malformed events
      }
    };
    window.addEventListener('invoice:draft-saved', handler as EventListener);
    return () => window.removeEventListener('invoice:draft-saved', handler as EventListener);
  }, []);
  const invoiceBuilderTopBar = (view === 'invoiceCreate' || view === 'invoiceEdit') ? (
    <WorkspaceListHeader
      leftControls={(
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            aria-label={view === 'invoiceEdit' ? 'Close invoice editor' : 'Close invoice composer'}
            onClick={() => {
              if (workspace === 'practice' && practiceSlug) {
                navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices`);
                return;
              }
              if (workspace === 'client' && practiceSlug) {
                navigate(`/client/${encodeURIComponent(practiceSlug)}/invoices`);
                return;
              }
              navigate('/dashboard');
            }}
            icon={XMarkIcon}
            iconClassName="h-5 w-5"
          />
          <div className="h-5 w-px bg-line-glass/30" aria-hidden="true" />
        </div>
      )}
      title={<h1 className="workspace-header__title">{view === 'invoiceEdit' ? 'Edit Invoice' : 'Create Invoice'}</h1>}
      controls={(
        <div className="flex items-center gap-3">
          {invoiceDraftSavedAt ? <div className="text-sm text-input-placeholder">Draft saved at {invoiceDraftSavedAt}</div> : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('invoice:hide-preview', { detail: { force: 'hide' } }))}>
            Hide preview
          </Button>
          {primaryCreateAction ? (
            <Button
              type="button"
              size="sm"
              onClick={primaryCreateAction.onClick}
            >
              {primaryCreateAction.label}
            </Button>
          ) : null}
        </div>
      )}
      className={layoutMode === 'desktop' ? 'px-4 py-2' : 'px-1 py-1'}
    />
  ) : undefined;
  const sectionContent = (() => {
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
      chatView={chatView}
      layout={sectionLayout}
      topBar={invoiceBuilderTopBar ?? (layoutMode === 'desktop' ? undefined : mobileSectionTopBar)}
      bottomNav={bottomNav}
    />
  );
  const inspectorPanel = inspectorTarget ? (
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
  ) : null;
  const activeInspector = detailInspectorOpen ? inspectorPanel : null;
  return (
    <AppShell
      className="bg-transparent h-dvh"
      accentBackdropVariant="none"
      sidebar={sidebarNav}
      secondarySidebar={secondaryPanel}
      listPanel={conversationListPanel ?? matterListPanel ?? contactsListPanel ?? invoicesListPanel}
      inspector={activeInspector ?? undefined}
      inspectorMobileOpen={detailInspectorOpen && isMobileLayout}
      onInspectorMobileClose={() => setIsInspectorOpen(false)}
      mobileSecondaryNavOpen={isMobileNavOpen}
      onMobileSecondaryNavClose={() => setIsMobileNavOpen(false)}
      main={unifiedMainShell}
      mainClassName="min-h-0 h-full overflow-hidden"
      bottomBar={layoutMode === 'desktop' ? bottomNav : undefined}
      bottomBarClassName={layoutMode === 'desktop' && showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40 bg-transparent' : undefined}
    />
  );
};

export default WorkspacePage;
