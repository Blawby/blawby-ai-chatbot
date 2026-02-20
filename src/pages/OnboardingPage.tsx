import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { getWorkspaceHomePath } from '@/shared/utils/workspace';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { SetupShell } from '@/shared/ui/layout/SetupShell';

const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center text-sm text-input-placeholder">
    Loading…
  </div>
);

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
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
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

  const fallbackPath = useMemo(() => {
    if (requestedReturnPath) return requestedReturnPath;
    if (practicesLoading) return null;
    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    if (!fallbackSlug && defaultWorkspace === 'practice') return '/pricing';
    return getWorkspaceHomePath(defaultWorkspace, fallbackSlug, '/');
  }, [currentPractice?.slug, defaultWorkspace, practices, practicesLoading, requestedReturnPath]);

  const userId = session?.user?.id;
  const userIsAnonymous = session?.user?.isAnonymous;
  const userOnboardingComplete = session?.user?.onboardingComplete;

  useEffect(() => {
    if (isPending) return;
    if (!userId || userIsAnonymous) {
      navigate('/auth?mode=signup', true);
      return;
    }
    if (userOnboardingComplete && fallbackPath) {
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
    <SetupShell>
      <div className="min-h-screen bg-transparent flex flex-col">
        <OnboardingFlow
          onClose={() => fallbackPath && navigate(fallbackPath, true)}
          onComplete={() => fallbackPath && navigate(fallbackPath, true)}
          active
        />
      </div>
    </SetupShell>
  );
};

export default OnboardingPage;
