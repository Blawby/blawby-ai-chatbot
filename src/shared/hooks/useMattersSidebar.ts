import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getPracticeWorkspaceEndpoint } from '@/config/api';

export type MattersSidebarStatus = 'draft' | 'active';

export interface MattersSidebarItem {
  id: string;
  title: string;
  matterType: string;
  status: MattersSidebarStatus;
  priority?: string;
  clientName?: string | null;
  leadSource?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  acceptedBy?: {
    userId: string | null;
    acceptedAt: string | null;
  } | null;
}

interface UseMattersSidebarOptions {
  practiceId?: string;
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

type Logger = {
  warn: (message: string, data?: unknown) => void;
};

const defaultLogger: Logger = {
  warn: (message: string, data?: unknown) => {
    console.warn(`[useMattersSidebar] ${message}`, data);
  }
};

const VALID_STATUSES: MattersSidebarStatus[] = ['draft', 'active'];

export function normalizeMattersResponse(
  payload: FetchResponsePayload,
  logger: Logger = defaultLogger
): MattersSidebarItem[] {
  const source = Array.isArray(payload.items) ? payload.items
    : Array.isArray(payload.matters) ? payload.matters
    : [];

  return source.map((item, index) => {
    let itemId: string;
    const rawId = (item as Record<string, unknown>).id as unknown;
    if (typeof rawId === 'string' && rawId.trim().length > 0) {
      itemId = rawId;
    } else if (typeof rawId === 'number' && Number.isFinite(rawId)) {
      itemId = String(rawId);
    } else {
      itemId = `unknown-id-${index}`;
      logger.warn('Missing or invalid matter id; using placeholder', { id: rawId, index });
    }
    
    // Validate and normalize acceptedBy
    const acceptedByRaw = item.acceptedBy as
      | { userId?: unknown; acceptedAt?: unknown }
      | null
      | undefined;
    
    let acceptedBy: MattersSidebarItem['acceptedBy'] = null;
    if (acceptedByRaw && typeof acceptedByRaw === 'object') {
      const userId = acceptedByRaw.userId;
      const acceptedAt = acceptedByRaw.acceptedAt;
      
      // Validate userId - if shape is present but invalid, log and set to null
      let normalizedUserId: string | null = null;
      if (userId !== undefined && userId !== null) {
        if (typeof userId === 'string' && userId.trim().length > 0) {
          normalizedUserId = userId;
        } else {
          logger.warn('Invalid userId in acceptedBy', {
            itemId,
            field: 'acceptedBy.userId',
            value: userId,
            type: typeof userId
          });
          normalizedUserId = null;
        }
      }
      
      // Validate acceptedAt - if shape is present but invalid, log and set to null
      let normalizedAcceptedAt: string | null = null;
      if (acceptedAt !== undefined && acceptedAt !== null) {
        if (typeof acceptedAt === 'string' && acceptedAt.trim().length > 0) {
          normalizedAcceptedAt = acceptedAt;
        } else {
          logger.warn('Invalid acceptedAt in acceptedBy', {
            itemId,
            field: 'acceptedBy.acceptedAt',
            value: acceptedAt,
            type: typeof acceptedAt
          });
          normalizedAcceptedAt = null;
        }
      }
      
      acceptedBy = {
        userId: normalizedUserId,
        acceptedAt: normalizedAcceptedAt
      };
    }

    // Validate status against allowed values
    let normalizedStatus: MattersSidebarStatus = 'draft';
    if (typeof item.status === 'string') {
      if (VALID_STATUSES.includes(item.status as MattersSidebarStatus)) {
        normalizedStatus = item.status as MattersSidebarStatus;
      } else {
        logger.warn('Invalid status value', {
          itemId,
          field: 'status',
          value: item.status,
          allowedValues: VALID_STATUSES
        });
        normalizedStatus = 'draft';
      }
    } else if (item.status !== undefined && item.status !== null) {
      logger.warn('Invalid status type', {
        itemId,
        field: 'status',
        value: item.status,
        type: typeof item.status,
        allowedValues: VALID_STATUSES
      });
    }

    // Validate createdAt - do not default, set to null if missing/invalid
    let normalizedCreatedAt: string | null = null;
    if (item.createdAt !== undefined && item.createdAt !== null) {
      if (typeof item.createdAt === 'string' && item.createdAt.trim().length > 0) {
        normalizedCreatedAt = item.createdAt;
      } else {
        logger.warn('Invalid createdAt value', {
          itemId,
          field: 'createdAt',
          value: item.createdAt,
          type: typeof item.createdAt
        });
      }
    } else {
      logger.warn('Missing createdAt timestamp', {
        itemId,
        field: 'createdAt'
      });
    }

    // Validate updatedAt - do not default, set to null if missing/invalid
    let normalizedUpdatedAt: string | null = null;
    if (item.updatedAt !== undefined && item.updatedAt !== null) {
      if (typeof item.updatedAt === 'string' && item.updatedAt.trim().length > 0) {
        normalizedUpdatedAt = item.updatedAt;
      } else {
        logger.warn('Invalid updatedAt value', {
          itemId,
          field: 'updatedAt',
          value: item.updatedAt,
          type: typeof item.updatedAt
        });
      }
    } else {
      logger.warn('Missing updatedAt timestamp', {
        itemId,
        field: 'updatedAt'
      });
    }

    return {
      id: itemId,
      title: typeof item.title === 'string' ? item.title : 'Untitled Matter',
      matterType: typeof item.matterType === 'string' ? item.matterType : 'General',
      status: normalizedStatus,
      priority: typeof item.priority === 'string' ? item.priority : undefined,
      clientName: typeof item.clientName === 'string' ? item.clientName : null,
      leadSource: typeof item.leadSource === 'string' ? item.leadSource : null,
      createdAt: normalizedCreatedAt,
      updatedAt: normalizedUpdatedAt,
      acceptedBy
    };
  });
}

export function useMattersSidebar(options: UseMattersSidebarOptions = {}): UseMattersSidebarResult {
  const {
    practiceId,
    initialStatus = 'active',
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
  const fetchMattersRef = useRef<((append?: boolean, overrideSearch?: string) => Promise<void>) | null>(null);
  const resetPaginationRef = useRef<(() => void) | null>(null);
  const searchDelayMsRef = useRef(searchDelayMs);
  const practiceIdRef = useRef(practiceId);

  const setSearchTerm = useCallback((value: string) => {
    setSearchTermState(value);
    searchTermRef.current = value;
  }, []);

  const resetPagination = useCallback(() => {
    cursorRef.current = null;
    setHasMore(false);
  }, []);

  const fetchMatters = useCallback(async (append: boolean = false, overrideSearch?: string) => {
    if (!practiceId) {
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
      const baseUrl = getPracticeWorkspaceEndpoint(practiceId, 'matters');
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
  }, [practiceId, pageSize, status]);

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

  // Keep function refs synchronized
  useEffect(() => {
    fetchMattersRef.current = fetchMatters;
  }, [fetchMatters]);

  useEffect(() => {
    resetPaginationRef.current = resetPagination;
  }, [resetPagination]);

  useEffect(() => {
    searchDelayMsRef.current = searchDelayMs;
  }, [searchDelayMs]);

  useEffect(() => {
    practiceIdRef.current = practiceId;
  }, [practiceId]);

  // Auto fetch on practice/status change
  useEffect(() => {
    if (!autoFetch) {
      return;
    }
    resetPagination();
    void fetchMatters(false);
  }, [autoFetch, fetchMatters, resetPagination, status, practiceId]);

  // Debounced search updates - only responds to searchTerm changes
  useEffect(() => {
    if (!autoFetch || !practiceIdRef.current || !fetchMattersRef.current || !resetPaginationRef.current) {
      return;
    }

    const handler = window.setTimeout(() => {
      resetPaginationRef.current?.();
      void fetchMattersRef.current?.(false, searchTermRef.current);
    }, searchDelayMsRef.current);

    return () => {
      window.clearTimeout(handler);
    };
  }, [autoFetch, searchTerm]);

  // Cleanup on unmount: abort any in-flight request
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (e) { void e; }
      }
    };
  }, []);

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
