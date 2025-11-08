import { useState, useEffect, useCallback, useRef, type StateUpdater } from 'preact/hooks';
import { getOrganizationWorkspaceEndpoint } from '../config/api';
import type { MatterWorkflowStatus } from './useOrganizationManagement';

const WORKFLOW_STATUSES: MatterWorkflowStatus[] = ['lead', 'open', 'in_progress', 'completed', 'archived'];

export interface MatterSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  priority?: string | null;
  clientName: string | null;
  leadSource: string | null;
  matterNumber: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedBy: { userId: string | null; acceptedAt: string | null } | null;
}

interface WorkspaceMatterResponse {
  success?: boolean;
  error?: string;
  data?: { matter?: Record<string, unknown> };
}

function normalizeStatus(value: unknown): MatterWorkflowStatus {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase() as MatterWorkflowStatus;
    if (WORKFLOW_STATUSES.includes(normalized)) {
      return normalized;
    }
  }
  return 'lead';
}

function normalizeMatter(record: Record<string, unknown>): MatterSummary {
  const acceptedByRaw = record.acceptedBy as Record<string, unknown> | null | undefined;
  const acceptedBy = acceptedByRaw && typeof acceptedByRaw === 'object'
    ? {
        userId: typeof acceptedByRaw.userId === 'string' && acceptedByRaw.userId.trim().length > 0
          ? acceptedByRaw.userId
          : null,
        acceptedAt: typeof acceptedByRaw.acceptedAt === 'string' ? acceptedByRaw.acceptedAt : null
      }
    : null;

  return {
    id: typeof record.id === 'string' ? record.id : String(record.id ?? ''),
    title: typeof record.title === 'string' && record.title.trim().length > 0
      ? record.title
      : 'Matter',
    matterType: typeof record.matterType === 'string' && record.matterType.trim().length > 0
      ? record.matterType
      : 'General',
    status: normalizeStatus(record.status),
    priority: typeof record.priority === 'string' ? record.priority : null,
    clientName: typeof record.clientName === 'string' ? record.clientName : null,
    leadSource: typeof record.leadSource === 'string' ? record.leadSource : null,
    matterNumber: typeof record.matterNumber === 'string' ? record.matterNumber : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    acceptedBy
  };
}

export interface UseMatterSummaryResult {
  matter: MatterSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setMatter: StateUpdater<MatterSummary | null>;
}

export function useMatterSummary(
  organizationId?: string,
  matterId?: string | null
): UseMatterSummaryResult {
  const [matter, setMatter] = useState<MatterSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchMatter = useCallback(async () => {
    if (!organizationId || !matterId) {
      setMatter(null);
      setError(null);
      setLoading(false);
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const endpoint = `${getOrganizationWorkspaceEndpoint(organizationId, 'matters')}/${encodeURIComponent(matterId)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load matter (${response.status})`);
      }

      const payload = await response.json() as WorkspaceMatterResponse;
      const matterRecord = payload.data?.matter;
      if (!matterRecord || typeof matterRecord !== 'object') {
        throw new Error('Matter not found');
      }

      setMatter(normalizeMatter(matterRecord));
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load matter';
      setError(message);
      setMatter(null);
    } finally {
      if (controllerRef.current === controller && !controller.signal.aborted) {
        setLoading(false);
        controllerRef.current = null;
      }
    }
  }, [organizationId, matterId]);

  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }

    if (!organizationId || !matterId) {
      setMatter(null);
      setError(null);
      setLoading(false);
      return;
    }

    fetchMatter().catch(error => {
      console.error('Failed to fetch matter summary', error);
    });

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [organizationId, matterId, fetchMatter]);

  const refresh = useCallback(async () => {
    await fetchMatter();
  }, [fetchMatter]);

  return { matter, loading, error, refresh, setMatter };
}
