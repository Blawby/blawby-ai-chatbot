import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { Button } from '@/shared/ui/Button';
import { EmailInput, LogoUploadInput } from '@/shared/ui/input';
import ConfirmationDialog from '@/shared/components/ConfirmationDialog';
import { FormActions } from '@/shared/ui/form';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { useAuthAccounts } from '@/shared/hooks/useAuthAccounts';
import { signOut } from '@/shared/utils/auth';
import { useTranslation } from '@/shared/i18n/hooks';
import { authClient, deleteUser, getSession, updateUser } from '@/shared/lib/authClient';
import { getCurrentSubscription, type CurrentSubscription } from '@/shared/lib/apiClient';
import { uploadFileViaBackend } from '@/shared/lib/uploadsApi';
import { formatDate } from '@/shared/utils/dateTime';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { cn } from '@/shared/utils/cn';

import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsDangerButton } from '@/features/settings/components/SettingsDangerButton';
import { AccountPageSkeleton } from '@/features/settings/components/AccountPageSkeleton';

const parsePeriodEndDate = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const d = new Date(numeric * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getErrorCode = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj.code === 'string') return obj.code;
  if (typeof obj.data === 'object' && obj.data !== null) {
    const data = obj.data as Record<string, unknown>;
    if (typeof data.code === 'string') return data.code;
  }
  return undefined;
};

export interface AccountProfilePageProps {
  className?: string;
}

export const AccountProfilePage = ({ className = '' }: AccountProfilePageProps) => {
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { t } = useTranslation(['settings', 'common']);

  const { session, isPending } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { workspaceFromPath } = useWorkspace();
  const isClientWorkspace = workspaceFromPath === 'client';

  const { currentPractice, isLoading: practiceLoading } = usePracticeManagement();
  const { members } = usePracticeTeam(
    currentPractice?.id ?? null,
    session?.user?.id ?? null,
    { enabled: Boolean(currentPractice?.id && session?.user?.id) },
  );
  const {
    hasPasswordAccount,
    isLoading: authAccountsLoading,
    error: authAccountsError,
  } = useAuthAccounts(Boolean(session?.user));

  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = useCallback(
    (subPath?: string) => buildSettingsPath(settingsBasePath, subPath),
    [settingsBasePath],
  );

  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteVerificationSent, setDeleteVerificationSent] = useState(false);
  const [passwordRequiredOverride, setPasswordRequiredOverride] = useState<boolean | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeSubmitting, setEmailChangeSubmitting] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<number | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const emailAddress = session?.user?.email ?? '';
  const displayName = (() => {
    const raw = typeof session?.user?.name === 'string' ? session.user.name.trim() : '';
    return raw || emailAddress || 'User';
  })();
  const currentAvatarUrl = avatarPreviewUrl ?? session?.user?.image ?? null;

  // Subscription state is fetched here only to gate account deletion (an
  // owner with an active subscription must cancel first). The full plan UI
  // lives in PracticeBillingPage.
  useEffect(() => {
    if (!session?.user || isClientWorkspace) {
      setCurrentSubscription(null);
      setSubscriptionLoading(false);
      return;
    }
    const controller = new AbortController();
    setSubscriptionLoading(true);
    getCurrentSubscription({ signal: controller.signal })
      .then((sub) => { if (!controller.signal.aborted) setCurrentSubscription(sub); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[AccountProfile] Failed to load subscription state', err);
        setCurrentSubscription(null);
      })
      .finally(() => { if (!controller.signal.aborted) setSubscriptionLoading(false); });
    return () => controller.abort();
  }, [session?.user, isClientWorkspace]);

  const currentUserEmail = typeof emailAddress === 'string' ? emailAddress.trim().toLowerCase() : '';
  const currentMember = members.find((m) =>
    (m.email && m.email.toLowerCase() === currentUserEmail) || m.userId === session?.user?.id,
  ) ?? null;
  const resolvedRole = normalizePracticeRole(activeMemberRole) ?? normalizePracticeRole(currentMember?.role) ?? null;
  const isOwner = resolvedRole === 'owner';

  const subscriptionEnd = parsePeriodEndDate(currentSubscription?.currentPeriodEnd);
  const hasActiveSubscription = currentSubscription !== null
    && ['active', 'trialing', 'past_due'].includes((currentSubscription.status || '').toLowerCase());
  const hasActivePeriod = Boolean(subscriptionEnd && subscriptionEnd.getTime() > Date.now());
  const deletionBlockedBySubscription = isOwner && (hasActiveSubscription || hasActivePeriod);

  const isOAuthUser = !hasPasswordAccount;
  const requiresPassword = passwordRequiredOverride ?? hasPasswordAccount;
  const shouldGateEmailManagement = isOAuthUser;

  const clearLocalAuthState = useCallback(() => {
    try {
      localStorage.removeItem('onboardingCompleted');
      localStorage.removeItem('onboardingCheckDone');
    } catch (error) {
      console.warn('Failed to clear onboarding flags after account deletion:', error);
    }
  }, []);

  const handleAvatarChange = useCallback(async (files: FileList | File[]) => {
    const fileList = Array.isArray(files) ? files : Array.from(files ?? []);
    const [file] = fileList;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Invalid file', 'Please select an image file.');
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showError('File too large', 'Please upload an image under 5 MB.');
      return;
    }
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    const previewUrl = URL.createObjectURL(file);
    avatarObjectUrlRef.current = previewUrl;
    setAvatarPreviewUrl(previewUrl);
    setAvatarUploading(true);
    setAvatarUploadProgress(0);
    try {
      const uploaded = await uploadFileViaBackend({
        file,
        scopeType: 'profile',
        onProgress: (progress) => setAvatarUploadProgress(progress.percentage),
      });
      if (!uploaded.publicUrl) throw new Error('Profile upload completed without a public URL.');
      await updateUser({ image: uploaded.publicUrl });
      await getSession().catch((error) => {
        console.warn('[AccountProfile] Session refresh failed after avatar update', error);
      });
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      setAvatarPreviewUrl(null);
      showSuccess('Profile photo updated', 'Your avatar has been saved.');
    } catch (error) {
      showError('Avatar upload failed', error instanceof Error ? error.message : 'Unable to upload image.');
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      setAvatarPreviewUrl(session?.user?.image ?? null);
    } finally {
      setAvatarUploading(false);
      setAvatarUploadProgress(null);
    }
  }, [session?.user?.image, showError, showSuccess]);

  useEffect(() => () => {
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
  }, []);

  const deleteListItems = useMemo(
    () => t('settings:account.delete.listItems', { returnObjects: true }) as string[],
    [t],
  );

  const handleDeleteAccount = () => {
    if (subscriptionLoading) {
      showError('Checking subscription', 'Please wait while we verify your subscription status.');
      return;
    }
    if (deletionBlockedBySubscription) {
      const endLabel = subscriptionEnd ? `Access ends on ${formatDate(subscriptionEnd)}.` : undefined;
      const message = (currentSubscription?.status ?? '').toLowerCase() === 'canceled'
        ? `Your subscription is scheduled to cancel. ${endLabel ?? ''} You can delete your account after it ends.`
        : `Your subscription is still active. ${endLabel ?? ''} Please cancel it before deleting your account.`;
      showError('Account deletion unavailable', message.trim());
      return;
    }
    setShowDeleteConfirm(true);
    setDeleteVerificationSent(false);
    setPasswordRequiredOverride(null);
  };

  const handleConfirmDelete = async ({ password }: { password?: string } = {}) => {
    try {
      if (isOAuthUser) {
        await deleteUser();
        setDeleteVerificationSent(true);
        clearLocalAuthState();
        showSuccess(
          t('settings:account.delete.verificationSentTitle'),
          t('settings:account.delete.verificationSentBody'),
        );
        return;
      }
      if (!password || password.trim().length === 0) {
        throw new Error(t('settings:account.delete.passwordRequired', {
          defaultValue: 'Password is required to delete your account.',
        }));
      }
      await deleteUser({ password });
      await signOut({ navigate });
      setShowDeleteConfirm(false);
      setDeleteVerificationSent(false);
      setPasswordRequiredOverride(null);
      clearLocalAuthState();
      showSuccess(
        t('settings:account.delete.toastSuccessTitle'),
        t('settings:account.delete.toastSuccessBody'),
      );
      setTimeout(() => { navigate('/', true); }, 1000);
    } catch (error) {
      const errorCode = getErrorCode(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const maybePasswordRequired = errorCode === 'PASSWORD_REQUIRED' || /password/i.test(errorMessage);
      if (maybePasswordRequired) setPasswordRequiredOverride(true);
      throw error;
    }
  };

  const closeEmailEdit = () => {
    setIsEditingEmail(false);
    setNewEmail('');
    setEmailChangeError(null);
  };

  const handleEmailChangeSubmit = async () => {
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailChangeError('Enter a new email address.');
      return;
    }
    if (trimmedEmail === emailAddress.trim().toLowerCase()) {
      setEmailChangeError('Enter a different email address.');
      return;
    }
    if (!origin) {
      setEmailChangeError('Unable to start email change. Please try again.');
      return;
    }
    try {
      setEmailChangeSubmitting(true);
      setEmailChangeError(null);
      const { error } = await authClient.changeEmail({
        newEmail: trimmedEmail,
        callbackURL: `${origin}${toSettingsPath('account/profile')}`,
      });
      if (error) {
        const message = error.message ?? String(error);
        setEmailChangeError(message);
        showError('Unable to change email', message);
        return;
      }
      closeEmailEdit();
      showSuccess(
        t('settings:account.email.changeSuccess.title'),
        t('settings:account.email.changeSuccess.body'),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmailChangeError(message);
      showError('Unable to change email', message);
    } finally {
      setEmailChangeSubmitting(false);
    }
  };

  if (isPending || practiceLoading || authAccountsLoading) {
    return <AccountPageSkeleton className={className} />;
  }
  if (authAccountsError) {
    throw new Error(typeof authAccountsError === 'string' ? authAccountsError : 'Account loading failed');
  }

  return (
    <div className={cn('divide-y divide-line-default', className)}>
      <SettingSection
        title={t('settings:account.profile.identityTitle', { defaultValue: 'Identity' })}
        description={t('settings:account.profile.identityDescription', {
          defaultValue: 'The name and avatar shown to your practice and clients.',
        })}
      >
        <div className="flex items-center gap-4">
          <LogoUploadInput
            imageUrl={currentAvatarUrl}
            name={displayName}
            accept="image/*"
            multiple={false}
            buttonLabel="Change profile photo"
            triggerMode="avatar"
            size={48}
            onChange={handleAvatarChange}
            disabled={avatarUploading}
            progress={avatarUploading ? avatarUploadProgress : null}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-input-text truncate">{displayName}</p>
            <p className="text-xs text-input-placeholder mt-0.5">JPG, PNG or GIF. 5 MB max.</p>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title={t('settings:account.profile.emailTitle', { defaultValue: 'Email' })}
        description={t('settings:account.profile.emailDescription', {
          defaultValue: 'Used to sign in and receive account notices.',
        })}
      >
        {!isEditingEmail ? (
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate text-sm text-input-text">{emailAddress}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsEditingEmail(true)}
            >
              {t('settings:account.email.modal.changeEmail', { defaultValue: 'Change email' })}
            </Button>
          </div>
        ) : shouldGateEmailManagement ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-input-text">
              {t('settings:account.email.addPasswordFirst')}
            </p>
            <p className="text-sm text-input-placeholder">
              {t('settings:account.email.oauthGatingExplanation')}
            </p>
            <FormActions
              className="justify-end"
              size="sm"
              onCancel={closeEmailEdit}
              onSubmit={() => {
                closeEmailEdit();
                navigate(toSettingsPath('account/security'));
              }}
              cancelText={t('settings:account.email.modal.notNow')}
              submitText={t('settings:account.email.modal.goToSecurity')}
              submitType="button"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-input-placeholder">
              {t('settings:account.profile.currentEmailLabel', { defaultValue: 'Current email' })}: {emailAddress}
            </p>
            <EmailInput
              id="account-email-change"
              label={t('settings:account.profile.newEmailLabel', { defaultValue: 'New email' })}
              value={newEmail}
              onChange={(value) => {
                setNewEmail(value);
                setEmailChangeError(null);
              }}
              placeholder={t('settings:account.profile.newEmailPlaceholder', { defaultValue: 'Enter your new email address' })}
              error={emailChangeError ?? undefined}
              showValidation
            />
            <FormActions
              className="justify-end"
              size="sm"
              onCancel={closeEmailEdit}
              onSubmit={() => void handleEmailChangeSubmit()}
              cancelText={t('settings:account.email.modal.cancel')}
              submitText={emailChangeSubmitting
                ? t('settings:account.email.modal.sending')
                : t('settings:account.email.modal.changeEmail')}
              submitType="button"
              submitDisabled={emailChangeSubmitting}
              cancelDisabled={emailChangeSubmitting}
            />
          </div>
        )}
      </SettingSection>

      <SettingSection
        title={t('settings:account.delete.sectionTitle', { defaultValue: 'Delete account' })}
        description={t('settings:account.profile.deleteDescription', {
          defaultValue: 'Permanently delete your Blawby account. This cannot be undone.',
        })}
      >
        <div className="flex items-start">
          <SettingsDangerButton
            size="sm"
            onClick={handleDeleteAccount}
            data-testid="account-delete-action"
          >
            {t('settings:account.delete.button')}
          </SettingsDangerButton>
        </div>
      </SettingSection>

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteVerificationSent(false);
          setPasswordRequiredOverride(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t('settings:account.delete.heading')}
        description={t('settings:account.delete.description')}
        confirmText={t('settings:account.delete.confirmButton')}
        cancelText={t('settings:account.delete.cancel')}
        confirmationValue={emailAddress}
        confirmationLabel={
          isOAuthUser
            ? t('settings:account.delete.confirmLabelOAuth', { email: emailAddress })
            : t('settings:account.delete.confirmLabel', { email: emailAddress })
        }
        warningItems={deleteListItems}
        successMessage={
          deleteVerificationSent ? {
            title: t('settings:account.delete.verificationSentTitle'),
            body: t('settings:account.delete.checkYourEmail'),
          } : undefined
        }
        showSuccessMessage={deleteVerificationSent}
        requirePassword={requiresPassword}
        passwordLabel={t('settings:account.delete.passwordLabel', {
          defaultValue: 'Enter your password to confirm deletion.',
        })}
        passwordPlaceholder={t('settings:account.delete.passwordPlaceholder', {
          defaultValue: 'Current password',
        })}
        passwordMissingMessage={t('settings:account.delete.passwordRequired', {
          defaultValue: 'Password is required to delete your account.',
        })}
      />

    </div>
  );
};

export default AccountProfilePage;
