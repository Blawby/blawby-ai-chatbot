import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Copy, X } from 'lucide-preact';

import { usePracticeManagement, type Role } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { usePracticeInvitations } from '@/shared/hooks/usePracticeInvitations';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { usePaymentUpgrade } from '@/shared/hooks/usePaymentUpgrade';
import { Button } from '@/shared/ui/Button';
import { EmailInput } from '@/shared/ui/input';
import { FormLabel } from '@/shared/ui/form/FormLabel';
import { Combobox } from '@/shared/ui/input/Combobox';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useTranslation } from '@/shared/i18n/hooks';
import { formatDate } from '@/shared/utils/dateTime';
import { cn } from '@/shared/utils/cn';
import { getPracticeRoleLabel, PRACTICE_ROLE_OPTIONS, normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { ListRowSkeleton } from '@/shared/ui/layout';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';

interface PracticeTeamPageProps {
  className?: string;
}

export const PracticeTeamPage = ({ className }: PracticeTeamPageProps) => {
  const { session } = useSessionContext();
  const { activeMemberRole, activeMemberRoleLoading } = useMemberRoleContext();
  const {
    currentPractice,
    updateMemberRole,
    removeMember,
    isLoading
  } = usePracticeManagement();
  const {
    invitations,
    sendInvitation: sendPracticeInvitation,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
  } = usePracticeInvitations(currentPractice?.id ?? null);
  const { showSuccess, showError, showWarning } = useToastContext();
  const { openBillingPortal, submitting } = usePaymentUpgrade();
  const { t } = useTranslation(['settings']);
  const location = useLocation();
  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);

  const currentUserEmail = session?.user?.email || '';
  const {
    members,
    summary,
    isLoading: teamLoading,
    error: teamError,
    refetch: refetchTeam,
  } = usePracticeTeam(
    currentPractice?.id ?? null,
    session?.user?.id ?? null,
    { enabled: Boolean(currentPractice?.id) }
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
  const isMembershipResolved = !teamLoading && !teamError;
  const isMember = Boolean(normalizedActiveRole ?? roleFromMembers);
  const teamRoleOptions = PRACTICE_ROLE_OPTIONS.filter(option => option.value !== 'owner');

  const [, setIsInvitingMember] = useState(false);
  // Tracks the invitation currently being acted on (accept / decline / cancel).
  // One flag is sufficient since these actions are mutually exclusive per row.
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
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
    if (!teamError) return;
    showError(teamError);
  }, [showError, teamError]);

  const refetchTeamAfterAction = useCallback(async () => {
    try {
      await refetchTeam();
    } catch (refetchErr) {
      console.warn('[PracticeTeamPage] Failed to refresh team — changes were saved.', refetchErr);
      showWarning('Failed to refresh team — changes were saved.');
    }
  }, [refetchTeam, showWarning]);

  if (currentPractice && !activeMemberRoleLoading && isMembershipResolved && !isMember) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-dim-2">You are not a member of this practice.</p>
      </div>
    );
  }

  const handleSendInvitation = async () => {
    if (!currentPractice || !inviteForm.email.trim()) {
      showError('Email is required');
      return;
    }

    try {
      await sendPracticeInvitation(inviteForm.email, inviteForm.role);
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
      await refetchTeamAfterAction();
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
      await refetchTeamAfterAction();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    if (pendingInvitationId) return;
    setPendingInvitationId(invitationId);
    try {
      await acceptInvitation(invitationId);
      showSuccess('Invitation accepted!');
      await refetchTeamAfterAction();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (pendingInvitationId) return;
    setPendingInvitationId(invitationId);
    try {
      await declineInvitation(invitationId);
      showSuccess('Invitation declined successfully!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to decline invitation');
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (pendingInvitationId) return;
    setPendingInvitationId(invitationId);
    try {
      await cancelInvitation(invitationId);
      showSuccess('Invitation canceled successfully!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    } finally {
      setPendingInvitationId(null);
    }
  };

  const buildInvitationLink = (invitationId: string) => {
    const path = `/auth/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
    return origin ? `${origin}${path}` : path;
  };

  const copyInvitationLink = async (invitationId: string) => {
    const link = buildInvitationLink(invitationId);
    try {
      await navigator.clipboard.writeText(link);
      showSuccess('Invite link copied', link);
    } catch (err) {
      showError('Failed to copy invite link', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (!currentPractice) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-dim-2">No practice selected.</p>
      </div>
    );
  }

  const seatsUsed = summary.seatsUsed ?? 0;
  const seatsTotal = summary.seatsIncluded ?? 3;
  const seatsPercent = Math.min(100, Math.round((seatsUsed / Math.max(seatsTotal, 1)) * 100));
  const isOverSeat = seatsUsed > seatsTotal;

  return (
    <div className={className}>
      <div className="space-y-0">
        <SettingSection
          first
          title="Members"
          description="Active members and pending invitations for this practice workspace."
        >
          {members.length === 0 && (isLoading || teamLoading) ? (
            <ListRowSkeleton rows={3} />
          ) : (
            <SettingsCard className="max-w-[860px] px-0 py-0">
            <div className="flex flex-col gap-0">
              {members.map((member) => {
                const initial = (member.name || member.email || '?').charAt(0).toUpperCase();
                const isMe = member.email?.toLowerCase() === currentUserEmail.toLowerCase();
                const isEditing = editMemberData?.userId === member.userId;
                return (
                  <div key={member.userId} className="border-b border-rule last:border-0">
                    <div className="grid items-center gap-4 px-4 py-[14px]" style={{ gridTemplateColumns: '40px 1fr 120px 100px auto' }}>
                      {/* Avatar */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-serif italic text-sm text-accent">
                        {initial}
                      </div>
                      {/* Name / email */}
                      <div>
                        <div className="text-sm font-medium text-ink">{member.name || member.email || member.userId}</div>
                        <div className="font-mono text-xs text-dim">{member.email || member.userId}</div>
                      </div>
                      {/* Role tag */}
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">
                        {getPracticeRoleLabel(member.role)}
                      </span>
                      {/* Status dot */}
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--pos,#22c55e)]" />
                        <span className="font-mono text-[10px] text-dim">active</span>
                      </span>
                      {/* Action */}
                      {isMe ? (
                        <Button variant="ghost" size="sm" disabled className="opacity-40 cursor-default">You</Button>
                      ) : isAdmin && member.role !== 'owner' ? (
                        <Button variant="ghost" size="sm" onClick={() => setEditMemberData(isEditing ? null : member)}>
                          {isEditing ? 'Cancel' : 'Manage'}
                        </Button>
                      ) : <span />}
                    </div>
                    {/* Inline manage form */}
                    {isEditing && editMemberData && (
                      <div className="border-t border-rule px-5 py-4 flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-0" style={{ maxWidth: 240 }}>
                          <FormLabel htmlFor="member-role">Role</FormLabel>
                          <Combobox
                            id="member-role"
                            value={editMemberData.role}
                            options={teamRoleOptions}
                            onChange={(value) => setEditMemberData((prev) => prev ? { ...prev, role: value as Role } : null)}
                            searchable={false}
                          />
                        </div>
                        <Button size="sm" onClick={handleUpdateMemberRole}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditMemberData(null)}>Cancel</Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => handleRemoveMember(editMemberData)} className="ml-auto">Remove</Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pending invitations */}
              {invitations.map((inv) => (
                <div key={inv.id} className="grid items-center gap-4 px-4 py-[14px] border-b border-rule last:border-0" style={{ gridTemplateColumns: '40px 1fr 120px 100px auto' }}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-rule text-sm text-dim">
                    {inv.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{inv.email}</div>
                    <div className="font-mono text-xs text-dim">Expires {formatDate(new Date(inv.expiresAt))}</div>
                  </div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim">{getPracticeRoleLabel(inv.role)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="font-mono text-[10px] text-dim">pending</span>
                  </span>
                  <div className="flex gap-1">
                    {inv.email.toLowerCase() === currentUserEmail.toLowerCase() ? (
                      <>
                        <Button size="sm" onClick={() => handleAcceptInvitation(inv.id)} disabled={pendingInvitationId !== null}>
                          {pendingInvitationId === inv.id ? '…' : 'Accept'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleDeclineInvitation(inv.id)} disabled={pendingInvitationId !== null}>Decline</Button>
                      </>
                    ) : isAdmin ? (
                      <>
                        <Button variant="icon" size="icon-sm" onClick={() => void copyInvitationLink(inv.id)} aria-label="Copy invite link" icon={Copy} iconClassName="h-4 w-4" />
                        <Button variant="icon" size="icon-sm" onClick={() => handleCancelInvitation(inv.id)} disabled={pendingInvitationId !== null} aria-label="Cancel invitation" icon={X} iconClassName="h-4 w-4" />
                      </>
                    ) : null}
                  </div>
                </div>
              ))}

              {members.length === 0 && invitations.length === 0 && (
                <p className="px-5 py-5 text-sm text-dim">No team members yet.</p>
              )}
            </div>
            </SettingsCard>
          )}
        </SettingSection>

        {isAdmin && (
          <SettingSection
            title="Invite a team member"
            description="New members receive their own login and assistant thread. You control what they can see and do."
          >
            <SettingsCard className="max-w-[860px]">
              <div className="font-serif text-lg mb-1">Send invitation</div>
              <p className="text-xs text-dim mb-4">They&apos;ll receive an email with a link to join your workspace.</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1" style={{ minWidth: 200 }}>
                  <FormLabel htmlFor="invite-email">Email address</FormLabel>
                  <EmailInput
                    id="invite-email"
                    value={inviteForm.email}
                    onChange={(value) => setInviteForm((prev) => ({ ...prev, email: value }))}
                    placeholder="paralegal@example.com"
                    showValidation
                    required
                  />
                </div>
                <div style={{ minWidth: 150 }}>
                  <FormLabel htmlFor="invite-role">Role</FormLabel>
                  <Combobox
                    id="invite-role"
                    value={inviteForm.role}
                    options={teamRoleOptions}
                    onChange={(value) => setInviteForm((prev) => ({ ...prev, role: value as Role }))}
                    searchable={false}
                  />
                </div>
                <Button size="sm" onClick={handleSendInvitation}>Invite →</Button>
              </div>
            </SettingsCard>
          </SettingSection>
        )}

        <SettingSection
          title="Role permissions"
          description="What each role can access. Custom roles can come later once the permission model is finalized."
        >
          <SettingsCard className="max-w-[860px] px-0 py-0">
          {[
            { name: 'Attorney', desc: 'Full access to matters, billing, and trust. Can approve staged actions.', badge: 'all permissions' },
            { name: 'Paralegal', desc: 'Read/write matters and intakes. Cannot access billing or trust ledger.', badge: 'limited' },
            { name: 'Admin', desc: 'Manage settings, billing, and team. Cannot view matter details or trust.', badge: 'admin only' },
            { name: 'Read-only', desc: 'View matters and reports. Cannot create, edit, or approve anything.', badge: 'view only' },
          ].map(({ name, desc, badge }) => (
            <div key={name} className="flex items-center justify-between gap-6 py-3.5 border-b border-rule last:border-0">
              <div>
                <div className="text-sm font-medium text-ink">{name}</div>
                <div className="text-xs text-dim mt-0.5">{desc}</div>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-dim border border-rule rounded-full px-2.5 py-0.5">{badge}</span>
            </div>
          ))}
          </SettingsCard>
        </SettingSection>

        <SettingSection
          title="Seat usage"
          description={`Your plan includes ${seatsTotal} seats. You're currently using ${seatsUsed}.`}
        >
          <SettingsCard className="max-w-[860px]">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-ink-2">{seatsUsed} of {seatsTotal} seats used</span>
              <span className="font-mono text-xs text-dim">{Math.max(0, seatsTotal - seatsUsed)} remaining</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-rule overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', isOverSeat ? 'bg-[var(--neg,#ef4444)]' : 'bg-ink')}
                style={{ width: `${seatsPercent}%` }}
              />
            </div>
          </div>

          {isOverSeat && isOwner && (
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openBillingPortal({
                  practiceId: currentPractice.id,
                  returnUrl: origin ? `${origin}${toSettingsPath('practice')}?sync=1` : `${toSettingsPath('practice')}?sync=1`,
                })}
                disabled={submitting}
              >
                {t('settings:account.plan.manage')}
              </Button>
            </div>
          )}
          </SettingsCard>
        </SettingSection>
      </div>
    </div>
  );
};
