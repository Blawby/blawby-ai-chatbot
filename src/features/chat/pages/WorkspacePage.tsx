import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Plus } from 'lucide-preact';

import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { WorkspaceHomeSection } from '@/features/chat/components/WorkspaceHomeSection';
import { WorkspaceSetupSection } from '@/features/chat/components/WorkspaceSetupSection';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { WorkspaceShellHeader } from '@/shared/ui/layout/WorkspaceShellHeader';
import { WorkspaceMainPane } from '@/shared/ui/layout/WorkspaceMainPane';
import type { WorkspaceMainPaneLayout } from '@/shared/ui/layout/WorkspaceMainPane';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { useWorkspaceConversations } from './hooks/useWorkspaceConversations';
import { useWorkspaceNavigation, previewTabOptions } from './hooks/useWorkspaceNavigation';
import { resolveConsultationState } from '@/shared/utils/consultationState';
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
import NavRail from '@/shared/ui/nav/NavRail';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import { SettingsContent, type SettingsView } from '@/features/settings/pages/SettingsContent';
import { mockApps } from '@/features/settings/pages/appsData';
import type { ChatMessageUI } from '../../../../worker/types';
import type { Conversation, ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode, WorkspaceView } from '@/app/MainApp';
import type { UserDetailRecord, UserDetailStatus, PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { IntakeConversationState, DerivedIntakeStatus, IntakeFieldChangeOptions } from '@/shared/types/intake';
import { features } from '@/config/features';

type PreviewTab = 'home' | 'messages' | 'intake';
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
    if (onSelectConversationOverride) {
      onSelectConversationOverride(conversationId);
      return;
    }
    navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
  }, [conversationsPath, navigate, onSelectConversationOverride, withWidgetQuery]);


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
      for (const section of navConfig.secondary) {
        for (const item of section.items) {
          if (item.href && activeHref.startsWith(item.href)) return item.id;
        }
      }
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
      if (item.isAction) {
        handleSettingsActionItemClick(item);
        return;
      }
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
    conversations: 'Inbox',
    intakes: 'Intakes',
    engagements: 'Engagements',
    matters: 'Matters',
    invoices: 'Payments',
    reports: 'Reports',
    settings: 'Settings',
  };
  const headerTitle = SECTION_TITLES[workspaceSection] ?? 'Home';
  const headerBreadcrumb = orgDisplayName ? [orgDisplayName, headerTitle] : undefined;
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

  // Practice areas (Pencil paWrap): first three services + a "More" button.
  // Color cycle from Pencil mockup ($accent-emerald, $accent-cyan, amber).
  const PRACTICE_AREA_COLORS = ['#10B981', '#06B6D4', '#F59E0B', '#A855F7', '#EF4444'];
  const allPracticeAreaNames = (() => {
    const source = practiceDetails?.services ?? currentPractice?.services ?? [];
    if (!Array.isArray(source)) return [] as string[];
    const names = source
      .map((entry: unknown) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const r = entry as Record<string, unknown>;
          if (typeof r.name === 'string') return r.name;
          if (typeof r.title === 'string') return r.title;
        }
        return '';
      })
      .filter((s): s is string => Boolean(s));
    return Array.from(new Set(names));
  })();
  const practiceAreas = allPracticeAreaNames.slice(0, 3).map((name, i) => ({
    name,
    color: PRACTICE_AREA_COLORS[i % PRACTICE_AREA_COLORS.length],
  }));
  const hasMorePracticeAreas = allPracticeAreaNames.length > practiceAreas.length;

  // Build the Sidebar tree as a function so we can render it twice — once for the
  // desktop column (respects collapsed state) and once for the mobile drawer (always
  // expanded so the rail-style icons don't show in the drawer overlay).
  const renderSidebarTree = (forceExpanded: boolean) => sidebarConfig ? (
    <Sidebar
      activeItemId={sidebarActiveItemId}
      onItemActivate={handleNavActivate}
      collapsed={forceExpanded ? false : isDesktopSidebarCollapsed}
      onToggleCollapsed={forceExpanded ? undefined : () => setIsDesktopSidebarCollapsed((v) => !v)}
    >
      {sidebarOrg ? (
        <Sidebar.Org
          name={sidebarOrg.name}
          subtitle={sidebarOrg.plan}
          logo={
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--accent-500))] text-sm font-bold text-[rgb(var(--accent-foreground))]"
            >
              {sidebarOrg.initial}
            </span>
          }
          onCollapseClick={forceExpanded ? undefined : () => setIsDesktopSidebarCollapsed((v) => !v)}
        />
      ) : null}
      {sidebarConfig.sections.map((section, idx) => (
        <Sidebar.Section key={section.label ?? `section-${idx}`} label={section.label} first={idx === 0}>
          {section.items.map((item) => {
            const children = item.children ?? [];
            const railSecondary = navConfig.secondary ?? [];
            const findSecondaryItem = (id: string): SecondaryNavItem | undefined => {
              for (const s of railSecondary) {
                for (const i of s.items) {
                  if (i.id === id) return i;
                  const child = i.children?.find((c) => c.id === id);
                  if (child) return child;
                }
              }
              return undefined;
            };
            return (
              <Sidebar.Item
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                href={item.href}
                badge={item.badge ?? null}
                variant={item.variant}
                isAction={item.isAction}
                onClick={item.onClick}
                expandable={item.expandable || children.length > 0}
              >
                {(() => {
                  let groupIndex = -1;
                  return children.map((child) => {
                    if (child.isGroupLabel) {
                      groupIndex += 1;
                      return (
                        <Sidebar.SubGroupLabel
                          key={child.id}
                          label={child.label}
                          first={groupIndex === 0}
                        />
                      );
                    }
                    return (
                      <Sidebar.SubItem
                        key={child.id}
                        id={child.id}
                        label={child.label}
                        href={child.href}
                        count={child.count ?? null}
                        variant={child.variant}
                        isAction={child.isAction}
                        icon={child.icon}
                        onClick={() => {
                          const matched = findSecondaryItem(child.id);
                          if (matched) handleSidebarSubItemSelect(child.id, matched);
                        }}
                      />
                    );
                  });
                })()}
              </Sidebar.Item>
            );
          })}
        </Sidebar.Section>
      ))}
      {practiceAreas.length > 0 ? (
        <Sidebar.Section label="Practice Areas">
          {practiceAreas.map((pa) => (
            <Sidebar.PracticeAreaItem
              key={pa.name}
              label={pa.name}
              color={pa.color}
              onClick={() => navigate(`${normalizedBase}/settings/practice/coverage`)}
            />
          ))}
          {hasMorePracticeAreas ? (() => {
            const moreCollapsed = forceExpanded ? false : isDesktopSidebarCollapsed;
            return (
              <button
                type="button"
                onClick={() => navigate(`${normalizedBase}/settings/practice/coverage`)}
                title="More"
                aria-label="More practice areas"
                className={
                  moreCollapsed
                    ? 'flex h-9 w-full items-center justify-center rounded-lg text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:bg-[rgb(var(--sidebar-hover-bg))] hover:text-[rgb(var(--sidebar-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
                    : 'flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-xs text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:text-[rgb(var(--sidebar-text))] hover:bg-[rgb(var(--sidebar-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50'
                }
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                </svg>
                {moreCollapsed ? null : <span>More</span>}
              </button>
            );
          })() : null}
        </Sidebar.Section>
      ) : null}
      {sidebarUser ? (
        <Sidebar.Footer>
          <SidebarProfileMenu
            user={sidebarUser}
            collapsed={forceExpanded ? false : isDesktopSidebarCollapsed}
            onAccount={() => navigate(`${normalizedBase}/settings/account`)}
            onPayments={() => navigate(`${normalizedBase}/invoices`)}
            onSignOut={() => void signOut({ navigate })}
          />
        </Sidebar.Footer>
      ) : null}
    </Sidebar>
  ) : undefined;
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
  const mobileCreateButton = primaryCreateAction && showMobileMenuButton ? (
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
  const desktopCreateButton = primaryCreateAction ? (
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
  const engagementsContent = resolveViewContent(engagementsView, [] as const);
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
      header={shellHeader}
      sidebar={sidebarNav}
      desktopSidebarCollapsed={isDesktopSidebarCollapsed}
      mobileSidebar={mobileSidebarNav}
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
  );
};

export default WorkspacePage;
