import PricingView from '@/features/pricing/components/PricingView';
import Modal from '@/shared/components/Modal';
import { useNavigation } from '@/shared/utils/navigation';
import { SetupShell } from '@/shared/ui/layout/SetupShell';

const PricingPage = () => {
  const { navigate } = useNavigation();

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

  return (
    <SetupShell accentBackdropVariant="workspace">
      <Modal
        isOpen
        onClose={handleClose}
        type="modal"
        mobileBehavior="drawer"
        contentClassName="max-w-xl w-full"
      >
        <PricingView />
      </Modal>
    </SetupShell>
  );
};

export default PricingPage;
