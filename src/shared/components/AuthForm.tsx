import { useState, useCallback, useRef } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { UserIcon } from '@heroicons/react/24/outline';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/shared/ui/form';
import { Input, EmailInput, PasswordInput } from '@/shared/ui/input';
import { handleError } from '@/shared/utils/errorHandler';
import { getClient } from '@/shared/lib/authClient';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import { useNavigation } from '@/shared/utils/navigation';
import { getFrontendBaseUrl } from '@/config/urls';

type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  mode?: AuthMode;
  defaultMode?: AuthMode;
  onSuccess?: (user: unknown) => void | Promise<void>;
  onError?: (error: string) => void;
  onModeChange?: (mode: AuthMode) => void;
  conversationContext?: {
    conversationId?: string | null;
    practiceId?: string | null;
  };
  showHeader?: boolean;
  showGoogleSignIn?: boolean;
  className?: string;
}

const AuthForm = ({
  mode,
  defaultMode = 'signin',
  onSuccess,
  onError,
  onModeChange,
  conversationContext,
  showHeader = true,
  showGoogleSignIn = true,
  className = ''
}: AuthFormProps) => {
  const { t } = useTranslation('auth');
  const { navigate } = useNavigation();
  const [internalMode, setInternalMode] = useState<AuthMode>(mode ?? defaultMode);
  const resolvedMode = mode ?? internalMode;
  const isControlled = typeof mode !== 'undefined';
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [linkingError, setLinkingError] = useState('');
  const linkingInProgress = useRef(false);
  const linkedConversationKeyRef = useRef<string | null>(null);
  const linkingPromiseRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const postAuthRedirectKey = 'post-auth-redirect';

  const storePostAuthRedirect = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const currentUrl = new URL(window.location.href);
      const redirectParam = currentUrl.searchParams.get('redirect');
      let safeRedirect: string | null = null;

      if (redirectParam) {
        const decodedRedirect = decodeURIComponent(redirectParam);
        try {
          const redirectUrl = new URL(decodedRedirect, window.location.origin);
          if (redirectUrl.origin === window.location.origin) {
            safeRedirect = `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
          }
        } catch {
          safeRedirect = null;
        }
      }

      const fallbackPath = currentUrl.pathname + currentUrl.search + currentUrl.hash;
      const shouldAvoidAuthPage = currentUrl.pathname.startsWith('/auth');
      const redirectTarget = safeRedirect ?? (shouldAvoidAuthPage ? '/' : fallbackPath);
      sessionStorage.setItem(postAuthRedirectKey, redirectTarget);
    } catch {
      // Ignore sessionStorage failures and proceed with auth flow
    }
  }, []);

  const defaultPostAuthPath = useCallback(() => {
    if (conversationContext?.conversationId && conversationContext?.practiceId) {
      return `/client/dashboard?conversationId=${encodeURIComponent(conversationContext.conversationId)}&practiceId=${encodeURIComponent(conversationContext.practiceId)}`;
    }
    return '/';
  }, [conversationContext?.conversationId, conversationContext?.practiceId]);

  const navigateToStoredRedirect = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedRedirect = sessionStorage.getItem(postAuthRedirectKey);
      const target = storedRedirect || defaultPostAuthPath();
      sessionStorage.removeItem(postAuthRedirectKey);
      const isClientDashboardTarget = target.startsWith('/client') || target.startsWith('/dashboard');
      const shouldRouteToRoot =
        isClientDashboardTarget &&
        !(conversationContext?.conversationId && conversationContext?.practiceId);
      navigate(shouldRouteToRoot ? '/' : target);
    } catch {
      // Ignore sessionStorage failures
    }
  }, [conversationContext?.conversationId, conversationContext?.practiceId, defaultPostAuthPath, navigate]);

  const linkConversationIfNeeded = useCallback(async () => {
    const conversationId = conversationContext?.conversationId;
    const practiceId = conversationContext?.practiceId;
    if (!conversationId || !practiceId) {
      return true;
    }
    const linkKey = `${conversationId}:${practiceId}`;
    if (linkedConversationKeyRef.current === linkKey) {
      return true;
    }
    if (linkingInProgress.current && linkingPromiseRef.current?.key === linkKey) {
      return linkingPromiseRef.current.promise;
    }

    linkingInProgress.current = true;
    const promise = (async () => {
      try {
        await linkConversationToUser(conversationId, practiceId);
        linkedConversationKeyRef.current = linkKey;
        setLinkingError('');
        return true;
      } catch (err) {
        console.error('Failed to link conversation to user:', err);
        const fallbackMessage = 'We could not automatically save your conversation. You can continue after signing in.';
        const messageText = err instanceof Error ? err.message || fallbackMessage : fallbackMessage;
        setLinkingError(messageText);
        if (onError) {
          onError(messageText);
        }
        return false;
      } finally {
        linkingInProgress.current = false;
        if (linkingPromiseRef.current?.key === linkKey) {
          linkingPromiseRef.current = null;
        }
      }
    })();
    linkingPromiseRef.current = { key: linkKey, promise };
    return promise;
  }, [conversationContext?.conversationId, conversationContext?.practiceId, onError]);

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
    setLinkingError('');
    storePostAuthRedirect();

    try {
      if (resolvedMode === 'signup') {
        if (formData.password !== formData.confirmPassword) {
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
        await linkConversationIfNeeded();
        await notifySuccess(result.data?.user ?? null);
        navigateToStoredRedirect();
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
        await linkConversationIfNeeded();
        await notifySuccess(result.data?.user ?? null);
        navigateToStoredRedirect();
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
    setLinkingError('');

    try {
      const client = getClient();
      storePostAuthRedirect();

      // callbackURL tells Better Auth where to redirect after OAuth completes
      // Better Auth will set the session cookie on redirect.
      const callbackURL = new URL(defaultPostAuthPath(), getFrontendBaseUrl()).toString();
      const result = await client.signIn.social({
        provider: 'google',
        callbackURL,
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
    setLinkingError('');
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
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-dark-input-bg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
{t(resolvedMode === 'signup' ? 'signup.googleSignIn' : 'signin.googleSignIn')}
            </button>
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
            {resolvedMode === 'signup' && (
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

            {resolvedMode === 'signup' && (
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

          {linkingError && !error && (
            <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">{linkingError}</p>
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
            </div>
          )}

          <div className="mt-4">
            <button
              type="submit"
              disabled={loading}
              data-testid={resolvedMode === 'signup' ? 'signup-submit-button' : 'signin-submit-button'}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-accent-500 hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                resolvedMode === 'signup' ? t('signup.submit') : t('signin.submit')
              )}
            </button>
          </div>

          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={handleToggleMode}
              disabled={loading}
              data-testid={resolvedMode === 'signup' ? 'auth-toggle-signin' : 'auth-toggle-signup'}
              className="text-sm text-accent-600 dark:text-accent-400 hover:text-accent-500 dark:hover:text-accent-300 transition-colors"
            >
              {resolvedMode === 'signup'
                ? `${t('signup.hasAccount')} ${t('signup.signInLink')}`
                : `${t('signin.noAccount')} ${t('signin.signUpLink')}`}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
};

export default AuthForm;
