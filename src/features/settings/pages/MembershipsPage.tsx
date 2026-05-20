import { useState } from 'preact/hooks';
import { Briefcase, LogOut, Check } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile';
import { Icon } from '@/shared/ui/Icon';
import ConfirmationDialog from '@/shared/components/ConfirmationDialog';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useTranslation } from '@/shared/i18n/hooks';
import { getPracticeRoleLabel, normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { cn } from '@/shared/utils/cn';

import { SettingSection } from '@/features/settings/components/SettingSection';

interface MembershipsPageProps {
  className?: string;
}

export const MembershipsPage = ({ className = '' }: MembershipsPageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { session } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { practices, currentPractice, removeMember, isLoading, refetch } = usePracticeManagement();
  const { t } = useTranslation(['settings', 'common']);

  const [practiceToLeave, setPracticeToLeave] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const userId = session?.user?.id ?? null;
  const currentRole = normalizePracticeRole(activeMemberRole) ?? 'member';

  const handleConfirmLeave = async () => {
    if (!practiceToLeave || !userId) return;
    setIsLeaving(true);
    try {
      await removeMember(practiceToLeave, userId);
      await refetch();
      showSuccess(
        t('settings:memberships.leftToastTitle', { defaultValue: 'Left practice' }),
        t('settings:memberships.leftToastBody', { defaultValue: 'You are no longer a member of this practice.' }),
      );
      setPracticeToLeave(null);
    } catch (error) {
      showError(
        t('common:error.title'),
        error instanceof Error ? error.message : 'Unable to leave practice.',
      );
    } finally {
      setIsLeaving(false);
    }
  };

  const leaveTargetName = practices.find((p) => p.id === practiceToLeave)?.name ?? '';

  if (isLoading) {
    return (
      <div className={cn('py-10 text-sm text-input-placeholder', className)}>
        {t('common:status.loading', { defaultValue: 'Loading…' })}
      </div>
    );
  }

  return (
    <div className={cn('divide-y divide-line-default', className)}>
      <SettingSection
        title={t('settings:memberships.title', { defaultValue: 'Practice memberships' })}
        description={t('settings:memberships.description', {
          defaultValue: 'The legal practices you belong to on Blawby. Your active practice is highlighted.',
        })}
        formClassName="max-w-2xl"
      >
        {practices.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <ul className="space-y-3">
            {practices.map((practice) => {
              const isCurrent = currentPractice?.id === practice.id;
              return (
                <li
                  key={practice.id}
                  className="flex items-center gap-4 rounded-xl border border-line-default bg-surface-card p-3"
                >
                  <Avatar
                    src={practice.logo ?? null}
                    name={practice.name ?? 'Practice'}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-input-text truncate">
                        {practice.name ?? 'Untitled practice'}
                      </p>
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-500">
                          <Icon icon={Check} className="w-3 h-3" aria-hidden="true" />
                          {t('settings:memberships.currentBadge', { defaultValue: 'Active' })}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-input-placeholder truncate">
                      {practice.slug ? `blawby.com/practice/${practice.slug}` : 'No public slug'}
                      {isCurrent ? ` · ${getPracticeRoleLabel(currentRole)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={LogOut}
                    iconClassName="w-4 h-4"
                    onClick={() => setPracticeToLeave(practice.id)}
                    disabled={isCurrent}
                    aria-label={t('settings:memberships.leaveAria', {
                      defaultValue: 'Leave {{name}}',
                      name: practice.name,
                    })}
                    title={isCurrent
                      ? t('settings:memberships.cannotLeaveCurrent', {
                          defaultValue: 'Switch to another practice before leaving this one.',
                        })
                      : undefined}
                  >
                    {t('settings:memberships.leaveButton', { defaultValue: 'Leave' })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingSection>

      <ConfirmationDialog
        isOpen={practiceToLeave !== null}
        onClose={() => { if (!isLeaving) setPracticeToLeave(null); }}
        onConfirm={handleConfirmLeave}
        title={t('settings:memberships.leaveConfirmTitle', {
          defaultValue: 'Leave {{name}}?',
          name: leaveTargetName,
        })}
        description={t('settings:memberships.leaveConfirmBody', {
          defaultValue: 'You will lose access to this practice. An admin will need to invite you back to rejoin.',
        })}
        confirmText={t('settings:memberships.leaveButton', { defaultValue: 'Leave' })}
        cancelText={t('common:forms.actions.cancel', { defaultValue: 'Cancel' })}
      />
    </div>
  );
};

const EmptyState = ({ t }: { t: ReturnType<typeof useTranslation>['t'] }) => (
  <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-default p-6">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-card-hover">
      <Icon icon={Briefcase} className="w-5 h-5 text-input-placeholder" aria-hidden="true" />
    </div>
    <div>
      <p className="text-sm font-medium text-input-text">
        {t('settings:memberships.emptyTitle', { defaultValue: 'No practice memberships yet' })}
      </p>
      <p className="mt-1 text-sm text-input-placeholder">
        {t('settings:memberships.emptyBody', {
          defaultValue: 'You belong to a practice when an admin invites you. Accept an invitation to get started.',
        })}
      </p>
    </div>
  </div>
);

export default MembershipsPage;
