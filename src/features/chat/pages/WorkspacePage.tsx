import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import axios from 'axios';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { SessionNotReadyError } from '@/shared/types/errors';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import { WorkspaceHomeSection } from '@/features/chat/components/WorkspaceHomeSection';
import { WorkspaceSetupSection } from '@/features/chat/components/WorkspaceSetupSection';
import { usePracticeBillingData, type BillingWindow } from '@/features/practice-dashboard/hooks/usePracticeBillingData';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { WorkspaceMainPane } from '@/shared/ui/layout/WorkspaceMainPane';
import type { WorkspaceMainPaneLayout } from '@/shared/ui/layout/WorkspaceMainPane';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import type { WorkspacePlaceholderAction } from '@/shared/ui/layout/WorkspacePlaceholderState';
import type { ComboboxOption } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';
import { useConversations } from '@/shared/hooks/useConversations';
import {
  addConversationTag,
  fetchLatestConversationMessage,
  removeConversationTag,
  updateConversationMetadata,
  updateConversationTriage,
} from '@/shared/lib/conversationApi';
import { 
  createConnectedAccount, 
  getOnboardingStatusPayload, 
  updateConversationMatter 
} from '@/shared/lib/apiClient';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';
import { resolveConsultationState } from '@/shared/utils/consultationState';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useMattersData } from '@/shared/hooks/useMattersData';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { useMessageHandling } from '@/shared/hooks/useMessageHandling';
import {
  type BasicsFormValues,
  type ContactFormValues,
  type OnboardingProgressSnapshot,
  type OnboardingSaveActionsSnapshot,
} from '@/features/practice-setup/components/PracticeSetup';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { StripeConnectStatus } from '@/features/onboarding/types';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';
import { uploadPracticeLogo } from '@/shared/utils/practiceLogoUpload';
import { normalizeAccentColor } from '@/shared/utils/accentColors';
import { buildPracticeProfilePayloads } from '@/shared/utils/practiceProfile';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import {
  getWorkspaceActiveHref,
  getWorkspaceActiveSecondaryFilter,
  getWorkspaceDefaultSecondaryFilter,
  getWorkspaceRouteState,
  getWorkspaceSection,
  shouldShowWorkspaceBottomNav,
  shouldShowWorkspaceMobileMenuButton,
  WORKSPACE_REPORT_SECTION_TITLES,
} from '@/shared/utils/workspaceShell';
import {
  CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP,
  CLIENT_INVOICES_FILTER_MAP,
  CLIENT_MATTERS_FILTER_MAP,
  MATTERS_FILTER_MAP,
  PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP,
  PRACTICE_INVOICES_FILTER_MAP,
  type SecondaryNavItem,
  type WorkspaceSection,
  getClientNavConfig,
  getPracticeNavConfig,
  getSettingsNavConfig
} from '@/shared/config/navConfig';
import NavRail from '@/shared/ui/nav/NavRail';
import SecondaryPanel from '@/shared/ui/nav/SecondaryPanel';
import InspectorPanel from '@/shared/ui/inspector/InspectorPanel';
import { SettingsContent, type SettingsView } from '@/features/settings/pages/SettingsContent';
import { mockApps } from '@/features/settings/pages/appsData';
import { listClientInvoices, listInvoices } from '@/features/invoices/services/invoicesService';
import type { ChatMessageUI } from '../../../../worker/types';
import type { Conversation, ConversationMode } from '@/shared/types/conversation';
import type { LayoutMode } from '@/app/MainApp';
import type { UserDetailRecord, UserDetailStatus, PracticeDetails } from '@/shared/lib/apiClient';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import type { MatterStatus } from '@/shared/types/matterStatus';
import type { IntakeConversationState, DerivedIntakeStatus, IntakeFieldChangeOptions } from '@/shared/types/intake';

type WorkspaceView = 'home' | 'setup' | 'list' | 'conversation' | 'matters' | 'clients' | 'invoices' | 'invoiceCreate' | 'invoiceDetail' | 'reports' | 'settings';
type PreviewTab = 'home' | 'messages' | 'intake';
type WorkspacePrefetchData = {
  mattersData?: {
    items: BackendMatter[];
    isLoaded: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: (signal?: AbortSignal) => Promise<void>;
  };
  clientsData?: {
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
  clientsView?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData, onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  clientsListContent?: ComponentChildren | ((statusFilter: UserDetailStatus | null, prefetchData?: WorkspacePrefetchData) => ComponentChildren);
  invoicesView?: ComponentChildren | ((statusFilter: string[], onDetailInspector?: (() => void), detailInspectorOpen?: boolean, detailHeaderLeadingAction?: ComponentChildren) => ComponentChildren);
  invoicesListContent?: ComponentChildren | ((statusFilter: string[]) => ComponentChildren);
  reportsView?: ComponentChildren | ((title: string) => ComponentChildren);
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

const toBillingTypeLabel = (value?: string | null) => {
  if (!value) return null;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  routeInvoiceId: _routeInvoiceId,
  onStartNewConversation,
  activeConversationId = null,
  chatView,
  mattersView,
  mattersListContent,
  clientsView,
  clientsListContent,
  invoicesView,
  invoicesListContent,
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
  const [secondaryFilterBySection, setSecondaryFilterBySection] = useState<Partial<Record<WorkspaceSection, string>>>({});
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [draftBasics, setDraftBasics] = useState<BasicsFormValues | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgressSnapshot | null>(null);
  const [onboardingSaveActions, setOnboardingSaveActions] = useState<OnboardingSaveActionsSnapshot>({
    canSave: false,
    isSaving: false,
    saveError: null,
  });
  const handleOnboardingSaveActionsChange = useCallback((next: OnboardingSaveActionsSnapshot) => {
    setOnboardingSaveActions((prev) => {
      if (
        prev.canSave === next.canSave &&
        prev.isSaving === next.isSaving &&
        prev.saveError === next.saveError &&
        prev.onSaveAll === next.onSaveAll
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const handleSettingsActionItemClick = useCallback((item: SecondaryNavItem) => {
    if (item.id === 'sign-out') {
      void signOut({ navigate });
    }
  }, [navigate]);
  const [paymentPreference, setPaymentPreference] = useState<'yes' | 'no' | null>(null);
  const [onboardingConversationId, setOnboardingConversationId] = useState<string | null>(null);
  const [onboardingConversationRetryTick, setOnboardingConversationRetryTick] = useState(0);
  const onboardingConversationInitRef = useRef(false);
  const navigationInitiatedRef = useRef(false);
  const hasAutoNavigatedRef = useRef(false);
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const intakeContactStarted = useMemo(
    () => hasIntakeContactStarted(messages),
    [messages]
  );
  const isPracticeWorkspace = workspace === 'practice';
  const isClientWorkspace = workspace === 'client';

  const workspaceBasePath = useMemo(() => {
    let base = '/';
    if (workspace === 'practice' && practiceSlug) {
      base = `/practice/${encodeURIComponent(practiceSlug)}`;
    } else if (workspace === 'client' && practiceSlug) {
      base = `/client/${encodeURIComponent(practiceSlug)}`;
    } else if (practiceSlug) {
      base = `/public/${encodeURIComponent(practiceSlug)}`;
    }
    return base.replace(/\/+$/, '') || '/';
  }, [workspace, practiceSlug]);

  const normalizedBase = useMemo(() => 
    workspaceBasePath === '/' ? '' : workspaceBasePath, 
  [workspaceBasePath]);

  const conversationsPath = useMemo(() => {
    return `${normalizedBase}/conversations`;
  }, [normalizedBase]);
  const withWidgetQuery = useCallback((path: string): string => {
    if (workspace !== 'public' || layoutMode !== 'widget') {
      return path;
    }
    return path.includes('?') ? `${path}&v=widget` : `${path}?v=widget`;
  }, [layoutMode, workspace]);
  const {
    selectedMatterIdFromPath,
    isMatterNonListRoute,
    selectedClientIdFromPath,
    peopleRouteKind,
    reportSectionFromPath,
  } = useMemo(() => getWorkspaceRouteState({
    view,
    path: location.path,
    normalizedBase,
    isPracticeWorkspace,
    isClientWorkspace,
  }), [view, location.path, normalizedBase, isPracticeWorkspace, isClientWorkspace]);
  useEffect(() => {
    if (view !== 'clients' || !isPracticeWorkspace) return;
    const legacyPrefix = `${normalizedBase}/clients`;
    if (!location.path.startsWith(legacyPrefix)) return;
    const nextPath = `${normalizedBase}/people${location.path.slice(legacyPrefix.length)}`;
    if (nextPath === location.path) return;
    navigate(nextPath, true);
  }, [isPracticeWorkspace, location.path, navigate, normalizedBase, view]);
  const previewBaseUrl = useMemo(() => {
    const path = practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/public';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }, [practiceSlug]);
  const previewTabOptions: Array<{ id: PreviewTab; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'messages', label: 'Messages' },
    { id: 'intake', label: 'Intake form' }
  ];
  const previewUrls = useMemo(() => {
    const trimmed = previewBaseUrl.endsWith('/')
      ? previewBaseUrl.slice(0, -1)
      : previewBaseUrl;
    return {
      home: trimmed,
      messages: `${trimmed}/conversations`
    };
  }, [previewBaseUrl]);

  const handleDashboardCreateInvoice = useCallback(() => {
    navigate(`${normalizedBase}/invoices/new`);
  }, [navigate, normalizedBase]);

  const workspaceSection: WorkspaceSection = getWorkspaceSection(view);

  const { session, isPending: isSessionPending, activeMemberRole } = useSessionContext();
  const normalizedRole = normalizePracticeRole(activeMemberRole);
  const navConfig = useMemo(() => {
    const slug = (practiceSlug ?? '').trim();
    if (!slug) return { rail: [] };
    const navCtx = {
      practiceSlug: slug,
      role: normalizedRole,
      canAccessPractice: isPracticeWorkspace || normalizedRole !== 'client',
    };
    if (view === 'settings') {
      return getSettingsNavConfig(navCtx);
    }
    if (workspace === 'public') {
      return { rail: [] };
    }
    return isPracticeWorkspace
      ? getPracticeNavConfig(navCtx, workspaceSection)
      : getClientNavConfig(navCtx, workspaceSection);
  }, [isPracticeWorkspace, normalizedRole, practiceSlug, view, workspace, workspaceSection]);
  const defaultSecondaryFilterId = useMemo(() => getWorkspaceDefaultSecondaryFilter({
    workspaceSection,
    isPracticeWorkspace,
    view,
    peopleRouteKind,
    reportSectionFromPath,
    navSecondary: navConfig.secondary,
  }), [workspaceSection, isPracticeWorkspace, view, peopleRouteKind, reportSectionFromPath, navConfig.secondary]);
  const activeSecondaryFilter = useMemo(() => getWorkspaceActiveSecondaryFilter({
    workspaceSection,
    isPracticeWorkspace,
    view,
    peopleRouteKind,
    reportSectionFromPath,
    secondaryFilterBySection,
    defaultSecondaryFilterId,
  }), [workspaceSection, isPracticeWorkspace, view, peopleRouteKind, reportSectionFromPath, secondaryFilterBySection, defaultSecondaryFilterId]);
  const handleSecondaryFilterSelect = useCallback((id: string) => {
    if (workspaceSection === 'settings') return;
    const basePath = normalizedBase || '/';
    if (workspaceSection === 'home') {
      const peopleBasePath = `${basePath}/people`;
      const target = id === 'people-archived'
        ? `${peopleBasePath}/archived`
        : id === 'people-team'
          ? `${peopleBasePath}/team`
          : id === 'people-clients'
            ? `${peopleBasePath}/clients`
        : id === 'people' || id === 'people-all'
          ? peopleBasePath
          : basePath;
      navigate(target);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    if (workspaceSection === 'reports') {
      const reportPathById: Record<string, string> = {
        'all-reports': `${basePath}/reports`,
        'payroll-matter-activity': `${basePath}/reports/payroll-matter-activity`,
        'trust-reconciliation': `${basePath}/reports/trust-reconciliation`,
        'stale-matters': `${basePath}/reports/stale-matters`,
      };
      navigate(reportPathById[id] ?? `${basePath}/reports`);
      setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
      return;
    }
    setSecondaryFilterBySection((prev) => ({ ...prev, [workspaceSection]: id }));
  }, [navigate, normalizedBase, workspaceSection]);
  const conversationAssignedToFilter = workspaceSection === 'conversations'
    ? (isPracticeWorkspace
      ? (activeSecondaryFilter ? PRACTICE_CONVERSATIONS_ASSIGNED_TO_MAP[activeSecondaryFilter] : null)
      : (isClientWorkspace && activeSecondaryFilter ? CLIENT_CONVERSATIONS_ASSIGNED_TO_MAP[activeSecondaryFilter] : null))
    : null;
  const shouldListConversations = isPracticeWorkspace ? true : view !== 'conversation';
  const {
    conversations,
    isLoading: isConversationsLoading,
    error: conversationsError,
    refresh: refreshConversations
  } = useConversations({
    practiceId,
    scope: 'practice',
    list: shouldListConversations,
    enabled: shouldListConversations && Boolean(practiceId) && !mockConversations,
    allowAnonymous: workspace === 'public',
    preferOrgScopedPracticeList: false,
    assignedTo: conversationAssignedToFilter
  });
  const resolvedConversations = mockConversations ?? conversations;
  const resolvedConversationsLoading = mockConversations ? false : isConversationsLoading;
  const resolvedConversationsError = mockConversations ? null : conversationsError;
  const conversationFilterId = workspaceSection === 'conversations' && activeSecondaryFilter
    ? activeSecondaryFilter
    : 'all';

  const filteredConversations = useMemo(() => {
    const activeConversations = resolvedConversations.filter((conversation) => conversation.status === 'active');
    const sessionUserId = session?.user?.id ?? null;
    if (isPracticeWorkspace) {
      if (conversationFilterId === 'your-inbox') {
        if (!sessionUserId) return activeConversations;
        return activeConversations.filter((conversation) => conversation.assigned_to === sessionUserId);
      }
      if (conversationFilterId === 'assigned-to-me') {
        if (!sessionUserId) return activeConversations;
        return activeConversations.filter((conversation) => conversation.assigned_to === sessionUserId);
      }
      if (conversationFilterId === 'unassigned') {
        return activeConversations.filter((conversation) => !conversation.assigned_to || conversation.assigned_to.trim() === '');
      }
      if (conversationFilterId === 'mentions') {
        return activeConversations.filter((conversation) =>
          Array.isArray(conversation.tags) && conversation.tags.some((tag) => tag.toLowerCase().includes('mention'))
        );
      }
      return activeConversations;
    }
    if (isClientWorkspace) {
      if (conversationFilterId === 'your-inbox') {
        return activeConversations.filter((conversation) => Number(conversation.unread_count ?? 0) > 0);
      }
      return activeConversations;
    }
    return activeConversations;
  }, [
    conversationFilterId,
    isClientWorkspace,
    isPracticeWorkspace,
    resolvedConversations,
    session?.user?.id,
  ]);
  const selectedConversation = useMemo(
    () => resolvedConversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, resolvedConversations]
  );
  const inspectorTarget = useMemo(() => {
    if (workspaceSection === 'conversations' && activeConversationId) {
      return { entityType: 'conversation' as const, entityId: activeConversationId };
    }
    if (workspaceSection === 'matters' && selectedMatterIdFromPath) {
      return { entityType: 'matter' as const, entityId: selectedMatterIdFromPath };
    }
    if (view === 'clients' && selectedClientIdFromPath) {
      return { entityType: 'client' as const, entityId: selectedClientIdFromPath };
    }
    return null;
  }, [activeConversationId, selectedClientIdFromPath, selectedMatterIdFromPath, view, workspaceSection]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOpenInspector = () => {
      if (!inspectorTarget) return;
      setIsInspectorOpen(true);
    };
    window.addEventListener('workspace:open-inspector', handleOpenInspector);
    return () => window.removeEventListener('workspace:open-inspector', handleOpenInspector);
  }, [inspectorTarget]);
  const mattersStatusFilter = useMemo<string[]>(() => {
    if (workspaceSection !== 'matters') return [];
    if (!activeSecondaryFilter) return [];
    if (isPracticeWorkspace) {
      return MATTERS_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    if (isClientWorkspace) {
      return CLIENT_MATTERS_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    return [];
  }, [activeSecondaryFilter, isClientWorkspace, isPracticeWorkspace, workspaceSection]);
  const clientsStatusFilter = useMemo<UserDetailStatus | null>(() => null, []);
  const invoicesStatusFilter = useMemo<string[]>(() => {
    if (workspaceSection !== 'invoices') return [];
    if (!activeSecondaryFilter) return [];
    if (isPracticeWorkspace) {
      return PRACTICE_INVOICES_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    if (isClientWorkspace) {
      return CLIENT_INVOICES_FILTER_MAP[activeSecondaryFilter] ?? [];
    }
    return [];
  }, [activeSecondaryFilter, isClientWorkspace, isPracticeWorkspace, workspaceSection]);
  // Always fetch the full unfiltered matters list so the inspector can use it.
  // The mattersStore handles deduplication — this fires once and caches.
  const mattersData = useMattersData(
    practiceId,
    [], // no status filter — fetch all, filter at display time
    { enabled: isPracticeWorkspace || isClientWorkspace }
  );
  // Filtered view for the matters list page (status filter applied after fetch)
  const filteredMattersItems = useMemo(() => {
    if (!mattersStatusFilter || mattersStatusFilter.length === 0) return mattersData.items;
    const accepted = new Set(mattersStatusFilter.map((s) => s.trim().toLowerCase()));
    return mattersData.items.filter((m) => accepted.has(String(m.status ?? '').toLowerCase()));
  }, [mattersData.items, mattersStatusFilter]);
  const mattersDataForView = useMemo(() => ({
    ...mattersData,
    items: filteredMattersItems,
  }), [mattersData, filteredMattersItems]);
  const clientsData = useClientsData(
    practiceId,
    clientsStatusFilter,
    session?.user?.id ?? null,
    { enabled: isPracticeWorkspace && (view === 'clients' || view === 'matters') }
  );
  const selectedMatter = useMemo(
    () => mattersData?.items?.find((matter) => matter.id === selectedMatterIdFromPath) ?? null,
    [mattersData?.items, selectedMatterIdFromPath]
  );
  const matterClientOptions = useMemo<ComboboxOption[]>(
    () => (clientsData?.items ?? [])
      .map((client): ComboboxOption | null => {
        const userId = client.user?.id;
        if (!userId) return null;
        return {
          value: userId,
          label: (() => {
            const name = client.user?.name?.trim();
            return name && name.length ? name : client.user?.email ?? 'Unknown person';
          })(),
          meta: client.user?.email ?? undefined,
        };
      })
      .filter((option): option is ComboboxOption => option !== null),
    [clientsData?.items]
  );
  const matterClientPeople = useMemo(
    () => (clientsData?.items ?? [])
      .map((client) => {
        const userId = client.user?.id;
        if (!userId) return null;
        return {
          userId,
          name: (() => {
            const name = client.user?.name?.trim();
            return name && name.length ? name : client.user?.email ?? 'Unknown person';
          })(),
          email: client.user?.email ?? undefined,
          image: null,
          role: 'client',
        };
      })
      .filter((client) => client !== null),
    [clientsData?.items]
  );
  const selectedMatterInspectorData = useMemo(() => {
    if (!selectedMatter) return null;

    const clientNameById = new Map(
      (clientsData?.items ?? []).map((client) => [
        client.user?.id ?? '',
        client.user?.name ?? client.user?.email ?? '',
      ])
    );
    const clientNameFromId = selectedMatter.client_id ? clientNameById.get(selectedMatter.client_id) : null;
    const selectedMatterRecord = selectedMatter as Record<string, unknown>;
    const selectedMatterClientName = clientNameFromId
      ?? (typeof selectedMatterRecord.client_name === 'string' ? selectedMatterRecord.client_name : null);

    const assigneeNamesFromRows = Array.isArray(selectedMatter.assignees)
      ? selectedMatter.assignees
        .map((assignee) => {
          if (typeof assignee === 'string') {
            return assignee.trim();
          }
          if (!assignee || typeof assignee !== 'object') return '';
          const row = assignee as Record<string, unknown>;
          const name = typeof row.name === 'string'
            ? row.name
            : (typeof row.email === 'string' ? row.email : '');
          return name.trim();
        })
        .filter((name): name is string => name.length > 0)
      : [];
    const selectedMatterAssigneeNames = assigneeNamesFromRows.length > 0
      ? assigneeNamesFromRows
      : (selectedMatter.assignee_ids?.map((id) => `User ${id.slice(0, 6)}`) ?? []);

    return {
      matterClientName: selectedMatterClientName,
      matterAssigneeNames: selectedMatterAssigneeNames,
      matterBillingLabel: toBillingTypeLabel(selectedMatter.billing_type),
      matterCreatedLabel: formatLongDate(selectedMatter.created_at),
      matterUpdatedLabel: selectedMatter.updated_at
        ? `Updated ${formatRelativeTime(selectedMatter.updated_at)}`
        : null,
      matterClientId: selectedMatter.client_id ?? null,
      matterUrgency: typeof selectedMatter.urgency === 'string' ? selectedMatter.urgency : null,
      matterResponsibleAttorneyId: selectedMatter.responsible_attorney_id ?? null,
      matterOriginatingAttorneyId: selectedMatter.originating_attorney_id ?? null,
      matterCaseNumber: selectedMatter.case_number ?? null,
      matterType: selectedMatter.matter_type ?? null,
      matterCourt: selectedMatter.court ?? null,
      matterJudge: selectedMatter.judge ?? null,
      matterOpposingParty: selectedMatter.opposing_party ?? null,
      matterOpposingCounsel: selectedMatter.opposing_counsel ?? null,
    };
  }, [clientsData?.items, selectedMatter]);
  const isMobileLayout = layoutMode !== 'desktop';
  const [hasDesktopInvoiceListItems, setHasDesktopInvoiceListItems] = useState<boolean | null>(null);

  useEffect(() => {
    onboardingConversationInitRef.current = false;
    navigationInitiatedRef.current = false;
    hasAutoNavigatedRef.current = false;
    setOnboardingConversationId(null);
    setOnboardingConversationRetryTick(0);
  }, [practiceId]);

  useEffect(() => {
    if (layoutMode !== 'desktop' || view !== 'invoices') {
      setHasDesktopInvoiceListItems(null);
      return;
    }
    if (!practiceId || (!isPracticeWorkspace && !isClientWorkspace)) {
      setHasDesktopInvoiceListItems(null);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const result = isPracticeWorkspace
          ? await listInvoices(
              practiceId,
              { rules: [], page: 1, pageSize: 1 },
              { signal: controller.signal, statusFilter: invoicesStatusFilter }
            )
          : await listClientInvoices(
              practiceId,
              { rules: [], page: 1, pageSize: 1 },
              { signal: controller.signal, statusFilter: invoicesStatusFilter }
            );

        if (!controller.signal.aborted) {
          setHasDesktopInvoiceListItems(result.total > 0);
        }
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError' || axios.isCancel(error)) {
          return;
        }
        if (!controller.signal.aborted) {
          setHasDesktopInvoiceListItems(true);
        }
      }
    })();

    return () => controller.abort();
  }, [invoicesStatusFilter, isClientWorkspace, isPracticeWorkspace, layoutMode, practiceId, view]);

  const onboardingConversationFromList = useMemo(() => {
    if (!isPracticeWorkspace) return null;
    const match = resolvedConversations.find((conversation) => {
      const mode = conversation.user_info?.mode;
      return mode === 'PRACTICE_ONBOARDING';
    });
    return match?.id ?? null;
  }, [resolvedConversations, isPracticeWorkspace]);

  const createOnboardingConversation = useCallback(async (): Promise<string> => {
    if (!practiceId) throw new Error('Practice context is required');
    const userId = session?.user?.id;
    if (!userId) throw new SessionNotReadyError();

    const params = new URLSearchParams({ practiceId });
    const response = await fetch(`/api/conversations?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        participantUserIds: [userId],
        metadata: { source: 'chat', mode: 'PRACTICE_ONBOARDING', title: 'Practice setup' },
        practiceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json() as { success?: boolean; data?: { id?: string }; error?: string };
    const conversationId = data.data?.id;
    if (!data.success || !conversationId) {
      throw new Error(data.error || 'Failed to create onboarding conversation');
    }

    await updateConversationMetadata(conversationId, practiceId, {
      mode: 'PRACTICE_ONBOARDING',
      title: 'Practice setup',
      source: 'chat',
    });
    return conversationId;
  }, [practiceId, session?.user?.id]);

  useEffect(() => {
    if (!isPracticeWorkspace || view !== 'setup' || !practiceId) return;
    if (isSessionPending) return;
    if (!session?.user?.id) return;
    if (isConversationsLoading) return;
    if (onboardingConversationId) return;
    if (onboardingConversationFromList) {
      setOnboardingConversationId(onboardingConversationFromList);
      onboardingConversationInitRef.current = true;
      return;
    }
    if (onboardingConversationInitRef.current) return;
    onboardingConversationInitRef.current = true;
    void (async () => {
      try {
        const createdId = await createOnboardingConversation();
        setOnboardingConversationId(createdId);
        void refreshConversations();
      } catch (error) {
        onboardingConversationInitRef.current = false;
        const isSessionNotReady =
          (error instanceof Error && error.name === 'SessionNotReadyError') ||
          (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'SessionNotReadyError');
        if (isSessionNotReady) {
          // Background onboarding thread creation can race session hydration.
          // Retry shortly on a state tick so the effect re-runs deterministically.
          setTimeout(() => {
            setOnboardingConversationRetryTick((tick) => tick + 1);
          }, 500);
        } else {
          console.warn('[WorkspacePage] Failed to create onboarding conversation', error);
        }
      }
    })();
  }, [createOnboardingConversation, isConversationsLoading, isPracticeWorkspace, isSessionPending, onboardingConversationFromList, onboardingConversationId, onboardingConversationRetryTick, practiceId, refreshConversations, session?.user?.id, view]);

  const [conversationPreviews, setConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());
  const previewFailureCounts = useRef<Record<string, number>>({});
  const MAX_PREVIEW_ATTEMPTS = 2;
  const shouldLoadConversationPreviews = view === 'home' || view === 'list';

  useEffect(() => {
    fetchedPreviewIds.current = new Set();
    previewFailureCounts.current = {};
    setConversationPreviews(mockConversationPreviews ?? {});
  }, [practiceId, mockConversationPreviews, mockConversations]);

  useEffect(() => {
    if (mockConversationPreviews || mockConversations) return;
    if (!shouldLoadConversationPreviews || resolvedConversations.length === 0 || !practiceId) {
      return;
    }
    if (workspace === 'practice' && (isSessionPending || !session?.user?.id)) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = resolvedConversations.slice(0, 10).filter(
        (conversation) => !fetchedPreviewIds.current.has(conversation.id)
      );
      await Promise.all(toFetch.map(async (conversation) => {
        const message = await fetchLatestConversationMessage(
          conversation.id,
          practiceId
        ).catch(() => null);
        if (message?.content) {
          fetchedPreviewIds.current.add(conversation.id);
          updates[conversation.id] = {
            content: message.content,
            role: message.role,
            createdAt: message.created_at
          };
          return;
        }
        const currentFailures = previewFailureCounts.current[conversation.id] ?? 0;
        const nextFailures = currentFailures + 1;
        previewFailureCounts.current[conversation.id] = nextFailures;
        if (nextFailures >= MAX_PREVIEW_ATTEMPTS) {
          fetchedPreviewIds.current.add(conversation.id);
        }
      }));
      if (isMounted && Object.keys(updates).length > 0) {
        setConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };
    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [mockConversationPreviews, mockConversations, practiceId, resolvedConversations, isSessionPending, session?.user?.id, shouldLoadConversationPreviews, workspace]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    hasAutoNavigatedRef.current = true;
    if (onSelectConversationOverride) {
      onSelectConversationOverride(conversationId);
      return;
    }
    navigate(withWidgetQuery(`${conversationsPath}/${encodeURIComponent(conversationId)}`));
  }, [conversationsPath, navigate, onSelectConversationOverride, withWidgetQuery]);

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
    if (resolvedConversations.length > 0) {
      const sorted = [...resolvedConversations].sort((a, b) => {
        const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
        const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
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
        const timestampLabel = preview?.createdAt
          ? formatRelativeTime(preview.createdAt)
          : (top.last_message_at ? formatRelativeTime(top.last_message_at) : '');
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
  }, [practiceLogo, practiceName, conversationPreviews, resolvedConversations, filteredMessages]);

  const { currentPractice, updatePractice } = usePracticeManagement({ fetchOnboardingStatus: false });
  const { showSuccess, showError } = useToastContext();
  const handleOnboardingMessageError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Onboarding chat error';
    showError('Onboarding', message);
  }, [showError]);
  const onboardingMessageHandling = useMessageHandling({
    practiceId: currentPractice?.id ?? practiceId,
    practiceSlug: practiceSlug ?? undefined,
    conversationId: onboardingConversationId ?? undefined,
    mode: 'PRACTICE_ONBOARDING',
    onError: handleOnboardingMessageError,
  });
  const {
    details: setupDetails,
    updateDetails: updateSetupDetails,
    fetchDetails: fetchSetupDetails,
  } = usePracticeDetails(currentPractice?.id ?? null, null, false);
  const setupStatus = resolvePracticeSetupStatus(currentPractice, setupDetails ?? null);
  const [logoUploadProgress, setLogoUploadProgress] = useState<number | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [dashboardWindow, setDashboardWindow] = useState<BillingWindow>('7d');

  const {
    summaryStats,
    recentActivity,
    recentClients,
    loading: practiceBillingLoading,
    error: practiceBillingError,
  } = usePracticeBillingData({
    practiceId: isPracticeWorkspace ? (currentPractice?.id ?? practiceId ?? null) : null,
    enabled: isPracticeWorkspace && view === 'home',
    matterLimit: 25,
    windowSize: dashboardWindow,
    matters: mattersData.isLoaded ? mattersData.items : undefined,
  });


  useEffect(() => {
    if (!currentPractice?.id) return;
    void fetchSetupDetails();
  }, [currentPractice?.id, fetchSetupDetails]);

  const forcePreviewReload = useCallback(() => {
    setPreviewReloadKey(prev => prev + 1);
  }, []);

  const handleSaveBasics = useCallback(async (
    values: BasicsFormValues,
    options?: { suppressSuccessToast?: boolean }
  ) => {
    if (!currentPractice) {
      const error = new Error('No active practice selected');
      showError('Select a practice first', 'Choose a practice before editing basics.');
      throw error;
    }
    const trimmedName = values.name.trim();
    const trimmedSlug = values.slug.trim();
    const normalizedAccentColor = normalizeAccentColor(values.accentColor);
    if (!normalizedAccentColor) {
      const error = new Error('Accent color must be a valid hex value (for example #3B82F6).');
      showError('Invalid accent color', error.message);
      throw error;
    }
    const practiceUpdates: Record<string, string> = {};

    if (trimmedName && trimmedName !== (currentPractice.name ?? '')) {
      practiceUpdates.name = trimmedName;
    }
    if (trimmedSlug && trimmedSlug !== (currentPractice.slug ?? '')) {
      practiceUpdates.slug = trimmedSlug;
    }
    const accentSource = normalizeAccentColor(setupDetails?.accentColor ?? currentPractice?.accentColor);
    const accentChanged = normalizedAccentColor !== accentSource;

    try {
      if (Object.keys(practiceUpdates).length > 0) {
        await updatePractice(currentPractice.id, practiceUpdates);
      }
      if (accentChanged) {
        await updateSetupDetails({
          ...(accentChanged ? { accentColor: normalizedAccentColor } : {})
        });
      }
      if (Object.keys(practiceUpdates).length > 0 || accentChanged) {
        if (!options?.suppressSuccessToast) {
          showSuccess('Basics updated', 'Your public profile reflects the newest info.');
        }
        forcePreviewReload();
      } else {
        if (!options?.suppressSuccessToast) {
          showSuccess('Up to date', 'Your firm basics already match these details.');
        }
      }
    } catch (error) {
      showError('Basics update failed', error instanceof Error ? error.message : 'Unable to save basics.');
      throw error;
    }
  }, [currentPractice, forcePreviewReload, setupDetails?.accentColor, showError, showSuccess, updatePractice, updateSetupDetails]);

  const handleSaveContact = useCallback(async (
    values: ContactFormValues,
    options?: { suppressSuccessToast?: boolean }
  ) => {
    if (!currentPractice) {
      const error = new Error('No active practice selected');
      showError('Select a practice first', 'Choose a practice before editing contact info.');
      throw error;
    }
    const normalize = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const address = values.address ?? {
      address: '',
      apartment: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    };
    try {
      const { detailsPayload } = buildPracticeProfilePayloads({
        website: normalize(values.website),
        businessEmail: normalize(values.businessEmail),
        businessPhone: normalize(values.businessPhone),
        address: normalize(address.address ?? ''),
        apartment: normalize(address.apartment ?? ''),
        city: normalize(address.city ?? ''),
        state: normalize(address.state ?? ''),
        postalCode: normalize(address.postalCode ?? ''),
        country: normalize(address.country ?? '')
      });
      await updateSetupDetails(detailsPayload);
      if (!options?.suppressSuccessToast) {
        showSuccess('Contact info updated', 'People and receipts will use your latest details.');
      }
      forcePreviewReload();
    } catch (error) {
      showError('Contact update failed', error instanceof Error ? error.message : 'Unable to save contact info.');
      throw error;
    }
  }, [currentPractice, forcePreviewReload, showError, showSuccess, updateSetupDetails]);

  const handleLogoChange = async (files: FileList | File[]) => {
    if (!currentPractice) return;
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setLogoUploading(true);
    setLogoUploadProgress(0);
    try {
      const uploaded = await uploadPracticeLogo(nextFiles[0], currentPractice.id, (progress) => {
        setLogoUploadProgress(progress);
      });
      await updatePractice(currentPractice.id, { logo: uploaded });
      forcePreviewReload();
    } catch (error) {
      showError('Logo upload failed', error instanceof Error ? error.message : 'Unable to upload logo.');
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(null);
    }
  };

  const handleSaveOnboardingServices = useCallback(async (
    nextServices: Array<{ name: string; key?: string }>
  ) => {
    const apiServices = nextServices
      .map((service) => ({
        id: (service.key ?? service.name).trim(),
        name: service.name.trim(),
      }))
      .filter((service) => service.id && service.name);

    const { detailsPayload } = buildPracticeProfilePayloads({ services: apiServices });
    await updateSetupDetails(detailsPayload);
    forcePreviewReload();
  }, [forcePreviewReload, updateSetupDetails]);

  const workspacePracticeId = practiceId ?? currentPractice?.id ?? null;
  const organizationId = practiceId ?? currentPractice?.id ?? null;
  const { members: practiceMembers } = usePracticeTeam(
    workspacePracticeId,
    session?.user?.id ?? null,
    { enabled: isPracticeWorkspace && Boolean(workspacePracticeId) }
  );
  const conversationMemberOptions = useMemo(
    () => practiceMembers
      .filter((member) => member.canMentionInternally)
      .map((member) => ({
        userId: member.userId,
        name: member.name?.trim() ?? '',
        email: member.email,
        image: member.image ?? null,
        role: member.role,
      }))
      .filter((member) => member.userId.trim().length > 0 && member.name.length > 0),
    [practiceMembers]
  );
  const matterAssigneeOptions = useMemo<ComboboxOption[]>(
    () => conversationMemberOptions.map((member) => ({
      value: member.userId,
      label: member.name,
      meta: member.email,
    })),
    [conversationMemberOptions]
  );
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [isStripeSubmitting, setIsStripeSubmitting] = useState(false);

  // Only fetch Stripe/onboarding status when the user is in the settings section.
  // Fetching it on every workspace mount hammers the rate-limited API endpoint.
  const isSettingsSection = workspaceSection === 'settings';

  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; });

  const refreshStripeStatus = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!organizationId || !isSettingsSection) {
      setStripeStatus(null);
      return;
    }
    setIsStripeLoading(true);
    try {
      const payload = await getOnboardingStatusPayload(organizationId, { signal: options?.signal });
      const status = extractStripeStatusFromPayload(payload);
      setStripeStatus(status ?? null);
    } catch (error) {
      if (axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')) return;
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setStripeStatus(null);
        return;
      }
      console.warn('[WorkspacePage] Failed to load payout status:', error);
      showErrorRef.current('Payouts', 'Unable to load payout account status.');
    } finally {
      setIsStripeLoading(false);
    }
  // organizationId and isSettingsSection are both stable primitives
  }, [organizationId, isSettingsSection]);

  // Only fetch when organizationId changes AND we're on the settings section
  useEffect(() => {
    if (!organizationId || !isSettingsSection) return;
    const controller = new AbortController();
    void refreshStripeStatus({ signal: controller.signal });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, isSettingsSection]);

  const handleStartStripeOnboarding = useCallback(async () => {
    if (!organizationId) {
      showError('Payouts', 'Missing active practice.');
      return;
    }
    const email = currentPractice?.businessEmail || session?.user?.email || '';
    if (!email) {
      showError('Payouts', 'Add a business email before submitting details.');
      return;
    }
    if (typeof window === 'undefined') {
      showError('Payouts', 'Unable to start Stripe onboarding in this environment.');
      return;
    }
    const baseUrl = window.location.origin + window.location.pathname;
    const returnUrl = new URL(baseUrl);
    returnUrl.searchParams.set('stripe', 'return');
    const refreshUrl = new URL(baseUrl);
    refreshUrl.searchParams.set('stripe', 'refresh');
    setIsStripeSubmitting(true);
    try {
      const connectedAccount = await createConnectedAccount({
        practiceEmail: email,
        practiceUuid: organizationId,
        returnUrl: returnUrl.toString(),
        refreshUrl: refreshUrl.toString()
      });
      if (connectedAccount.onboardingUrl) {
        const validated = getValidatedStripeOnboardingUrl(connectedAccount.onboardingUrl);
        if (validated) {
          window.open(validated, '_blank');
          return;
        }
        showError('Payouts', 'Received an invalid Stripe onboarding link. Please try again.');
        return;
      }
      showError('Payouts', 'Stripe onboarding link was not provided. Please try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding';
      showError('Payouts', message);
    } finally {
      setIsStripeSubmitting(false);
    }

  }, [organizationId, currentPractice?.businessEmail, session?.user?.email, showError]);

  const handleIntakePreviewSubmit = useCallback(async () => {
    showSuccess('Intake preview submitted', 'This submission is for preview only.');
    forcePreviewReload();
  }, [showSuccess, forcePreviewReload]);

  const payoutDetailsSubmitted = stripeStatus?.details_submitted === true;
  const stripeHasAccount = Boolean(stripeStatus?.stripe_account_id);
  const paymentQuestionAnswered = paymentPreference !== null || payoutDetailsSubmitted || stripeHasAccount;
  const progressFields = onboardingProgress?.fields ?? {};
  const persistedServiceCount = (() => {
    const sources = [progressFields.services, setupDetails?.services, currentPractice?.services];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const count = source.filter((service) => {
        const row = (service ?? {}) as Record<string, unknown>;
        const name = typeof row.name === 'string'
          ? row.name
          : (typeof row.title === 'string' ? row.title : '');
        return name.trim().length > 0;
      }).length;
      if (count > 0) return count;
    }
    return 0;
  })();
  const persistedServiceNames = (() => {
    const sources = [progressFields.services, setupDetails?.services, currentPractice?.services];
    for (const source of sources) {
      if (!Array.isArray(source)) continue;
      const names = source
        .map((service) => {
          const row = (service ?? {}) as Record<string, unknown>;
          const name = typeof row.name === 'string'
            ? row.name
            : (typeof row.title === 'string' ? row.title : '');
          return name.trim();
        })
        .filter((name): name is string => name.length > 0);
      if (names.length > 0) return names;
    }
    return [] as string[];
  })();
  const strongName = (progressFields.name ?? draftBasics?.name ?? currentPractice?.name ?? '').trim();
  const strongDescription = (progressFields.description ?? setupDetails?.description ?? currentPractice?.description ?? '').trim();
  const strongServicesCount = Math.max(
    persistedServiceCount,
    setupStatus.servicesComplete ? 1 : 0
  );
  const strongLogoReady = Boolean(currentPractice?.logo);
  const previewStrongReady = Boolean(
    strongName &&
    strongDescription &&
    strongServicesCount > 0 &&
    strongLogoReady &&
    paymentQuestionAnswered
  );
  const showSidebarPreview = (previewStrongReady || (onboardingProgress?.completionScore ?? 0) >= 80) && setupSidebarView === 'preview';
  const websiteValue = (progressFields.website ?? setupDetails?.website ?? currentPractice?.website ?? '').trim();
  const phoneValue = (progressFields.contactPhone ?? setupDetails?.businessPhone ?? currentPractice?.businessPhone ?? '').trim();
  const emailValue = (progressFields.businessEmail ?? setupDetails?.businessEmail ?? currentPractice?.businessEmail ?? '').trim();
  const accentColorValue = (progressFields.accentColor ?? setupDetails?.accentColor ?? currentPractice?.accentColor ?? '').trim();
  const addressCandidate = (progressFields.address ?? setupDetails?.address ?? currentPractice?.address ?? null) as Record<string, unknown> | null;
  const addressLine1 = typeof addressCandidate?.address === 'string'
    ? addressCandidate.address.trim()
    : typeof addressCandidate?.line1 === 'string'
      ? addressCandidate.line1.trim()
      : '';
  const addressCity = typeof addressCandidate?.city === 'string' ? addressCandidate.city.trim() : '';
  const addressState = typeof addressCandidate?.state === 'string' ? addressCandidate.state.trim() : '';
  const addressPostal = typeof addressCandidate?.postalCode === 'string'
    ? addressCandidate.postalCode.trim()
    : typeof addressCandidate?.postal_code === 'string'
      ? addressCandidate.postal_code.trim()
      : '';
  const addressParts = [addressLine1, [addressCity, addressState].filter(Boolean).join(', '), addressPostal].filter(Boolean);
  const addressValue = addressParts.join(' ').trim();
  const paymentStatusValue = stripeHasAccount || payoutDetailsSubmitted
    ? 'Enabled'
    : paymentPreference === 'yes'
      ? 'Yes (setup started)'
      : paymentPreference === 'no'
        ? 'Not now'
        : 'Not answered';
  const fieldRows = [
    { key: 'name', label: 'Practice name', done: Boolean(strongName), value: strongName || 'Not provided' },
    { key: 'description', label: 'Description', done: Boolean(strongDescription), value: strongDescription || 'Not provided' },
    {
      key: 'services',
      label: 'Services',
      done: strongServicesCount > 0,
      value: strongServicesCount > 0 ? `${strongServicesCount} added` : 'Not provided',
      listValues: persistedServiceNames.length > 0 ? persistedServiceNames : undefined,
    },
    { key: 'website', label: 'Website', done: Boolean(websiteValue), value: websiteValue || 'Not provided' },
    { key: 'contactPhone', label: 'Phone', done: Boolean(phoneValue), value: phoneValue || 'Not provided' },
    { key: 'businessEmail', label: 'Email', done: Boolean(emailValue), value: emailValue || 'Not provided' },
    { key: 'address', label: 'Address', done: Boolean(addressLine1 && addressCity && addressState), value: addressValue || 'Not provided' },
    { key: 'accentColor', label: 'Accent color', done: Boolean(accentColorValue), value: accentColorValue || 'Not provided' },
    { key: 'logo', label: 'Logo', done: strongLogoReady, value: strongLogoReady ? 'Uploaded' : 'Not uploaded' },
    { key: 'payouts', label: 'Payments', done: paymentQuestionAnswered, value: paymentStatusValue },
  ] as const;
  const setupInfoPanelProps = {
    fieldRows,
    canSaveAll: onboardingSaveActions.canSave,
    isSavingAll: onboardingSaveActions.isSaving,
    saveAllError: onboardingSaveActions.saveError,
    onSaveAll: onboardingSaveActions.onSaveAll,
    paymentPreference,
    stripeHasAccount,
    payoutDetailsSubmitted,
    isStripeSubmitting,
    isStripeLoading,
    stripeStatus,
    onSetPaymentPreference: setPaymentPreference,
    onStartStripeOnboarding: handleStartStripeOnboarding,
  } as const;

  useEffect(() => {
    if (stripeHasAccount || payoutDetailsSubmitted) {
      setPaymentPreference((prev) => prev ?? 'yes');
    }
  }, [payoutDetailsSubmitted, stripeHasAccount]);

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
            const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
            const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
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
      setupInfoPanelProps={setupInfoPanelProps}
      setupStatus={setupStatus}
      payoutsCompleteOverride={stripeHasAccount || payoutDetailsSubmitted}
      practice={currentPractice}
      details={setupDetails ?? null}
      onSaveBasics={handleSaveBasics}
      onSaveContact={handleSaveContact}
      onSaveServices={handleSaveOnboardingServices}
      logoUploading={logoUploading}
      logoUploadProgress={logoUploadProgress}
      onLogoChange={handleLogoChange}
      onBasicsDraftChange={setDraftBasics}
      onProgressChange={setOnboardingProgress}
      onSaveActionsChange={handleOnboardingSaveActionsChange}
      chatAdapter={onboardingConversationId ? {
        messages: onboardingMessageHandling.messages,
        sendMessage: onboardingMessageHandling.sendMessage,
        messagesReady: onboardingMessageHandling.messagesReady,
        isSocketReady: onboardingMessageHandling.isSocketReady,
        hasMoreMessages: onboardingMessageHandling.hasMoreMessages,
        isLoadingMoreMessages: onboardingMessageHandling.isLoadingMoreMessages,
        onLoadMoreMessages: onboardingMessageHandling.loadMoreMessages,
        onToggleReaction: onboardingMessageHandling.toggleMessageReaction,
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
      recentClients={recentClients}
      onDashboardWindowChange={setDashboardWindow}
      onCreateInvoice={handleDashboardCreateInvoice}
      onOpenInvoice={(invoiceId) => navigate(`${normalizedBase}/invoices/${encodeURIComponent(invoiceId)}`)}
      onViewAllClients={() => navigate(`${normalizedBase}/people`)}
      onViewClient={(clientId) => navigate(`${normalizedBase}/people/${encodeURIComponent(clientId)}`)}
    />
  );
  const showBottomNav = shouldShowWorkspaceBottomNav({
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

  const sidebarNav = layoutMode === 'desktop' && navConfig.rail.length > 0 ? (
    <NavRail
      variant="rail"
      items={navConfig.rail}
      activeHref={activeHref}
      onItemActivate={handleNavActivate}
    />
  ) : undefined;
  const secondaryPanel = navConfig.secondary && navConfig.secondary.length > 0 ? (
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
    selectedClientIdFromPath,
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
    clientsData,
  };
  const shouldShowDesktopMattersListPanel = !(
    layoutMode === 'desktop'
    && view === 'matters'
    && mattersDataForView.isLoaded
    && !mattersDataForView.isLoading
    && !mattersDataForView.error
    && mattersDataForView.items.length === 0
  );
  const shouldShowDesktopClientsListPanel = !(
    layoutMode === 'desktop'
    && view === 'clients'
    && clientsData.isLoaded
    && !clientsData.isLoading
    && !clientsData.error
    && clientsData.items.length === 0
  );
  const shouldShowDesktopInvoicesListPanel = view === 'invoiceDetail' || hasDesktopInvoiceListItems !== false;
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
      isLoading={resolvedConversationsLoading}
      error={resolvedConversationsError}
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
  const clientsContent = (typeof clientsView === 'function'
    ? clientsView(
      clientsStatusFilter,
      workspacePrefetchData,
      toggleDetailInspector,
      detailInspectorOpen,
      layoutMode === 'desktop' ? desktopCreateButton ?? undefined : undefined
    )
    : clientsView) ?? (
    <div className="flex flex-1 flex-col glass-card">
      <div className="mx-6 my-6 glass-panel p-5">
        <p className="text-sm text-input-placeholder">
          Manage people and relationship statuses here.
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
  const clientsListPanel = layoutMode === 'desktop' && isPracticeWorkspace && view === 'clients' && shouldShowDesktopClientsListPanel
    ? (typeof clientsListContent === 'function'
      ? clientsListContent(clientsStatusFilter, workspacePrefetchData)
      : clientsListContent)
    : undefined;
  const invoicesListPanel = layoutMode === 'desktop' && (isPracticeWorkspace || isClientWorkspace) && (view === 'invoices' || view === 'invoiceDetail') && shouldShowDesktopInvoicesListPanel
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
          isLoading={resolvedConversationsLoading}
          error={resolvedConversationsError}
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
      case 'matters':
        return selectedMatterIdFromPath || isMatterNonListRoute ? null : 'Matters';
      case 'clients':
        return selectedClientIdFromPath ? null : 'People';
      case 'invoices':
        return 'Invoices';
      case 'invoiceCreate':
      case 'invoiceDetail':
        return null;
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
  const mobileSectionTopBar = layoutMode !== 'desktop' && view !== 'conversation' && (mobileMenuButton || mobileCreateButton || mobileSectionTitle)
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
  const invoiceCreateTopBar = view === 'invoiceCreate' ? (
    <WorkspaceListHeader
      leftControls={(
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            aria-label="Close invoice composer"
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
      title={<h1 className="workspace-header__title">Create Invoice</h1>}
      controls={primaryCreateAction ? (
        <Button
          type="button"
          size="sm"
          onClick={primaryCreateAction.onClick}
        >
          {primaryCreateAction.label}
        </Button>
      ) : undefined}
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
      case 'matters':
        return mattersContent;
      case 'clients':
        return clientsContent;
      case 'invoices':
      case 'invoiceCreate':
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
    if (view === 'clients') {
      return { kind: 'full-page', overflow: 'hidden' };
    }
    if (view === 'invoices' || view === 'invoiceDetail' || view === 'invoiceCreate') {
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
      topBar={invoiceCreateTopBar ?? (layoutMode === 'desktop' ? undefined : mobileSectionTopBar)}
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
      onConversationAssignedToChange={isPracticeWorkspace ? async (assignedTo) => {
        if (!selectedConversation?.id) return;
        try {
          await updateConversationTriage(selectedConversation.id, workspacePracticeId, { assignedTo });
          await refreshConversations();
        } catch (error) {
          console.error('[WorkspacePage] Failed to update assignment:', error);
          showError('Update Failed', 'Failed to update conversation assignment.');
        }
      } : undefined}
      onConversationPriorityChange={isPracticeWorkspace ? async (priority) => {
        if (!selectedConversation?.id) return;
        try {
          await updateConversationTriage(selectedConversation.id, workspacePracticeId, { priority });
          await refreshConversations();
        } catch (error) {
          console.error('[WorkspacePage] Failed to update priority:', error);
          showError('Update Failed', 'Failed to update conversation priority.');
        }
      } : undefined}
      onConversationTagsChange={isPracticeWorkspace ? async (nextTags) => {
        if (!selectedConversation?.id) return;
        try {
          const current = new Set((selectedConversation.tags ?? []).map((tag) => tag.trim()).filter(Boolean));
          const next = new Set(nextTags.map((tag) => tag.trim()).filter(Boolean));
          const toAdd = [...next].filter((tag) => !current.has(tag));
          const toRemove = [...current].filter((tag) => !next.has(tag));
          
          for (const tag of toAdd) {
            await addConversationTag(selectedConversation.id, workspacePracticeId, tag);
          }
          for (const tag of toRemove) {
            await removeConversationTag(selectedConversation.id, workspacePracticeId, tag);
          }
          
          await refreshConversations();
        } catch (error) {
          console.error('[WorkspacePage] Failed to update tags:', error);
          showError('Update Failed', 'Failed to update conversation tags.');
        }
      } : undefined}
      onConversationMatterChange={isPracticeWorkspace ? async (matterId) => {
        if (!selectedConversation?.id) return;
        try {
          await updateConversationMatter(selectedConversation.id, matterId);
          await refreshConversations();
        } catch (error) {
          console.error('[WorkspacePage] Failed to update matter:', error);
          showError('Update Failed', 'Failed to link matter to conversation.');
        }
      } : undefined}
      onClose={() => setIsInspectorOpen(false)}
      matters={mattersData.items}
      onMatterStatusChange={(status: MatterStatus) => {
        if (typeof window === 'undefined' || !selectedMatterIdFromPath) return;
        window.dispatchEvent(
          new CustomEvent('workspace:matter-status-change', {
            detail: { matterId: selectedMatterIdFromPath, status },
          })
        );
      }}
      onMatterPatchChange={(patch) => {
        if (typeof window === 'undefined' || !selectedMatterIdFromPath) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
          window.dispatchEvent(
            new CustomEvent('workspace:matter-patch-change', {
              detail: { matterId: selectedMatterIdFromPath, patch, resolve, reject },
            })
          );
        });
      }}
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
      listPanel={conversationListPanel ?? matterListPanel ?? clientsListPanel ?? invoicesListPanel}
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
