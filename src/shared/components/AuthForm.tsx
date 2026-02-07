import { useEffect, useState, useCallback } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { UserIcon } from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/shared/ui/form';
import { Input, EmailInput, PasswordInput } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';
import { handleError } from '@/shared/utils/errorHandler';
import { getClient } from '@/shared/lib/authClient';

type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  mode?: AuthMode;
  defaultMode?: AuthMode;
  initialEmail?: string;
  signupVariant?: 'full' | 'minimal';
  callbackURL?: string;
  onSuccess?: (user: unknown) => void | Promise<void>;
  onError?: (error: string) => void;
  onModeChange?: (mode: AuthMode) => void;
  showHeader?: boolean;
  showGoogleSignIn?: boolean;
  showModeToggle?: boolean;
  className?: string;
}

const AuthForm = ({
  mode,
  defaultMode = 'signin',
  initialEmail,
  signupVariant = 'full',
  callbackURL,
  onSuccess,
  onError,
  onModeChange,
  showHeader = true,
  showGoogleSignIn = true,
  showModeToggle = true,
  className = ''
}: AuthFormProps) => {
  const { t } = useTranslation('auth');
  const [internalMode, setInternalMode] = useState<AuthMode>(mode ?? defaultMode);
  const resolvedMode = mode ?? internalMode;
  const isControlled = typeof mode !== 'undefined';
  const [formData, setFormData] = useState({
    name: '',
    email: initialEmail ?? '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof initialEmail !== 'string') return;
    setFormData((prev) => (
      prev.email === initialEmail ? prev : { ...prev, email: initialEmail }
    ));
  }, [initialEmail]);

  const notifySuccess = useCallback(async (user: unknown) => {
    if (!onSuccess) return;

    try {
      await onSuccess(user);
    } catch (callbackError) {
      handleError(callbackError, {
        component: 'AuthForm',
        action: 'onSuccess-callback',
        mode: resolvedMode
      });
    }
  }, [onSuccess, resolvedMode]);

  const handleSubmit = async (_data?: Record<string, unknown>) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (resolvedMode === 'signup') {
        if (signupVariant === 'full' && formData.password !== formData.confirmPassword) {
          setError(t('errors.passwordsDoNotMatch'));
          setLoading(false);
          return;
        }

        const client = getClient();
        const result = await client.signUp.email({
          email: formData.email,
          password: formData.password,
          name: formData.name || formData.email.split('@')[0] || t('defaults.demoUserName'),
        });

        if (result.error) {
          console.error('Sign-up error:', result.error);
          const signupMessage = result.error.message || '';
          const normalized = signupMessage.toLowerCase();
          if (normalized.includes('already') && normalized.includes('exist')) {
            setError('An account with this email already exists. Try signing in instead.');
          } else {
            setError(signupMessage || t('errors.unknownError'));
          }
          setLoading(false);
          if (onError) {
            onError(signupMessage || t('errors.unknownError'));
          }
          return;
        }

        setMessage(t('messages.accountCreated'));
        await notifySuccess(result.data?.user ?? null);
      } else {
        const client = getClient();
        const result = await client.signIn.email({
          email: formData.email,
          password: formData.password,
        });

        if (result.error) {
          console.error('Sign-in error:', result.error);
          const signInMessage = result.error.message || '';
          const normalized = signInMessage.toLowerCase();
          if (normalized.includes('not found')) {
            setError(t('errors.userNotFound'));
          } else if (normalized.includes('invalid credentials')) {
            setError(t('errors.invalidCredentials'));
          } else {
            setError(signInMessage || t('errors.invalidCredentials'));
          }
          setLoading(false);
          if (onError) {
            onError(signInMessage || t('errors.invalidCredentials'));
          }
          return;
        }

        setMessage(t('messages.signedIn'));
        await notifySuccess(result.data?.user ?? null);
      }
    } catch (err) {
      console.error('Auth error:', err);
      let errorMessage = t('errors.unknownError');
      if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const client = getClient();
      const currentUrl = new URL(window.location.href);
      const redirectParam = currentUrl.searchParams.get('redirect');
      let resolvedCallbackURL = window.location.origin;
      if (typeof callbackURL === 'string' && callbackURL.trim().length > 0) {
        const trimmed = callbackURL.trim();
        try {
          const url = new URL(trimmed, window.location.origin);
          if (url.origin === window.location.origin) {
            resolvedCallbackURL = url.href;
          }
        } catch {
          // Fall back to origin
        }
      } else if (redirectParam) {
        try {
          const decodedRedirect = decodeURIComponent(redirectParam);
          const redirectUrl = new URL(decodedRedirect, window.location.origin);
          if (redirectUrl.origin === window.location.origin) {
            resolvedCallbackURL = redirectUrl.href;
          }
        } catch {
          // Fall back to origin
        }
      }
      const result = await client.signIn.social({
        provider: 'google',
        callbackURL: resolvedCallbackURL,
      });

      if (result.error) {
        console.error('Google sign-in error:', result.error);
        const errorMessage = result.error.message || t('errors.unknownError');
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('Google auth error:', err);
      let errorMessage = t('errors.unknownError');
      if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      setLoading(false);
    }
  };

  const handleToggleMode = () => {
    const nextMode: AuthMode = resolvedMode === 'signup' ? 'signin' : 'signup';
    if (!isControlled) {
      setInternalMode(nextMode);
    }
    if (onModeChange) {
      onModeChange(nextMode);
    }
    setError('');
    setMessage('');
    setFormData({ name: '', email: '', password: '', confirmPassword: '' });
  };

  return (
    <div className={`w-full ${className}`}>
      {showHeader && (
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {resolvedMode === 'signup' ? t('signup.title') : t('signin.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {resolvedMode === 'signup' ? t('signup.subtitle') : t('signin.subtitle')}
          </p>
        </div>
      )}

      <div className="bg-light-card-bg dark:bg-dark-card-bg py-8 px-4 shadow sm:rounded-lg sm:px-10">
        {showGoogleSignIn && (
          <div className="mb-6">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full justify-center border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-input-bg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover focus:ring-accent-500"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              }
              iconPosition="left"
            >
              {t(resolvedMode === 'signup' ? 'signup.googleSignIn' : 'signin.googleSignIn')}
            </Button>
          </div>
        )}

        {showGoogleSignIn && (
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-light-card-bg dark:bg-dark-card-bg text-gray-500 dark:text-gray-400">{t('common.orContinueWithEmail')}</span>
            </div>
          </div>
        )}

        <Form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {resolvedMode === 'signup' && signupVariant === 'full' && (
              <FormField name="name">
                {({ error: fieldError, onChange }) => (
                  <FormItem>
                    <FormLabel htmlFor="signup-fullname">{t('signup.fullName')}</FormLabel>
                    <FormControl>
                      <Input
                        id="signup-fullname"
                        type="text"
                        required={resolvedMode === 'signup'}
                        value={formData.name}
                        onChange={(value) => {
                          onChange(value);
                          setFormData(prev => ({ ...prev, name: String(value) }));
                        }}
                        placeholder={t('signup.fullNamePlaceholder')}
                        icon={<UserIcon className="h-5 w-5 text-gray-400" />}
                        error={fieldError?.message}
                        data-testid="signup-name-input"
                      />
                    </FormControl>
                    {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                  </FormItem>
                )}
              </FormField>
            )}

            <FormField name="email">
              {({ error: fieldError, onChange }) => (
                <FormItem>
                  <FormControl>
                    <EmailInput
                      label={t(resolvedMode === 'signup' ? 'signup.email' : 'signin.email')}
                      required
                      value={formData.email}
                      onChange={(value) => {
                        onChange(value);
                        setFormData(prev => ({ ...prev, email: String(value) }));
                      }}
                      placeholder={t(resolvedMode === 'signup' ? 'signup.emailPlaceholder' : 'signin.emailPlaceholder')}
                      error={fieldError?.message}
                      data-testid={resolvedMode === 'signup' ? 'signup-email-input' : 'signin-email-input'}
                    />
                  </FormControl>
                  {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                </FormItem>
              )}
            </FormField>

            <FormField name="password">
              {({ error: fieldError, onChange }) => (
                <FormItem>
                  <FormControl>
                    <PasswordInput
                      id="password-field"
                      label={t(resolvedMode === 'signup' ? 'signup.password' : 'signin.password')}
                      required
                      value={formData.password}
                      onChange={(value) => {
                        onChange(value);
                        setFormData(prev => ({ ...prev, password: String(value) }));
                      }}
                      placeholder={t(resolvedMode === 'signup' ? 'signup.passwordPlaceholder' : 'signin.passwordPlaceholder')}
                      error={fieldError?.message}
                      data-testid={resolvedMode === 'signup' ? 'signup-password-input' : 'signin-password-input'}
                    />
                  </FormControl>
                  {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                </FormItem>
              )}
            </FormField>

            {resolvedMode === 'signup' && signupVariant === 'full' && (
              <FormField name="confirmPassword">
                {({ error: fieldError, onChange }) => (
                  <FormItem>
                    <FormControl>
                      <PasswordInput
                        id="confirm-password-field"
                        label={t('signup.confirmPassword')}
                        required={resolvedMode === 'signup'}
                        value={formData.confirmPassword}
                        onChange={(value) => {
                          onChange(value);
                          setFormData(prev => ({ ...prev, confirmPassword: String(value) }));
                        }}
                        placeholder={t('signup.confirmPasswordPlaceholder')}
                        error={fieldError?.message}
                        data-testid="signup-confirm-password-input"
                      />
                    </FormControl>
                    {fieldError && <FormMessage>{fieldError.message}</FormMessage>}
                  </FormItem>
                )}
              </FormField>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
            </div>
          )}

          <div className="mt-4">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
              data-testid={resolvedMode === 'signup' ? 'signup-submit-button' : 'signin-submit-button'}
              className="w-full justify-center"
              aria-busy={loading}
              aria-label={loading
                ? (resolvedMode === 'signup' ? t('signup.submitting') : t('signin.submitting'))
                : undefined}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                resolvedMode === 'signup' ? t('signup.submit') : t('signin.submit')
              )}
            </Button>
          </div>

          {showModeToggle && (
            <div className="mt-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={handleToggleMode}
                disabled={loading}
                className="text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300"
              >
                {resolvedMode === 'signup' 
                  ? t('signup.hasAccount', { signInLink: t('signup.signInLink') })
                  : t('signin.noAccount', { signUpLink: t('signin.signUpLink') })}
              </Button>
            </div>
          )}
        </Form>
      </div>
    </div>
  );
};

export default AuthForm;
