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
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/pricing')) {
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
