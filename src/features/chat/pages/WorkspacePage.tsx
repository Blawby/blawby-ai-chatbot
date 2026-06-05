import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import { useLocation } from 'preact-iso';
import { Menu, Plus, Search, SquarePen } from 'lucide-preact';

import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { WorkspaceHomeSection } from '@/features/chat/components/WorkspaceHomeSection';
import { WorkspaceSetupSection } from '@/features/chat/components/WorkspaceSetupSection';
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
import { LeftRail, BrandMark, FocusDrawer, type LeftRailItem } from '@/design-system/layout';
import { OrgSwitcherMenu } from '@/shared/ui/nav/OrgSwitcherMenu';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { signOut } from '@/shared/utils/auth';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { WorkspaceMainPane } from '@/shared/ui/layout/WorkspaceMainPane';
import type { WorkspaceMainPaneLayout } from '@/shared/ui/layout/WorkspaceMainPane';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { useWorkspaceConversations } from './hooks/useWorkspaceConversations';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { resolveConversationContactName, resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { useWorkspaceSetup } from './hooks/useWorkspaceSetup';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { useConversationPreviews } from './hooks/useConversationPreviews';
import { useWorkspaceInspectorActions } from './hooks/useWorkspaceInspectorActions';
import { useWorkspaceAutoNavigation } from './hooks/useWorkspaceAutoNavigation';
import { useRecentMessage } from './hooks/useRecentMessage';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { isAssistantConversation } from '@/shared/utils/conversationSurface';
import {
  getWorkspaceActiveHref,
  shouldShowWorkspaceBottomNav,
  shouldShowWorkspaceMobileMenuButton,
  WORKSPACE_REPORT_SECTION_TITLES,
} from '@/shared/utils/workspaceShell';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
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
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';

const PracticeAssistantBriefing = lazy(() => import('@/features/chat/components/PracticeAssistantBriefing').then((m) => ({ default: m.PracticeAssistantBriefing })));

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
type ThreadSidebarSection = 'assistant' | 'conversations';

const isRailHrefActive = (currentPath: string, item: LeftRailItem): boolean => {
  const normalizedCurrent = currentPath.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const targets = (item.matchHrefs?.length ? item.matchHrefs : [item.href]).map((href) => href.replace(/\/+$/, '') || '/');

  return targets.some((target) => normalizedCurrent === target || normalizedCurrent.startsWith(`${target}/`));
};

const getRailItemMatchScore = (currentPath: string, item: LeftRailItem): number => {
  const normalizedCurrent = currentPath.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const targets = (item.matchHrefs?.length ? item.matchHrefs : [item.href]).map((href) => href.replace(/\/+$/, '') || '/');

  let bestScore = -1;
  for (const target of targets) {
    if (normalizedCurrent === target || normalizedCurrent.startsWith(`${target}/`)) {
      bestScore = Math.max(bestScore, target.length);
    }
  }
  return bestScore;
};

const SECTION_SIDEBAR_WORKSPACE_SECTIONS = new Set(['settings', 'reports', 'conversations', 'assistant', 'tasks', 'calendar'] as const);

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
  routeReportDeliveryId?: string | null;
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
  reportsView?: ComponentChildren | ((title: string, reportType: string, deliveryId: string | null) => ComponentChildren);
  intakesView?: ComponentChildren | (() => ComponentChildren);
  engagementsView?: ComponentChildren | (() => ComponentChildren);
  tasksView?: ComponentChildren | (() => ComponentChildren);
  filesView?: ComponentChildren;
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

const BLAWBY_AI_OPTION: ComboboxOption = {
  value: '__blawby_ai__',
  label: 'Blawby AI',
  description: 'Practice AI assistant',
  meta: 'AI',
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
  routeReportDeliveryId,
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
  filesView,
  tasksView,
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
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [conversationPendingDelete, setConversationPendingDelete] = useState<Conversation | null>(null);
  const [optimisticallyReadConversationIds, setOptimisticallyReadConversationIds] = useState<Set<string>>(new Set());
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [isMobileRailMenuOpen, setIsMobileRailMenuOpen] = useState(false);
  const [threadSidebarSearch, setThreadSidebarSearch] = useState<Record<ThreadSidebarSection, string>>({
    assistant: '',
    conversations: '',
  });
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false);
  // Draft conversation state. When non-null, the chat area renders
  // DraftConversationView and the messages list shows a synthetic "Draft"
  // entry pinned at the top. POST + assignment + first message are deferred
  // until the user actually sends from the draft view.
  const [draftConversation, setDraftConversation] = useState<
    | { kind: 'user'; contactUserId: string | null; contactName?: string; contactEmail?: string }
    | { kind: 'practice_assistant' }
    | null
  >(null);
  const [pendingInviteOption, setPendingInviteOption] = useState<{ name: string; email: string } | null>(null);
  const navigationInitiatedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(false);
  // When the home page composer submits a question it navigates here with
  // ?ask=<encoded question>. We fire it as a new PRACTICE_ASSISTANT
  // conversation once and clear the param so a refresh doesn't re-send.
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
    isIntakeResponseDetailRoute: _isIntakeResponseDetailRoute,
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedContactIdFromPath,
    isEngagementCreateRoute,
    isEngagementDetailRoute: _isEngagementDetailRoute,
    isEngagementEditRoute,
    isReportDeliveryDetailRoute: _isReportDeliveryDetailRoute,
    previewUrls,
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
    isInitialConversationCheckRef,
    activeConversationMissingNotification,
    setActiveConversationMissingNotification,
    filteredConversations,
    selectedConversation,
  } = useWorkspaceConversations({
    practiceId,
    workspace,
    isPracticeWorkspace,
    isClientWorkspace,
    view,
    workspaceSection,
    activeSecondaryFilter: activeSecondaryFilter ?? undefined,
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

  // Tracks whether the viewport has a dedicated inspector column (xl = 1280px).
  const [isXlViewport, setIsXlViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const handler = (e: MediaQueryListEvent) => setIsXlViewport(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Practice Messages design (Pencil rxzde) keeps the 320px context panel visible
  // by default. Auto-open the inspector when a practice user lands on a
  // conversation on desktop. Re-fires on conversation switch so flipping between
  // threads brings the panel back even if it was closed for a previous one.
  const inspectorTargetId = inspectorTarget?.entityType === 'conversation' ? inspectorTarget.entityId : null;
  useEffect(() => {
    if (!isPracticeWorkspace) return;
    if (!isXlViewport) return;
    if (workspaceSection !== 'conversations') return;
    if (!inspectorTargetId) return;
    setIsInspectorOpen(true);
  }, [isPracticeWorkspace, isXlViewport, workspaceSection, inspectorTargetId]);
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
    activeSecondaryFilter: activeSecondaryFilter ?? undefined,
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
    showError,
    showSuccess,
  });

  useEffect(() => {
    setup.resetForPracticeId();
  }, [practiceId, setup]);

  const { conversationPreviews } = useConversationPreviews({
    filteredConversations,
    mockConversationPreviews,
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
    if (workspaceSection === 'assistant') {
      navigate(`${normalizedBase}/assistant/${encodeURIComponent(conversationId)}`);
      return;
    }
    navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
  }, [conversationsPath, navigate, normalizedBase, onSelectConversationOverride, withWidgetQuery, workspaceSection, resolvedConversations, practiceId]);


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
    return isPracticeWorkspace ? [BLAWBY_AI_OPTION, ...rows] : rows;
  }, [
    composePickerEnabled,
    composeClientsData.items,
    composeTeamData.members,
    sessionUserId,
    isPracticeWorkspace,
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

  const assistantConversations = useMemo(
    () => resolvedConversations.filter(isAssistantConversation),
    [resolvedConversations]
  );
  const conversationThreadSearch = threadSidebarSearch.conversations.trim().toLowerCase();
  const assistantThreadSearch = threadSidebarSearch.assistant.trim().toLowerCase();

  useEffect(() => {
    if (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) {
      setSetupSidebarView((prev) => (prev === 'info' || prev === 'preview' ? prev : 'preview'));
      return;
    }
    setSetupSidebarView('info');
  }, [previewStrongReady, onboardingProgress?.completionScore]);

  const handleStartConversation = useCallback(async (
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
      if (workspaceSection === 'assistant' || mode === 'PRACTICE_ASSISTANT') {
        navigate(`${normalizedBase}/assistant/${encodeURIComponent(conversationId)}`);
      } else {
        navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
      }
      return conversationId;
    } catch (error) {
      // "Session not ready" — the toast was already shown by MainApp, so finish gracefully.
      if (error instanceof SessionNotReadyError) return undefined;
      console.error('[WorkspacePage] Failed to start conversation:', error);
      showError('Unable to start conversation', 'Please try again in a moment.');
      return undefined;
    }
  }, [
    conversationsPath,
    isPracticeWorkspace,
    layoutMode,
    navigate,
    normalizedBase,
    onStartNewConversation,
    refreshConversations,
    resolvedConversations,
    showError,
    withWidgetQuery,
    workspace,
    workspaceSection,
  ]);

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`));
      return;
    }
    navigate(withWidgetQuery(conversationsPath));
  };

  const handleHomeAssistantAsk = useCallback((question: string) => {
    try { sessionStorage.setItem('blawby:pending_ask', question); } catch { /* ignore */ }
    void handleStartConversation('PRACTICE_ASSISTANT', {
      forceNew: true,
      additionalParticipantUserIds: [],
      additionalMetadata: { source: 'practice_assistant', mode: 'PRACTICE_ASSISTANT' },
    });
  }, [handleStartConversation]);

  const handleEnterDraftMode = useCallback(() => {
    setDraftConversation((prev) => prev ?? { kind: 'user', contactUserId: null });
  }, []);

  const handleCancelDraft = () => {
    setDraftConversation(null);
    setPendingInviteOption(null);
  };

  const handleDraftContactChange = (next: import('@/features/chat/components/DraftConversationView').DraftContact) => {
    if (!next) {
      setDraftConversation((prev) => prev?.kind === 'user'
        ? { ...prev, contactUserId: null, contactName: undefined, contactEmail: undefined }
        : null);
      return;
    }
    if (next.kind === 'practice_assistant') {
      setDraftConversation(null);
      void handleStartConversation('PRACTICE_ASSISTANT', {
        forceNew: true,
        additionalParticipantUserIds: [],
        additionalMetadata: { source: 'practice_assistant', mode: 'PRACTICE_ASSISTANT' },
      });
      return;
    }
    // kind === 'user' — jump to existing 1-on-1 thread if one exists
    if (sessionUserId) {
      const existing = resolvedConversations.find((conversation) => {
        if (isAssistantConversation(conversation)) return false;
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
      kind: 'user',
      contactUserId: next.userId,
      contactName: next.name,
      contactEmail: next.email,
    });
  };

  const handleDraftSendFirstMessage = async (message: string, attachments: FileAttachment[] = []) => {
    if (!draftConversation || !practiceId) return;
    if (draftConversation.kind !== 'user' || !draftConversation.contactUserId) return;
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
      // Throw so DraftConversationView's catch fires and keeps the composer
      // text + attachments alive — the user can retry from the same draft view.
      throw new Error('first-message-post-failed');
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
      draftContact={
        draftConversation.kind === 'practice_assistant'
          ? { kind: 'practice_assistant' }
          : draftConversation.contactUserId
            ? { kind: 'user', userId: draftConversation.contactUserId, name: draftConversation.contactName ?? '', email: draftConversation.contactEmail }
            : null
      }
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
        onRequestReactions: (id: string) => { void onboardingMessageHandling.requestMessageReactions(id); },
      } : null}
      fallbackContent={workspaceFallbackHome}
    />
  );
  const homeContent = (
    isPracticeWorkspace ? (
      <Suspense fallback={<div className="flex-1" />}>
        <PracticeAssistantBriefing
          practiceId={practiceId}
          practiceSlug={practiceSlug}
          practiceName={practiceName}
          onAsk={handleHomeAssistantAsk}
        />
      </Suspense>
    ) : (
      <WorkspaceHomeSection
        workspace={workspace}
        practiceId={practiceId}
        practiceSlug={practiceSlug}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        recentMessage={recentMessage}
        intakeContactStarted={intakeContactStarted}
        onOpenRecentMessage={handleOpenRecentMessage}
        onSendMessage={() => handleStartConversation('ASK_QUESTION')}
        onRequestConsultation={() => handleStartConversation('REQUEST_CONSULTATION')}
      />
    )
  );
  const isFullscreenEditorRoute = (view === 'intakes' && isIntakeTemplateEditorRoute)
    || isEngagementCreateRoute
    || isEngagementEditRoute;
  const showBottomNav = !isFullscreenEditorRoute && shouldShowWorkspaceBottomNav({
    isMobileLayout,
    workspace,
    view,
  });
  const activeHref = getWorkspaceActiveHref({
    view,
    normalizedBase,
    path: location.path,
  });

  const handleNavActivate = useCallback(() => {
    setIsInspectorOpen(false);
  }, []);

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

  // WorkspaceShellHeader was removed per locked decision §5 (no top bar in
  // chat-first DS). Section titles now live inside each page's main view.
  // Sidebar counts come from the /api/practice/:id/sidebar/counts worker
  // endpoint (Pencil GtRGH badges). All sections — matters, intakes, inbox,
  // invoices, files — are computed server-side; the active workspaceSection
  // determines which sub-counts (active/closed/pending/etc.) get written into
  // the map for the visible expanded rail item.
  const { counts: sidebarCounts } = useSidebarCounts(
    isPracticeWorkspace ? practiceId : null,
    workspaceSection,
    { enabled: isPracticeWorkspace },
  );

  // Build LeftRail items from the same nav config that PracticeSidebar /
  // ClientSidebar consumed. NavRailItem maps cleanly to LeftRailItem (only
  // icon type differs slightly). sidebarCounts merges into items.badge so
  // unread counts surface in the rail.
  const railItems = useMemo<LeftRailItem[]>(() => {
    if (!practiceSlug || navConfig.rail.length === 0) return [];
    return navConfig.rail.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon as IconComponent,
      href: item.href,
      matchHrefs: item.matchHrefs,
      badge: sidebarCounts?.[item.id] ?? item.badge ?? null,
      variant: item.variant,
      isAction: item.isAction,
      onClick: item.onClick,
      prefetch: item.prefetch,
    }));
  }, [navConfig.rail, practiceSlug, sidebarCounts]);
  const brandMark = sidebarOrg && currentPractice?.id && practiceSlug ? (
    <OrgSwitcherMenu
      org={{
        id: currentPractice.id,
        name: sidebarOrg.name,
        initial: sidebarOrg.initial,
        subtitle: sidebarOrg.plan,
        logoUrl: currentPractice.logo ?? null,
      }}
      collapsed={false}
    />
  ) : sidebarOrg ? (
    <BrandMark word={sidebarOrg.name} className="px-2 py-2" />
  ) : (
    <BrandMark className="px-2 py-2" />
  );

  const profileFooter = sidebarUser ? (
    <SidebarProfileMenu
      user={sidebarUser}
      onAccount={() => practiceSlug && navigate(`${normalizedBase}/settings/account`)}
      onSettings={() => practiceSlug && navigate(`${normalizedBase}/settings/general`)}
      onSignOut={() => void signOut({ navigate })}
    />
  ) : null;
  const showMobileMenuButton = shouldShowWorkspaceMobileMenuButton({
    isMobileLayout,
    hasSecondaryNav: Boolean(navConfig.secondary?.length) || workspaceSection === 'assistant' || workspaceSection === 'conversations',
    workspaceSection,
    view,
    isPracticeWorkspace,
    selectedContactIdFromPath,
  });
  const mobileMenuButton = showMobileMenuButton ? (
    <Button
      type="button"
      variant="icon"
      size="icon-sm"
      onClick={() => setIsMobileRailMenuOpen(true)}
      aria-label="Open navigation"
      icon={Menu}
      iconClassName="h-5 w-5"
    />
  ) : null;
  const suppressShellCreateButton = view === 'matters' || workspaceSection === 'conversations' || workspaceSection === 'assistant';
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
  const handleThreadSidebarSearchChange = useCallback((value: string) => {
    if (workspaceSection !== 'assistant' && workspaceSection !== 'conversations') return;
    setThreadSidebarSearch((prev) => ({ ...prev, [workspaceSection]: value }));
  }, [workspaceSection]);
  const handleAssistantCreate = useCallback(() => {
    void handleStartConversation('PRACTICE_ASSISTANT', {
      forceNew: true,
      additionalParticipantUserIds: [],
      additionalMetadata: { source: 'practice_assistant', mode: 'PRACTICE_ASSISTANT' },
    });
  }, [handleStartConversation]);
  const handleMessagesCreate = useCallback(() => {
    handleEnterDraftMode();
  }, [handleEnterDraftMode]);
  const handleDrawerAssistantCreate = useCallback(() => {
    setIsMobileRailMenuOpen(false);
    handleAssistantCreate();
  }, [handleAssistantCreate]);
  const handleDrawerMessagesCreate = useCallback(() => {
    setIsMobileRailMenuOpen(false);
    handleMessagesCreate();
  }, [handleMessagesCreate]);
  const renderThreadRootState = (
    message: string,
    actionLabel: string | null,
    onAction: (() => void) | null,
  ) => (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="flex max-w-md flex-col items-center text-center">
        <p className="text-sm text-dim-2">
          {message}
        </p>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAction}
            className="mt-4"
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
  const assistantRootContent = workspaceSection === 'assistant' && !activeConversationId && !draftView
    ? renderThreadRootState(
      'Select an assistant thread from the sidebar to open the thread.',
      isPracticeWorkspace ? 'New assistant thread' : null,
      isPracticeWorkspace ? handleAssistantCreate : null,
    )
    : null;
  const conversationsRootContent = workspaceSection === 'conversations' && !activeConversationId && !draftView
    ? renderThreadRootState(
      'Select a conversation from the sidebar to open the thread.',
      isPracticeWorkspace ? 'New message' : null,
      isPracticeWorkspace ? handleMessagesCreate : null,
    )
    : null;
  const buildThreadRailItems = useCallback((
    conversations: Conversation[],
    section: ThreadSidebarSection,
  ): LeftRailItem[] => {
    const searchQuery = (section === 'assistant' ? assistantThreadSearch : conversationThreadSearch).trim();
    const fallbackTitle = typeof practiceName === 'string' ? practiceName.trim() : '';
    const searchNeedle = searchQuery.toLowerCase();

    return conversations
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .filter((conversation) => {
        if (!searchNeedle) return true;
        const title = resolveConversationContactName(conversation)
          || resolveConversationDisplayTitle(conversation, fallbackTitle)
          || '';
        const previewText = (conversationPreviews[conversation.id]?.content ?? conversation.last_message_content ?? '').toString();
        return title.toLowerCase().includes(searchNeedle) || previewText.toLowerCase().includes(searchNeedle);
      })
      .map((conversation) => {
        const title = resolveConversationContactName(conversation)
          || resolveConversationDisplayTitle(conversation, fallbackTitle)
          || 'Conversation';
        const hrefBase = section === 'assistant' ? `${normalizedBase}/assistant` : conversationsPath;
        return {
          id: `${section}-thread-${conversation.id}`,
          label: title,
          href: `${hrefBase}/${encodeURIComponent(conversation.id)}`,
          meta: formatRelativeTime(conversation.updated_at),
          presentation: 'thread' as const,
          unread: Number(conversation.unread_count ?? 0) > 0,
          isActive: activeConversationId === conversation.id,
        };
      });
  }, [
    activeConversationId,
    assistantThreadSearch,
    conversationPreviews,
    conversationThreadSearch,
    conversationsPath,
    normalizedBase,
    practiceName,
  ]);
  const messageThreadRailItems = useMemo(
    () => buildThreadRailItems(filteredConversationsWithOptimisticRead, 'conversations'),
    [buildThreadRailItems, filteredConversationsWithOptimisticRead],
  );
  const assistantThreadRailItems = useMemo(
    () => buildThreadRailItems(assistantConversations, 'assistant'),
    [assistantConversations, buildThreadRailItems],
  );
  const desktopMessagesListContent = (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-dim-2">
      Select a conversation from the sidebar to open the thread.
    </div>
  );
  const desktopCreate = layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined;
  const mattersContent = resolveViewContent(
    mattersView,
    [mattersStatusFilter, workspacePrefetchData, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col card">
      <div className="mx-6 my-6 panel p-5">
        <div className="text-sm text-dim-2">
          Your active matters will appear here once a practice connects them to your account.
        </div>
        <div className="mt-2 text-sm text-dim-2">
          Start a conversation to open a new matter with the practice.
        </div>
      </div>
    </div>
  );
  const intakesContent = resolveViewContent(intakesView, [] as const);
  const engagementsContent = resolveViewContent(engagementsView, [] as const);
  const contactsContent = resolveViewContent(
    contactsView,
    [contactsStatusFilter, workspacePrefetchData, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col card">
      <div className="mx-6 my-6 panel p-5">
        <p className="text-sm text-dim-2">
          Manage contacts and relationship statuses here.
        </p>
      </div>
    </div>
  );
  const invoicesContent = resolveViewContent(
    invoicesView,
    [invoicesStatusFilter, toggleDetailInspector, detailInspectorOpen, desktopCreate] as const,
    <div className="flex flex-1 flex-col card">
      <div className="mx-6 my-6 panel p-5">
        <p className="text-sm text-dim-2">
          Invoice details and payments will appear here.
        </p>
      </div>
    </div>
  );
  const reportsTitle = WORKSPACE_REPORT_SECTION_TITLES[activeSecondaryFilter ?? 'all-reports'] ?? WORKSPACE_REPORT_SECTION_TITLES['all-reports'];
  const reportsReportType = activeSecondaryFilter ?? 'all-reports';
  const reportsDeliveryId = reportsReportType === 'deliveries' ? routeReportDeliveryId ?? null : null;
  const reportsContent = resolveViewContent(reportsView, [reportsTitle, reportsReportType, reportsDeliveryId] as const);
  const tasksContent = resolveViewContent(tasksView, [] as const);
  const filesContent = resolveViewContent(filesView, [] as const);
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
  const mobileSectionTopBar = layoutMode !== 'desktop' && !isFullscreenEditorRoute && (mobileMenuButton || mobileCreateButton)
    ? (
      <WorkspaceListHeader
        leftControls={mobileMenuButton ?? undefined}
        controls={mobileCreateButton ?? undefined}
        className="px-1 py-1"
      />
    )
    : undefined;
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
        return conversationsRootContent ?? (layoutMode === 'desktop'
          ? (draftView ?? desktopMessagesListContent)
          : chatContent);
      case 'intakes':
      case 'intakeDetail':
        return intakesContent;
      case 'engagements':
        return engagementsContent;
      case 'tasks':
        return tasksContent;
      case 'matters':
        return mattersContent;
      case 'contacts':
        return contactsContent;
      case 'invoices':
      case 'invoiceDetail':
        return invoicesContent;
      case 'reports':
        return reportsContent;
      case 'files':
        return filesContent;
      case 'settings':
        return settingsContent;
      case 'coverage':
        return coverageContent;
      case 'assistant':
        return assistantRootContent ?? chatContent;
      case 'conversation':
      default:
        return chatContent;
    }
  })();
  const sectionLayout: WorkspaceMainPaneLayout = (() => {
    if (view === 'list' || view === 'conversation' || view === 'assistant') {
      return { kind: 'conversation-shell' };
    }
    if (view === 'intakes' || view === 'intakeDetail' || view === 'engagements' || view === 'tasks') {
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
    if (view === 'invoices' || view === 'invoiceDetail') {
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
      topBar={layoutMode === 'desktop' ? undefined : mobileSectionTopBar}
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

  const showLeftRail = !isFullscreenEditorRoute && railItems.length > 0;
  const currentSectionRailItem = railItems.reduce<{ item: LeftRailItem | null; score: number }>((best, item) => {
    const score = getRailItemMatchScore(activeHref, item);
    if (score > best.score) return { item, score };
    return best;
  }, { item: null, score: -1 }).item;
  const shouldUseSectionSidebar = Boolean(
    ((navConfig.secondary?.length ?? 0) > 0
      || workspaceSection === 'conversations'
      || workspaceSection === 'assistant')
    && currentSectionRailItem
    && SECTION_SIDEBAR_WORKSPACE_SECTIONS.has(workspaceSection as 'settings' | 'reports' | 'conversations' | 'assistant' | 'tasks' | 'calendar')
  );
  const staticSectionSidebarSections = useMemo(() => (
    (navConfig.secondary ?? []).map((section, index) => ({
      id: `${section.label ?? currentSectionRailItem?.id ?? 'section'}-${index}`,
      label: section.label,
      items: section.items
        .filter((item): item is typeof item & { href: string } => typeof item.href === 'string')
        .map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon as IconComponent | undefined,
          href: item.href,
          badge: typeof item.badge === 'number' ? item.badge : null,
          variant: item.variant,
          isAction: item.isAction,
          isActive: workspaceSection === 'conversations'
            ? item.id === activeSecondaryFilter
            : undefined,
          onClick: workspaceSection === 'conversations'
            ? () => handleSecondaryFilterSelect(item.id)
            : undefined,
          prefetch: item.prefetch,
        })),
    }))
  ), [
    activeSecondaryFilter,
    currentSectionRailItem?.id,
    handleSecondaryFilterSelect,
    navConfig.secondary,
    workspaceSection,
  ]);
  const sectionSidebarSections = useMemo(() => (
    workspaceSection === 'conversations'
      ? [
        ...staticSectionSidebarSections,
        { id: 'conversation-threads', label: 'Threads', items: messageThreadRailItems },
      ]
      : workspaceSection === 'assistant'
        ? [
          ...staticSectionSidebarSections,
          { id: 'assistant-threads', label: 'Threads', items: assistantThreadRailItems },
        ]
        : staticSectionSidebarSections
  ), [assistantThreadRailItems, messageThreadRailItems, staticSectionSidebarSections, workspaceSection]);
  const sectionSidebarBackHref = normalizedBase ?? '/';
  const sectionSidebarBackLabel = workspaceSection === 'assistant' ? 'Back to home' : 'Back to workspace';
  const activeThreadSearchValue = workspaceSection === 'assistant'
    ? threadSidebarSearch.assistant
    : workspaceSection === 'conversations'
      ? threadSidebarSearch.conversations
      : '';
  const sectionSidebarCreateButton = workspaceSection === 'assistant'
    ? (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={handleAssistantCreate}
        aria-label="New assistant thread"
        icon={Plus}
        iconClassName="h-4 w-4"
      />
    )
    : workspaceSection === 'conversations'
      ? (
        <Button
          type="button"
          variant="icon"
          size="icon-sm"
          onClick={handleMessagesCreate}
          aria-label="New message"
          icon={SquarePen}
          iconClassName="h-4 w-4"
        />
      )
      : null;
  const drawerSectionSidebarCreateButton = workspaceSection === 'assistant'
    ? (
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={handleDrawerAssistantCreate}
        aria-label="New assistant thread"
        icon={Plus}
        iconClassName="h-4 w-4"
      />
    )
    : workspaceSection === 'conversations'
      ? (
        <Button
          type="button"
          variant="icon"
          size="icon-sm"
          onClick={handleDrawerMessagesCreate}
          aria-label="New message"
          icon={SquarePen}
          iconClassName="h-4 w-4"
        />
      )
      : null;
  const sectionSidebarHeader = shouldUseSectionSidebar ? (
    <div className="flex flex-col gap-3 px-1 py-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(sectionSidebarBackHref)}
          className="ml-[-2px] inline-flex items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-[rgb(var(--sidebar-text-secondary))] transition-colors hover:text-[rgb(var(--sidebar-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span aria-hidden="true">←</span>
          <span>{sectionSidebarBackLabel}</span>
        </button>
        {sectionSidebarCreateButton}
      </div>
      {(workspaceSection === 'assistant' || workspaceSection === 'conversations') ? (
        <Input
          type="search"
          value={activeThreadSearchValue}
          onChange={handleThreadSidebarSearchChange}
          placeholder={workspaceSection === 'assistant' ? 'Search assistant threads...' : 'Search messages...'}
          aria-label={workspaceSection === 'assistant' ? 'Search assistant threads' : 'Search messages'}
          size="sm"
          icon={Search}
        />
      ) : null}
    </div>
  ) : brandMark;

  const handleMobileRailItemSelect = useCallback((item: LeftRailItem) => {
    if (item.isAction) {
      item.onClick?.();
      setIsMobileRailMenuOpen(false);
      handleNavActivate();
      return;
    }
    if (item.onClick) {
      item.onClick();
      setIsMobileRailMenuOpen(false);
      handleNavActivate();
      return;
    }
    setIsMobileRailMenuOpen(false);
    navigate(item.href);
    handleNavActivate();
  }, [handleNavActivate, navigate]);

  return (
    <>
      <div className="flex h-dvh flex-col lg:flex-row">
        {showLeftRail && (
          <LeftRail
            variant="desktop"
            {...(shouldUseSectionSidebar ? { sections: sectionSidebarSections } : { items: railItems })}
            activeHref={activeHref}
            onItemActivate={handleNavActivate}
            brandMark={sectionSidebarHeader}
            footer={profileFooter}
            className="hidden lg:flex"
          />
        )}
        <AppShell
          className="flex-1 min-w-0 bg-transparent"
          accentBackdropVariant="none"
          listPanel={isFullscreenEditorRoute ? undefined : (matterListPanel ?? contactsListPanel ?? invoicesListPanel)}
          inspector={activeInspector ?? undefined}
          inspectorMobileOpen={detailInspectorOpen && (isMobileLayout || !isXlViewport)}
          onInspectorMobileClose={() => setIsInspectorOpen(false)}
          main={unifiedMainShell}
          mainClassName="min-h-0 h-full overflow-hidden"
          inspectorXlWidth="400px"
        />
        {showBottomNav && showLeftRail && (
          <LeftRail
            variant="mobile"
            items={railItems}
            activeHref={activeHref}
            onItemActivate={handleNavActivate}
            maxItems={5}
            onOverflowClick={() => setIsMobileRailMenuOpen(true)}
            className="lg:hidden"
          />
        )}
      </div>
      <FocusDrawer
        isOpen={isMobileRailMenuOpen}
        onClose={() => setIsMobileRailMenuOpen(false)}
        position="bottom"
        title={shouldUseSectionSidebar ? (currentSectionRailItem?.label ?? 'Section') : 'Navigate'}
        ariaLabel="Workspace navigation"
      >
        <div className="flex flex-col gap-2">
          {shouldUseSectionSidebar ? (
            <div className="mb-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileRailMenuOpen(false);
                    navigate(sectionSidebarBackHref);
                    handleNavActivate();
                  }}
                  className="inline-flex items-center gap-1.5 px-2 py-2 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-dim transition-colors hover:text-ink"
                >
                  <span aria-hidden="true">←</span>
                  <span>{sectionSidebarBackLabel}</span>
                </button>
                {drawerSectionSidebarCreateButton}
              </div>
              {(workspaceSection === 'assistant' || workspaceSection === 'conversations') ? (
                <Input
                  type="search"
                  value={activeThreadSearchValue}
                  onChange={handleThreadSidebarSearchChange}
                  placeholder={workspaceSection === 'assistant' ? 'Search assistant threads...' : 'Search messages...'}
                  aria-label={workspaceSection === 'assistant' ? 'Search assistant threads' : 'Search messages'}
                  size="sm"
                  icon={Search}
                />
              ) : null}
            </div>
          ) : null}
          {(shouldUseSectionSidebar
            ? sectionSidebarSections.flatMap((section) => section.items)
            : railItems
          ).map((item) => {
            const isActive = item.isActive !== undefined ? item.isActive : isRailHrefActive(activeHref, item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleMobileRailItemSelect(item)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  item.presentation === 'thread'
                    ? 'flex w-full flex-col gap-1 rounded-[var(--r-xs)] px-3 py-3 text-left transition-colors'
                    : 'flex w-full items-center gap-3 rounded-[var(--r-xs)] px-3 py-3 text-left text-[14px] transition-colors',
                  isActive
                    ? 'bg-ink text-accent'
                    : 'text-ink-2 hover:bg-rule-soft hover:text-ink'
                )}
              >
                {item.presentation === 'thread' ? (
                  <>
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {item.unread ? <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', 'bg-accent')} /> : null}
                        {item.meta ? (
                          <span className={cn('text-[10px] uppercase tracking-[0.08em]', isActive ? 'text-accent' : 'text-dim')}>
                            {item.meta}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {item.description ? (
                      <span className={cn('truncate text-[11px]', isActive ? 'text-accent' : 'text-dim')}>
                        {item.description}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {item.icon ? <Icon icon={item.icon} className={cn('h-4 w-4 shrink-0', isActive ? 'opacity-100' : 'opacity-70')} /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className={cn('font-mono text-[10px]', isActive ? 'text-accent' : 'text-dim')}>
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </FocusDrawer>
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
          <p className="text-sm text-ink">
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
