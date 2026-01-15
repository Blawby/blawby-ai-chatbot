import { atom, onMount } from 'nanostores';
import { useStore } from '@nanostores/preact';
import { useCallback } from 'preact/hooks';
import { getWorkerApiUrl } from '@/config/urls';
import { getTokenAsync } from '@/shared/lib/tokenStorage';
import type {
  NotificationCategory,
  NotificationItem,
  NotificationListResult,
  NotificationStreamEvent
} from '@/features/notifications/types';

const CATEGORIES: NotificationCategory[] = ['message', 'system', 'payment', 'intake', 'matter'];

const PAGE_LIMIT = 25;
const MAX_UNREAD_PAGES = 5;

type CategoryState = {
  items: NotificationItem[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  nextCursor: string | null;
};

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'error';

type NotificationState = {
  categories: Record<NotificationCategory, CategoryState>;
  unreadCounts: Record<NotificationCategory, number>;
  conversationUnreadCounts: Record<string, number>;
  streamStatus: StreamStatus;
  lastEventAt: string | null;
};

type SystemNotificationPayload = {
  id?: string;
  title: string;
  message?: string;
  link?: string;
  duration?: number;
};

const createCategoryState = (): CategoryState => ({
  items: [],
  isLoading: false,
  error: null,
  hasMore: false,
  nextCursor: null
});

const createCategoryMap = <T>(factory: () => T): Record<NotificationCategory, T> => ({
  message: factory(),
  system: factory(),
  payment: factory(),
  intake: factory(),
  matter: factory()
});

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

const notificationStore = atom<NotificationState>({
  categories: createCategoryMap(createCategoryState),
  unreadCounts: createCategoryMap(() => 0),
  conversationUnreadCounts: {},
  streamStatus: 'idle',
  lastEventAt: null
});

const updateCategoryState = (
  category: NotificationCategory,
  updater: (state: CategoryState) => CategoryState
) => {
  const current = notificationStore.get();
  const nextCategory = updater(current.categories[category]);
  notificationStore.set({
    ...current,
    categories: {
      ...current.categories,
      [category]: nextCategory
    }
  });
};

const updateUnreadCounts = (counts: Partial<Record<NotificationCategory, number>>) => {
  const current = notificationStore.get();
  notificationStore.set({
    ...current,
    unreadCounts: {
      ...current.unreadCounts,
      ...counts
    }
  });
};

const updateUnreadCountsWith = (
  updater: (counts: Record<NotificationCategory, number>) => Record<NotificationCategory, number>
) => {
  const current = notificationStore.get();
  notificationStore.set({
    ...current,
    unreadCounts: updater(current.unreadCounts)
  });
};

const updateConversationUnreadCounts = (nextCounts: Record<string, number>) => {
  const current = notificationStore.get();
  notificationStore.set({
    ...current,
    conversationUnreadCounts: nextCounts
  });
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await getTokenAsync();
  if (!token) {
    throw new Error('Authentication token not available');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
};

const buildWorkerUrl = (path: string, params?: Record<string, string | number | boolean | undefined | null>) => {
  const url = new URL(`${getWorkerApiUrl()}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const parseListResponse = async (response: Response): Promise<NotificationListResult> => {
  const payload = await response.json() as { success?: boolean; data?: NotificationListResult; error?: string };
  if (!payload?.success || !payload.data) {
    throw new Error(payload?.error || 'Failed to load notifications');
  }
  return payload.data;
};

const mergeItems = (existing: NotificationItem[], incoming: NotificationItem[], append: boolean) => {
  if (!append) return incoming;
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  incoming.forEach((item) => {
    if (!seen.has(item.id)) {
      next.push(item);
    }
  });
  return next;
};

const fetchNotifications = async (options: {
  category: NotificationCategory;
  cursor?: string | null;
  append?: boolean;
  unreadOnly?: boolean;
}): Promise<void> => {
  const { category, cursor, append = false, unreadOnly = false } = options;
  const currentState = notificationStore.get().categories[category];
  if (currentState.isLoading) return;
  updateCategoryState(category, (state) => ({
    ...state,
    isLoading: true,
    error: null
  }));

  try {
    const headers = await getAuthHeaders();
    const url = buildWorkerUrl('/api/notifications', {
      category,
      cursor: cursor ?? undefined,
      limit: PAGE_LIMIT,
      unreadOnly: unreadOnly ? '1' : undefined
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Failed to load notifications (${response.status})`);
    }

    const result = await parseListResponse(response);
    updateCategoryState(category, (state) => ({
      ...state,
      isLoading: false,
      error: null,
      items: mergeItems(state.items, result.items, append),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor ?? null
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notifications';
    updateCategoryState(category, (state) => ({
      ...state,
      isLoading: false,
      error: message
    }));
  }
};

export const refreshUnreadCounts = async () => {
  try {
    const headers = await getAuthHeaders();
    const entries = await Promise.all(
      CATEGORIES.map(async (category) => {
        const url = buildWorkerUrl('/api/notifications/unread-count', { category });
        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `Failed to load unread count (${response.status})`);
        }
        const payload = await response.json() as { success?: boolean; data?: { count?: number }; error?: string };
        if (!payload?.success) {
          throw new Error(payload?.error || 'Failed to load unread count');
        }
        return [category, Number(payload.data?.count ?? 0)] as const;
      })
    );

    const nextCounts = entries.reduce<Record<NotificationCategory, number>>((acc, [category, count]) => {
      acc[category] = count;
      return acc;
    }, createCategoryMap(() => 0));

    updateUnreadCounts(nextCounts);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Notifications] Failed to refresh unread counts', error);
    }
  }
};

const extractConversationId = (item: NotificationItem): string | null => {
  if (item.entityType && item.entityType.toLowerCase() === 'conversation' && item.entityId) {
    return item.entityId;
  }

  const metadata = item.metadata ?? {};
  const metaConversationId = metadata.conversationId || metadata.conversation_id;
  if (typeof metaConversationId === 'string' && metaConversationId.trim().length > 0) {
    return metaConversationId.trim();
  }

  if (item.link) {
    const match = item.link.match(/\/chats\/([^/?#]+)/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }

  return null;
};

export const refreshConversationCounts = async () => {
  try {
    const headers = await getAuthHeaders();
    let cursor: string | null = null;
    let page = 0;
    const unreadItems: NotificationItem[] = [];

    while (page < MAX_UNREAD_PAGES) {
      const url = buildWorkerUrl('/api/notifications', {
        category: 'message',
        limit: PAGE_LIMIT,
        cursor: cursor ?? undefined,
        unreadOnly: '1'
      });

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        break;
      }

      const result = await parseListResponse(response);
      unreadItems.push(...result.items);
      if (!result.hasMore || !result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
      page += 1;
    }

    const counts: Record<string, number> = {};
    unreadItems.forEach((item) => {
      if (item.readAt) return;
      const conversationId = extractConversationId(item);
      if (!conversationId) return;
      counts[conversationId] = (counts[conversationId] ?? 0) + 1;
    });

    updateConversationUnreadCounts(counts);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Notifications] Failed to refresh conversation counts', error);
    }
  }
};

const maybeShowOsNotification = (event: NotificationStreamEvent) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (event.category !== 'message' && event.category !== 'system') return;

  const title = event.title ?? 'New notification';
  try {
    void new Notification(title, { body: event.category === 'message' ? 'New message received.' : 'New system alert.' });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Notifications] Failed to show OS notification', error);
    }
  }
};

const setStreamStatus = (status: StreamStatus, lastEventAt?: string | null) => {
  const current = notificationStore.get();
  notificationStore.set({
    ...current,
    streamStatus: status,
    lastEventAt: lastEventAt ?? current.lastEventAt
  });
};

let streamController: AbortController | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let streamActive = false;
const initialLoadRequested = new Set<NotificationCategory>();
let countsRequested = false;

const getNotificationCategoryFromPath = (path: string): NotificationCategory | null => {
  const segments = path.split('/').filter(Boolean);
  const index = segments.indexOf('notifications');
  if (index === -1) return null;
  const candidate = segments[index + 1];
  if (!candidate) return 'message';
  const normalized = candidate.toLowerCase();
  return CATEGORIES.includes(normalized as NotificationCategory)
    ? (normalized as NotificationCategory)
    : 'message';
};

export const ensureNotificationsLoaded = (targetCategory: NotificationCategory) => {
  const targetState = notificationStore.get().categories[targetCategory];
  const shouldLoad = targetState.items.length === 0 && !targetState.isLoading && !targetState.error;
  if (shouldLoad && !initialLoadRequested.has(targetCategory)) {
    initialLoadRequested.add(targetCategory);
    void fetchNotifications({ category: targetCategory });
  }
};

export const initUnreadAndConversationCounts = () => {
  if (countsRequested) return;
  countsRequested = true;
  void refreshUnreadCounts();
  void refreshConversationCounts();
};

const stopStream = () => {
  if (streamController) {
    streamController.abort();
    streamController = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  streamActive = false;
  setStreamStatus('idle');
};

const scheduleReconnect = () => {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    void startStream();
  }, 5000);
};

const handleStreamEvent = (event: NotificationStreamEvent) => {
  if (event.notificationId) {
    setStreamStatus('connected', event.createdAt ?? new Date().toISOString());
    if (event.category) {
      void fetchNotifications({ category: event.category });
      void refreshUnreadCounts();
      if (event.category === 'message') {
        void refreshConversationCounts();
      }
    }
  }

  maybeShowOsNotification(event);
};

const parseSseBlock = (block: string): { event: string; data: string } | null => {
  const trimmed = block.trim();
  if (!trimmed) return null;

  let eventName = 'message';
  let dataPayload = '';

  trimmed.split('\n').forEach((line) => {
    const cleaned = line.trim();
    if (!cleaned || cleaned.startsWith(':')) return;
    if (cleaned.startsWith('event:')) {
      eventName = cleaned.slice(6).trim();
      return;
    }
    if (cleaned.startsWith('data:')) {
      dataPayload += (dataPayload ? '\n' : '') + cleaned.slice(5).trim();
    }
  });

  if (!dataPayload) return null;
  return { event: eventName, data: dataPayload };
};

const startStream = async () => {
  if (streamActive) return;
  streamActive = true;

  try {
    const headers = await getAuthHeaders();
    const url = buildWorkerUrl('/api/notifications/stream');
    streamController = new AbortController();
    setStreamStatus('connecting');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      credentials: 'include',
      signal: streamController.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream failed: ${response.status}`);
    }

    setStreamStatus('connected');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        scheduleReconnect();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsedBlock = parseSseBlock(block);
        if (parsedBlock && parsedBlock.event === 'notification') {
          try {
            const parsed = JSON.parse(parsedBlock.data) as NotificationStreamEvent;
            handleStreamEvent(parsed);
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn('[Notifications] Failed to parse stream event', error);
            }
          }
        }
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Notifications] Notification stream error', error);
    }
    if (!streamController?.signal.aborted) {
      setStreamStatus('error');
      scheduleReconnect();
    }
  } finally {
    streamActive = false;
  }
};

onMount(notificationStore, () => {
  initUnreadAndConversationCounts();
  void startStream();

  const loadFromPath = () => {
    if (typeof window === 'undefined') return;
    const category = getNotificationCategoryFromPath(window.location.pathname);
    if (category) {
      ensureNotificationsLoaded(category);
    }
  };

  const handleTokenUpdated = () => {
    stopStream();
    void startStream();
  };

  const handleTokenCleared = () => {
    stopStream();
  };

  const handleSystemNotification = (event: Event) => {
    const detail = (event as CustomEvent<SystemNotificationPayload>).detail;
    if (!detail?.title) return;
    const systemNotification: NotificationItem = {
      id: detail.id ?? `local-${generateUUID()}`,
      userId: 'local',
      category: 'system',
      title: detail.title,
      body: detail.message ?? null,
      link: detail.link ?? null,
      senderName: 'Blawby',
      senderAvatarUrl: '/blawby-favicon-iframe.png',
      createdAt: new Date().toISOString(),
      readAt: null,
      metadata: { source: 'local' }
    };

    updateCategoryState('system', (state) => ({
      ...state,
      items: [systemNotification, ...state.items]
    }));

    updateUnreadCounts({
      system: notificationStore.get().unreadCounts.system + 1
    });
  };

  if (typeof window !== 'undefined') {
    loadFromPath();
    window.addEventListener('popstate', loadFromPath);
    window.addEventListener('auth:token-updated', handleTokenUpdated);
    window.addEventListener('auth:token-cleared', handleTokenCleared);
    window.addEventListener('notifications:system', handleSystemNotification);
  }

  return () => {
    stopStream();
    initialLoadRequested.clear();
    countsRequested = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', loadFromPath);
      window.removeEventListener('auth:token-updated', handleTokenUpdated);
      window.removeEventListener('auth:token-cleared', handleTokenCleared);
      window.removeEventListener('notifications:system', handleSystemNotification);
    }
  };
});

export const refreshNotifications = async (category: NotificationCategory) => {
  await fetchNotifications({ category });
};

export const loadMoreNotifications = async (category: NotificationCategory) => {
  const state = notificationStore.get().categories[category];
  if (!state.hasMore || state.isLoading || !state.nextCursor) return;
  await fetchNotifications({ category, cursor: state.nextCursor, append: true });
};

export const markNotificationRead = async (notificationId: string, category: NotificationCategory) => {
  const headers = await getAuthHeaders();
  const url = buildWorkerUrl(`/api/notifications/${notificationId}/read`);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Failed to mark notification read (${response.status})`);
  }

  const currentItem = notificationStore.get().categories[category].items.find((item) => item.id === notificationId);
  if (!currentItem || currentItem.readAt) {
    return;
  }

  const now = new Date().toISOString();
  updateCategoryState(category, (state) => ({
    ...state,
    items: state.items.map((item) => (item.id === notificationId ? { ...item, readAt: now } : item))
  }));

  updateUnreadCountsWith((counts) => ({
    ...counts,
    [category]: Math.max(0, counts[category] - 1)
  }));

  const updatedItem = notificationStore.get().categories[category].items.find((item) => item.id === notificationId);
  if (updatedItem?.category === 'message') {
    void refreshConversationCounts();
  }
};

export const markNotificationUnread = async (notificationId: string, category: NotificationCategory) => {
  const headers = await getAuthHeaders();
  const url = buildWorkerUrl(`/api/notifications/${notificationId}/unread`);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Failed to mark notification unread (${response.status})`);
  }

  const currentItem = notificationStore.get().categories[category].items.find((item) => item.id === notificationId);
  if (!currentItem || !currentItem.readAt) {
    return;
  }

  updateCategoryState(category, (state) => ({
    ...state,
    items: state.items.map((item) => (item.id === notificationId ? { ...item, readAt: null } : item))
  }));

  updateUnreadCountsWith((counts) => ({
    ...counts,
    [category]: counts[category] + 1
  }));

  const updatedItem = notificationStore.get().categories[category].items.find((item) => item.id === notificationId);
  if (updatedItem?.category === 'message') {
    void refreshConversationCounts();
  }
};

export const markAllNotificationsRead = async (category: NotificationCategory) => {
  const headers = await getAuthHeaders();
  const url = buildWorkerUrl('/api/notifications/read-all', { category });
  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Failed to mark all read (${response.status})`);
  }

  const now = new Date().toISOString();
  updateCategoryState(category, (state) => ({
    ...state,
    items: state.items.map((item) => ({ ...item, readAt: item.readAt ?? now }))
  }));

  updateUnreadCounts({
    [category]: 0
  });

  if (category === 'message') {
    void refreshConversationCounts();
  }
};

export const useNotifications = (category: NotificationCategory) => {
  const state = useStore(notificationStore);
  const categoryState = state.categories[category];
  const ensureLoaded = useCallback((targetCategory = category) => {
    ensureNotificationsLoaded(targetCategory);
  }, [category]);

  return {
    notifications: categoryState.items,
    isLoading: categoryState.isLoading,
    error: categoryState.error,
    hasMore: categoryState.hasMore,
    unreadCount: state.unreadCounts[category],
    ensureLoaded,
    loadMore: () => loadMoreNotifications(category),
    refresh: () => refreshNotifications(category),
    markRead: (notificationId: string) => markNotificationRead(notificationId, category),
    markUnread: (notificationId: string) => markNotificationUnread(notificationId, category),
    markAllRead: () => markAllNotificationsRead(category)
  };
};

export const useNotificationStoreState = () => useStore(notificationStore);
