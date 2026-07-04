import { useEffect, useState } from 'preact/hooks';
import { ArrowLeft } from 'lucide-preact';

import { Logo } from '@/shared/ui/Logo';
import { Button } from '@/shared/ui/Button';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/shared/ui/form';
import { PasswordInput } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { SetupShell } from '@/shared/ui/layout/SetupShell';
import { authClient } from '@/shared/lib/authClient';

const ResetPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { navigate } = useNavigation();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token'));
  }, []);

  const handleBackToSignIn = () => {
    navigate('/auth', true);
  };

  const handleSubmit = async () => {
    if (!token) {
      setError(t('resetPassword.errors.missingToken'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errors.passwordsDoNotMatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('errors.passwordTooShort'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword, token });
      if (resetError) {
        setError(resetError.message || t('errors.unknownError'));
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SetupShell>
      <div className="min-h-screen bg-transparent flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex items-center justify-center mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToSignIn}
              className="text-sm text-dim-2 hover:text-ink"
              icon={ArrowLeft} iconClassName="h-4 w-4"
              iconPosition="left"
            >
              {t('forgotPassword.backToSignIn')}
            </Button>
          </div>

          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">
            {t('resetPassword.title')}
          </h2>
          {!done && token && (
            <p className="mt-2 text-center text-sm text-dim-2">
              {t('resetPassword.subtitle')}
            </p>
          )}
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card py-8 px-4 sm:px-10">
            {done ? (
              <div>
                <div className="rounded-r-md panel border-emerald-500/20 p-3">
                  <p className="text-sm text-emerald-400">{t('resetPassword.success')}</p>
                </div>
                <div className="mt-4">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full justify-center"
                    onClick={handleBackToSignIn}
                    data-testid="reset-password-back-to-signin"
                  >
                    {t('forgotPassword.backToSignIn')}
                  </Button>
                </div>
              </div>
            ) : !token ? (
              <div className="rounded-r-md panel border-neg/20 p-3">
                <p className="text-sm text-neg">{t('resetPassword.errors.missingToken')}</p>
              </div>
            ) : (
              <Form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <FormField name="newPassword">
                    {({ error: fieldError, onChange }) => (
                      <FormItem>
                        <FormControl>
                          <PasswordInput
                            id="reset-new-password"
                            autoComplete="new-password"
                            label={t('resetPassword.newPassword')}
                            required
                            value={newPassword}
                            onChange={(value) => {
                              onChange(value);
                              setNewPassword(String(value));
                            }}
                            placeholder={t('signup.passwordPlaceholder')}
                            error={fieldError?.message}
                            data-testid="reset-password-new-input"
                          />
                        </FormControl>
                        {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                      </FormItem>
                    )}
                  </FormField>

                  <FormField name="confirmPassword">
                    {({ error: fieldError, onChange }) => (
                      <FormItem>
                        <FormControl>
                          <PasswordInput
                            id="reset-confirm-password"
                            autoComplete="new-password"
                            label={t('signup.confirmPassword')}
                            required
                            value={confirmPassword}
                            onChange={(value) => {
                              onChange(value);
                              setConfirmPassword(String(value));
                            }}
                            placeholder={t('signup.confirmPasswordPlaceholder')}
                            error={fieldError?.message}
                            data-testid="reset-password-confirm-input"
                          />
                        </FormControl>
                        {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                      </FormItem>
                    )}
                  </FormField>
                </div>

                {error && (
                  <div className="mt-4 rounded-r-md panel border-neg/20 p-3">
                    <p className="text-sm text-neg">{error}</p>
                  </div>
                )}

                <div className="mt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={loading}
                    className="w-full justify-center"
                    aria-busy={loading}
                    data-testid="reset-password-submit-button"
                  >
                    {loading ? (
                      <LoadingSpinner size="md" ariaLabel={t('resetPassword.submitting')} />
                    ) : (
                      t('resetPassword.submit')
                    )}
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </div>
      </div>
    </SetupShell>
  );
};

export default ResetPasswordPage;
