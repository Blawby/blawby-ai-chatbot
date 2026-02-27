import { useEffect, useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import PricingView from '@/features/pricing/components/PricingView';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { SetupShell } from '@/shared/ui/layout/SetupShell';
import { Button } from '@/shared/ui/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const PricingPage = () => {
  const { navigate } = useNavigation();
  const location = useLocation();
  const { session, isPending } = useSessionContext();
  const isAuthenticated = Boolean(session?.user && !session.user.isAnonymous);

  useEffect(() => {
    if (isPending || isAuthenticated) return;
    const currentUrl = location.url.startsWith('/')
      ? location.url
      : '/pricing';
    const redirect = encodeURIComponent(currentUrl);
    navigate(`/auth?mode=signin&redirect=${redirect}`, true);
  }, [isAuthenticated, isPending, location.url, navigate]);

  const rawReturnTo = typeof location.query?.returnTo === 'string' ? location.query.returnTo : null;
  const resolvedReturnPath = useMemo(() => {
    if (!rawReturnTo) return '/';
    let decoded: string | null = null;
    try {
      decoded = decodeURIComponent(rawReturnTo);
    } catch {
      return '/';
    }

    const isValidInternalPath =
      typeof decoded === 'string' &&
      /^\/[A-Za-z0-9_/-]*$/.test(decoded) &&
      decoded.startsWith('/') &&
      !decoded.startsWith('//') &&
      !decoded.includes('\\');
    return isValidInternalPath ? decoded : '/';
  }, [rawReturnTo]);

  const handleClose = () => {
    navigate(resolvedReturnPath, true);
  };

  if (isPending || !isAuthenticated) {
    return (
      <SetupShell>
        <div className="flex h-screen items-center justify-center text-sm text-input-placeholder">
          Loading…
        </div>
      </SetupShell>
    );
  }

  return (
    <SetupShell>
      <div className="min-h-screen bg-transparent flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-xl">
          <div className="flex items-center justify-center mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-sm text-input-placeholder hover:text-input-text"
              icon={<ArrowLeftIcon className="h-4 w-4" />}
              iconPosition="left"
            >
              Back
            </Button>
          </div>
        </div>
        <div className="sm:mx-auto sm:w-full sm:max-w-xl">
          <PricingView />
        </div>
      </div>
    </SetupShell>
  );
};

export default PricingPage;
