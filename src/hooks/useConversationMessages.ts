import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: 'text' | 'system' | 'file' | 'matter_update';
  reply_to_message_id: string | null;
  metadata: string | null;
  is_edited: number;
  edited_at: string | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
}

export interface UseConversationMessagesOptions {
  conversationId?: string | null;
  pageSize?: number;
  autoConnect?: boolean;
}

export interface UseConversationMessagesResult {
  messages: ConversationMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  sendMessage: (content: string, options?: { replyTo?: string | null; messageType?: ConversationMessage['message_type']; metadata?: Record<string, unknown>; }) => Promise<ConversationMessage | null>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markRead: (messageId: string) => Promise<void>;
}

function mergeMessage(list: ConversationMessage[], incoming: ConversationMessage): ConversationMessage[] {
  const existingIndex = list.findIndex(msg => msg.id === incoming.id);
  if (existingIndex >= 0) {
    const updated = [...list];
    updated[existingIndex] = incoming;
    return updated;
  }
  return [...list, incoming].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function useConversationMessages(options: UseConversationMessagesOptions): UseConversationMessagesResult {
  const { conversationId, pageSize = 50, autoConnect = true } = options;
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isFetchingRef = useRef(false);

  const buildUrl = useCallback((isLoadMore: boolean) => {
    if (!conversationId) {
      return null;
    }
    const params = new URLSearchParams();
    params.set('limit', Math.max(1, Math.min(pageSize, 200)).toString());
    if (isLoadMore && nextCursorRef.current) {
      params.set('before', nextCursorRef.current);
    }
    return `/api/conversations/${conversationId}/messages?${params.toString()}`;
  }, [conversationId, pageSize]);

  const fetchMessages = useCallback(async (isLoadMore: boolean) => {
    if (!conversationId || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const url = buildUrl(isLoadMore);
      if (!url) {
        throw new Error('Missing conversationId');
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to fetch conversation messages (${response.status})`);
      }

      const payload = await response.json() as { data?: { items?: ConversationMessage[]; nextCursor?: string | null } };
      const items = payload.data?.items ?? [];
      const nextCursor = payload.data?.nextCursor ?? null;
      nextCursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));

      setMessages(prev => {
        if (isLoadMore) {
          const merged = [...items, ...prev];
          const unique = new Map<string, ConversationMessage>();
          for (const message of merged) {
            unique.set(message.id, message);
          }
          return Array.from(unique.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
        return [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    } catch (err) {
      console.error('Failed to fetch conversation messages', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [buildUrl, conversationId]);

  const refresh = useCallback(async () => {
    nextCursorRef.current = null;
    await fetchMessages(false);
  }, [fetchMessages]);

  const loadMore = useCallback(async () => {
    if (!hasMore) {
      return;
    }
    await fetchMessages(true);
  }, [fetchMessages, hasMore]);

  const connectStream = useCallback(() => {
    if (!conversationId || !autoConnect) {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource(`/api/conversations/${conversationId}/stream`, { withCredentials: true });
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { event: string; data: unknown };
        if (!payload || typeof payload !== 'object') {
          return;
        }

        switch (payload.event) {
          case 'message':
          case 'message_updated': {
            const message = payload.data as ConversationMessage;
            if (message?.id) {
              setMessages(prev => mergeMessage(prev, message));
            }
            break;
          }
          case 'message_deleted': {
            const message = payload.data as ConversationMessage;
            if (message?.id) {
              setMessages(prev => prev.map(item => item.id === message.id ? message : item));
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.warn('Failed to parse conversation stream event', err);
      }
    };

    source.onerror = (err) => {
      console.warn('Conversation stream error', err);
      source.close();
      eventSourceRef.current = null;
    };
  }, [conversationId, autoConnect]);

  const disconnectStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    nextCursorRef.current = null;
    setMessages([]);
    if (conversationId) {
      fetchMessages(false).catch(error => {
        console.error('Initial conversation message fetch failed', error);
      });
    }
    connectStream();
    return () => {
      disconnectStream();
    };
  }, [conversationId, fetchMessages, connectStream, disconnectStream]);

  const sendMessage = useCallback(async (content: string, opts?: { replyTo?: string | null; messageType?: ConversationMessage['message_type']; metadata?: Record<string, unknown>; }) => {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    const payload: Record<string, unknown> = {
      content: trimmed,
      clientNonce: crypto.randomUUID()
    };
    if (opts?.replyTo) {
      payload.replyToMessageId = opts.replyTo;
    }
    if (opts?.messageType) {
      payload.messageType = opts.messageType;
    }
    if (opts?.metadata) {
      payload.metadata = opts.metadata;
    }

    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to send message');
    }

    const body = await response.json() as { data?: { message?: ConversationMessage } };
    const message = body.data?.message ?? null;
    if (message) {
      setMessages(prev => mergeMessage(prev, message));
    }
    return message;
  }, [conversationId]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }
    const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'edit', content })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to edit message');
    }
    const body = await response.json() as { data?: { message?: ConversationMessage } };
    const message = body.data?.message;
    if (message) {
      setMessages(prev => mergeMessage(prev, message));
    }
  }, [conversationId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }
    const response = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'delete' })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to delete message');
    }
    const body = await response.json() as { data?: { message?: ConversationMessage } };
    const message = body.data?.message;
    if (message) {
      setMessages(prev => mergeMessage(prev, message));
    }
  }, [conversationId]);

  const markRead = useCallback(async (messageId: string) => {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }
    await fetch(`/api/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ lastMessageId: messageId })
    });
  }, [conversationId]);

  return {
    messages,
    loading,
    error,
    hasMore,
    refresh,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    markRead
  };
}
