import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { ArrowLeftIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { usePracticeManagement, type Role } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
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
import { getPracticeRoleLabel, PRACTICE_ROLE_OPTIONS, normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { FormGrid, SectionDivider } from '@/shared/ui/layout';
import { SettingsPageLayout } from '@/features/settings/components/SettingsPageLayout';
import { SettingsNotice } from '@/features/settings/components/SettingsNotice';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';

interface PracticeTeamPageProps {
  onNavigate?: (path: string) => void;
}

export const PracticeTeamPage = ({ onNavigate }: PracticeTeamPageProps) => {
  const { session, activeMemberRole, activeMemberRoleLoading } = useSessionContext();
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
  const location = useLocation();

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

  const roleFromMembers = currentMember?.role ?? null;
  const normalizedActiveRole = normalizePracticeRole(activeMemberRole);
  const currentUserRole = normalizedActiveRole ?? roleFromMembers ?? 'member';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;
  const isMember = Boolean(normalizedActiveRole ?? roleFromMembers);
  const teamRoleOptions = PRACTICE_ROLE_OPTIONS.filter(option => option.value !== 'owner');

  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'admin' as Role
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
    const inviteQuery = typeof location.query?.invite === 'string' ? location.query.invite : '';
    if (inviteQuery === '1' || inviteQuery === 'true') {
      setIsInvitingMember(true);
    }
  }, [location.query]);

  useEffect(() => {
    if (!currentPractice) return;
    fetchMembers(currentPractice.id).catch((err) => {
      showError(err?.message || String(err) || 'Failed to fetch practice members');
    });
  }, [currentPractice, fetchMembers, showError]);

  if (currentPractice && !activeMemberRoleLoading && !isMember) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-input-placeholder">You are not a member of this practice.</p>
      </div>
    );
  }

  const handleSendInvitation = async () => {
    if (!currentPractice || !inviteForm.email.trim()) {
      showError('Email is required');
      return;
    }

    try {
      await sendInvitation(currentPractice.id, inviteForm.email, inviteForm.role);
      showSuccess('Invitation sent successfully!');
      setIsInvitingMember(false);
      setInviteForm({ email: '', role: 'admin' });
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
    const confirmed = window.confirm(
      `Are you sure you want to remove ${member.name || member.email} from the practice?`
    );
    if (!confirmed) return;

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
        <p className="text-sm text-input-placeholder">No practice selected.</p>
      </div>
    );
  }

  return (
    <SettingsPageLayout
      title="Team Members"
      wrapChildren={false}
      contentClassName="pb-6"
      headerLeading={(
        <Button
          variant="icon"
          size="icon"
          onClick={() => navigate('/settings/practice')}
          aria-label="Back to practice settings"
          icon={<ArrowLeftIcon className="w-5 h-5" />}
        />
      )}
    >
      <div className="pt-2 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-input-placeholder">
              Manage access to your practice workspace.
            </p>
            <SettingsHelperText className="mt-2">
              Seats used: {members.length} / {normalizeSeats(currentPractice?.seats)}
            </SettingsHelperText>
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
          <SettingsNotice variant="warning" className="mb-4" role="status" aria-live="polite">
            <p className="text-sm">
              You&apos;re using {members.length} seats but your plan includes {normalizeSeats(currentPractice?.seats)}. The billing owner can increase seats in Stripe.
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openBillingPortal({
                    practiceId: currentPractice.id,
                    returnUrl: origin ? `${origin}/settings/practice?sync=1` : '/settings/practice?sync=1'
                  })}
                  disabled={submitting}
                  className="ml-2 underline text-accent-600 hover:text-accent-700"
                >
                  {t('settings:account.plan.manage')}
                </Button>
              )}
            </p>
          </SettingsNotice>
        )}

      {members.length === 0 && loading ? (
        <SettingsHelperText>Loading members...</SettingsHelperText>
      ) : members.length > 0 ? (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-input-text">
                    {member.name || member.email}
                  </p>
                  <SettingsHelperText>
                    {member.email} • {getPracticeRoleLabel(member.role)}
                  </SettingsHelperText>
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
                    className="text-input-text hover:text-accent-600 dark:hover:text-accent-400"
                  >
                    {isEditingMember && editMemberData?.userId === member.userId ? 'Cancel' : 'Manage'}
                  </Button>
                )}
              </div>
            ))}
          </div>
      ) : (
        <SettingsHelperText>No team members yet</SettingsHelperText>
      )}

        {isInvitingMember && (
          <div className="mt-6 space-y-4">
            <FormGrid>
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
                    ...teamRoleOptions
                  ]}
                  onChange={(value) => setInviteForm(prev => ({ ...prev, role: value as Role }))}
                />
              </div>
            </FormGrid>

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
              <p className="text-sm font-medium text-input-text mb-2">
                {editMemberData.name || editMemberData.email}
              </p>
            <SettingsHelperText>
              {editMemberData.email}
            </SettingsHelperText>
            </div>

            <div>
              <FormLabel htmlFor="member-role">Role</FormLabel>
              <Select
                value={editMemberData.role}
                options={[
                  ...teamRoleOptions
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

        <SectionDivider className="mt-8" />
        <div className="pt-6">
          <h3 className="text-sm font-semibold text-input-text mb-4">
            Pending Invitations
          </h3>
          {invitations.length > 0 ? (
            <div className="space-y-3">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-input-text">
                      {inv.practiceName || inv.practiceId}
                    </p>
                    <SettingsHelperText>
                      Role: {getPracticeRoleLabel(inv.role)} • Expires: {formatDate(new Date(inv.expiresAt * 1000))}
                    </SettingsHelperText>
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
            <SettingsHelperText>No pending invitations</SettingsHelperText>
          )}
        </div>
    </SettingsPageLayout>
  );
};
