import { useState } from 'preact/hooks';
import { ArrowLeft } from 'lucide-preact';

import { Logo } from '@/shared/ui/Logo';
import { Button } from '@/shared/ui/Button';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/shared/ui/form';
import { EmailInput } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { SetupShell } from '@/shared/ui/layout/SetupShell';
import { authClient } from '@/shared/lib/authClient';

const ForgotPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { navigate } = useNavigation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleBackToSignIn = () => {
    navigate('/auth', true);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error: requestError } = await authClient.requestPasswordReset({ email, redirectTo });
      if (requestError) {
        setError(requestError.message || t('errors.unknownError'));
        return;
      }
      setSent(true);
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
            {t('forgotPassword.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-dim-2">
            {t('forgotPassword.subtitle')}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card py-8 px-4 sm:px-10">
            {sent ? (
              <div className="rounded-r-md panel border-emerald-500/20 p-3">
                <p className="text-sm text-emerald-400">{t('forgotPassword.sent')}</p>
              </div>
            ) : (
              <Form onSubmit={handleSubmit}>
                <FormField name="email">
                  {({ error: fieldError, onChange }) => (
                    <FormItem>
                      <FormControl>
                        <EmailInput
                          label={t('signin.email')}
                          required
                          value={email}
                          onChange={(value) => {
                            onChange(value);
                            setEmail(String(value));
                          }}
                          placeholder={t('signin.emailPlaceholder')}
                          error={fieldError?.message}
                          data-testid="forgot-password-email-input"
                        />
                      </FormControl>
                      {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                    </FormItem>
                  )}
                </FormField>

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
                    data-testid="forgot-password-submit-button"
                  >
                    {loading ? (
                      <LoadingSpinner size="md" ariaLabel={t('forgotPassword.submitting')} />
                    ) : (
                      t('forgotPassword.submit')
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

export default ForgotPasswordPage;
