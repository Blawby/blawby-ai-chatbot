import { useState, useEffect, useMemo } from 'preact/hooks';
import { 
  BuildingOfficeIcon, 
  PlusIcon, 
  UserPlusIcon,
  KeyIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { useOrganizationManagement, type Role } from '../../../hooks/useOrganizationManagement';
import { features } from '../../../config/features';
import { Button } from '../../ui/Button';
import Modal from '../../Modal';
import { Input } from '../../ui/input';
import { FormLabel } from '../../ui/form/FormLabel';
import { Select } from '../../ui/input/Select';
import { useToastContext } from '../../../contexts/ToastContext';
import { formatDate } from '../../../utils/dateTime';
import { useNavigation } from '../../../utils/navigation';
import { useSession } from '../../../contexts/AuthContext';

interface OrganizationPageProps {
  className?: string;
}

export const OrganizationPage = ({ className = '' }: OrganizationPageProps) => {
  const { data: session } = useSession();
  const { 
    currentOrganization, 
    getMembers,
    getTokens,
    invitations, 
    loading, 
    error,
    updateOrganization,
    createOrganization,
    deleteOrganization,
    acceptInvitation,
    declineInvitation,
    fetchMembers,
    updateMemberRole,
    removeMember,
    sendInvitation,
    fetchTokens,
    createToken,
    revokeToken,
    refetch 
  } = useOrganizationManagement();
  
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  
  // Get current user email from session
  const currentUserEmail = session?.user?.email || '';
  
  // Form states
  const [editOrgForm, setEditOrgForm] = useState({
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
  
  const [tokenForm, setTokenForm] = useState({
    name: ''
  });
  
  // Inline form states (like SecurityPage pattern)
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; tokenId: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editMemberData, setEditMemberData] = useState<{ userId: string; email: string; name?: string; role: Role } | null>(null);

  const hasOrganization = !!currentOrganization;
  console.log('🔍 DEBUG OrganizationPage: currentOrganization:', JSON.stringify(currentOrganization, null, 2));
  console.log('🔍 DEBUG OrganizationPage: hasOrganization:', hasOrganization);
  const members = useMemo(() => currentOrganization ? getMembers(currentOrganization.id) : [], [currentOrganization, getMembers]);
  const _memberCount = members.length;
  const tokens = currentOrganization ? getTokens(currentOrganization.id) : [];
  
  // Better approach - get role directly from current org context
  const currentMember = useMemo(() => {
    if (!currentOrganization || !currentUserEmail) return null;
    return members.find(m => m.email.toLowerCase() === currentUserEmail.toLowerCase());
  }, [currentOrganization, currentUserEmail, members]);

  const currentUserRole = currentMember?.role || 'paralegal';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = (currentUserRole === 'admin' || isOwner) ?? false;


  // Current user email is now derived from session - no need for useEffect

  // Initialize form with current organization data
  useEffect(() => {
    if (currentOrganization) {
      setEditOrgForm({
        name: currentOrganization.name,
        description: currentOrganization.description || ''
      });
      
      // Fetch related data only once when organization changes
      const fetchMembersData = async () => {
        try {
          await fetchMembers(currentOrganization.id);
        } catch (err) {
          showError(err?.message || String(err) || 'Failed to fetch organization members');
        }
      };
      
      fetchMembersData();
      fetchTokens(currentOrganization.id);
    }
  }, [currentOrganization?.id]); // Only depend on organization ID, not the functions

  const handleCreateOrganization = async () => {
    if (!createForm.name.trim()) {
      showError('Organization name is required');
      return;
    }

    try {
      await createOrganization({
        name: createForm.name,
        slug: createForm.slug || undefined,
        description: createForm.description || undefined,
      });
      
      showSuccess('Organization created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', description: '' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create organization');
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

  const handleUpdateOrganization = async () => {
    if (!currentOrganization) return;
    
    try {
      await updateOrganization(currentOrganization.id, editOrgForm);
      showSuccess('Organization updated successfully!');
      setIsEditingOrg(false);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  const handleSendInvitation = async () => {
    if (!currentOrganization || !inviteForm.email.trim()) {
      showError('Email is required');
      return;
    }

    try {
      await sendInvitation(currentOrganization.id, inviteForm.email, inviteForm.role);
      showSuccess('Invitation sent successfully!');
      setIsInvitingMember(false);
      setInviteForm({ email: '', role: 'attorney' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleCreateToken = async () => {
    if (!currentOrganization || !tokenForm.name.trim()) {
      showError('Token name is required');
      return;
    }

    try {
      const result = await createToken(currentOrganization.id, tokenForm.name);
      setNewToken(result);
      showSuccess('API token created successfully!');
      setShowTokenModal(false);
      setTokenForm({ name: '' });
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create token');
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    if (!currentOrganization) return;

    try {
      await revokeToken(currentOrganization.id, tokenId);
      showSuccess('Token revoked successfully!');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganization) return;
    
    if (deleteConfirmText !== currentOrganization.name) {
      showError('Organization name must match exactly');
      return;
    }

    try {
      await deleteOrganization(currentOrganization.id);
      showSuccess('Organization deleted successfully!');
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      navigate('/');
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete organization');
    }
  };

  const handleUpdateMemberRole = async () => {
    if (!currentOrganization || !editMemberData) return;

    try {
      await updateMemberRole(currentOrganization.id, editMemberData.userId, editMemberData.role);
      showSuccess('Member role updated successfully!');
      setEditMemberData(null);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (member: { userId: string; email: string; name?: string; role: Role }) => {
    if (!currentOrganization) return;

    try {
      await removeMember(currentOrganization.id, member.userId);
      showSuccess('Member removed successfully!');
      setEditMemberData(null);
		} catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading organization...</p>
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
          Organization
        </h1>
        <div className="border-t border-gray-200 dark:border-dark-border mt-4" />
      </div>
      
      <div className="flex-1 overflow-y-auto px-6">
        <div className="space-y-0">
          {hasOrganization ? (
            <>
              {/* Organization Name Section */}
              <div className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Organization Name
                  </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {currentOrganization.name}
                  </p>
                  </div>
                <div className="ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingOrg(!isEditingOrg)}
                  >
                    {isEditingOrg ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </div>
              
              {/* Inline Edit Form */}
              {isEditingOrg && (
                <div className="mt-4 space-y-4">
                  <div>
                    <FormLabel htmlFor="edit-org-name">Organization Name</FormLabel>
                    <Input
                      id="edit-org-name"
                      value={editOrgForm.name}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, name: value }))}
                    />
                  </div>
                  
                  <div>
                    <FormLabel htmlFor="edit-org-description">Description (optional)</FormLabel>
                    <Input
                      id="edit-org-description"
                      value={editOrgForm.description}
                      onChange={(value) => setEditOrgForm(prev => ({ ...prev, description: value }))}
                      placeholder="Brief description of your practice"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setIsEditingOrg(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpdateOrganization}>
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
                  {currentOrganization.subscriptionTier === 'plus' ? 'Plus' : 
                   currentOrganization.subscriptionTier === 'business' ? 'Business' : 
                   currentOrganization.subscriptionTier === 'enterprise' ? 'Enterprise' : 'Free'}
                  {currentOrganization.seats && currentOrganization.seats > 1 && 
                    ` • ${currentOrganization.seats} seats`}
                </p>
              </div>

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Organization Slug Section */}
              <div className="py-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Organization Slug
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {currentOrganization.slug}
                </p>
              </div>

              {currentOrganization.description && (
                <>
                  <div className="border-t border-gray-200 dark:border-dark-border" />
                  <div className="py-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Description
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {currentOrganization.description}
                    </p>
                  </div>
                </>
              )}

              <div className="border-t border-gray-200 dark:border-dark-border" />

              {/* Team Members Section */}
              <div className="py-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Team Members</h3>
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

              {/* API Tokens Section (Owner only) */}
              {isOwner && (
                <>
                  <div className="py-3">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">API Tokens</h3>
                      <Button size="sm" onClick={() => setShowTokenModal(true)}>
                        <KeyIcon className="w-4 h-4 mr-2" />
                        Create Token
                      </Button>
                    </div>
                    
                    {tokens.length > 0 ? (
                      <div className="space-y-3">
                        {tokens.map((token) => (
                          <div key={token.id} className="flex items-center justify-between py-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{token.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Created: {formatDate(token.createdAt)}
                                {token.lastUsed && ` • Last used: ${formatDate(token.lastUsed)}`}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevokeToken(token.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Revoke
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">No API tokens created yet</p>
                    )}
                  </div>

                  <div className="border-t border-gray-200 dark:border-dark-border" />

                  {/* Delete Organization Section (Owner only) */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Delete Organization</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Permanently delete this organization and all its data
                      </p>
                    </div>
                    <div className="ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* No Organization State */
            <div className="py-3">
              <div className="text-center py-8">
                <BuildingOfficeIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-sm font-semibold mb-2">No Organization Yet</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Create your law firm or accept an invitation
                </p>
                {features.enableMultipleOrganizations && (
                  <Button size="sm" onClick={() => setShowCreateModal(true)}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Create Organization
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
                        {inv.organizationName || inv.organizationId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Role: {inv.role} • Expires: {formatDate(inv.expiresAt)}
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

      {/* Create Organization Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Organization"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="org-name">Organization Name *</FormLabel>
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
            <Button onClick={handleCreateOrganization}>
              Create Organization
            </Button>
          </div>
        </div>
      </Modal>


      {/* Create API Token Modal */}
      <Modal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        title="Create API Token"
      >
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="token-name">Token Name</FormLabel>
            <Input
              id="token-name"
              value={tokenForm.name}
              onChange={(value) => setTokenForm(prev => ({ ...prev, name: value }))}
              placeholder="My Integration Token"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowTokenModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateToken}>
              Create Token
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Token Display Modal */}
      <Modal
        isOpen={!!newToken}
        onClose={() => setNewToken(null)}
        title="API Token Created"
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm font-medium mb-2">Your new API token:</p>
            <code className="text-xs bg-white dark:bg-gray-900 p-2 rounded border block break-all">
              {newToken?.token}
            </code>
            <p className="text-xs text-gray-500 mt-2">
              ⚠️ Copy this token now. You won&apos;t be able to see it again.
            </p>
          </div>
          
          <div className="flex justify-end">
            <Button onClick={() => setNewToken(null)}>
              I&apos;ve Copied It
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Organization Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Organization"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              ⚠️ This action cannot be undone. This will permanently delete the organization and all its data.
            </p>
          </div>
          
          <div>
            <FormLabel htmlFor="delete-confirm">
              Type the organization name to confirm: <strong>{currentOrganization?.name}</strong>
            </FormLabel>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={setDeleteConfirmText}
              placeholder="Enter organization name"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="ghost"
              onClick={handleDeleteOrganization}
              disabled={deleteConfirmText !== currentOrganization?.name}
              className="text-red-600 hover:text-red-700"
            >
              Delete Organization
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};
