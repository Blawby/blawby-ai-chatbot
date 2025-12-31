import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import {
  BuildingOfficeIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement, type MatterWorkflowStatus } from '@/shared/hooks/usePracticeManagement';
import { features } from '@/config/features';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Input, Textarea } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { useNavigation } from '@/shared/utils/navigation';
import { authClient } from '@/shared/lib/authClient';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/shared/i18n/hooks';
import { getPracticeWorkspaceEndpoint } from '@/config/api';

interface PracticePageProps {
  className?: string;
  onNavigate?: (path: string) => void;
}

interface LeadSummary {
  id: string;
  title: string;
  matterType: string;
  status: MatterWorkflowStatus;
  priority: string;
  clientName?: string | null;
  leadSource?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PracticePage = ({ className = '', onNavigate }: PracticePageProps) => {
  const { data: session } = authClient.useSession();
  const { 
    currentPractice, 
    getMembers,
    loading, 
    error,
    updatePractice,
    createPractice,
    deletePractice,
    fetchMembers,
    refetch,
    acceptMatter,
    rejectMatter
  } = usePracticeManagement();
  
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const navigateTo = onNavigate ?? navigate;
  const location = useLocation();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Form states
  const [editPracticeForm, setEditPracticeForm] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  const [isEditPracticeModalOpen, setIsEditPracticeModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [leadQueue, setLeadQueue] = useState<LeadSummary[]>([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [decisionLead, setDecisionLead] = useState<LeadSummary | null>(null);
  const [decisionAction, setDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  const hasPractice = !!currentPractice;
  const members = useMemo(() => currentPractice ? getMembers(currentPractice.id) : [], [currentPractice, getMembers]);
  const _memberCount = members.length;
  
  // Better approach - get role directly from current practice context
  const currentMember = useMemo(() => {
    if (!currentPractice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) || 
           members.find(m => m.userId === session?.user?.id);
  }, [currentPractice, currentUserEmail, members, session?.user?.id]);

  const currentUserRole = currentMember?.role || 'paralegal';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = (currentUserRole === 'admin' || isOwner) ?? false;
  const canReviewLeads = isAdmin || isOwner;
  const servicesCount = useMemo(() => {
    const metadata = currentPractice?.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const conversationConfig = (metadata as Record<string, unknown>).conversationConfig;
      if (conversationConfig && typeof conversationConfig === 'object' && !Array.isArray(conversationConfig)) {
        const available = (conversationConfig as Record<string, unknown>).availableServices;
        if (Array.isArray(available)) {
          return available.filter((item) => typeof item === 'string').length;
        }
      }
    }
    const config = currentPractice?.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const available = (config as Record<string, unknown>).availableServices;
      if (Array.isArray(available)) {
        return available.filter((item) => typeof item === 'string').length;
      }
    }
    return 0;
  }, [currentPractice]);

  const loadLeadQueue = useCallback(async () => {
    if (!currentPractice?.id || !canReviewLeads) {
      setLeadQueue([]);
      return;
    }

    setLeadLoading(true);
    setLeadError(null);

    try {
      const endpoint = `${getPracticeWorkspaceEndpoint(currentPractice.id, 'matters')}?status=lead`;
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
  }, [currentPractice?.id, canReviewLeads]);

  useEffect(() => {
    void loadLeadQueue();
  }, [loadLeadQueue]);

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
    if (!currentPractice?.id || !decisionLead || !decisionAction) return;
    setDecisionSubmitting(true);
    try {
      if (decisionAction === 'accept') {
        await acceptMatter(currentPractice.id, decisionLead.id);
        showSuccess('Lead accepted', 'The client has been notified.');
      } else {
        await rejectMatter(currentPractice.id, decisionLead.id, decisionReason);
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

  // SSR-safe origin for return URLs
  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  // Subscription guard for deletion
  const hasManagedSub = Boolean(currentPractice?.stripeCustomerId);
  const subStatus = (currentPractice?.subscriptionStatus || 'none').toLowerCase();
  const deletionBlockedBySubscription = hasManagedSub && !(subStatus === 'canceled' || subStatus === 'none');
  const deletionBlockedMessage = (() => {
    if (!deletionBlockedBySubscription) return '';
    const ts = currentPractice?.subscriptionPeriodEnd;
    const end = (typeof ts === 'number' && Number.isFinite(ts)) ? new Date(ts * 1000) : null;
    if (end) {
      return `Subscription must be canceled before deleting. Access ends on ${formatDate(end)}.`;
    }
    return 'Subscription must be canceled in Stripe before deleting this practice.';
  })();


  // Current user email is now derived from session - removed redirect to keep practice settings accessible

  // Initialize form with current practice data
  useEffect(() => {
    if (currentPractice) {
      setEditPracticeForm({
        name: currentPractice.name,
        slug: currentPractice.slug || '',
        description: currentPractice.description || ''
      });
      
      // Fetch related data only once when practice changes
      const fetchMembersData = async () => {
        try {
          await fetchMembers(currentPractice.id);
        } catch (err) {
          showError(err?.message || String(err) || 'Failed to fetch practice members');
        }
      };
      
      fetchMembersData();
    }
  }, [currentPractice, fetchMembers, showError]);

  // Refetch after return from portal
  useEffect(() => {
    const syncParam = (() => {
      const q = (location as unknown as { query?: Record<string, unknown> } | undefined)?.query;
      if (q && typeof q === 'object' && 'sync' in q) {
        const v = (q as Record<string, unknown>)['sync'] as unknown;
        const val = Array.isArray(v) ? v[0] : (v as string | undefined);
        return val;
      }
      if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).get('sync') ?? undefined;
      }
      return undefined;
    })();
    if (String(syncParam) === '1' && currentPractice?.id) {
      refetch()
        .then(() => {
          showSuccess('Subscription updated', 'Your subscription status has been refreshed.');
        })
        .catch((error) => {
          console.error('Failed to refresh subscription:', error);
          // Don't show error toast - refetch failure is not critical
        })
        .finally(() => {
          // Remove sync param to prevent re-trigger (URL hygiene)
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('sync');
          window.history.replaceState({}, '', newUrl.toString());
        });
    }
  }, [location, currentPractice?.id, refetch, showSuccess]);

  const handleCreatePractice = async () => {
    if (!createForm.name.trim()) {
      showError('Practice name is required');
      return;
    }

    try {
      await createPractice({
        name: createForm.name,
        slug: createForm.slug || undefined,
        description: createForm.description || undefined,
      });
      
      showSuccess('Practice created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', description: '' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create practice');
    }
  };

  const openEditPracticeModal = () => {
    if (!currentPractice) return;
    setEditPracticeForm({
      name: currentPractice.name,
      slug: currentPractice.slug || '',
      description: currentPractice.description || ''
    });
    setIsEditPracticeModalOpen(true);
  };

  const handleUpdatePractice = async () => {
    if (!currentPractice) return;
    
    try {
      await updatePractice(currentPractice.id, editPracticeForm);
      showSuccess('Practice updated successfully!');
      setIsEditPracticeModalOpen(false);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update practice');
    }
  };

  const handleDeletePractice = async () => {
    if (!currentPractice) return;
    
    if (deleteConfirmText !== currentPractice.name) {
      showError('Practice name must match exactly');
      return;
    }

    try {
      await deletePractice(currentPractice.id);
      showSuccess('Practice deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete practice');
    }
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading practice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button size="sm" onClick={refetch}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Practice
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>
      
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {hasPractice ? (
            <>
              {/* Practice Details Row */}
              <div className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Practice
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {currentPractice.name}
                    {currentPractice.slug
                      ? ` • ai.blawby.com/${currentPractice.slug}`
                      : ' • ai.blawby.com/your-practice'}
                  </p>
                </div>
                <div className="ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openEditPracticeModal}
                  >
                    Edit
                  </Button>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Lead Review Queue */}
              <div className="py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Lead Review Queue
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Review new intake requests and decide whether to accept or decline.
                </p>

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
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {lead.clientName || lead.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {lead.matterType}
                                {lead.leadSource ? ` · ${lead.leadSource}` : ''}
                              </p>
                            </div>
                            <span className="text-xs text-gray-400">
                              {formatDate(lead.createdAt)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => openDecisionModal(lead, 'accept')}>
                              Accept
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => openDecisionModal(lead, 'reject')}>
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {currentPractice.description && (
                <>
                  <div className="border-t border-gray-200 dark:border-dark-border" />
                  <div className="py-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Description
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {currentPractice.description}
                    </p>
                  </div>
                </>
              )}

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Services Row */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Services</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {servicesCount > 0
                        ? `${servicesCount} services configured`
                        : 'No services configured yet'}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigateTo('/settings/practice/services')}
                      className="hidden sm:inline-flex"
                    >
                      Manage
                    </Button>
                    <button
                      type="button"
                      onClick={() => navigateTo('/settings/practice/services')}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label="Manage services"
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Team Row */}
              <div className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Team Members
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {members.length > 0 ? `${members.length} team members` : 'Manage team access and roles'}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigateTo('/settings/practice/team')}
                      className="hidden sm:inline-flex"
                    >
                      Manage
                    </Button>
                    <button
                      type="button"
                      onClick={() => navigateTo('/settings/practice/team')}
                      className="sm:hidden p-2 text-gray-500 dark:text-gray-400"
                      aria-label="Manage team members"
                    >
                      <ChevronRightIcon className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Delete Practice Section (Owner only) */}
              {isOwner && (
                <>
                  <div className="flex items-center justify-between py-3" data-testid="practice-delete-section">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Practice</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Permanently delete this practice and all its data
                      </p>
                    </div>
                    <div className="ml-4">
                      {deletionBlockedBySubscription ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!currentPractice?.id) return;
                            openBillingPortal({ 
                              practiceId: currentPractice.id, 
                              returnUrl: origin ? `${origin}/settings/practice?sync=1` : '/settings/practice?sync=1' 
                            });
                          }}
                          disabled={submitting}
                          data-testid="practice-delete-action"
                        >
                          {t('settings:account.plan.manage')}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteModal(true)}
                          className="text-red-600 hover:text-red-700"
                          data-testid="practice-delete-action"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {deletionBlockedBySubscription && deletionBlockedMessage && (
                    <div role="status" aria-live="polite" className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                      <p className="text-xs text-yellow-800 dark:text-yellow-200">
                        {deletionBlockedMessage}
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* No Practice State */
            <div className="py-3">
              <div className="text-center py-8">
                <BuildingOfficeIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-sm font-semibold mb-2">No Practice Yet</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Create your law firm or accept an invitation
                </p>
                {features.enableMultiplePractices && (
                  <Button size="sm" onClick={() => setShowCreateModal(true)}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Create Practice
                  </Button>
                )}
              </div>
            </div>
          )}
          
        </div>
      </div>

      {/* Lead Decision Modal */}
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

      {/* Edit Practice Modal */}
      <Modal
        isOpen={isEditPracticeModalOpen}
        onClose={() => setIsEditPracticeModalOpen(false)}
        title="Edit Practice"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="edit-practice-name">Practice Name *</FormLabel>
            <Input
              id="edit-practice-name"
              value={editPracticeForm.name}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, name: value }))}
              placeholder="Your Law Firm Name"
              required
            />
          </div>

          <div>
            <FormLabel htmlFor="edit-practice-slug">Slug (optional)</FormLabel>
            <Input
              id="edit-practice-slug"
              value={editPracticeForm.slug}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, slug: value }))}
              placeholder="your-law-firm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs. Leave empty to keep the current slug.
            </p>
          </div>

          <div>
            <FormLabel htmlFor="edit-practice-description">Description (optional)</FormLabel>
            <Input
              id="edit-practice-description"
              value={editPracticeForm.description}
              onChange={(value) => setEditPracticeForm(prev => ({ ...prev, description: value }))}
              placeholder="Brief description of your practice"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => setIsEditPracticeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdatePractice}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Practice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Practice"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="practice-name">Practice Name *</FormLabel>
            <Input
              id="practice-name"
              value={createForm.name}
              onChange={(value) => setCreateForm(prev => ({ ...prev, name: value }))}
              placeholder="Your Law Firm Name"
              required
            />
          </div>
          
          <div>
            <FormLabel htmlFor="practice-slug">Slug (optional)</FormLabel>
            <Input
              id="practice-slug"
              value={createForm.slug}
              onChange={(value) => setCreateForm(prev => ({ ...prev, slug: value }))}
              placeholder="your-law-firm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs. Leave empty to auto-generate.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="practice-description">Description (optional)</FormLabel>
            <Input
              id="practice-description"
              value={createForm.description}
              onChange={(value) => setCreateForm(prev => ({ ...prev, description: value }))}
              placeholder="Brief description of your practice"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="secondary" 
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreatePractice}>
              Create Practice
            </Button>
          </div>
        </div>
      </Modal>


      {/* Delete Practice Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Practice"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              ⚠️ This action cannot be undone. This will permanently delete the practice and all its data.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="delete-confirm">
              Type the practice name to confirm: <strong>{currentPractice?.name}</strong>
            </FormLabel>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={setDeleteConfirmText}
              placeholder="Enter practice name"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="ghost"
              onClick={handleDeletePractice}
              disabled={deleteConfirmText !== currentPractice?.name}
              className="text-red-600 hover:text-red-700"
            >
              Delete Practice
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
