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
  if (workspace === 'practice') return '/practice/home';
  return '/client/conversations';
};

const isSafeRedirectPath = (path: string | null | undefined): path is string => {
  if (!path) return false;
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
  const rawReturnTo = typeof location.query?.returnTo === 'string'
    ? decodeURIComponent(location.query.returnTo)
    : null;
  const requestedReturnPath = isSafeRedirectPath(rawReturnTo) ? rawReturnTo : null;

  const fallbackPath = useMemo(
    () => requestedReturnPath ?? resolveFallbackPath(defaultWorkspace),
    [defaultWorkspace, requestedReturnPath]
  );

  useEffect(() => {
    if (isPending) return;
    const user = session?.user;
    if (!user || user.isAnonymous) {
      navigate('/auth?mode=signup', true);
      return;
    }
    if (user.onboardingComplete) {
      navigate(fallbackPath, true);
    }
  }, [fallbackPath, isPending, navigate, session?.user]);

  if (isPending) {
    return <LoadingScreen />;
  }

  const user = session?.user;
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
