import { useState, useEffect } from 'preact/hooks';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import OnboardingModal from '@/features/onboarding/components/OnboardingModal';
import type { OnboardingFormData } from '@/shared/types/onboarding';
import { Logo } from '@/shared/ui/Logo';
import { handleError } from '@/shared/utils/errorHandler';
import AuthForm from '@/shared/components/AuthForm';
import { useTranslation } from '@/shared/i18n/hooks';

interface AuthPageProps {
  mode?: 'signin' | 'signup';
  onSuccess?: () => void | Promise<void>;
  redirectDelay?: number;
}

const AuthPage = ({ mode = 'signin', onSuccess, redirectDelay = 1000 }: AuthPageProps) => {
  const { t } = useTranslation('auth');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(mode);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [conversationContext, setConversationContext] = useState<{ conversationId?: string | null; practiceId?: string | null }>({});
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

  // Check URL params for mode and onboarding (guarded by server truth)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlMode = urlParams.get('mode');
    const needsOnboarding = urlParams.get('onboarding') === 'true';
    const conversationId = urlParams.get('conversationId');
    const practiceId = urlParams.get('practiceId');
    const redirect = urlParams.get('redirect');

    if (urlMode === 'signin' || urlMode === 'signup') {
      setAuthMode(urlMode);
    }

    if (conversationId && practiceId) {
      setConversationContext({ conversationId, practiceId });
    }

    if (redirect) {
      const decodedRedirect = decodeURIComponent(redirect);
      const safeRedirect = getSafeRedirectPath(decodedRedirect);
      setRedirectPath(safeRedirect ?? '/');
    }

    // Only open onboarding when explicitly requested via URL param
    if (needsOnboarding) {
      setShowOnboarding(true);
      // Strip the param to avoid re-triggering on rebuilds
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('onboarding');
        window.history.replaceState({}, '', url.toString());
        // eslint-disable-next-line no-empty
      } catch {}
    }
  }, []);

  // Helper function to handle redirect with proper onSuccess awaiting
  const handleRedirect = async () => {
    if (onSuccess) {
      try {
        await onSuccess();
      } catch (_error) {
        // onSuccess callback failed - use production-safe error handling
        handleError(_error, {
          component: 'AuthPage',
          action: 'onSuccess-callback',
          mode
        }, {
          component: 'AuthPage',
          action: 'handleRedirect'
        });
        // Continue with redirect even if onSuccess fails
      }
    }

    const delay = redirectDelay;
    const postAuthRedirectKey = 'post-auth-redirect';
    const storedRedirect = sessionStorage.getItem(postAuthRedirectKey);
    if (storedRedirect) {
      sessionStorage.removeItem(postAuthRedirectKey);
    }
    const destination = isSafeRedirectPath(storedRedirect)
      ? storedRedirect
      : (redirectPath && redirectPath.startsWith('/') ? redirectPath : '/');

    if (delay > 0) {
      setTimeout(() => {
        window.location.href = destination;
      }, delay);
    } else {
      window.location.href = destination;
    }
  };

  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const handleOnboardingComplete = async (data: OnboardingFormData) => {
    // Development-only debug log with redacted sensitive data
    if (import.meta.env.DEV) {
      const _redactedData = {
        personalInfo: {
          fullName: data.personalInfo.fullName ? '[REDACTED]' : undefined,
          birthday: data.personalInfo.birthday ? '[REDACTED]' : undefined,
          agreedToTerms: data.personalInfo.agreedToTerms
        },
        useCase: {
          primaryUseCase: data.useCase.primaryUseCase,
          additionalInfo: data.useCase.additionalInfo ? '[REDACTED]' : undefined
        }
      };
      // Onboarding completed with redacted data
    }
    
    // Legacy onboardingCompleted localStorage write removed - server truth is used instead

    // Close onboarding modal and redirect to main app
    setShowOnboarding(false);
    await handleRedirect();
  };

  const handleOnboardingClose = async () => {
    setShowOnboarding(false);
    
    // Redirect to home page if onboarding is closed, waiting for onSuccess if provided
    await handleRedirect();
  };

  const handleAuthSuccess = async () => {
    if (authMode === 'signup' || showOnboarding) {
      setShowOnboarding(true);
      return;
    }

    await handleRedirect();
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header with back button */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center mb-6">
          <button
            onClick={handleBackToHome}
            className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
{t('navigation.backToHome')}
          </button>
        </div>
        
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          {authMode === 'signup' ? t('signup.title') : t('signin.title')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          {authMode === 'signup' ? t('signup.subtitle') : t('signin.subtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <AuthForm
          mode={authMode}
          defaultMode={authMode}
          onModeChange={(newMode) => setAuthMode(newMode)}
          onSuccess={handleAuthSuccess}
          conversationContext={conversationContext}
          showHeader={false}
        />
      </div>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleOnboardingClose}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
};

export default AuthPage;
