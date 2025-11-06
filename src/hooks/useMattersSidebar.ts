import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getOrganizationWorkspaceEndpoint } from '../config/api';

export type MattersSidebarStatus = 'lead' | 'open' | 'in_progress' | 'completed' | 'archived';

export interface MattersSidebarItem {
  id: string;
  title: string;
  matterType: string;
  status: MattersSidebarStatus;
  priority?: string;
  clientName?: string | null;
  leadSource?: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedBy?: {
    userId: string;
    acceptedAt: string | null;
  } | null;
}

interface UseMattersSidebarOptions {
  organizationId?: string;
  initialStatus?: MattersSidebarStatus;
  pageSize?: number;
  autoFetch?: boolean;
  searchDelayMs?: number;
}

interface FetchResponsePayload {
  items?: Array<Record<string, unknown>>;
  matters?: Array<Record<string, unknown>>;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface UseMattersSidebarResult {
  matters: MattersSidebarItem[];
  loading: boolean;
  error: string | null;
  status: MattersSidebarStatus;
  setStatus: (status: MattersSidebarStatus) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

function normalizeMattersResponse(payload: FetchResponsePayload): MattersSidebarItem[] {
  const source = Array.isArray(payload.items) ? payload.items
    : Array.isArray(payload.matters) ? payload.matters
    : [];

  return source.map(item => {
    const acceptedByRaw = item.acceptedBy as
      | { userId?: unknown; acceptedAt?: unknown }
      | null
      | undefined;
    const acceptedBy = acceptedByRaw && typeof acceptedByRaw === 'object'
      ? {
          userId: typeof acceptedByRaw.userId === 'string' ? acceptedByRaw.userId : String(acceptedByRaw.userId ?? ''),
          acceptedAt: ((): string | null => {
            if (acceptedByRaw.acceptedAt === null) return null;
            return typeof acceptedByRaw.acceptedAt === 'string' ? acceptedByRaw.acceptedAt : null;
          })()
        }
      : null;

    return {
      id: typeof item.id === 'string' ? item.id : String(item.id ?? ''),
      title: typeof item.title === 'string' ? item.title : 'Untitled Matter',
      matterType: typeof item.matterType === 'string' ? item.matterType : 'General',
      status: (typeof item.status === 'string' ? item.status : 'lead') as MattersSidebarStatus,
      priority: typeof item.priority === 'string' ? item.priority : undefined,
      clientName: typeof item.clientName === 'string' ? item.clientName : null,
      leadSource: typeof item.leadSource === 'string' ? item.leadSource : null,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      acceptedBy
    };
  });
}

export function useMattersSidebar(options: UseMattersSidebarOptions = {}): UseMattersSidebarResult {
  const {
    organizationId,
    initialStatus = 'lead',
    pageSize = 25,
    autoFetch = true,
    searchDelayMs = 300
  } = options;

  const [status, setStatus] = useState<MattersSidebarStatus>(initialStatus);
  const [searchTerm, setSearchTermState] = useState('');
  const [matters, setMatters] = useState<MattersSidebarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const searchTermRef = useRef(searchTerm);
  const abortControllerRef = useRef<AbortController | null>(null);

  const setSearchTerm = useCallback((value: string) => {
    setSearchTermState(value);
    searchTermRef.current = value;
  }, []);

  const resetPagination = useCallback(() => {
    cursorRef.current = null;
    setHasMore(false);
  }, []);

  const fetchMatters = useCallback(async (append: boolean = false, overrideSearch?: string) => {
    if (!organizationId) {
      setMatters([]);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = getOrganizationWorkspaceEndpoint(organizationId, 'matters');
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('status', status);
      const searchValue = typeof overrideSearch === 'string' ? overrideSearch : searchTermRef.current;
      if (searchValue && searchValue.trim().length > 0) {
        params.set('q', searchValue.trim());
      }
      if (cursorRef.current && append) {
        params.set('cursor', cursorRef.current);
      }

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to fetch matters (${response.status})`);
      }

      const json = await response.json() as {
        success?: boolean;
        error?: string;
        data?: FetchResponsePayload;
      };

      if (json.success === false) {
        throw new Error(json.error || 'Failed to fetch matters');
      }

      const payload = json.data ?? {};
      const normalizedItems = normalizeMattersResponse(payload);

      setMatters(prev => append ? [...prev, ...normalizedItems] : normalizedItems);
      cursorRef.current = payload.nextCursor ?? null;
      setHasMore(Boolean(payload.hasMore && payload.nextCursor));
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load matters';
      setError(message);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [organizationId, pageSize, status]);

  const refresh = useCallback(async () => {
    resetPagination();
    await fetchMatters(false);
  }, [fetchMatters, resetPagination]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) {
      return;
    }
    await fetchMatters(true);
  }, [fetchMatters, hasMore, loading]);

  // Keep search ref synchronized
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  // Auto fetch on organization/status change
  useEffect(() => {
    if (!autoFetch) {
      return;
    }
    resetPagination();
    void fetchMatters(false);
  }, [autoFetch, fetchMatters, resetPagination, status, organizationId]);

  // Debounced search updates
  useEffect(() => {
    if (!autoFetch || !organizationId) {
      return;
    }

    const handler = window.setTimeout(() => {
      resetPagination();
      void fetchMatters(false, searchTermRef.current);
    }, searchDelayMs);

    return () => {
      window.clearTimeout(handler);
    };
  }, [autoFetch, fetchMatters, organizationId, resetPagination, searchDelayMs, searchTerm]);

  const result = useMemo<UseMattersSidebarResult>(() => ({
    matters,
    loading,
    error,
    status,
    setStatus,
    searchTerm,
    setSearchTerm,
    refresh,
    loadMore,
    hasMore
  }), [matters, loading, error, status, searchTerm, setSearchTerm, refresh, loadMore, hasMore]);

  return result;
}

