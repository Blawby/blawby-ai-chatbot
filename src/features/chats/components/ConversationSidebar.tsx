import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ChatBubbleLeftRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useConversations, useConversationsWithContext } from '@/shared/hooks/useConversations';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { Conversation } from '@/shared/types/conversation';

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
  const { session, isAnonymous } = useSessionContext();
  const hasSession = Boolean(session?.user);
  const isPublicWorkspace = workspace === 'public';
  const isPracticeWorkspace = workspace === 'practice';
  const allowAllScope = hasSession && !isAnonymous;
  const practiceConversationsData = useConversations({
    practiceId,
    scope: 'practice',
    enabled: isPracticeWorkspace && hasSession && Boolean(practiceId),
    onError: (message) => showError(message)
  });

  const publicConversationsData = useConversations({
    practiceId,
    scope: 'practice',
    enabled: isPublicWorkspace && hasSession && Boolean(practiceId),
    onError: (message) => showError(message)
  });

  const conversationsData = useConversationsWithContext({
    scope: 'all',
    enabled: !isPracticeWorkspace && !isPublicWorkspace && allowAllScope,
    onError: (message) => showError(message)
  });

  const activeConversationsData = isPracticeWorkspace
    ? practiceConversationsData
    : (isPublicWorkspace ? publicConversationsData : conversationsData);
  const conversations = activeConversationsData.conversations as Conversation[];
  const isLoading = activeConversationsData.isLoading;
  const error = activeConversationsData.error;
  const refresh = activeConversationsData.refresh;
  const practiceLabelCacheRef = useRef(new Map<string, string>());
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const getConversationTitle = (conversation: Conversation) => {
    return conversation.user_info?.title
      || conversation.practice?.name
      || conversation.practice?.slug
      || practiceLabelCacheRef.current.get(conversation.practice_id)
      || (typeof conversation.practice_id === 'string' ? conversation.practice_id.slice(0, 6) : 'Conversation');
  };

  const isSystemConversation = (conversation: Conversation) => (
    conversation.user_info?.system_conversation === true
    || conversation.user_info?.title === 'Blawby System'
  );

  const filteredConversations = useMemo(() => {
    if (!normalizedQuery) return conversations;
    return conversations.filter((conversation) => {
      const title = getConversationTitle(conversation);
      return title.toLowerCase().includes(normalizedQuery);
    });
  }, [conversations, normalizedQuery]);

  const sections = useMemo(() => {
    if (filteredConversations.length === 0) return [];

    const active = filteredConversations.filter((conversation) => conversation.status === 'active' || !conversation.status);
    const closed = filteredConversations.filter((conversation) => conversation.status === 'closed' || conversation.status === 'completed');
    const archived = filteredConversations.filter((conversation) => conversation.status === 'archived');

    const sortItems = (items: Conversation[]) => (
      [...items].sort((a, b) => Number(isSystemConversation(b)) - Number(isSystemConversation(a)))
    );

    return [
      { key: 'active', label: 'Active', items: sortItems(active) },
      { key: 'closed', label: 'Closed', items: sortItems(closed) },
      { key: 'archived', label: 'Archived', items: sortItems(archived) }
    ].filter((section) => section.items.length > 0);
  }, [filteredConversations]);

  useEffect(() => {
    conversations.forEach((conversation) => {
      const label = conversation.practice?.name || conversation.practice?.slug;
      if (label) {
        practiceLabelCacheRef.current.set(conversation.practice_id, label);
      }
    });
  }, [conversations]);

  const onSelectConversationRef = useRef<typeof onSelectConversation>(onSelectConversation);
  useEffect(() => {
    onSelectConversationRef.current = onSelectConversation;
  }, [onSelectConversation]);

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

      <div className="px-2">
        <label className="sr-only" htmlFor="conversation-search">
          Find or start a conversation
        </label>
        <input
          id="conversation-search"
          type="search"
          value={searchQuery}
          onInput={(event) => setSearchQuery((event.target as HTMLInputElement).value)}
          placeholder="Find or start a conversation"
          className="w-full rounded-full bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:bg-white/10 dark:text-white dark:placeholder:text-gray-500"
        />
      </div>

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
          {isPracticeWorkspace
            ? 'No conversations yet. Share your practice link to start chatting.'
            : 'No conversations yet. Open a practice link to start chatting.'}
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-2">
          {filteredConversations.length === 0 ? (
            <div className="px-2 text-xs text-gray-500 dark:text-gray-400">
              No conversations match that search.
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <span>{section.label}</span>
                  <span>{section.items.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {section.items.map((conversation) => {
                    const displayTitle = getConversationTitle(conversation);
                    const unreadCount = conversation.unread_count ?? 0;
                    const isUnread = unreadCount > 0;
                    const isActive = selectedConversationId === conversation.id;
                    const avatarSrc = isSystemConversation(conversation)
                      ? '/blawby-favicon-iframe.png'
                      : null;

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => onSelectConversation?.(conversation.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                          'hover:bg-gray-100 dark:hover:bg-white/5',
                          isActive
                            ? 'bg-gray-100 dark:bg-white/10'
                            : 'bg-transparent'
                        )}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            isUnread ? 'bg-accent-500' : 'bg-transparent'
                          )}
                          aria-hidden="true"
                        />
                        <Avatar size="sm" name={displayTitle} src={avatarSrc} />
                        <span className={cn('truncate text-sm text-gray-900 dark:text-white', isUnread ? 'font-semibold' : 'font-medium')}>
                          {displayTitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
