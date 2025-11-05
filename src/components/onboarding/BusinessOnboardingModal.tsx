import { useState, useEffect, useCallback } from 'preact/hooks';
import Modal from '../Modal';
import { OnboardingContainer } from './organisms/OnboardingContainer';
import { OnboardingStepRenderer } from './organisms/OnboardingStepRenderer';
import { OnboardingHeader } from './molecules/OnboardingHeader';
import { useOnboardingState } from './hooks/useOnboardingState';
import { useStepValidation } from './hooks/useStepValidation';
import { useStepNavigation } from './hooks/useStepNavigation';
import { useToastContext } from '../../contexts/ToastContext';
import type { OnboardingFormData } from './hooks/useOnboardingState';
import type { OnboardingStep } from './hooks/useStepValidation';

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
  fallbackContactEmail?: string | undefined;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
}

const BusinessOnboardingModal = ({
  isOpen,
  organizationId,
  organizationName,
  fallbackContactEmail,
  onClose,
  onCompleted
}: BusinessOnboardingModalProps) => {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const { showError } = useToastContext();
  
  // Create save function that calls the API
  const saveOnboardingData = useCallback(async (data: OnboardingFormData) => {
    try {
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          data
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((errorData as { message?: string }).message || 'Failed to save onboarding progress');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save onboarding progress';
      console.error('[ONBOARDING][SAVE] Error:', errorMessage);
      showError('Save Failed', 'Could not save your progress. Please try again.');
      throw error;
    }
  }, [organizationId, showError]);

  // Custom hook for state management (no auto-save)
  const { formData, updateField, setFormData } = useOnboardingState(
    {
      contactEmail: fallbackContactEmail || ''
    }
  );

  // Load saved data on mount
  useEffect(() => {
    if (!isOpen || !organizationId) return;

    const loadSavedData = async () => {
      setIsLoadingData(true);
      try {
        const response = await fetch(`/api/onboarding/status?organizationId=${organizationId}`, {
          credentials: 'include'
        });

        if (response.ok) {
          const status = await response.json() as { 
            completed?: boolean; 
            data?: Record<string, unknown> | null;
          } | null;
          
          if (status?.data && !status.completed) {
            // Merge saved data with initial form data
            const savedData = status.data as Partial<OnboardingFormData>;
            setFormData({
              ...formData,
              ...savedData,
              // Preserve contactEmail from fallback if not in saved data
              contactEmail: savedData.contactEmail || formData.contactEmail || fallbackContactEmail || ''
            });
          }
        }
      } catch (error) {
        console.warn('[ONBOARDING][LOAD] Failed to load saved data:', error);
        // Non-blocking - continue with empty form
      } finally {
        setIsLoadingData(false);
      }
    };

    void loadSavedData();
  }, [isOpen, organizationId, fallbackContactEmail, setFormData]);

  // Setup step change callback
  const handleStepChange = useCallback((_step: OnboardingStep, _prevStep: OnboardingStep) => {
    // No-op: explicit saves are handled in continue/back handlers to avoid redundant/conflicting saves
    return;
  }, []);

  const { currentStep, goNext, goBack, progress, isFirstStep, isLastStep } = useStepNavigation(handleStepChange);
  const { validateStep, clearErrors, errors } = useStepValidation();

  const handleStepContinue = async () => {
    if (isLoadingData) {
      return; // Block interactions until saved data load finishes
    }
    clearErrors();
    setSubmitError(null);
    setLoading(true);

    // Validate current step before proceeding
    const validationError = validateStep(currentStep, formData);
    if (validationError) {
      setLoading(false);
      return;
    }

    // Save current step data before navigation (explicit save)
    try {
      await saveOnboardingData(formData);
    } catch (error) {
      console.warn('[ONBOARDING][CONTINUE] Failed to save before navigation:', error);
      setSubmitError('Failed to save onboarding progress');
      setLoading(false);
      return;
    }

    if (isLastStep) {
      // Final step - complete onboarding
      try {
        if (onCompleted) {
          await onCompleted();
        }
        onClose();
      } catch (err) {
        console.error('Failed to complete onboarding:', err);
        setSubmitError(err instanceof Error ? err.message : 'Failed to complete onboarding');
        setLoading(false);
        return;
      }
    } else {
      goNext();
    }
    
    setLoading(false);
  };

  const handleBack = async () => {
    if (isLoadingData) {
      return; // Block interactions until saved data load finishes
    }
    if (isFirstStep) {
      onClose();
      return;
    }
    
    // Save current step data before navigation (explicit save)
    try {
      await saveOnboardingData(formData);
    } catch (error) {
      console.warn('[ONBOARDING][BACK] Failed to save before navigation:', error);
      setSubmitError('Failed to save onboarding progress');
      return;
    }
    
    goBack();
    clearErrors();
    setSubmitError(null);
  };


  const handleClose = () => {
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} type="fullscreen" showCloseButton={false}>
      <OnboardingContainer
        loading={loading || isLoadingData}
        error={submitError}
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
          disabled={isLoadingData}
        />
            
      </OnboardingContainer>
    </Modal>
  );
};

export default BusinessOnboardingModal;