import { useState, useEffect, useMemo } from 'preact/hooks';
import { 
  BuildingOfficeIcon, 
  PlusIcon, 
  UserPlusIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { usePracticeManagement, type Role } from '../../../hooks/usePracticeManagement';
import { features } from '../../../config/features';
import { Button } from '../../ui/Button';
import Modal from '../../Modal';
import { Input } from '../../ui/input';
import { FormLabel } from '../../ui/form/FormLabel';
import { Select } from '../../ui/input/Select';
import { useToastContext } from '../../../contexts/ToastContext';
import { formatDate } from '../../../utils/dateTime';
import { useNavigation } from '../../../utils/navigation';
import { authClient } from '../../../lib/authClient';
import { useSessionContext } from '../../../contexts/SessionContext';
import { usePaymentUpgrade } from '../../../hooks/usePaymentUpgrade';
import { normalizeSeats } from '../../../utils/subscription';
import { useLocation } from 'preact-iso';
import { useTranslation } from '@/i18n/hooks';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../ui/dropdown';
import { PracticeLogo } from '../../ui/sidebar/atoms/PracticeLogo';

interface PracticePageProps {
  className?: string;
}

export const PracticePage = ({ className = '' }: PracticePageProps) => {
  const { data: session } = authClient.useSession();
  const { activePracticeId } = useSessionContext();
  const { 
    practices,
    currentPractice, 
    getMembers,
    invitations, 
    loading, 
    error,
    updatePractice,
    createPractice,
    deletePractice,
    acceptInvitation,
    declineInvitation,
    fetchMembers,
    updateMemberRole,
    removeMember,
    sendInvitation,
    refetch 
  } = usePracticeManagement();
  
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Practice switcher state
  const [isSwitchingPractice, setIsSwitchingPractice] = useState(false);
  const [isPracticeDropdownOpen, setIsPracticeDropdownOpen] = useState(false);
  
  // Form states
  const [editPracticeForm, setEditPracticeForm] = useState({
    name: '',
    description: ''
  });
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    description: ''
  });
  
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'attorney' as Role
  });
  
  // Inline form states (like SecurityPage pattern)
  const [isEditingPractice, setIsEditingPractice] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editMemberData, setEditMemberData] = useState<{ userId: string; email: string; name?: string; role: Role } | null>(null);

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

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await acceptInvitation(invitationId);
      showSuccess('Invitation accepted!');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to accept invitation');
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      await declineInvitation(invitationId);
      showSuccess('Invitation declined successfully!');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to decline invitation');
    }
  };

  const handleUpdatePractice = async () => {
    if (!currentPractice) return;
    
    try {
      await updatePractice(currentPractice.id, editPracticeForm);
      showSuccess('Practice updated successfully!');
      setIsEditingPractice(false);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update practice');
    }
  };

  const handleSendInvitation = async () => {
    if (!currentPractice || !inviteForm.email.trim()) {
      showError('Email is required');
      return;
    }

    try {
      await sendInvitation(currentPractice.id, inviteForm.email, inviteForm.role);
      showSuccess('Invitation sent successfully!');
      setIsInvitingMember(false);
      setInviteForm({ email: '', role: 'attorney' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send invitation');
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

  const handleUpdateMemberRole = async () => {
    if (!currentPractice || !editMemberData) return;

    try {
      await updateMemberRole(currentPractice.id, editMemberData.userId, editMemberData.role);
      showSuccess('Member role updated successfully!');
      setEditMemberData(null);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (member: { userId: string; email: string; name?: string; role: Role }) => {
    if (!currentPractice) return;

    try {
      await removeMember(currentPractice.id, member.userId);
      showSuccess('Member removed successfully!');
      setEditMemberData(null);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  // Practice switcher handler
  const handlePracticeSwitch = async (practiceId: string) => {
    if (practiceId === activePracticeId || isSwitchingPractice) return;
    
    setIsSwitchingPractice(true);
    setIsPracticeDropdownOpen(false);
    try {
      // Note: Better Auth API uses "organizationId" parameter name
      await authClient.organization.setActive({ organizationId: practiceId });
      await refetch();
      showSuccess('Practice switched successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to switch practice');
    } finally {
      setIsSwitchingPractice(false);
    }
  };

  // Ensure current practice is always included if it exists
  const practicesWithCurrent = useMemo(() => {
    if (!currentPractice) return practices;
    const hasCurrent = practices.some(org => org.id === currentPractice.id);
    if (hasCurrent) return practices;
    return [currentPractice, ...practices];
  }, [practices, currentPractice]);

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
              {/* Practice Name Section */}
              <div className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Practice Name
                  </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {currentPractice.name}
                  </p>
                  </div>
                <div className="ml-4 flex gap-2">
                  {practicesWithCurrent.length > 1 && (
                    <DropdownMenu
                      open={isPracticeDropdownOpen}
                      onOpenChange={setIsPracticeDropdownOpen}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSwitchingPractice}
                        >
                          Switch
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-64 max-h-96">
                        <div className="max-h-64 overflow-y-auto">
                          {practicesWithCurrent.map((org) => {
                            const orgProfileImage = org.config ? (org.config as { profileImage?: string | null }).profileImage ?? null : null;
                            const isActive = org.id === activePracticeId;
                            return (
                              <DropdownMenuItem
                                key={org.id}
                                onSelect={() => handlePracticeSwitch(org.id)}
                                disabled={isSwitchingPractice}
                                className="flex items-center gap-2"
                              >
                                {orgProfileImage ? (
                                  <PracticeLogo 
                                    src={orgProfileImage} 
                                    alt={org.name}
                                    size="sm"
                                  />
                                ) : (
                                  <BuildingOfficeIcon className="w-5 h-5 text-gray-400" />
                                )}
                                <span className="flex-1 text-sm">{org.name}</span>
                                {isActive && (
                                  <CheckIcon className="w-4 h-4 text-accent-500" />
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </div>
                        <DropdownMenuItem
                          onSelect={() => setShowCreateModal(true)}
                          disabled={isSwitchingPractice}
                          className="flex items-center gap-2"
                        >
                          <PlusIcon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm">Add practice</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreateModal(true)}
                    disabled={isSwitchingPractice}
                  >
                    Add
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingPractice(!isEditingPractice)}
                  >
                    {isEditingPractice ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </div>
              
              {/* Inline Edit Form */}
              {isEditingPractice && (
                <div className="mt-4 space-y-4">
                  <div>
                    <FormLabel htmlFor="edit-org-name">Practice Name</FormLabel>
                    <Input
                      id="edit-org-name"
                      value={editPracticeForm.name}
                      onChange={(value) => setEditPracticeForm(prev => ({ ...prev, name: value }))}
                    />
                  </div>
                  
                  <div>
                    <FormLabel htmlFor="edit-org-description">Description (optional)</FormLabel>
                    <Input
                      id="edit-org-description"
                      value={editPracticeForm.description}
                      onChange={(value) => setEditPracticeForm(prev => ({ ...prev, description: value }))}
                      placeholder="Brief description of your practice"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setIsEditingPractice(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdatePractice}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Subscription Tier Section */}
              <div className="py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Subscription Plan
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {currentPractice.subscriptionTier === 'plus' ? 'Plus' : 
                   currentPractice.subscriptionTier === 'business' ? 'Business' : 
                   currentPractice.subscriptionTier === 'enterprise' ? 'Enterprise' : 'Free'}
                  {currentPractice.seats && currentPractice.seats > 1 && 
                    ` • ${currentPractice.seats} seats`}
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Practice Slug Section */}
              <div className="py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Practice Slug
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {currentPractice.slug}
                </p>
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

              {/* Team Members Section */}
              <div className="py-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Team Members</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Seats used: {members.length} / {normalizeSeats(currentPractice?.seats)}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button 
                      size="sm" 
                      onClick={() => setIsInvitingMember(!isInvitingMember)}
                    >
                      <UserPlusIcon className="w-4 h-4 mr-2" />
                      {isInvitingMember ? 'Cancel' : 'Invite'}
                    </Button>
                  )}
                </div>
                
                {members.length > normalizeSeats(currentPractice?.seats) && (
                  <div role="status" aria-live="polite" className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      You&apos;re using {members.length} seats but your plan includes {normalizeSeats(currentPractice?.seats)}. The billing owner can increase seats in Stripe.
                      {isOwner && currentPractice?.stripeCustomerId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openBillingPortal({ 
                            practiceId: currentPractice.id, 
                            returnUrl: origin ? `${origin}/settings/practice?sync=1` : '/settings/practice?sync=1' 
                          })}
                          disabled={submitting}
                          className="ml-2 underline text-blue-600 hover:text-blue-700"
                        >
                          {t('settings:account.plan.manage')}
                        </Button>
                      )}
                    </p>
                  </div>
                )}
                
                {members.length === 0 && loading ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Loading members...</p>
                ) : members.length > 0 ? (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div key={member.userId} className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {member.name || member.email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {member.email} • {member.role}
                          </p>
                        </div>
                        {isAdmin && member.role !== 'owner' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditMemberData(member);
                              setIsEditingMember(!isEditingMember);
                            }}
                            className="text-gray-600 dark:text-gray-400"
                          >
                            {isEditingMember && editMemberData?.userId === member.userId ? 'Cancel' : 'Manage'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No team members yet</p>
                )}

                {/* Inline Invite Form */}
                {isInvitingMember && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <FormLabel htmlFor="invite-email">Email Address</FormLabel>
                      <Input
                        id="invite-email"
                        type="email"
                        value={inviteForm.email}
                        onChange={(value) => setInviteForm(prev => ({ ...prev, email: value }))}
                        placeholder="colleague@lawfirm.com"
                      />
                    </div>
                    
                    <div>
                      <FormLabel htmlFor="invite-role">Role</FormLabel>
                      <Select
                        value={inviteForm.role}
                        options={[
                          { value: 'paralegal', label: 'Paralegal' },
                          { value: 'attorney', label: 'Attorney' },
                          { value: 'admin', label: 'Admin' }
                        ]}
                        onChange={(value) => setInviteForm(prev => ({ ...prev, role: value as Role }))}
                      />
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button variant="secondary" onClick={() => setIsInvitingMember(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSendInvitation}>
                        Send Invitation
                      </Button>
                    </div>
                  </div>
                )}

                {/* Inline Edit Member Form */}
                {isEditingMember && editMemberData && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {editMemberData.name || editMemberData.email}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {editMemberData.email}
                      </p>
                    </div>
                    
                    <div>
                      <FormLabel htmlFor="member-role">Role</FormLabel>
                      <Select
                        value={editMemberData.role}
                        options={[
                          { value: 'paralegal', label: 'Paralegal' },
                          { value: 'attorney', label: 'Attorney' },
                          { value: 'admin', label: 'Admin' }
                        ]}
                        onChange={(value) => setEditMemberData(prev => prev ? {...prev, role: value as Role} : null)}
                      />
                    </div>
                    
                    <div className="flex justify-between pt-2">
                      <Button 
                        variant="ghost"
                        onClick={() => handleRemoveMember(editMemberData)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove Member
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => {
                          setIsEditingMember(false);
                          setEditMemberData(null);
                        }}>
                          Cancel
                        </Button>
                        <Button onClick={handleUpdateMemberRole}>
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Delete Practice Section (Owner only) */}
              {isOwner && (
                <>
                  <div className="flex items-center justify-between py-3" data-testid="org-delete-section">
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
                          data-testid="org-delete-action"
                        >
                          {t('settings:account.plan.manage')}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteModal(true)}
                          className="text-red-600 hover:text-red-700"
                          data-testid="org-delete-action"
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
          
          <div className="border-t border-gray-200 dark:border-dark-border" />
          
          {/* Pending Invitations */}
          <div className="py-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Pending Invitations</h3>
            {invitations.length > 0 ? (
              <div className="space-y-3">
                {invitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {inv.practiceName || inv.practiceId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Role: {inv.role} • Expires: {formatDate(new Date(inv.expiresAt * 1000))}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleAcceptInvitation(inv.id)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleDeclineInvitation(inv.id)}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">No pending invitations</p>
            )}
          </div>
        </div>
      </div>

      {/* Create Practice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Practice"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="org-name">Practice Name *</FormLabel>
            <Input
              id="org-name"
              value={createForm.name}
              onChange={(value) => setCreateForm(prev => ({ ...prev, name: value }))}
              placeholder="Your Law Firm Name"
              required
            />
          </div>
          
          <div>
            <FormLabel htmlFor="org-slug">Slug (optional)</FormLabel>
            <Input
              id="org-slug"
              value={createForm.slug}
              onChange={(value) => setCreateForm(prev => ({ ...prev, slug: value }))}
              placeholder="your-law-firm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in URLs. Leave empty to auto-generate.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="org-description">Description (optional)</FormLabel>
            <Input
              id="org-description"
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
