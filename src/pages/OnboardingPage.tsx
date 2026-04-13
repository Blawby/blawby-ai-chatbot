import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { SetupShell } from '@/shared/ui/layout/SetupShell';
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
 // AppShell always encodes a returnTo when redirecting to /onboarding. Fall
 // back to '/' only if the param is absent or invalid (e.g. direct navigation).
 const fallbackPath: string = isSafeRedirectPath(rawReturnTo) ? rawReturnTo : '/';

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
  <SetupShell>
   <div className="min-h-screen bg-transparent flex flex-col">
    <OnboardingFlow
     onClose={() => navigate(fallbackPath, true)}
     onComplete={() => navigate(fallbackPath, true)}
     active
    />
   </div>
  </SetupShell>
 );
};

export default OnboardingPage;
