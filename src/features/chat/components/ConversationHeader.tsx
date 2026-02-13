import { useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { MatterStatusBadge } from '@/features/matters/components/StatusBadge';
import { getConversationEndpoint, getPracticeWorkspaceEndpoint } from '@/config/api';
import { LinkMatterModal } from '@/features/chat/components/LinkMatterModal';
import type { Conversation } from '@/shared/types/conversation';
import type { MatterWorkflowStatus, MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';
import { useNavigation } from '@/shared/utils/navigation';

interface ConversationHeaderProps {
  practiceId?: string;
  practiceSlug?: string | null;
  conversationId?: string;
  canReviewLeads?: boolean;
  acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  updateMatterStatus: (practiceId: string, matterId: string, status: MatterWorkflowStatus) => Promise<MatterTransitionResult>;
}

interface MatterSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  clientName?: string | null;
  leadSource?: string | null;
  acceptedBy?: {
    userId: string;
    acceptedAt: string | null;
  } | null;
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
  practiceId,
  practiceSlug,
  conversationId,
  canReviewLeads = false,
  acceptMatter,
  rejectMatter,
  updateMatterStatus
}: ConversationHeaderProps) => {
  const [matter, setMatter] = useState<MatterSummary | null>(null);
  const [linkedMatterId, setLinkedMatterId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [matterError, setMatterError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const { navigate } = useNavigation();

  useEffect(() => {
    if (!practiceId || !conversationId) {
      setLinkedMatterId(null);
      setMatter(null);
      setConversationError(null);
      setMatterError(null);
      setActionError(null);
      return;
    }

    const controller = new AbortController();
    const fetchConversation = async () => {
      setConversationLoading(true);
      setConversationError(null);
      try {
        const endpoint = `${getConversationEndpoint(conversationId)}?practiceId=${encodeURIComponent(practiceId)}`;
        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load conversation (${response.status})`);
        }

        const payload = await response.json() as {
          success?: boolean;
          error?: string;
          data?: Conversation;
        };

        if (payload.success === false) {
          throw new Error(payload.error || 'Failed to load conversation');
        }

        const conversation = payload.data;
        const nextMatterId = conversation?.matter_id ?? null;
        setLinkedMatterId(nextMatterId);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to load conversation';
          setConversationError(message);
          setLinkedMatterId(null);
        }
      } finally {
        setConversationLoading(false);
      }
    };

    void fetchConversation();
    return () => controller.abort();
  }, [practiceId, conversationId]);

  useEffect(() => {
    if (!practiceId || !linkedMatterId) {
      setMatter(null);
      return;
    }

    const controller = new AbortController();
    const fetchMatter = async () => {
      setLoading(true);
      setMatterError(null);
      try {
        const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}/${encodeURIComponent(linkedMatterId)}`;
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
              userId: typeof acceptedByRaw.userId === 'string'
                ? acceptedByRaw.userId
                : String(acceptedByRaw.userId ?? ''),
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
          clientName: typeof matterRecord.clientName === 'string' ? matterRecord.clientName : null,
          leadSource: typeof matterRecord.leadSource === 'string' ? matterRecord.leadSource : null,
          acceptedBy
        };

        setMatter(normalized);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to load matter';
          setMatterError(message);
          setMatter(null);
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchMatter();
    return () => controller.abort();
  }, [practiceId, linkedMatterId]);

  const handleAccept = async () => {
    if (!practiceId || !linkedMatterId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await acceptMatter(practiceId, linkedMatterId);
      setMatter(prev => prev ? { ...prev, status: result.status, acceptedBy: result.acceptedBy ?? prev.acceptedBy } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept lead';
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!practiceId || !linkedMatterId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await rejectMatter(practiceId, linkedMatterId);
      setMatter(prev => prev ? { ...prev, status: result.status, acceptedBy: null } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject lead';
      setActionError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (nextStatus: MatterWorkflowStatus) => {
    if (!practiceId || !linkedMatterId || !matter) return;
    if (nextStatus === matter.status) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const result = await updateMatterStatus(practiceId, linkedMatterId, nextStatus);
      setMatter(prev => prev ? { ...prev, status: result.status } : prev);
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

  const handleMatterUpdated = (conversation: Conversation) => {
    setMatterError(null);
    setActionError(null);
    setLinkedMatterId(conversation.matter_id ?? null);
  };

  if (!practiceId || !conversationId) {
    return null;
  }

  const canUpdateMatter = Boolean(canReviewLeads);
  const matterLink = linkedMatterId && practiceSlug
    ? `/practice/${encodeURIComponent(practiceSlug)}/matters/${encodeURIComponent(linkedMatterId)}`
    : null;

  const error = actionError || matterError || conversationError;

  return (
    <div className="px-4 py-3 border-b border-line-glass/30 bg-surface-glass/60 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-input-text">Conversation</h2>
          {linkedMatterId && matter && matterLink && (
            <Button
              variant="link"
              size="xs"
              className="inline-flex items-center gap-2 rounded-full glass-panel px-3 py-1 text-xs text-input-text"
              onClick={() => navigate(matterLink)}
            >
              <span className="font-medium">{matter.title}</span>
              <MatterStatusBadge status={matter.status} />
            </Button>
          )}
          {linkedMatterId && matter && !matterLink && (
            <span className="inline-flex items-center gap-2 rounded-full glass-panel px-3 py-1 text-xs text-input-text">
              <span className="font-medium">{matter.title}</span>
              <MatterStatusBadge status={matter.status} />
            </span>
          )}
          {!linkedMatterId && (
            <span className="text-xs text-gray-500 dark:text-gray-400">No matter linked</span>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsLinkModalOpen(true)}
          disabled={actionLoading || conversationLoading}
        >
          {linkedMatterId ? 'Update link' : 'Link to matter'}
        </Button>
      </div>

      {(conversationLoading || loading) && (
        <div className="animate-pulse text-sm text-gray-500 dark:text-gray-400 mt-2">
          {conversationLoading ? 'Loading conversation…' : 'Loading matter…'}
        </div>
      )}

      {!linkedMatterId && !loading && !conversationLoading && !error && (
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Link a matter to enable lead workflows and quick access.
        </div>
      )}

      {!loading && linkedMatterId && !matter && !error && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Select a matter to manage lead status.
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {matter && linkedMatterId && !loading && (
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
                canUpdateMatter ? (
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
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    You don&apos;t have permission to accept or reject leads.
                  </span>
                )
              ) : (
                <select
                  value={matter.status}
                  onChange={(event) => handleStatusChange(event.currentTarget.value as MatterWorkflowStatus)}
                  disabled={actionLoading || !canUpdateMatter}
                  aria-label="Matter status"
                  className="text-sm border border-input-border rounded-md px-2 py-1 bg-input-bg text-input-text focus:outline-none focus:ring-2 focus:ring-accent-500"
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

      {isLinkModalOpen && (
        <LinkMatterModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          practiceId={practiceId}
          conversationId={conversationId}
          currentMatterId={linkedMatterId}
          onMatterUpdated={handleMatterUpdated}
        />
      )}
    </div>
  );
};
