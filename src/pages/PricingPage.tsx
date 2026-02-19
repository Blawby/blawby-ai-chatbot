import { useEffect } from 'preact/hooks';
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

  const resolveReturnPath = (): string => {
    if (typeof window === 'undefined') return '/';
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    
    // Validate: must be internal path starting with /, not //, not /pricing, no backslashes,
    // and match strict alphanumeric/dash/underscore/slash pattern
    const isValidInternalPath = returnTo 
      && typeof returnTo === 'string'
      && /^\/[A-Za-z0-9_/-]*$/.test(returnTo)
      && returnTo.startsWith('/') 
      && !returnTo.startsWith('//') 
      && !returnTo.startsWith('/pricing')
      && !returnTo.includes('\\');
    
    if (isValidInternalPath) {
      return returnTo;
    }
    return '/';
  };

  const handleClose = () => {
    navigate(resolveReturnPath(), true);
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
