import { FunctionComponent } from 'preact';
import type { ComponentChildren } from 'preact';
import { useMemo, useRef, useState, useEffect } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import PublicEmbedHome from './PublicEmbedHome';
import PublicEmbedNavigation from './PublicEmbedNavigation';
import PublicConversationList from './PublicConversationList';
import { useConversations } from '@/shared/hooks/useConversations';
import { fetchLatestConversationMessage } from '@/shared/lib/conversationApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { ChatMessageUI } from '../../../../worker/types';
import type { ConversationMode } from '@/shared/types/conversation';

type EmbedView = 'home' | 'list' | 'conversation' | 'matters' | 'clients';

interface PublicEmbedLayoutProps {
  view: EmbedView;
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

const filterPublicMessages = (messages: ChatMessageUI[]) => {
  const base = messages.filter(
    (message) =>
      message.metadata?.systemMessageKey !== 'ask_question_help'
  );
  const hasNonSystemMessages = base.some((message) => message.role !== 'system');
  return hasNonSystemMessages ? base.filter((message) => message.metadata?.systemMessageKey !== 'intro') : base;
};

const PublicEmbedLayout: FunctionComponent<PublicEmbedLayoutProps> = ({
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
  const publicMessages = useMemo(() => filterPublicMessages(messages), [messages]);

  const embedBasePath = useMemo(() => {
    if (workspace === 'practice') {
      return practiceSlug ? `/practice/${encodeURIComponent(practiceSlug)}` : '/practice';
    }
    if (workspace === 'client') {
      return practiceSlug ? `/client/${encodeURIComponent(practiceSlug)}` : '/client';
    }
    return practiceSlug ? `/embed/${encodeURIComponent(practiceSlug)}` : '/embed';
  }, [workspace, practiceSlug]);
  const conversationsPath = `${embedBasePath}/conversations`;

  const isPracticeOnly = useMemo(() => ['clients'].includes(view), [view]);
  const isSharedGuarded = useMemo(() => ['matters'].includes(view), [view]);
  const allowed = useMemo(() => {
    if (isPracticeOnly) return showPracticeTabs;
    if (isSharedGuarded) return showClientTabs || showPracticeTabs;
    return true;
  }, [isPracticeOnly, isSharedGuarded, showClientTabs, showPracticeTabs]);

  // Redirect if unauthorized to view specific pages
  useEffect(() => {
    if (!allowed) {
      navigate(embedBasePath, true);
    }
  }, [allowed, embedBasePath, navigate]);

  const {
    conversations: publicConversations,
    isLoading: isPublicConversationsLoading,
    refresh: refreshPublicConversations
  } = useConversations({
    practiceId,
    scope: 'practice',
    list: view !== 'conversation',
    enabled: view !== 'conversation' && Boolean(practiceId)
  });

  const [publicConversationPreviews, setPublicConversationPreviews] = useState<Record<string, {
    content: string;
    role: string;
    createdAt: string;
  }>>({});
  const fetchedPreviewIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (view === 'conversation' || publicConversations.length === 0 || !practiceId) {
      return;
    }
    let isMounted = true;
    const loadPreviews = async () => {
      const updates: Record<string, { content: string; role: string; createdAt: string }> = {};
      const toFetch = publicConversations.slice(0, 10).filter(
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
        setPublicConversationPreviews((prev) => ({ ...prev, ...updates }));
      }
    };
    void loadPreviews();
    return () => {
      isMounted = false;
    };
  }, [practiceId, publicConversations, view]);

  const recentMessage = useMemo(() => {
    const fallbackPracticeName = typeof practiceName === 'string'
      ? practiceName.trim()
      : '';
    if (publicConversations.length > 0) {
      const sorted = [...publicConversations].sort((a, b) => {
        const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
        const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
        return bTime - aTime;
      });
      const top = sorted.find((conversation) => {
        const preview = publicConversationPreviews[conversation.id];
        return typeof preview?.content === 'string' && preview.content.trim().length > 0;
      });
      if (top) {
        const preview = publicConversationPreviews[top.id];
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
    if (publicMessages.length === 0) {
      return null;
    }
    const candidate = [...publicMessages]
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
  }, [practiceLogo, practiceName, publicConversationPreviews, publicConversations, publicMessages]);

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
      console.error('[PublicEmbedLayout] Failed to start conversation:', error);
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
          <PublicEmbedHome
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
          <PublicConversationList
            conversations={publicConversations}
            previews={publicConversationPreviews}
            practiceName={practiceName}
            practiceLogo={practiceLogo}
            isLoading={isPublicConversationsLoading}
            onClose={() => navigate(embedBasePath)}
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
  const containerClassName = 'flex flex-col h-screen w-full m-0 p-0 relative overflow-hidden bg-light-bg dark:bg-dark-bg';
  const mainClassName = 'flex flex-col flex-1 min-h-0 w-full overflow-hidden relative items-center px-3 py-4';
  const frameClassName = 'flex flex-col flex-1 min-h-0 w-full max-w-[420px] mx-auto rounded-[32px] bg-light-bg dark:bg-dark-bg shadow-[0_32px_80px_rgba(15,23,42,0.18)] border border-light-border dark:border-white/20 overflow-hidden';

  if (!shouldFrame) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        {renderContent()}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <main className={mainClassName}>
        <div className={frameClassName}>
          {renderContent()}
          {showBottomNav && (
            <PublicEmbedNavigation
              activeTab={activeTab}
              showClientTabs={showClientTabs}
              showPracticeTabs={showPracticeTabs}
              onSelectTab={(tab) => {
                if (tab === 'messages') {
                  void refreshPublicConversations();
                  navigate(conversationsPath);
                  return;
                }
                if (tab === 'matters') {
                  navigate(`${embedBasePath}/matters`);
                  return;
                }
                if (tab === 'clients') {
                  navigate(`${embedBasePath}/clients`);
                  return;
                }
                if (tab === 'settings') {
                  navigate('/settings');
                  return;
                }
                navigate(embedBasePath);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicEmbedLayout;
