import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import WorkspaceHomeView from '@/features/chat/views/WorkspaceHomeView';
import WorkspaceBottomNav from '@/features/chat/views/WorkspaceBottomNav';
import ConversationListView from '@/features/chat/views/ConversationListView';
import { SplitView } from '@/shared/ui/layout/SplitView';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { cn } from '@/shared/utils/cn';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
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
}) => {
  const { navigate } = useNavigation();
  const filteredMessages = useMemo(() => filterWorkspaceMessages(messages), [messages]);
  const isPracticeWorkspace = workspace === 'practice';

  const workspaceBasePath = useMemo(() => {
    if (workspace === 'practice') {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/practice';
    }
    if (workspace === 'client') {
      return practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '/client';
    }
    return practiceSlug ? `/embed/${encodeURIComponent(practiceSlug)}` : '/embed';
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
          <div className="flex flex-1 flex-col overflow-y-auto rounded-[32px] bg-light-bg dark:bg-dark-bg">
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
          <div className="flex flex-1 flex-col overflow-y-auto rounded-[32px] bg-light-bg dark:bg-dark-bg">
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

  const showBottomNav = showClientTabs || showPracticeTabs || view === 'home' || view === 'list' || view === 'matters' || view === 'clients';
  const activeTab = view === 'list' || view === 'conversation'
    ? 'messages'
    : view === 'matters'
    ? 'matters'
    : view === 'clients'
    ? 'clients'
    : view;
  const shouldFrame = view !== 'conversation';

  const bottomNav = showBottomNav ? (
    <WorkspaceBottomNav
      activeTab={activeTab}
      showClientTabs={showClientTabs}
      showPracticeTabs={showPracticeTabs}
      onSelectTab={(tab) => {
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
      }}
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

  if (isPracticeWorkspace && (view === 'list' || view === 'conversation')) {
    const showListOnMobile = view === 'list';
    const showChatOnMobile = view === 'conversation';

    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex-1 min-h-0">
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
        </div>
        {bottomNav && (
          <div className="md:hidden">
            {bottomNav}
          </div>
        )}
      </div>
    );
  }

  if (isPracticeWorkspace) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex-1 min-h-0 w-full">
          {renderContent()}
        </div>
        {bottomNav && (
          <div className="md:hidden">
            {bottomNav}
          </div>
        )}
      </div>
    );
  }

  const containerClassName = 'flex min-h-0 w-full flex-1 items-center justify-center px-3 py-4';
  const frameClassName = 'flex flex-col flex-1 min-h-0 w-full max-w-[420px] mx-auto rounded-[32px] bg-light-bg dark:bg-dark-bg shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-light-border dark:border-white/20 overflow-hidden';

  return (
    <AppShell
      className="bg-light-bg dark:bg-dark-bg"
      main={(
        <div className={cn('flex h-full min-h-0 w-full', shouldFrame ? containerClassName : 'flex-col')}>
          {shouldFrame ? (
            <div className={frameClassName}>
              {renderContent()}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {renderContent()}
            </div>
          )}
        </div>
      )}
      mainClassName="min-h-0"
      bottomBar={bottomNav}
      bottomBarClassName={showBottomNav ? 'md:hidden' : undefined}
    />
  );
};

export default WorkspacePage;
