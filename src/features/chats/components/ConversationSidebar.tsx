import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useConversations, useConversationsWithContext } from '@/shared/hooks/useConversations';
import { getConversationWsEndpoint } from '@/config/api';
import { cn } from '@/shared/utils/cn';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import type { WorkspaceType } from '@/shared/types/workspace';
import type { Conversation } from '@/shared/types/conversation';

const CHAT_PROTOCOL_VERSION = 1;
const REFRESH_DEBOUNCE_MS = 250;

interface ConversationSidebarProps {
  workspace: WorkspaceType;
  practiceId?: string;
  practiceSlug?: string;
  selectedConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
}

export const ConversationSidebar = ({
  workspace,
  practiceId,
  practiceSlug,
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
    practiceSlug,
    scope: 'practice',
    enabled: isPracticeWorkspace && hasSession && Boolean(practiceId),
    onError: (message) => showError(message)
  });

  const publicConversationsData = useConversations({
    practiceId,
    practiceSlug,
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
  const wsConnectionsRef = useRef<Map<string, WebSocket>>(new Map());
  const wsAuthedRef = useRef(new Set<string>());
  const pendingReadSeqRef = useRef(new Map<string, number>());
  const refreshTimerRef = useRef<number | null>(null);
  const markReadTimerRef = useRef<number | null>(null);
  const conversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations]);

  const getConversationTitle = useCallback((conversation: Conversation) => {
    return conversation.user_info?.title
      || conversation.practice?.name
      || conversation.practice?.slug
      || practiceLabelCacheRef.current.get(conversation.practice_id)
      || 'Untitled';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceLabelCacheRef.current]);

  const isSystemConversation = (conversation: Conversation) => (
    conversation.user_info?.system_conversation === true
    || conversation.user_info?.title === 'Blawby System'
  );

  const sections = useMemo(() => {
    if (conversations.length === 0) return [];

    const active = conversations.filter((conversation) => conversation.status === 'active' || !conversation.status);
    const closed = conversations.filter((conversation) => conversation.status === 'closed' || conversation.status === 'completed');
    const archived = conversations.filter((conversation) => conversation.status === 'archived');

    const sortItems = (items: Conversation[]) => (
      [...items].sort((a, b) => Number(isSystemConversation(b)) - Number(isSystemConversation(a)))
    );

    return [
      { key: 'active', label: 'Active', items: sortItems(active) },
      { key: 'closed', label: 'Closed', items: sortItems(closed) },
      { key: 'archived', label: 'Archived', items: sortItems(archived) }
    ].filter((section) => section.items.length > 0);
  }, [conversations]);

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

  const sendReadUpdate = useCallback((conversationId: string, latestSeq: number) => {
    const socket = wsConnectionsRef.current.get(conversationId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    if (!wsAuthedRef.current.has(conversationId)) {
      return false;
    }
    socket.send(JSON.stringify({
      type: 'read.update',
      data: {
        conversation_id: conversationId,
        last_read_seq: latestSeq
      }
    }));
    return true;
  }, []);

  const queueReadUpdate = useCallback((conversationId: string, latestSeq?: number | null) => {
    if (!Number.isFinite(latestSeq)) {
      return;
    }
    if (!sendReadUpdate(conversationId, latestSeq as number)) {
      pendingReadSeqRef.current.set(conversationId, latestSeq as number);
    }
  }, [sendReadUpdate]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    onSelectConversationRef.current?.(conversation.id);
    queueReadUpdate(conversation.id, conversation.latest_seq);
    if (markReadTimerRef.current !== null) {
      clearTimeout(markReadTimerRef.current);
    }
    markReadTimerRef.current = window.setTimeout(() => {
      markReadTimerRef.current = null;
      refresh();
    }, 600);
  }, [queueReadUpdate, refresh]);

  useEffect(() => {
    if (!hasSession || typeof WebSocket === 'undefined') {
      return;
    }

    const activeSockets = wsConnectionsRef.current;
    const authedConnections = wsAuthedRef.current;
    const pendingReads = pendingReadSeqRef.current;
    const targetIds = new Set(conversationIds);

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) {
        return;
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    for (const [conversationId, socket] of activeSockets.entries()) {
      if (!targetIds.has(conversationId)) {
        socket.close();
        activeSockets.delete(conversationId);
      }
    }

    for (const conversationId of targetIds) {
      if (activeSockets.has(conversationId)) {
        continue;
      }
      const socket = new WebSocket(getConversationWsEndpoint(conversationId));
      activeSockets.set(conversationId, socket);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: 'auth',
          data: {
            protocol_version: CHAT_PROTOCOL_VERSION,
            client_info: { platform: 'web' }
          }
        }));
      });

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          return;
        }
        let frame: { type?: string };
        try {
          frame = JSON.parse(event.data) as { type?: string };
        } catch {
          return;
        }
        if (frame.type === 'auth.ok') {
          authedConnections.add(conversationId);
          const pendingSeq = pendingReads.get(conversationId);
          if (Number.isFinite(pendingSeq)) {
            if (sendReadUpdate(conversationId, pendingSeq)) {
              pendingReads.delete(conversationId);
            }
          }
          return;
        }
        if (frame.type === 'message.new') {
          scheduleRefresh();
        }
      });

      socket.addEventListener('close', () => {
        if (activeSockets.get(conversationId) === socket) {
          activeSockets.delete(conversationId);
        }
        authedConnections.delete(conversationId);
      });

      socket.addEventListener('error', (event) => {
        if (import.meta.env.DEV) {
          console.warn('[ConversationSidebar] Socket error', { conversationId, event });
        }
      });
    }

    return () => {
      for (const socket of activeSockets.values()) {
        socket.close();
      }
      activeSockets.clear();
      authedConnections.clear();
      pendingReads.clear();
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (markReadTimerRef.current !== null) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
    };
  }, [conversationIds, hasSession, refresh, sendReadUpdate]);

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
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                <span>{section.label}</span>
                <span>{section.items.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                  {section.items.map((conversation) => {
                    const displayTitle = getConversationTitle(conversation);
                    const unreadCount = conversation.unread_count ?? 0;
                    const isActive = selectedConversationId === conversation.id;
                    const isUnread = unreadCount > 0 && !isActive;
                    const avatarSrc = isSystemConversation(conversation)
                      ? '/blawby-favicon-iframe.png'
                      : null;

                    return (
                      <div key={conversation.id} className="relative overflow-visible">
                        <button
                          type="button"
                          onClick={() => handleSelectConversation(conversation)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors',
                            'hover:bg-gray-100 dark:hover:bg-white/5',
                            isActive
                              ? 'bg-gray-100 dark:bg-white/10'
                            : 'bg-transparent'
                        )}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <Avatar size="sm" name={displayTitle} src={avatarSrc} />
                        <span
                          className={cn(
                            'truncate text-sm',
                            isUnread ? 'font-semibold' : 'font-medium',
                            isActive || isUnread
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-500 dark:text-gray-400'
                          )}
                        >
                          {displayTitle}
                        </span>
                      </button>
                      <span
                        className={cn(
                          'pointer-events-none absolute -left-1 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full border border-gray-300 bg-white shadow-sm dark:border-white/40',
                          isUnread
                            ? ''
                            : 'opacity-0'
                        )}
                        aria-hidden="true"
                      />
                    </div>
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
