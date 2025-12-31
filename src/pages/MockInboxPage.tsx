import { useEffect, useRef, useState } from 'preact/hooks';
import { InboxPage } from '@/features/settings/pages/InboxPage';
import { MockInboxControls } from '@/features/inbox/mock/components/MockInboxControls';
import { MockInboxInfo } from '@/features/inbox/mock/components/MockInboxInfo';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';
import { useMockInbox } from '@/features/inbox/mock/useMockInbox';
import { apiClient } from '@/shared/lib/apiClient';
import { authClient } from '@/shared/lib/authClient';
import { SessionProvider } from '@/shared/contexts/SessionContext';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import type { Practice } from '@/shared/lib/apiClient';
import type { InboxFilters } from '@/shared/hooks/useInbox';
import type { MockConversation } from '@/features/inbox/mock/types';
import { setToken } from '@/shared/lib/tokenStorage';

const MOCK_PRACTICE_ID = 'mock-practice-inbox';
const mockPractice: Practice = {
  id: MOCK_PRACTICE_ID,
  slug: 'mock-inbox-practice',
  name: 'Mock Inbox Practice',
  description: 'Practice for inbox mock scenarios',
  kind: 'business',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 5,
  subscriptionPeriodEnd: Date.now() / 1000 + 30 * 24 * 60 * 60,
  createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  businessEmail: 'owner@mock-inbox.test',
  businessPhone: '+1-555-0101',
  logo: null,
  businessOnboardingStatus: 'completed',
  businessOnboardingCompletedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
  businessOnboardingSkipped: false,
  config: {
    ownerEmail: 'owner@mock-inbox.test',
    profileImage: null,
    introMessage: 'Welcome to the mock inbox practice',
    description: 'Mock practice for inbox testing',
    availableServices: ['Litigation', 'Contracts', 'Estate Planning'],
    serviceQuestions: {},
    brandColor: '#6366f1',
    accentColor: '#8b5cf6',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    }
  },
  metadata: {
    conversationConfig: {
      ownerEmail: 'owner@mock-inbox.test',
      introMessage: 'Welcome to the mock inbox practice',
      description: 'Mock practice for inbox testing',
      availableServices: ['Litigation', 'Contracts', 'Estate Planning'],
      serviceQuestions: {},
      domain: '',
      brandColor: '#6366f1',
      accentColor: '#8b5cf6',
      profileImage: null,
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: null,
        displayName: null,
        previewUrl: null
      },
      metadata: {
        serviceDetails: []
      }
    },
    onboarding: {
      status: 'completed',
      completed: true,
      skipped: false,
      completedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      lastSavedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      data: {
        firmName: 'Mock Inbox Practice',
        contactEmail: 'owner@mock-inbox.test',
        contactPhone: '+1-555-0101',
        services: [],
        __meta: {
          resumeStep: 'review-and-launch',
          savedAt: Date.now() - 1000 * 60 * 60 * 24 * 5
        }
      }
    }
  }
};

const mockSession = {
  data: {
    user: {
      id: 'mock-user-1',
      email: 'owner@mock-inbox.test',
      name: 'Mock Inbox User',
      practiceId: MOCK_PRACTICE_ID,
      activePracticeId: MOCK_PRACTICE_ID
    }
  },
  isPending: false
};

const originalUseSession = authClient.useSession;

function matchesInboxEndpoint(pathname: string) {
  return pathname.startsWith('/api/inbox');
}

function parseFilters(searchParams: URLSearchParams, defaults: InboxFilters): InboxFilters {
  const filters: InboxFilters = { ...defaults };
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const assignedTo = searchParams.get('assignedTo');
  const tags = searchParams.get('tags');

  if (status && status !== 'all') filters.status = status as InboxFilters['status'];
  if (priority) filters.priority = priority as InboxFilters['priority'];
  if (assignedTo) filters.assignedTo = assignedTo as InboxFilters['assignedTo'];
  if (tags) filters.tags = tags.split(',');

  return filters;
}

type SortField = 'last_message_at' | 'created_at' | 'priority';

function filterAndSortConversations(conversations: MockConversation[], filters: InboxFilters, searchParams: URLSearchParams) {
  const filtered = conversations.filter((conversation) => {
    if (filters.status && conversation.status !== filters.status) return false;
    if (filters.priority && conversation.priority !== filters.priority) return false;
    if (filters.assignedTo) {
      if (filters.assignedTo === 'me') {
        if (conversation.assigned_to !== mockSession.data.user.id) return false;
      } else if (filters.assignedTo === 'unassigned') {
        if (conversation.assigned_to) return false;
      } else if (conversation.assigned_to !== filters.assignedTo) {
        return false;
      }
    }
    if (filters.tags && filters.tags.length > 0) {
      return filters.tags.every((tag) => conversation.tags.includes(tag));
    }
    return true;
  });

  const sortByParam = searchParams.get('sortBy');
  const sortBy: SortField = sortByParam === 'last_message_at' || sortByParam === 'created_at' || sortByParam === 'priority'
    ? sortByParam
    : 'last_message_at';
  const sortOrderParam = searchParams.get('sortOrder');
  const sortOrder = sortOrderParam === 'asc' || sortOrderParam === 'desc' ? sortOrderParam : 'desc';

  const sorted = [...filtered].sort((a, b) => {
    const valueA = a[sortBy];
    const valueB = b[sortBy];

    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return sortOrder === 'asc' ? -1 : 1;
    if (valueB == null) return sortOrder === 'asc' ? 1 : -1;

    const direction = sortOrder === 'asc' ? 1 : -1;

    if (sortBy === 'priority') {
      const priorityRank: Record<'low' | 'normal' | 'high' | 'urgent', number> = {
        low: 1,
        normal: 2,
        high: 3,
        urgent: 4
      };
      const rankA = priorityRank[valueA as keyof typeof priorityRank];
      const rankB = priorityRank[valueB as keyof typeof priorityRank];
      if (rankA === rankB) return 0;
      return rankA > rankB ? direction : -direction;
    }

    const timeA = typeof valueA === 'string' ? Date.parse(valueA) : Number.NaN;
    const timeB = typeof valueB === 'string' ? Date.parse(valueB) : Number.NaN;

    if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
      if (timeA === timeB) return 0;
      return timeA > timeB ? direction : -direction;
    }

    const compareA = String(valueA);
    const compareB = String(valueB);
    if (compareA === compareB) return 0;
    return compareA > compareB ? direction : -direction;
  });

  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const paginated = sorted.slice(offset, offset + limit);

  return {
    conversations: paginated,
    total: filtered.length,
    limit,
    offset
  };
}

function parsePayload(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch (err) {
      console.warn('[MockInboxPage] Failed to parse payload', err);
      return null;
    }
  }
  if (typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

function buildJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

export function MockInboxPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockInbox();
  const mockRef = useRef(mock);

  useEffect(() => {
    mockRef.current = mock;
  }, [mock]);

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    if (!isDevMode) return;

    void setToken('mock-inbox-token');

    const authClientOverrideTarget = authClient as unknown as { useSession: () => typeof mockSession };
    authClientOverrideTarget.useSession = () => mockSession;

    const originalFetch = window.fetch.bind(window);

    const interceptFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
      const method = init?.method?.toUpperCase() || (typeof input === 'object' && 'method' in input && typeof input.method === 'string' ? input.method.toUpperCase() : 'GET');
      const parsedUrl = new URL(url, window.location.origin);
      const currentMock = mockRef.current;

      if (matchesInboxEndpoint(parsedUrl.pathname)) {
        const searchParams = parsedUrl.searchParams;
        const filters = parseFilters(searchParams, currentMock.state.filters);

        if (parsedUrl.pathname === '/api/inbox/conversations' && method === 'GET') {
          const result = filterAndSortConversations(currentMock.conversations, filters, searchParams);
          currentMock.addDebugEvent('api_conversations', { method: 'GET', filters, total: result.total });
          return buildJsonResponse({
            success: true,
            data: result
          });
        }

        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        const conversationId = pathParts.length >= 4 ? pathParts[3] : null;
        const action = pathParts.length >= 5 ? pathParts[4] : null;

        if (parsedUrl.pathname === '/api/inbox/stats' && method === 'GET') {
          currentMock.addDebugEvent('api_stats');
          return buildJsonResponse({ success: true, data: currentMock.stats });
        }

        if (conversationId && method === 'GET') {
          const conversation = currentMock.conversations.find((item) => item.id === conversationId);
          if (conversation) {
            currentMock.addDebugEvent('api_conversation', { conversationId });
            return buildJsonResponse({ success: true, data: conversation });
          }
          return buildJsonResponse({ success: false, error: 'Not found' }, { status: 404 });
        }

        if (conversationId && method === 'PUT') {
          const body = parsePayload(init?.body) as Partial<MockConversation> | null ?? {};
          const existing = currentMock.conversations.find((item) => item.id === conversationId);
          const optimistic = existing ? { ...existing, ...body, updated_at: new Date().toISOString() } : existing;
          await currentMock.updateConversation(conversationId, body);
          currentMock.addDebugEvent('api_update', { conversationId, body });
          return buildJsonResponse({ success: true, data: optimistic ?? body });
        }

        if (conversationId && action === 'assign' && method === 'POST') {
          const body = parsePayload(init?.body) as { assignedTo?: string | null } | null;
          const assignedTo = body?.assignedTo === 'me' ? mockSession.data.user.id : body?.assignedTo ?? null;
          const existing = currentMock.conversations.find((item) => item.id === conversationId);
          const optimistic = existing
            ? { ...existing, assigned_to: assignedTo, updated_at: new Date().toISOString() }
            : existing;
          await currentMock.assignConversation(conversationId, assignedTo);
          currentMock.addDebugEvent('api_assign', { conversationId, assignedTo });
          return buildJsonResponse({ success: true, data: optimistic ?? body });
        }

        if (conversationId && action === 'archive' && method === 'POST') {
          const existing = currentMock.conversations.find((item) => item.id === conversationId);
          const optimistic = existing ? { ...existing, status: 'archived', updated_at: new Date().toISOString() } : existing;
          await currentMock.updateConversation(conversationId, { status: 'archived' });
          currentMock.addDebugEvent('api_archive', { conversationId });
          return buildJsonResponse({ success: true, data: optimistic });
        }
      }

      return originalFetch(input, init);
    };

    window.fetch = interceptFetch as typeof fetch;

    const requestInterceptor = apiClient.interceptors.request.use((config) => {
      if (import.meta.env.DEV) {
        config.baseURL = window.location.origin;
      }
      return config;
    });

    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        const url = response.config.url || '';
        const resolvedUrl = (() => {
          try {
            return new URL(url, window.location.origin);
          } catch {
            return null;
          }
        })();
        const pathname = resolvedUrl?.pathname ?? url;
        const method = response.config.method?.toLowerCase() ?? 'get';
        const currentMock = mockRef.current;

        if (matchesInboxEndpoint(pathname)) {
          const searchParams = resolvedUrl?.searchParams ?? new URLSearchParams();
          const filters = parseFilters(searchParams, currentMock.state.filters);
          const pathParts = pathname.split('/').filter(Boolean);
          const conversationId = pathParts.length >= 4 ? pathParts[3] : null;
          const action = pathParts.length >= 5 ? pathParts[4] : null;

          if (pathname === '/api/inbox/conversations' && method === 'get') {
            const result = filterAndSortConversations(currentMock.conversations, filters, searchParams);
            currentMock.addDebugEvent('api_conversations', { method: 'axios', filters, total: result.total });
            return { ...response, data: { success: true, data: result } };
          }

          if (pathname === '/api/inbox/stats' && method === 'get') {
            currentMock.addDebugEvent('api_stats', { transport: 'axios' });
            return { ...response, data: { success: true, data: currentMock.stats } };
          }

          if (conversationId && !action && method === 'get') {
            const conversation = currentMock.conversations.find((item) => item.id === conversationId);
            return { ...response, data: { success: Boolean(conversation), data: conversation } };
          }

          if (conversationId && method === 'put') {
            const payload = parsePayload(response.config.data) as Partial<MockConversation> | null;
            if (payload) {
              void currentMock.updateConversation(conversationId, payload);
            }
            return { ...response, data: { success: true, data: payload ?? {} } };
          }

          if (conversationId && action === 'assign' && method === 'post') {
            const payload = parsePayload(response.config.data) as { assignedTo?: string | null } | null;
            const assignedTo = payload?.assignedTo === 'me' ? mockSession.data.user.id : payload?.assignedTo ?? null;
            void currentMock.assignConversation(conversationId, assignedTo);
            return { ...response, data: { success: true, data: { assignedTo } } };
          }

          if (conversationId && action === 'archive' && method === 'post') {
            void currentMock.updateConversation(conversationId, { status: 'archived' });
            return { ...response, data: { success: true, data: { status: 'archived' } } };
          }
        }

        if (url.includes('/api/practice/list')) {
          return { ...response, data: { practices: [mockPractice] } };
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && response.config.method?.toLowerCase() === 'put') {
          return { ...response, data: { practice: mockPractice } };
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          return { ...response, data: { practice: mockPractice } };
        }

        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          return {
            ...response,
            data: {
              members: [
                { userId: 'mock-user-1', role: 'owner', email: 'owner@mock-inbox.test', name: 'Mock Owner', image: null, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30 },
                { userId: 'mock-user-2', role: 'attorney', email: 'attorney@mock-inbox.test', name: 'Mock Attorney', image: null, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10 }
              ]
            }
          };
        }

        if (url.includes('/api/practice/invitations')) {
          return { ...response, data: { invitations: [] } };
        }

        return response;
      },
      (error) => {
        const url = error.config?.url || '';
        const resolvedUrl = (() => {
          try {
            return new URL(url, window.location.origin);
          } catch {
            return null;
          }
        })();
        const pathname = resolvedUrl?.pathname ?? url;
        const method = error.config?.method?.toLowerCase() ?? 'get';
        const currentMock = mockRef.current;

        if (matchesInboxEndpoint(pathname)) {
          const searchParams = resolvedUrl?.searchParams ?? new URLSearchParams();
          const filters = parseFilters(searchParams, currentMock.state.filters);
          const pathParts = pathname.split('/').filter(Boolean);
          const conversationId = pathParts.length >= 4 ? pathParts[3] : null;
          const action = pathParts.length >= 5 ? pathParts[4] : null;

          if (pathname === '/api/inbox/conversations' && method === 'get') {
            const result = filterAndSortConversations(currentMock.conversations, filters, searchParams);
            return Promise.resolve({
              data: { success: true, data: result },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: error.config
            });
          }

          if (pathname === '/api/inbox/stats' && method === 'get') {
            return Promise.resolve({
              data: { success: true, data: currentMock.stats },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: error.config
            });
          }

          if (conversationId && !action && method === 'get') {
            const conversation = currentMock.conversations.find((item) => item.id === conversationId);
            return Promise.resolve({
              data: { success: Boolean(conversation), data: conversation },
              status: conversation ? 200 : 404,
              statusText: conversation ? 'OK' : 'Not Found',
              headers: {},
              config: error.config
            });
          }

          if (conversationId && method === 'put') {
            const payload = parsePayload(error.config?.data) as Partial<MockConversation> | null;
            if (payload) {
              void currentMock.updateConversation(conversationId, payload);
            }
            return Promise.resolve({
              data: { success: true, data: payload ?? {} },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: error.config
            });
          }

          if (conversationId && action === 'assign' && method === 'post') {
            const payload = parsePayload(error.config?.data) as { assignedTo?: string | null } | null;
            const assignedTo = payload?.assignedTo === 'me' ? mockSession.data.user.id : payload?.assignedTo ?? null;
            void currentMock.assignConversation(conversationId, assignedTo);
            return Promise.resolve({
              data: { success: true, data: { assignedTo } },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: error.config
            });
          }

          if (conversationId && action === 'archive' && method === 'post') {
            void currentMock.updateConversation(conversationId, { status: 'archived' });
            return Promise.resolve({
              data: { success: true, data: { status: 'archived' } },
              status: 200,
              statusText: 'OK',
              headers: {},
              config: error.config
            });
          }
        }

        if (url.includes('/api/practice/list')) {
          return Promise.resolve({
            data: { practices: [mockPractice] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && error.config?.method?.toLowerCase() === 'put') {
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          return Promise.resolve({
            data: {
              members: [
                { userId: 'mock-user-1', role: 'owner', email: 'owner@mock-inbox.test', name: 'Mock Owner', image: null, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30 },
                { userId: 'mock-user-2', role: 'attorney', email: 'attorney@mock-inbox.test', name: 'Mock Attorney', image: null, createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10 }
              ]
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes('/api/practice/invitations')) {
          return Promise.resolve({
            data: { invitations: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        return Promise.reject(error);
      }
    );

    return () => {
      window.fetch = originalFetch;
      apiClient.interceptors.request.eject(requestInterceptor);
      apiClient.interceptors.response.eject(responseInterceptor);
      const authClientRestoreTarget = authClient as unknown as { useSession: typeof originalUseSession };
      authClientRestoreTarget.useSession = originalUseSession;
    };
  }, [isDevMode]);

  if (!isDevMode) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-300">
        Redirecting…
      </div>
    );
  }

  return (
    <ToastProvider>
      <SessionProvider>
        <div className="flex h-screen bg-white dark:bg-dark-bg">
          <MockInboxControls mock={mock} />

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                <div className="mb-4 p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Mock Inbox Page</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Development-only inbox for testing conversation lists</p>
                </div>
                <InboxPage className="h-[calc(100%-80px)]" />
              </div>
            </div>

            <DebugPanel 
              events={mock.debugEvents.map(event => ({ ...event, data: event.data ?? {} }))} 
              onClear={mock.clearDebugEvents} 
            />
          </div>

          <MockInboxInfo mock={mock} />
        </div>
      </SessionProvider>
    </ToastProvider>
  );
}
