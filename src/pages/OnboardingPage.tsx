import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    Loading…
  </div>
);

const resolveFallbackPath = (workspace: ReturnType<typeof useWorkspace>['defaultWorkspace']) => {
  if (workspace === 'practice') return '/practice';
  return '/client';
};

const isSafeRedirectPath = (path: string | null | undefined): path is string => {
  if (!path) return false;
  const normalized = path.toLowerCase();
  if (normalized.includes('\\') || normalized.includes('%5c')) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  try {
    const url = new URL(path, 'http://local.dev');
    return url.pathname.startsWith('/');
  } catch {
    return false;
  }
};

const OnboardingPage = () => {
  const { session, isPending } = useSessionContext();
  const { navigate } = useNavigation();
  const { defaultWorkspace } = useWorkspace();
  const location = useLocation();
  let rawReturnTo: string | null = null;
  if (typeof location.query?.returnTo === 'string') {
    try {
      rawReturnTo = decodeURIComponent(location.query.returnTo);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Invalid returnTo value, ignoring', location.query.returnTo, error);
      }
      rawReturnTo = null;
    }
  }
  const requestedReturnPath = isSafeRedirectPath(rawReturnTo) ? rawReturnTo : null;

  const fallbackPath = useMemo(
    () => requestedReturnPath ?? resolveFallbackPath(defaultWorkspace),
    [defaultWorkspace, requestedReturnPath]
  );

  const userId = session?.user?.id;
  const userIsAnonymous = session?.user?.isAnonymous;
  const userOnboardingComplete = session?.user?.onboardingComplete;

  useEffect(() => {
    if (isPending) return;
    if (!userId || userIsAnonymous) {
      navigate('/auth?mode=signup', true);
      return;
    }
    if (userOnboardingComplete) {
      navigate(fallbackPath, true);
    }
  }, [
    fallbackPath,
    isPending,
    navigate,
    userId,
    userIsAnonymous,
    userOnboardingComplete
  ]);

  const sessionUser = session?.user;

  if (isPending) {
    return <LoadingScreen />;
  }

  const user = sessionUser;
  if (!user || user.isAnonymous) {
    return <LoadingScreen />;
  }

  if (user.onboardingComplete) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col">
      <OnboardingFlow
        onClose={() => navigate(fallbackPath, true)}
        onComplete={() => navigate(fallbackPath, true)}
        active
      />
    </div>
  );
};

export default OnboardingPage;
