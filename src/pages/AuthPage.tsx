import { useState, useEffect } from 'preact/hooks';
import { ArrowLeft } from 'lucide-preact';

import { Logo } from '@/shared/ui/Logo';
import { Button } from '@/shared/ui/Button';
import AuthForm from '@/shared/components/AuthForm';
import { useTranslation } from '@/shared/i18n/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { SetupShell } from '@/shared/ui/layout/SetupShell';
import { getSession } from '@/shared/lib/authClient';

interface AuthPageProps {
  mode?: 'signin' | 'signup';
  onSuccess?: () => void | Promise<void>;
}

const isSafeRedirectPath = (path: string | null): path is string =>
  Boolean(path && path.startsWith('/') && !path.startsWith('//'));

const getSafeRedirectPath = (decodedRedirect: string): string | null => {
  if (!decodedRedirect || decodedRedirect.startsWith('//')) {
    return null;
  }

  try {
    const url = new URL(decodedRedirect, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const AuthPage = ({ mode = 'signin', onSuccess }: AuthPageProps) => {
  const { t } = useTranslation('auth');
  const { navigate } = useNavigation();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(mode);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [initialEmail, setInitialEmail] = useState<string>('');

  // Check URL params for mode and onboarding (guarded by server truth)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlMode = urlParams.get('mode');
    const redirect = urlParams.get('redirect');
    const emailParam = urlParams.get('email');

    if (urlMode === 'signin' || urlMode === 'signup') {
      setAuthMode(urlMode);
    }

    if (redirect) {
      const decodedRedirect = decodeURIComponent(redirect);
      const safeRedirect = getSafeRedirectPath(decodedRedirect);
      setRedirectPath(safeRedirect ?? '/');
    }

    if (emailParam) {
      try {
        const decodedEmail = decodeURIComponent(emailParam);
        if (decodedEmail.includes('@')) {
          setInitialEmail(decodedEmail);
        }
      } catch {
        // ignore invalid email param
      }
    }

    // Only open onboarding when explicitly requested via URL param
  }, []);

  const handleAuthSuccess = async () => {
    // Force the Better Auth session store to refetch BEFORE we navigate.
    // Without this, RootRoute / AppShell observe a stale "no session" via
    // useSession() on the new route and bounce the user right back to /auth
    // (src/index.tsx RootRoute: `if (!session?.user) navigate('/auth', true)`).
    // The reactive hook doesn't auto-refetch fast enough on the cookie change
    // from the sign-up/sign-in response.
    try {
      await getSession();
    } catch {
      // If the refresh fails, we still navigate — the next render will retry.
    }
    if (onSuccess) {
      await onSuccess();
      return;
    }
    // No onSuccess prop (the default /auth route mount): navigate to the safe
    // redirect target (or '/') so AppShell's onboarding/home routing takes over.
    // Without this, the user sits on /auth indefinitely after signup because
    // AppShell skips the onboarding redirect when location.path starts with
    // /auth (src/index.tsx).
    navigate(callbackURL, true);
  };

  const handleBackToHome = () => {
    navigate('/', true);
  };

  const callbackURL = (redirectPath && isSafeRedirectPath(redirectPath)) ? redirectPath : '/';

  return (
    <SetupShell>
      <div className="min-h-screen bg-transparent flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        {/* Header with back button */}
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex items-center justify-center mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToHome}
              className="text-sm text-dim-2 hover:text-ink"
              icon={ArrowLeft} iconClassName="h-4 w-4"
              iconPosition="left"
            >
              {t('navigation.backToHome')}
            </Button>
          </div>
          
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">
            {authMode === 'signup' ? t('signup.title') : t('signin.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-dim-2">
            {authMode === 'signup' ? t('signup.subtitle') : t('signin.subtitle')}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <AuthForm
            mode={authMode}
            defaultMode={authMode}
            initialEmail={initialEmail}
            callbackURL={callbackURL}
            onModeChange={(newMode) => setAuthMode(newMode)}
            onSuccess={handleAuthSuccess}
            showHeader={false}
          />
        </div>
      </div>
    </SetupShell>
  );
};

export default AuthPage;
