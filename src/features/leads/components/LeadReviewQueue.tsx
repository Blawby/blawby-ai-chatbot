import { useCallback, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { Textarea } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
import { useLeadQueueAutoLoad } from '@/features/settings/hooks/usePracticePageEffects';
import { useNavigation } from '@/shared/utils/navigation';
import type { MatterWorkflowStatus, MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';

export interface LeadSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  priority: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  leadSource?: string | null;
  conversationId?: string | null;
  intakeUuid?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadReviewQueueProps {
  practiceId: string | null;
  canReviewLeads: boolean;
  acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (practiceId: string, matterId: string, reason?: string) => Promise<MatterTransitionResult>;
  onOpenConversation?: (conversationId: string) => void;
  showHeader?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

export const LeadReviewQueue = ({
  practiceId,
  canReviewLeads,
  acceptMatter,
  rejectMatter,
  onOpenConversation,
  showHeader = true,
  title = 'Lead Review Queue',
  description = 'Review new intake requests and decide whether to accept or decline.',
  className = ''
}: LeadReviewQueueProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const [leadQueue, setLeadQueue] = useState<LeadSummary[]>([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [decisionLead, setDecisionLead] = useState<LeadSummary | null>(null);
  const [decisionAction, setDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  const loadLeadQueue = useCallback(async () => {
    if (!practiceId || !canReviewLeads) {
      setLeadQueue([]);
      return;
    }

    setLeadLoading(true);
    setLeadError(null);

    try {
      const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}?status=lead`;
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load leads (${response.status})`);
      }

      const payload = await response.json() as {
        success?: boolean;
        error?: string;
        data?: { items?: LeadSummary[]; matters?: LeadSummary[] };
      };

      if (payload.success === false) {
        throw new Error(payload.error || 'Failed to load leads');
      }

      const items = payload.data?.items || payload.data?.matters || [];
      setLeadQueue(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load leads';
      setLeadError(message);
    } finally {
      setLeadLoading(false);
    }
  }, [practiceId, canReviewLeads]);

  useLeadQueueAutoLoad(loadLeadQueue);

  const openDecisionModal = (lead: LeadSummary, action: 'accept' | 'reject') => {
    setDecisionLead(lead);
    setDecisionAction(action);
    setDecisionReason('');
  };

  const closeDecisionModal = (force = false) => {
    if (decisionSubmitting && !force) return;
    setDecisionLead(null);
    setDecisionAction(null);
    setDecisionReason('');
  };

  const handleDecision = async () => {
    if (!practiceId || !decisionLead || !decisionAction) return;
    setDecisionSubmitting(true);
    try {
      if (decisionAction === 'accept') {
        await acceptMatter(practiceId, decisionLead.id);
        showSuccess('Lead accepted', 'The client has been notified.');
      } else {
        await rejectMatter(practiceId, decisionLead.id, decisionReason);
        showSuccess('Lead rejected', 'The client has been notified.');
      }
      setDecisionSubmitting(false);
      closeDecisionModal(true);
      await loadLeadQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update lead';
      showError('Action failed', message);
      setDecisionSubmitting(false);
    }
  };

  const handleOpenConversation = useCallback((conversationId: string) => {
    if (onOpenConversation) {
      onOpenConversation(conversationId);
      return;
    }
    navigate(`/practice/chats/${encodeURIComponent(conversationId)}`);
  }, [navigate, onOpenConversation]);

  return (
    <div className={className}>
      {showHeader && (
        <>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {description}
          </p>
        </>
      )}

      {!canReviewLeads && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Only admins and owners can review leads.
        </div>
      )}

      {canReviewLeads && leadLoading && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Loading leads…
        </div>
      )}

      {canReviewLeads && leadError && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {leadError}
        </div>
      )}

      {canReviewLeads && !leadLoading && !leadError && leadQueue.length === 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          No leads waiting for review.
        </div>
      )}

      {canReviewLeads && leadQueue.length > 0 && (
        <div className="space-y-3">
          {leadQueue.map((lead) => (
            <div
              key={lead.id}
              className="rounded-lg border border-gray-200 dark:border-dark-border p-4 bg-white dark:bg-dark-card-bg"
              data-testid={`lead-card-${lead.id}`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {lead.clientName || lead.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lead.matterType}
                      {lead.leadSource ? ` · ${lead.leadSource}` : ''}
                    </p>
                    {(lead.clientEmail || lead.clientPhone) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {lead.clientEmail ?? '—'}
                        {lead.clientPhone ? ` · ${lead.clientPhone}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(lead.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => openDecisionModal(lead, 'accept')}
                    data-testid={`lead-accept-${lead.id}`}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openDecisionModal(lead, 'reject')}
                    data-testid={`lead-reject-${lead.id}`}
                  >
                    Reject
                  </Button>
                  {lead.conversationId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenConversation(lead.conversationId as string)}
                    >
                      Open chat
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(decisionAction && decisionLead)}
        onClose={closeDecisionModal}
        title={decisionAction === 'accept' ? 'Accept Lead' : 'Reject Lead'}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3 text-sm text-gray-700 dark:text-gray-200">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {decisionLead?.clientName || decisionLead?.title}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {decisionLead?.matterType}
              {decisionLead?.leadSource ? ` · ${decisionLead.leadSource}` : ''}
            </p>
          </div>

          {decisionAction === 'reject' && (
            <div>
              <FormLabel htmlFor="lead-reject-reason">Reason (optional)</FormLabel>
              <Textarea
                id="lead-reject-reason"
                value={decisionReason}
                onChange={(value) => setDecisionReason(value)}
                placeholder="Add a short note to the client"
                rows={3}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => closeDecisionModal()} disabled={decisionSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleDecision()} disabled={decisionSubmitting}>
              {decisionAction === 'accept' ? 'Accept Lead' : 'Reject Lead'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
