import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ChatBubbleLeftRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useInbox } from '@/shared/hooks/useInbox';
import { useConversationsWithContext } from '@/shared/hooks/useConversations';
import { useChatCapabilities } from '@/shared/hooks/useChatCapabilities';
import { cn } from '@/shared/utils/cn';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { Conversation } from '@/shared/types/conversation';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

interface ConversationSidebarProps {
  workspace: WorkspaceType;
  practiceId?: string;
  selectedConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
}

export const ConversationSidebar = ({
  workspace,
  practiceId,
  selectedConversationId,
  onSelectConversation
}: ConversationSidebarProps) => {
  const { showError } = useToastContext();
  const capabilities = useChatCapabilities({ workspace });
  const isPracticeInbox = capabilities.canManageInbox;

  const inboxData = useInbox({
    practiceId: isPracticeInbox ? practiceId : undefined,
    limit: 50,
    autoRefresh: isPracticeInbox,
    refreshInterval: 30000,
    onError: (message) => showError(message)
  });

  const conversationsData = useConversationsWithContext({
    scope: 'all',
    enabled: !isPracticeInbox,
    onError: (message) => showError(message)
  });

  const conversations = (isPracticeInbox
    ? inboxData.conversations
    : conversationsData.conversations) as Conversation[];
  const isLoading = isPracticeInbox ? inboxData.isLoading : conversationsData.isLoading;
  const error = isPracticeInbox ? inboxData.error : conversationsData.error;
  const refresh = isPracticeInbox ? inboxData.refresh : conversationsData.refresh;
  const stats = isPracticeInbox ? inboxData.stats : null;

  const sections = useMemo(() => {
    if (conversations.length === 0) return [];

    const active = conversations.filter((conversation) => conversation.status === 'active' || !conversation.status);
    const closed = conversations.filter((conversation) => conversation.status === 'closed' || conversation.status === 'completed');
    const archived = conversations.filter((conversation) => conversation.status === 'archived');

    if (isPracticeInbox) {
      const unassigned = active.filter((conversation) => !conversation.assigned_to);
      const assigned = active.filter((conversation) => conversation.assigned_to);

      return [
        { key: 'unassigned', label: 'Unassigned', items: unassigned },
        { key: 'active', label: 'Active', items: assigned },
        { key: 'closed', label: 'Closed', items: closed },
        { key: 'archived', label: 'Archived', items: archived }
      ].filter((section) => section.items.length > 0);
    }

    return [
      { key: 'active', label: 'Active', items: active },
      { key: 'closed', label: 'Closed', items: closed },
      { key: 'archived', label: 'Archived', items: archived }
    ].filter((section) => section.items.length > 0);
  }, [conversations, isPracticeInbox]);

  const practiceLabelCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    conversations.forEach((conversation) => {
      const label = conversation.practice?.name || conversation.practice?.slug;
      if (label) {
        practiceLabelCacheRef.current.set(conversation.practice_id, label);
      }
    });
  }, [conversations]);

  useEffect(() => {
    if (!onSelectConversation) return;
    if (conversations.length === 0) return;

    const hasSelection = selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId);
    if (!hasSelection) {
      onSelectConversation(conversations[0].id);
    }
  }, [conversations, onSelectConversation, selectedConversationId]);

  if (workspace === 'practice' && !practiceId) {
    return (
      <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
        Select a practice to view chats.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between px-2 pt-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          <span>Conversations</span>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          aria-label="Refresh conversations"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>

      {stats && (
        <div className="px-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{stats.active} active</span>
          <span className="px-1">|</span>
          <span>{stats.unassigned} unassigned</span>
        </div>
      )}

      {isLoading && conversations.length === 0 ? (
        <div className="px-3 text-sm text-gray-500 dark:text-gray-400">
          Loading conversations...
        </div>
      ) : error ? (
        <div className="px-3 text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      ) : conversations.length === 0 ? (
        <div className="px-3 text-sm text-gray-500 dark:text-gray-400">
          {isPracticeInbox
            ? 'No conversations yet. Share your practice link to start chatting.'
            : 'No conversations yet. Open a practice link to start chatting.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-2">
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                <span>{section.label}</span>
                <span>{section.items.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {section.items.map((conversation) => {
                  const timestamp = conversation.last_message_at || conversation.updated_at;
                  const cachedLabel = practiceLabelCacheRef.current.get(conversation.practice_id);
                  const practiceLabel = conversation.practice?.name
                    || conversation.practice?.slug
                    || cachedLabel
                    || conversation.practice_id.slice(0, 6);

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => onSelectConversation?.(conversation.id)}
                      className={cn(
                        'w-full rounded-md px-2 py-2 text-left transition-colors',
                        'hover:bg-gray-100 dark:hover:bg-white/5',
                        selectedConversationId === conversation.id
                          ? 'bg-gray-100 dark:bg-white/10'
                          : 'bg-transparent'
                      )}
                      aria-current={selectedConversationId === conversation.id ? 'true' : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {`Conversation ${conversation.id.slice(0, 6)}`}
                        </span>
                        {timestamp && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {formatRelativeTime(timestamp)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                        {isPracticeInbox ? (
                          <span>{conversation.assigned_to ? 'Assigned' : 'Unassigned'}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:border-white/10 dark:text-gray-300">
                            {practiceLabel}
                          </span>
                        )}
                        <span className="capitalize">{conversation.status ?? 'active'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
