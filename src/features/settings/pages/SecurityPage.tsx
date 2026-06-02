import { useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { authClient } from '@/shared/lib/authClient';
import { useAuthAccounts } from '@/shared/hooks/useAuthAccounts';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { AlertTriangle } from 'lucide-preact';
import { Icon } from '@/shared/ui/Icon';
import { useTranslation } from '@/shared/i18n/hooks';
import type { SecuritySettings } from '@/shared/types/user';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import type { SecurityPreferences } from '@/shared/types/preferences';
import { FormActions } from '@/shared/ui/form';
import { features } from '@/config/features';
import { buildSettingsPath, resolveSettingsBasePath } from '@/shared/utils/workspace';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/Button';

// ---------------------------------------------------------------------------
// Local types & helpers
// ---------------------------------------------------------------------------

interface SecurityUser {
  twoFactorEnabled?: boolean;
  emailNotifications?: boolean;
  loginAlerts?: boolean;
  lastPasswordChange?: Date | string | number;
}

const isValidDate = (value: unknown): value is Date | string | number => {
  if (value == null) return false;
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isFinite(new Date(value).getTime());
  if (typeof value === 'string') return isFinite(Date.parse(value));
  return false;
};

const safeConvertLastPasswordChange = (value: unknown): Date | undefined => {
  if (!isValidDate(value)) return undefined;
  const date = new Date(value as Date | string | number);
  return isNaN(date.getTime()) ? undefined : date;
};

type BetterAuthResult = { data?: unknown; error?: { message?: string } | null } | null | undefined;

const getBetterAuthErrorMessage = (result: BetterAuthResult, fallback: string): string | null => {
  if (!result?.error) return null;
  return result.error.message || fallback;
};

// ---------------------------------------------------------------------------
// SecurityBadge
// ---------------------------------------------------------------------------

const SecurityBadge = ({
  enabled,
  onLabel = 'enabled',
  offLabel = 'not enabled',
}: {
  enabled: boolean;
  onLabel?: string;
  offLabel?: string;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]',
      enabled
        ? 'border-[color:color-mix(in_oklab,var(--pos)_25%,var(--rule))] bg-[color:color-mix(in_oklab,var(--pos)_10%,var(--card))] text-[var(--pos)]'
        : 'border-rule text-dim',
    )}
  >
    {enabled && <span className="h-1.5 w-1.5 rounded-full bg-[var(--pos)]" aria-hidden="true" />}
    {enabled ? onLabel : offLabel}
  </span>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface SecurityPageProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
}

export const SecurityPage = ({
  isMobile: _isMobile = false,
  onClose: _onClose,
  className = '',
}: SecurityPageProps) => {
  const securityCardClassName = 'max-w-[440px] rounded-[18px] border border-rule bg-card px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:px-6';
  const { showSuccess, showError } = useToastContext();
  const { navigate } = useNavigation();
  const location = useLocation();
  const { t } = useTranslation(['settings', 'common']);
  const { session, isPending } = useSessionContext();
  const { hasPasswordAccount, isLoading: authAccountsLoading, error: authAccountsError, reload: reloadAuthAccounts } = useAuthAccounts(Boolean(session?.user));

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showDisableMFAConfirm, setShowDisableMFAConfirm] = useState(false);
  const showMfa = features.enableMfa;

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [googleLinking, setGoogleLinking] = useState(false);

  const settingsBasePath = resolveSettingsBasePath(location.path);
  const toSettingsPath = (subPath?: string) => buildSettingsPath(settingsBasePath, subPath);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoadError(null);
        const prefs = await getPreferencesCategory<SecurityPreferences>('security');
        if (!mounted) return;
        setSettings({
          twoFactorEnabled: prefs?.two_factor_enabled ?? false,
          emailNotifications: prefs?.email_notifications ?? true,
          loginAlerts: prefs?.login_alerts ?? true,
          sessionTimeout: prefs?.session_timeout,
          lastPasswordChange: safeConvertLastPasswordChange((session?.user as SecurityUser | undefined)?.lastPasswordChange) ?? null,
          connectedAccounts: [],
        });
      } catch (error) {
        if (!mounted) return;
        setSettings(null);
        setLoadError(error instanceof Error ? error.message : 'Failed to load security settings.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [session?.user]);

  useEffect(() => {
    if (session?.user?.email) setEmailInput(session.user.email);
  }, [session?.user?.email]);

  useEffect(() => {
    if (!session?.user) return;
    authClient.listUserAccounts()
      .then((result) => {
        const accounts = (result?.data ?? []) as Array<{ provider: string }>;
        setLinkedProviders(accounts.map((a) => a.provider));
      })
      .catch(() => { /* best-effort */ });
  }, [session?.user]);

  const handleUpdateEmail = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed || trimmed === session?.user?.email) return;
    setEmailSubmitting(true);
    try {
      const result = await authClient.changeEmail({ newEmail: trimmed, callbackURL: window.location.href });
      const errorMessage = getBetterAuthErrorMessage(result as BetterAuthResult, 'Unable to send verification email. Please try again.');
      if (errorMessage) {
        showError('Email change failed', errorMessage);
        return;
      }
      showSuccess('Verification sent', `A confirmation link has been sent to ${trimmed}. Click it to complete the change.`);
    } catch {
      showError('Email change failed', 'Unable to send verification email. Please try again.');
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleLinkGoogle = async () => {
    setGoogleLinking(true);
    try {
      await authClient.linkSocialAccount({ provider: 'google', callbackURL: window.location.href });
    } catch {
      showError('Link failed', 'Unable to start Google sign-in. Please try again.');
      setGoogleLinking(false);
    }
  };

  const handleConfirmDisableMFA = async () => {
    if (!settings || !session?.user) {
      showError(t('common:notifications.settingsSaveErrorTitle'), t('common:notifications.sessionExpired'));
      setShowDisableMFAConfirm(false);
      return;
    }
    setSettings({ ...settings, twoFactorEnabled: false });
    try {
      const twoFactorClient = (authClient as { twoFactor?: { disable: () => Promise<void> } }).twoFactor;
      if (twoFactorClient) await twoFactorClient.disable();
      else throw new Error('Two-factor authentication is not available');
      await updatePreferencesCategory('security', { two_factor_enabled: false });
      showSuccess(t('settings:security.mfa.disable.toastTitle'), t('settings:security.mfa.disable.toastBody'));
    } catch {
      showError(t('common:notifications.settingsSaveErrorTitle'), t('common:notifications.settingsSaveErrorBody'));
      setSettings(settings);
    }
    setShowDisableMFAConfirm(false);
  };

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword || (hasPasswordAccount && !passwordForm.currentPassword)) {
      showError(t('settings:security.password.errors.missing.title'), t('settings:security.password.errors.missing.body'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showError(t('settings:security.password.errors.mismatch.title'), t('settings:security.password.errors.mismatch.body'));
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showError(t('settings:security.password.errors.weak.title'), t('settings:security.password.errors.weak.body'));
      return;
    }
    try {
      setPasswordSubmitting(true);
      setPasswordError(null);
      if (hasPasswordAccount) {
        const { data: _d, error } = await authClient.changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
        const msg = getBetterAuthErrorMessage({ data: _d, error }, t('settings:security.password.errors.failed.body'));
        if (msg) { setPasswordError(msg); showError(t('settings:security.password.errors.failed.title'), msg); return; }
      } else {
        const { data: _d, error } = await authClient.setPassword({ newPassword: passwordForm.newPassword });
        const msg = getBetterAuthErrorMessage({ data: _d, error }, t('settings:security.password.errors.failed.body'));
        if (msg) { setPasswordError(msg); showError(t('settings:security.password.errors.failed.title'), msg); return; }
      }
      showSuccess(t('settings:security.password.success.title'), t('settings:security.password.success.body'));
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      reloadAuthAccounts().catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('settings:security.password.errors.failed.body');
      setPasswordError(msg);
      showError(t('settings:security.password.errors.failed.title'), msg);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (isResettingPassword || !session?.user?.email) return;
    setIsResettingPassword(true);
    try {
      const { data: _d, error } = await authClient.requestPasswordReset({ email: session.user.email });
      const msg = getBetterAuthErrorMessage({ data: _d, error }, t('settings:security.password.errors.failed.body'));
      if (msg) { showError(t('settings:security.password.errors.failed.title'), msg); return; }
      showSuccess(t('settings:security.password.reset.title'), t('settings:security.password.reset.body'));
    } catch (err) {
      showError(t('settings:security.password.errors.failed.title'), err instanceof Error ? err.message : t('settings:security.password.errors.failed.body'));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleGenerateRecoveryCodes = useCallback(() => {
    showError('Not implemented', 'Backup code generation is not available yet.');
  }, [showError]);

  if (isPending || isLoading || authAccountsLoading) return <LoadingBlock className={className} />;
  if (authAccountsError) throw new Error(authAccountsError);
  if (!settings) throw new Error(loadError ?? 'Failed to load security settings.');

  const lastChanged = settings.lastPasswordChange instanceof Date
    ? settings.lastPasswordChange.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={className}>
      <SettingSection first title="Email address" description="Your login email. Changing this sends a verification link to the new address.">
        <div className={securityCardClassName}>
          <div className="form-field">
            <label className="label" htmlFor="email-input">Email</label>
            <input id="email-input" className="input" type="email" value={emailInput}
              onInput={(e) => setEmailInput((e.target as HTMLInputElement).value)} />
          </div>
          <div className="flex items-center gap-3 mt-3.5">
            <Button variant="ghost" size="sm"
              onClick={() => void handleUpdateEmail()}
              disabled={emailSubmitting || !emailInput.trim() || emailInput.trim() === session?.user?.email}>
              {emailSubmitting ? <LoadingSpinner size="sm" ariaLabel="Updating email" /> : null}
              Update email
            </Button>
            {session?.user?.email_verified && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--pos)]">✓ Verified</span>
            )}
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Password" description="Change your password. You&apos;ll be signed out of all other sessions.">
        <div className={securityCardClassName}>
          <div className="flex flex-col gap-3.5">
            {hasPasswordAccount && (
              <div className="form-field">
                <label className="label" htmlFor="current-password-input">Current password</label>
                <input id="current-password-input" className="input" type="password" placeholder="••••••••" value={passwordForm.currentPassword}
                  onInput={(e) => { setPasswordError(null); setPasswordForm(p => ({ ...p, currentPassword: (e.target as HTMLInputElement).value })); }} />
              </div>
            )}
            <div className="form-field">
              <label className="label" htmlFor="new-password-input">New password</label>
              <input id="new-password-input" className="input" type="password" placeholder="At least 8 characters" value={passwordForm.newPassword}
                onInput={(e) => { setPasswordError(null); setPasswordForm(p => ({ ...p, newPassword: (e.target as HTMLInputElement).value })); }} />
            </div>
            <div className="form-field">
              <label className="label" htmlFor="confirm-password-input">Confirm new password</label>
              <input id="confirm-password-input" className="input" type="password" placeholder="••••••••" value={passwordForm.confirmPassword}
                onInput={(e) => { setPasswordError(null); setPasswordForm(p => ({ ...p, confirmPassword: (e.target as HTMLInputElement).value })); }} />
            </div>
          </div>
          {passwordError && <p className="mt-3 text-[12px] text-[var(--neg)]">{passwordError}</p>}
          <div className="flex items-center gap-2 mt-4">
            <Button variant="primary" size="sm" onClick={() => void handleChangePassword()} disabled={passwordSubmitting}>
              {passwordSubmitting ? <LoadingSpinner size="sm" ariaLabel="Updating password" /> : null}
              Update password
            </Button>
            {hasPasswordAccount && (
              <Button variant="ghost" size="sm" onClick={() => void handleResetPassword()} disabled={isResettingPassword}>
                {isResettingPassword ? <LoadingSpinner size="sm" ariaLabel="Sending password reset email" /> : null}
                Forgot password?
              </Button>
            )}
          </div>
          {lastChanged && <p className="mt-3" style={{ fontSize: 12.5, color: 'var(--dim)' }}>Last changed: {lastChanged}</p>}
        </div>
      </SettingSection>

      {showMfa && (
        <SettingSection title="Two-factor authentication" description="Add an extra layer of security. When enabled, you'll need your authenticator app to sign in.">
          <SettingRow
            label="Authenticator app"
            description="Use an app like Google Authenticator, Authy, or 1Password to generate time-based codes."
            controlClassName="min-w-[212px] justify-end"
          >
            <SecurityBadge enabled={settings.twoFactorEnabled} />
            <Button variant="ghost" size="sm"
              onClick={() => settings.twoFactorEnabled ? setShowDisableMFAConfirm(true) : navigate(toSettingsPath('mfa-enrollment'))}>
              {settings.twoFactorEnabled ? 'Disable' : 'Set up'}
            </Button>
          </SettingRow>
          <SettingRow
            label="Recovery codes"
            description="One-time backup codes in case you lose access to your authenticator. Generate these after enabling 2FA."
            controlClassName="min-w-[212px] justify-end"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateRecoveryCodes}
              disabled={!settings.twoFactorEnabled}
              className={settings.twoFactorEnabled ? '' : 'opacity-40'}
            >
              Generate codes
            </Button>
          </SettingRow>
        </SettingSection>
      )}

      {/* Connected accounts */}
      <SettingSection title="Connected accounts" description="Social sign-in providers linked to your account.">
        {(() => {
          const isLinked = linkedProviders.includes('google');
          return (
            <SettingRow
              label="Google"
              description="Sign in with your Google account instead of a password."
              controlClassName="min-w-[212px] justify-end"
            >
              <SecurityBadge enabled={isLinked} onLabel="linked" offLabel="not linked" />
              {!isLinked && (
                <Button variant="ghost" size="sm"
                  onClick={() => void handleLinkGoogle()} disabled={googleLinking}>
                  {googleLinking ? 'Redirecting…' : 'Link Google'}
                </Button>
              )}
            </SettingRow>
          );
        })()}
      </SettingSection>

      <section className="mt-8 rounded-[20px] border border-[color:color-mix(in_oklab,var(--neg)_30%,var(--rule))] bg-[color:color-mix(in_oklab,var(--neg)_6%,var(--card))] px-5 py-5 sm:px-6">
        <h3 className="font-serif text-2xl font-normal tracking-tight text-[var(--neg)]">Delete account</h3>
        <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-2">Permanently delete your Blawby account and all associated data. This removes you from the organization but does not delete the practice. Transfer ownership first if you&apos;re the sole owner.</p>
        <Button variant="danger-ghost" size="sm" className="mt-3"
          onClick={() => showError('Contact support', 'To delete your account, please contact support@blawby.com.')}>
          Delete my account
        </Button>
      </section>

      {/* MFA disable confirmation dialog */}
      {showMfa && (
        <Dialog
          isOpen={showDisableMFAConfirm}
          onClose={() => setShowDisableMFAConfirm(false)}
          title={t('settings:security.mfa.disable.modalTitle')}
          description={t('settings:security.mfa.disable.description')}
          showCloseButton
        >
          <DialogBody>
            <div className="flex items-start gap-3">
              <Icon icon={AlertTriangle} className="w-6 h-6 text-orange-500 shrink-0" />
              <h3 className="text-base font-semibold text-ink">{t('settings:security.mfa.disable.heading')}</h3>
            </div>
          </DialogBody>
          <DialogFooter className="p-0">
            <FormActions
              className="w-full justify-end border-0 px-5 py-4 sm:px-6"
              size="sm"
              onCancel={() => setShowDisableMFAConfirm(false)}
              onSubmit={handleConfirmDisableMFA}
              submitType="button"
              submitVariant="warning"
              cancelText={t('settings:security.mfa.disable.cancel')}
              submitText={t('settings:security.mfa.disable.confirm')}
            />
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
};
