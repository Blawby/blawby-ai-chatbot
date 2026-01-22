import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { Textarea } from '@/shared/ui/input';
import { Select } from '@/shared/ui/input/Select';
import { TagInput } from '@/shared/ui/tag';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { getPracticeWorkspaceEndpoint } from '@/config/api';
import { useLeadQueueAutoLoad } from '@/features/settings/hooks/usePracticePageEffects';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeManagement, type MatterWorkflowStatus, type MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

export interface LeadSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  priority: string;
  assignedTo?: string | null;
  tags?: string[];
  internalNotes?: string | null;
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
  const { fetchMembers, getMembers } = usePracticeManagement({
    autoFetchPractices: false,
    fetchInvitations: false,
    fetchPracticeDetails: false
  });
  const [leadQueue, setLeadQueue] = useState<LeadSummary[]>([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [decisionLead, setDecisionLead] = useState<LeadSummary | null>(null);
  const [decisionAction, setDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [savingLeadIds, setSavingLeadIds] = useState<Set<string>>(new Set());

  const members = useMemo(() => (practiceId ? getMembers(practiceId) : []), [getMembers, practiceId]);
  const memberOptions = useMemo(() => {
    const options = members.map((member) => ({
      value: member.userId,
      label: member.name || member.email || member.userId
    }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: '', label: 'Unassigned' }, ...options];
  }, [members]);

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
        data?: { items?: Array<Record<string, unknown>>; matters?: Array<Record<string, unknown>> };
      };

      if (payload.success === false) {
        throw new Error(payload.error || 'Failed to load leads');
      }

      const items = payload.data?.items || payload.data?.matters || [];
      const normalized = items.map((item: Record<string, unknown>, index: number): LeadSummary => {
        const id = typeof item.id === 'string' ? item.id : String(item.id ?? `lead-${index}`);
        const tags = Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          : [];
        return {
          id,
          title: typeof item.title === 'string' ? item.title : 'Lead',
          matterType: typeof item.matterType === 'string' ? item.matterType : 'General',
          status: (typeof item.status === 'string' ? item.status : 'lead') as MatterWorkflowStatus,
          priority: typeof item.priority === 'string' ? item.priority : 'normal',
          assignedTo: typeof item.assignedTo === 'string' ? item.assignedTo : null,
          tags,
          internalNotes: typeof item.internalNotes === 'string' ? item.internalNotes : null,
          clientName: typeof item.clientName === 'string' ? item.clientName : null,
          clientEmail: typeof item.clientEmail === 'string' ? item.clientEmail : null,
          clientPhone: typeof item.clientPhone === 'string' ? item.clientPhone : null,
          leadSource: typeof item.leadSource === 'string' ? item.leadSource : null,
          conversationId: typeof item.conversationId === 'string' ? item.conversationId : null,
          intakeUuid: typeof item.intakeUuid === 'string' ? item.intakeUuid : null,
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
        };
      });
      setLeadQueue(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load leads';
      setLeadError(message);
    } finally {
      setLeadLoading(false);
    }
  }, [practiceId, canReviewLeads]);

  useLeadQueueAutoLoad(loadLeadQueue);

  useEffect(() => {
    if (!practiceId || !canReviewLeads) return;
    void fetchMembers(practiceId).catch((err) => {
      const message = err instanceof Error ? err.message : 'Failed to load practice members';
      showError('Members unavailable', message);
    });
  }, [practiceId, canReviewLeads, fetchMembers, showError]);

  const setLeadSaving = useCallback((leadId: string, isSaving: boolean) => {
    setSavingLeadIds((prev) => {
      const next = new Set(prev);
      if (isSaving) {
        next.add(leadId);
      } else {
        next.delete(leadId);
      }
      return next;
    });
  }, []);

  const updateLead = useCallback((leadId: string, updates: Partial<LeadSummary>) => {
    setLeadQueue((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, ...updates } : lead)));
  }, []);

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

  const handleTriageSave = useCallback(async (lead: LeadSummary) => {
    if (!practiceId) return;
    setLeadSaving(lead.id, true);
    try {
      const endpoint = `${getPracticeWorkspaceEndpoint(practiceId, 'matters')}/${encodeURIComponent(lead.id)}`;
      const payload = {
        assignedTo: lead.assignedTo ?? null,
        priority: lead.priority || 'normal',
        tags: lead.tags ?? [],
        internalNotes: lead.internalNotes ?? null
      };
      const response = await fetch(endpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to update lead (${response.status})`);
      }

      const data = await response.json() as {
        success?: boolean;
        error?: string;
        data?: { matter?: Record<string, unknown> };
      };

      if (data.success === false) {
        throw new Error(data.error || 'Failed to update lead');
      }

      const updated = data.data?.matter;
      if (updated && typeof updated === 'object') {
        updateLead(lead.id, {
          priority: typeof updated.priority === 'string' ? updated.priority : lead.priority,
          assignedTo: typeof updated.assignedTo === 'string' ? updated.assignedTo : lead.assignedTo ?? null,
          tags: Array.isArray(updated.tags)
            ? updated.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
            : lead.tags ?? [],
          internalNotes: typeof updated.internalNotes === 'string' ? updated.internalNotes : lead.internalNotes ?? null
        });
      }

      showSuccess('Triage updated', 'Lead details saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update lead';
      showError('Triage update failed', message);
    } finally {
      setLeadSaving(lead.id, false);
    }
  }, [practiceId, setLeadSaving, showSuccess, showError, updateLead]);

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
          {leadQueue.map((lead) => {
            const isSaving = savingLeadIds.has(lead.id);
            return (
              <div
                key={lead.id}
                className="rounded-lg border border-gray-200 dark:border-dark-border p-4 bg-white dark:bg-dark-card-bg"
                data-testid={`lead-card-${lead.id}`}
              >
                <div className="flex flex-col gap-4">
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

                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FormLabel>Assignee</FormLabel>
                        <Select
                          value={lead.assignedTo ?? ''}
                          options={memberOptions}
                          onChange={(value) => updateLead(lead.id, { assignedTo: value || null })}
                          className="w-full"
                          placeholder="Unassigned"
                          disabled={memberOptions.length <= 1}
                        />
                      </div>
                      <div>
                        <FormLabel>Priority</FormLabel>
                        <Select
                          value={lead.priority || 'normal'}
                          options={PRIORITY_OPTIONS}
                          onChange={(value) => updateLead(lead.id, { priority: value })}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <FormLabel htmlFor={`lead-tags-${lead.id}`}>Tags</FormLabel>
                      <TagInput
                        id={`lead-tags-${lead.id}`}
                        value={lead.tags ?? []}
                        onChange={(tags) => updateLead(lead.id, { tags })}
                        placeholder="Add tags"
                        size="sm"
                      />
                    </div>

                    <div>
                      <FormLabel htmlFor={`lead-notes-${lead.id}`}>Internal notes</FormLabel>
                      <Textarea
                        id={`lead-notes-${lead.id}`}
                        value={lead.internalNotes ?? ''}
                        onChange={(value) => updateLead(lead.id, { internalNotes: value })}
                        placeholder="Add internal notes for the team"
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleTriageSave(lead)}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving…' : 'Save triage'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
