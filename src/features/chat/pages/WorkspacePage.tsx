import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import WorkspaceNav, { type WorkspaceNavTab } from '@/features/chat/views/WorkspaceNav';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { SplitView } from '@/shared/ui/layout/SplitView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { cn } from '@/shared/utils/cn';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { PracticeSetupBanner } from '@/features/practice-setup/components/PracticeSetupBanner';
import { resolvePracticeSetupStatus } from '@/features/practice-setup/utils/status';
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';

type WorkspaceView = 'home' | 'list' | 'conversation' | 'matters' | 'clients';

interface WorkspacePageProps {
  view: WorkspaceView;
  practiceId: string;
  practiceSlug: string | null;
  practiceName?: string | null;
  practiceLogo?: string | null;
  messages: ChatMessageUI[];
  showClientTabs?: boolean;
  showPracticeTabs?: boolean;
  workspace?: 'public' | 'practice' | 'client';
  onStartNewConversation: (mode: ConversationMode) => Promise<string | null>;
  chatView: ComponentChildren;
  mattersView?: ComponentChildren;
  clientsView?: ComponentChildren;
  header?: ComponentChildren;
  headerClassName?: string;
}

const filterWorkspaceMessages = (messages: ChatMessageUI[]) => {
  const base = messages.filter(
    (message) =>
      message.metadata?.systemMessageKey !== 'ask_question_help'
  );
  const hasNonSystemMessages = base.some((message) => message.role !== 'system');
  return hasNonSystemMessages ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
};

const WorkspacePage: FunctionComponent<WorkspacePageProps> = ({
  view,
  practiceId,
  practiceSlug,
  practiceName,
  practiceLogo,
  messages,
  showClientTabs = false,
  showPracticeTabs = false,
  workspace = 'public',
  onStartNewConversation,
  chatView,
  mattersView,
  clientsView,
  header,
  headerClassName,
}) => {
  const { navigate } = useNavigation();
  const [previewTab, setPreviewTab] = useState<WorkspaceNavTab>('home');
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const isPracticeWorkspace = workspace === 'practice';

  const workspaceBasePath = useMemo(() => {
    if (workspace === 'practice') {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/practice';
    }
    if (workspace === 'client') {
      return practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '/client';
    }
    return practiceSlug ? `/public/${encodeURIComponent(practiceSlug)}` : '/public';
  }, [workspace, practiceSlug]);
  const conversationsPath = `${workspaceBasePath}/conversations`;

  const isPracticeOnly = useMemo(() => ['clients'].includes(view), [view]);
  const isSharedGuarded = useMemo(() => ['matters'].includes(view), [view]);
  const allowed = useMemo(() => {
    if (isPracticeOnly) return showPracticeTabs;
    if (isSharedGuarded) return showClientTabs || showPracticeTabs;
    return true;
  }, [isPracticeOnly, isSharedGuarded, showClientTabs, showPracticeTabs]);

  useEffect(() => {
    if (!allowed) {
      navigate(workspaceBasePath, true);
    }
  }, [allowed, workspaceBasePath, navigate]);

  const shouldListConversations = isPracticeWorkspace ? true : view !== 'conversation';
  const {
    conversations,
    isLoading: isConversationsLoading,
    refresh: refreshConversations
  } = useConversations({
    practiceId,
    scope: 'practice',
    list: shouldListConversations,
    enabled: shouldListConversations && Boolean(practiceId)
  });

  const [conversationPreviews, setConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());
  const previewFailureCounts = useRef<Record<string, number>>({});
  const MAX_PREVIEW_ATTEMPTS = 2;

  useEffect(() => {
    fetchedPreviewIds.current = new Set();
    previewFailureCounts.current = {};
    setConversationPreviews({});
  }, [practiceId]);

  useEffect(() => {
    if (view === 'conversation' || conversations.length === 0 || !practiceId) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = conversations.slice(0, 10).filter(
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
  }, [practiceId, conversations, view]);

  const recentMessage = useMemo(() => {
    const fallbackPracticeName = typeof practiceName === 'string'
      ? practiceName.trim()
      : '';
    if (conversations.length > 0) {
      const sorted = [...conversations].sort((a, b) => {
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
        const title = typeof top.user_info?.title === 'string' ? top.user_info?.title.trim() : '';
        const timestampLabel = preview?.createdAt
          ? formatRelativeTime(preview.createdAt)
          : (top.last_message_at ? formatRelativeTime(top.last_message_at) : '');
        return {
          preview: clipped,
          timestampLabel,
          senderLabel: title || fallbackPracticeName,
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
      ? formatRelativeTime(new Date(candidate.timestamp).toISOString())
      : '';
    return {
      preview,
      timestampLabel,
      senderLabel: fallbackPracticeName,
      avatarSrc: practiceLogo ?? null,
      conversationId: null
    };
  }, [practiceLogo, practiceName, conversationPreviews, conversations, filteredMessages]);

  const { currentPractice } = usePracticeManagement();
  const { details: setupDetails } = usePracticeDetails(currentPractice?.id ?? null);
  const setupStatus = resolvePracticeSetupStatus(currentPractice, setupDetails ?? null);

  const handleSetupNavigate = (target: 'basics' | 'contact' | 'services' | 'payouts') => {
    switch (target) {
      case 'contact':
        navigate('/settings/practice?setup=contact');
        break;
      case 'services':
        navigate('/settings/practice/services');
        break;
      case 'payouts':
        navigate('/settings/account/payouts');
        break;
      case 'basics':
      default:
        navigate('/settings/practice');
        break;
    }
  };

  if (!allowed) {
    return null;
  }

  const handleStartConversation = async (mode: ConversationMode) => {
    try {
      const conversationId = await onStartNewConversation(mode);
      if (conversationId) {
        navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
        return;
      }
    } catch (error) {
      console.error('[WorkspacePage] Failed to start conversation:', error);
    }
    navigate(conversationsPath);
  };

  const handleOpenRecentMessage = () => {
    if (recentMessage?.conversationId) {
      navigate(`${conversationsPath}/${encodeURIComponent(recentMessage.conversationId)}`);
      return;
    }
    navigate(conversationsPath);
  };

  const renderContent = () => {
    if (workspace === 'practice' && view === 'home') {
      return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden bg-white dark:bg-dark-bg">
          {/* Left: Setup Panel - Expanded */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-light-border lg:border-b-0 lg:border-r dark:border-dark-border">
            <div className="flex-1 overflow-y-auto p-6 md:p-12">
              <div className="mx-auto max-w-2xl">
                <PracticeSetupBanner
                  status={setupStatus}
                  onNavigate={handleSetupNavigate}
                />
              </div>
            </div>
          </div>

          {/* Right: Public View Preview - Focused */}
          <div className="flex w-full shrink-0 flex-col items-center justify-center bg-gray-50 p-6 md:p-8 lg:w-[500px] dark:bg-black/20">
            <div className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Public Preview</div>
            <div className="relative flex h-[600px] w-full max-w-[360px] flex-col overflow-hidden rounded-[40px] border-[8px] border-gray-900 bg-white shadow-2xl transition-all md:h-[700px] lg:h-full lg:max-h-[800px] lg:max-w-[400px] dark:border-gray-800 dark:bg-dark-bg">
              <div className="flex-1 overflow-y-auto">
                {previewTab === 'home' ? (
                  <WorkspaceHomeView
                    practiceName={practiceName}
                    practiceLogo={practiceLogo}
                    onSendMessage={() => setPreviewTab('messages')}
                    onRequestConsultation={() => setPreviewTab('messages')}
                    recentMessage={null}
                    onOpenRecentMessage={() => setPreviewTab('messages')}
                    consultationTitle={undefined}
                    consultationDescription={undefined}
                    consultationCta={undefined}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-12 text-center text-gray-400">
                    <div className="mb-4 h-12 w-12 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{previewTab}</h4>
                    <p className="mt-2 text-xs">This view is currently in preview mode.</p>
                  </div>
                )}
              </div>
              <WorkspaceNav
                variant="bottom"
                activeTab={previewTab}
                onSelectTab={(tab) => setPreviewTab(tab)}
                showClientTabs={true}
                className="border-t-0 p-2"
              />
            </div>
            {/* Mobile Helper Text */}
            <p className="mt-6 text-center text-xs text-gray-400 lg:hidden">
              This is a preview of your public-facing page.
            </p>
          </div>
        </div>
      );
    }

    switch (view) {
      case 'home':
        return (
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
          />
        );
      case 'list':
        return (
          <ConversationListView
            conversations={conversations}
            previews={conversationPreviews}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            isLoading={isConversationsLoading}
            onClose={() => navigate(workspaceBasePath)}
            onSelectConversation={(conversationId) => {
              navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
            }}
            onSendMessage={() => handleStartConversation('ASK_QUESTION')}
          />
        );
      case 'matters':
        return mattersView ?? (
          <div className="flex flex-1 flex-col rounded-[32px] bg-light-bg dark:bg-dark-bg">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Matters</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Your active matters will appear here once a practice connects them to your account.
              </p>
            </div>
            <div className="mx-6 mb-6 rounded-2xl border border-light-border bg-light-card-bg p-5 shadow-[0_16px_32px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">No matters yet</div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Start a conversation to open a new matter with the practice.
              </div>
            </div>
          </div>
        );
      case 'clients':
        return clientsView ?? (
          <div className="flex flex-1 flex-col rounded-[32px] bg-light-bg dark:bg-dark-bg">
            <div className="px-6 py-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clients</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Manage your practice clients here.
              </p>
            </div>
          </div>
        );
      case 'conversation':
      default:
        return chatView;
    }
  };

  const showBottomNav = workspace !== 'practice'
    ? true
    : (showClientTabs || showPracticeTabs || view === 'home' || view === 'list' || view === 'matters' || view === 'clients');
  const activeTab = view === 'list' || view === 'conversation'
    ? 'messages'
    : view === 'matters'
    ? 'matters'
    : view === 'clients'
    ? 'clients'
    : view;
  const handleSelectTab = (tab: WorkspaceNavTab) => {
    if (tab === 'messages') {
      void refreshConversations();
      navigate(conversationsPath);
      return;
    }
    if (tab === 'matters') {
      navigate(`${workspaceBasePath}/matters`);
      return;
    }
    if (tab === 'clients') {
      navigate(`${workspaceBasePath}/clients`);
      return;
    }
    if (tab === 'settings') {
      navigate('/settings');
      return;
    }
    navigate(workspaceBasePath);
  };

  const bottomNav = showBottomNav ? (
    <WorkspaceNav
      variant="bottom"
      activeTab={activeTab}
      showClientTabs={showClientTabs}
      showPracticeTabs={showPracticeTabs}
      onSelectTab={handleSelectTab}
    />
  ) : undefined;

  const sidebarNav = showBottomNav ? (
    <WorkspaceNav
      variant="sidebar"
      activeTab={activeTab}
      showClientTabs={showClientTabs}
      showPracticeTabs={showPracticeTabs}
      onSelectTab={handleSelectTab}
    />
  ) : undefined;

  const conversationListView = (
    <ConversationListView
      conversations={conversations}
      previews={conversationPreviews}
      practiceName={practiceName}
      practiceLogo={practiceLogo}
      isLoading={isConversationsLoading}
      onClose={() => navigate(workspaceBasePath)}
      onSelectConversation={(conversationId) => {
        navigate(`${conversationsPath}/${encodeURIComponent(conversationId)}`);
      }}
      onSendMessage={() => handleStartConversation('ASK_QUESTION')}
      showBackButton={false}
    />
  );

  const showListOnMobile = view === 'list';
  const showChatOnMobile = view === 'conversation';
  const isSplitView = isPracticeWorkspace && (view === 'list' || view === 'conversation');
  const mainContent = isSplitView
    ? (
      <SplitView
        className="h-full min-h-0 w-full"
        primary={conversationListView}
        secondary={chatView}
        primaryClassName={cn(
          'min-h-0',
          showListOnMobile ? 'block' : 'hidden',
          'md:block'
        )}
        secondaryClassName={cn(
          'min-h-0',
          showChatOnMobile ? 'block' : 'hidden',
          'md:block'
        )}
      />
    )
    : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    );

  return (
    <AppShell
      className="bg-light-bg dark:bg-dark-bg"
      sidebar={sidebarNav}
      main={(
        <div className="flex h-full min-h-0 w-full flex-col">
          {header && (
            <div className={cn('w-full', headerClassName)}>
              {header}
            </div>
          )}
          {mainContent}
        </div>
      )}
      mainClassName={cn('min-h-0 overflow-hidden', showBottomNav ? 'pb-20 md:pb-0' : undefined)}
      bottomBar={bottomNav}
      bottomBarClassName={showBottomNav ? 'md:hidden fixed inset-x-0 bottom-0 z-40' : undefined}
    />
  );
};

export default WorkspacePage;
