import Modal from '@/shared/components/Modal';
import type { OnboardingFormData } from '@/shared/types/onboarding';
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: OnboardingFormData) => void;
}

const OnboardingModal = ({ isOpen, onClose, onComplete }: OnboardingModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="fullscreen"
      showCloseButton={false}
    >
      <OnboardingFlow
        onClose={onClose}
        onComplete={onComplete}
        active={isOpen}
        className="data-[test=modal]"
      />
    </Modal>
  );
};

export default OnboardingModal;
