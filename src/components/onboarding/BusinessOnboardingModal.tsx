import { useState } from 'preact/hooks';
import Modal from '../Modal';
import { OnboardingContainer } from './organisms/OnboardingContainer';
import { OnboardingStepRenderer } from './organisms/OnboardingStepRenderer';
import { OnboardingHeader } from './molecules/OnboardingHeader';
import { useOnboardingState } from './hooks/useOnboardingState';
import { useStepValidation } from './hooks/useStepValidation';
import { useStepNavigation } from './hooks/useStepNavigation';
import type { OnboardingStep } from './hooks';

const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: 'Welcome to Blawby',
  'firm-basics': 'Tell us about your firm',
  'trust-account-intro': 'Connect your trust account for payouts',
  'stripe-onboarding': 'Connect with Stripe',
  'business-details': 'Configure your business profile',
  services: 'Add your practice areas',
  'review-and-launch': 'Review and launch'
};

const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  welcome: "Let's get your AI intake assistant set up. This will only take a few minutes.",
  'firm-basics': "We'll use this information to build your payment system and client-facing experience.",
  'trust-account-intro': 'To stay IOLTA-compliant, we need to securely verify your identity and link your trust account. All client payments will be deposited here.',
  'stripe-onboarding': "You'll be redirected to Stripe to complete your account setup and link your trust account.",
  'business-details': "Set up your services, intake questions, and preferences.",
  services: 'Add the legal services you offer to help the AI assistant provide relevant guidance.',
  'review-and-launch': 'Review your setup and launch your intake assistant.'
};

interface BusinessOnboardingModalProps {
  isOpen: boolean;
  organizationId: string;
  organizationName?: string;
  fallbackContactEmail?: string;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
}

const BusinessOnboardingModal = ({
  isOpen,
  organizationId: _organizationId,
  organizationName,
  fallbackContactEmail,
  onClose,
  onCompleted
}: BusinessOnboardingModalProps) => {
  const [loading, setLoading] = useState(false);
  
  // Custom hooks for state management
  const { formData, updateField } = useOnboardingState({
    contactEmail: fallbackContactEmail || ''
  });
  const { currentStep, goNext, goBack, progress, isFirstStep, isLastStep } = useStepNavigation();
  const { validateStep, clearErrors, errors } = useStepValidation();

  const handleStepContinue = async () => {
    clearErrors();
    setLoading(true);

    // Validate current step before proceeding
    const validationError = validateStep(currentStep, formData);
    if (validationError) {
      setLoading(false);
      return;
    }

    // Proceed immediately or await real API call here when available

    if (isLastStep) {
      // Final step - complete onboarding
      try {
        localStorage.removeItem('businessSetupPending');
        
        if (onCompleted) {
          await onCompleted();
        }
        onClose();
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
        // Show error to user instead of just logging
        setLoading(false);
        return;
      }
    } else {
      goNext();
    }
    
    setLoading(false);
  };

  const handleBack = () => {
    if (isFirstStep) {
      onClose();
      return;
    }
    goBack();
    clearErrors();
  };


  const handleClose = () => {
    try {
      localStorage.setItem('businessSetupPending', 'snoozed');
    } catch {
      // noop
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} type="fullscreen" showCloseButton={false}>
      <OnboardingContainer
        loading={loading}
        error={errors && errors.length > 0 ? errors[0].message : null}
        header={
          <OnboardingHeader
            title={STEP_TITLES[currentStep]}
            description={STEP_DESCRIPTIONS[currentStep]}
            currentStep={progress.current}
            totalSteps={progress.total}
            showProgress={true}
          />
        }
      >
        <OnboardingStepRenderer
          currentStep={currentStep}
          stepData={formData}
          onChange={updateField}
          onContinue={handleStepContinue}
          onBack={handleBack}
          errors={errors && errors.length > 0 ? errors[0].message : null}
          organizationSlug={organizationName?.toLowerCase().replace(/\s+/g, '-')}
        />
            
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
              Progress is saved automatically.
            </div>
      </OnboardingContainer>
    </Modal>
  );
};

export default BusinessOnboardingModal;