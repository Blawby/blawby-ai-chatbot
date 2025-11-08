import { useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '../ui/Button';
import { MatterStatusBadge } from '../matters/StatusBadge';
import { getOrganizationWorkspaceEndpoint } from '../../config/api';
import type { MatterWorkflowStatus, MatterTransitionResult } from '../../hooks/useOrganizationManagement';
import type { MatterSummary } from '../../hooks/useMatterSummary';

interface ConversationHeaderProps {
  organizationId?: string;
  matterId?: string | null;
  acceptMatter: (orgId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (orgId: string, matterId: string) => Promise<MatterTransitionResult>;
  updateMatterStatus: (orgId: string, matterId: string, status: MatterWorkflowStatus) => Promise<MatterTransitionResult>;
  matterSummary?: MatterSummary | null;
  matterLoading?: boolean;
  matterError?: string | null;
  onMatterChange?: (next: MatterSummary | null) => void;
  onRefreshMatter?: () => Promise<void> | void;
}

const STATUS_OPTIONS: { value: MatterWorkflowStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' }
];

const STATUS_TRANSITIONS: Record<MatterWorkflowStatus, MatterWorkflowStatus[]> = {
  lead: ['open', 'archived'],
  open: ['in_progress', 'archived'],
  in_progress: ['open', 'completed', 'archived'],
  completed: ['in_progress', 'archived'],
  archived: ['open']
};

export const ConversationHeader = ({
  organizationId,
  matterId,
  acceptMatter,
  rejectMatter,
  updateMatterStatus,
  matterSummary,
  matterLoading,
  matterError,
  onMatterChange,
  onRefreshMatter
}: ConversationHeaderProps) => {
  const isControlled = typeof matterSummary !== 'undefined';
  const [internalMatter, setInternalMatter] = useState<MatterSummary | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const matter = isControlled ? matterSummary ?? null : internalMatter;
  const loading = isControlled ? Boolean(matterLoading) : internalLoading;
  const baseError = isControlled ? matterError ?? null : internalError;
  const error = actionError ?? baseError;

  useEffect(() => {
    if (isControlled) {
      return;
    }

    if (!organizationId || !matterId) {
      setInternalMatter(null);
      setInternalError(null);
      return;
    }

    const controller = new AbortController();
    const fetchMatter = async () => {
      setInternalLoading(true);
      setInternalError(null);
      try {
        const endpoint = `${getOrganizationWorkspaceEndpoint(organizationId, 'matters')}/${encodeURIComponent(matterId)}`;
        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load matter (${response.status})`);
        }

        const payload = await response.json() as {
          success?: boolean;
          error?: string;
          data?: { matter?: Record<string, unknown> };
        };

        if (payload.success === false) {
          throw new Error(payload.error || 'Failed to load matter');
        }

        const matterRecord = payload.data?.matter;
        if (!matterRecord || typeof matterRecord !== 'object') {
          throw new Error('Matter not found');
        }

        const acceptedByRaw = matterRecord.acceptedBy as Record<string, unknown> | null | undefined;
        const acceptedBy = acceptedByRaw && typeof acceptedByRaw === 'object'
          ? {
              userId: typeof acceptedByRaw.userId === 'string' && acceptedByRaw.userId.trim().length > 0
                ? acceptedByRaw.userId
                : null,
              acceptedAt: typeof acceptedByRaw.acceptedAt === 'string'
                ? acceptedByRaw.acceptedAt
                : null
            }
          : null;

        const normalized: MatterSummary = {
          id: typeof matterRecord.id === 'string' ? matterRecord.id : String(matterRecord.id ?? ''),
          title: typeof matterRecord.title === 'string' ? matterRecord.title : 'Matter',
          matterType: typeof matterRecord.matterType === 'string' ? matterRecord.matterType : 'General',
          status: (typeof matterRecord.status === 'string' ? matterRecord.status : 'lead') as MatterWorkflowStatus,
          priority: typeof matterRecord.priority === 'string' ? matterRecord.priority : null,
          clientName: typeof matterRecord.clientName === 'string' ? matterRecord.clientName : null,
          leadSource: typeof matterRecord.leadSource === 'string' ? matterRecord.leadSource : null,
          matterNumber: typeof matterRecord.matterNumber === 'string' ? matterRecord.matterNumber : null,
          createdAt: typeof matterRecord.createdAt === 'string' ? matterRecord.createdAt : new Date().toISOString(),
          updatedAt: typeof matterRecord.updatedAt === 'string' ? matterRecord.updatedAt : new Date().toISOString(),
          acceptedBy
        };

        setInternalMatter(normalized);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to load matter';
          setInternalError(message);
          setInternalMatter(null);
        }
      } finally {
        setInternalLoading(false);
      }
    };

    void fetchMatter();
    return () => controller.abort();
  }, [isControlled, organizationId, matterId]);

  useEffect(() => {
    if (!isControlled) {
      return;
    }

    setActionError(null);
  }, [isControlled, matterSummary, matterError]);

  const handleAccept = async () => {
    if (!organizationId || !matterId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await acceptMatter(organizationId, matterId);
      if (isControlled) {
        if (matter && onMatterChange) {
          onMatterChange({ ...matter, status: result.status, acceptedBy: result.acceptedBy ?? matter.acceptedBy ?? null });
        }
        await onRefreshMatter?.();
      } else {
        setInternalMatter(prev => prev ? { ...prev, status: result.status, acceptedBy: result.acceptedBy ?? prev.acceptedBy } : prev);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept lead';
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!organizationId || !matterId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await rejectMatter(organizationId, matterId);
      if (isControlled) {
        if (matter && onMatterChange) {
          onMatterChange({ ...matter, status: result.status, acceptedBy: null });
        }
        await onRefreshMatter?.();
      } else {
        setInternalMatter(prev => prev ? { ...prev, status: result.status, acceptedBy: null } : prev);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject lead';
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (nextStatus: MatterWorkflowStatus) => {
    if (!organizationId || !matterId || !matter) return;
    if (nextStatus === matter.status) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await updateMatterStatus(organizationId, matterId, nextStatus);
      if (isControlled) {
        onMatterChange?.({ ...matter, status: result.status });
        await onRefreshMatter?.();
      } else {
        setInternalMatter(prev => prev ? { ...prev, status: result.status } : prev);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const availableStatusOptions = useMemo(() => {
    if (!matter) return STATUS_OPTIONS;
    if (matter.status === 'lead') {
      return STATUS_OPTIONS.filter(option => option.value === 'lead');
    }

    const allowed = new Set<MatterWorkflowStatus>([
      matter.status,
      ...(STATUS_TRANSITIONS[matter.status] ?? [])
    ]);

    return STATUS_OPTIONS.filter(option => allowed.has(option.value));
  }, [matter]);

  if (!organizationId || !matterId) {
    return null;
  }

  return (
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      {loading && (
        <div className="animate-pulse text-sm text-gray-500 dark:text-gray-400">
          Loading matter…
        </div>
      )}

      {!loading && !matter && !error && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Select a matter to manage lead status.
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {matter && !loading && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {matter.clientName || matter.title}
                </h2>
                <MatterStatusBadge status={matter.status} />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {matter.matterType}
                {matter.leadSource && (
                  <span className="ml-2 text-gray-400 dark:text-gray-500">
                    · Source: {matter.leadSource}
                  </span>
                )}
              </div>
              {matter.acceptedBy && matter.acceptedBy.userId && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Accepted by {matter.acceptedBy.userId}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {matter.status === 'lead' ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAccept}
                    disabled={actionLoading}
                  >
                    Accept Lead
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleReject}
                    disabled={actionLoading}
                  >
                    Reject
                  </Button>
                </>
              ) : (
                <select
                  value={matter.status}
                  onChange={(event) => handleStatusChange(event.currentTarget.value as MatterWorkflowStatus)}
                  disabled={actionLoading}
                  aria-label="Matter status"
                  className="text-sm border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
                >
                  {availableStatusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

