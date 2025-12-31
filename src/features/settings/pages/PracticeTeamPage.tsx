import { useEffect, useMemo, useState } from 'preact/hooks';
import { ArrowLeftIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement, type Role } from '@/shared/hooks/usePracticeManagement';
import { authClient } from '@/shared/lib/authClient';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { normalizeSeats } from '@/shared/utils/subscription';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { Select } from '@/shared/ui/input/Select';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatDate } from '@/shared/utils/dateTime';

interface PracticeTeamPageProps {
  onNavigate?: (path: string) => void;
}

export const PracticeTeamPage = ({ onNavigate }: PracticeTeamPageProps) => {
  const { data: session } = authClient.useSession();
  const {
    currentPractice,
    getMembers,
    fetchMembers,
    updateMemberRole,
    removeMember,
    sendInvitation,
    invitations,
    acceptInvitation,
    declineInvitation,
    loading
  } = usePracticeManagement();
  const { showSuccess, showError } = useToastContext();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { navigate: baseNavigate } = useNavigation();
  const { t } = useTranslation(['settings']);
  const navigate = onNavigate ?? baseNavigate;

  const currentUserEmail = session?.user?.email || '';
  const members = useMemo(
    () => (currentPractice ? getMembers(currentPractice.id) : []),
    [currentPractice, getMembers]
  );

  const currentMember = useMemo(() => {
    if (!currentPractice || !currentUserEmail) return null;
    return members.find(m => m.email && m.email.toLowerCase() === currentUserEmail.toLowerCase()) ||
      members.find(m => m.userId === session?.user?.id);
  }, [currentPractice, currentUserEmail, members, session?.user?.id]);

  const currentUserRole = currentMember?.role || 'paralegal';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'attorney' as Role
  });
  const [editMemberData, setEditMemberData] = useState<{
    userId: string;
    email: string;
    name?: string;
    role: Role;
  } | null>(null);

  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  useEffect(() => {
    if (!currentPractice) return;
    fetchMembers(currentPractice.id).catch((err) => {
      showError(err?.message || String(err) || 'Failed to fetch practice members');
    });
  }, [currentPractice, fetchMembers, showError]);

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

  const handleUpdateMemberRole = async () => {
    if (!currentPractice || !editMemberData) return;

    try {
      await updateMemberRole(currentPractice.id, editMemberData.userId, editMemberData.role);
      showSuccess('Member role updated successfully!');
      setEditMemberData(null);
      setIsEditingMember(false);
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
      setIsEditingMember(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove member');
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

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-500">No practice selected.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="pt-4 pb-6">
          <button
            type="button"
            onClick={() => navigate('/settings/practice')}
            className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300"
            aria-label="Back to practice settings"
          >
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium">Back to Practice</span>
          </button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Team Members</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage access to your practice workspace.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
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
                      if (isEditingMember && editMemberData?.userId === member.userId) {
                        setIsEditingMember(false);
                        setEditMemberData(null);
                        return;
                      }
                      setEditMemberData(member);
                      setIsEditingMember(true);
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

        {isInvitingMember && (
          <div className="mt-6 space-y-4">
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

        {isEditingMember && editMemberData && (
          <div className="mt-6 space-y-4">
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
                onChange={(value) => setEditMemberData(prev => prev ? { ...prev, role: value as Role } : null)}
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

        <div className="mt-8 border-t border-gray-200 dark:border-dark-border pt-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Pending Invitations
          </h3>
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
  );
};
