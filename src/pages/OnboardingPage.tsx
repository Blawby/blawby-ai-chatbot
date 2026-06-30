import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';

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

const getSubscriptionSuccessPracticeId = (path: string | null): string | null => {
  if (!path) return null;
  try {
    const url = new URL(path, 'http://local.dev');
    if (url.searchParams.get('subscription') !== 'success') return null;
    const practiceId = url.searchParams.get('practiceId')?.trim();
    return practiceId || null;
  } catch {
    return null;
  }
};

const getStripeReturnStatus = (value: unknown): 'return' | 'refresh' | null => {
  return value === 'return' || value === 'refresh' ? value : null;
};

const OnboardingPage = () => {
  const { session, isPending } = useSessionContext();
  const { navigate } = useNavigation();
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
  // A new user has no org yet — do not call usePracticeManagement here.
  // RootRoute owns the post-onboarding destination decision. Returning to `/`
  // is safe now because root routing fails fast and sends no-practice users to pricing.
  const fallbackPath: string = isSafeRedirectPath(rawReturnTo) ? rawReturnTo : '/';
  const subscriptionSuccessPracticeId = getSubscriptionSuccessPracticeId(fallbackPath);
  const completionPath = subscriptionSuccessPracticeId ? '/' : fallbackPath;
  const stripeReturnStatus = getStripeReturnStatus(location.query?.stripe);
  const initialOnboardingStep = subscriptionSuccessPracticeId
    ? 4
    : stripeReturnStatus === 'return'
      ? 5
      : stripeReturnStatus === 'refresh'
        ? 4
        : undefined;
  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(completionPath);
      return;
    }
    navigate(completionPath, true);
  };

  const userId = session?.user?.id;
  const userIsAnonymous = session?.user?.is_anonymous;
  const userOnboardingComplete = session?.user?.onboarding_complete;

  useEffect(() => {
    if (isPending) return;
    if (!userId || userIsAnonymous) {
      navigate('/auth?mode=signup', true);
      return;
    }
    if (userOnboardingComplete) {
      navigate(completionPath, true);
    }
  }, [
    completionPath,
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
  if (!user || user.is_anonymous) {
    return <LoadingScreen />;
  }

  if (user.onboarding_complete) {
    return <LoadingScreen />;
  }

  // The new 6-step conversational flow owns its own full-bleed gradient
  // background + 340px progress sidebar / stage layout, so we render it
  // directly without SetupShell's extra accent backdrop.
  return (
    <OnboardingFlow
      onClose={() => navigate(completionPath, true)}
      onComplete={handleComplete}
      initialStep={initialOnboardingStep}
      initialHasActiveSubscription={Boolean(subscriptionSuccessPracticeId)}
      subscriptionSuccessPracticeId={subscriptionSuccessPracticeId}
      active
    />
  );
};

export default OnboardingPage;
