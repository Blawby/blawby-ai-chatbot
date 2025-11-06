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

const STEP_SEQUENCE: OnboardingStep[] = [
  'welcome',
  'firm-basics',
  'trust-account-intro',
  'stripe-onboarding',
  'business-details',
  'services',
  'review-and-launch'
];

type PersistedOnboardingSnapshot = OnboardingFormData & {
  __meta?: {
    resumeStep?: OnboardingStep;
    savedAt?: string;
  };
};

interface BusinessOnboardingStatusResponse {
  status: 'completed' | 'skipped' | 'pending' | 'not_required';
  completed: boolean;
  skipped: boolean;
  completedAt: number | null;
  lastSavedAt: number | null;
  hasDraft: boolean;
  data: PersistedOnboardingSnapshot | null;
}

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
  const { showError, showSuccess } = useToastContext();
  
  // Create save function that calls the API
  const saveOnboardingData = useCallback(async (data: OnboardingFormData, resumeStep: OnboardingStep) => {
    try {
      const payload: PersistedOnboardingSnapshot = {
        ...data,
        __meta: {
          resumeStep,
          savedAt: new Date().toISOString()
        }
      };
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          data: payload
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

  const getAdjacentStep = useCallback((step: OnboardingStep, delta: number): OnboardingStep => {
    const index = STEP_SEQUENCE.indexOf(step);
    if (index === -1) {
      return step;
    }
    const nextIndex = Math.min(Math.max(index + delta, 0), STEP_SEQUENCE.length - 1);
    return STEP_SEQUENCE[nextIndex];
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { message?: string }).message || 'Failed to finalize onboarding');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to finalize onboarding';
      showError('Completion Failed', message);
      throw error;
    }
  }, [organizationId, showError]);

  const handleStepChange = useCallback((_step: OnboardingStep, _prevStep: OnboardingStep) => {
    // No-op: explicit saves are handled in continue/back handlers to avoid redundant/conflicting saves
    return;
  }, []);

  const { currentStep, goNext, goBack, goToStep, progress, isFirstStep, isLastStep } = useStepNavigation(handleStepChange);

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
          const payload = await response.json() as { success?: boolean; data?: BusinessOnboardingStatusResponse | null };
          const progress = payload?.data ?? null;

          if (progress?.data && progress.status !== 'completed') {
            const { __meta, ...rest } = progress.data;
            setFormData((prev) => ({
              ...prev,
              ...rest,
              contactEmail: rest.contactEmail || prev.contactEmail || fallbackContactEmail || ''
            }));

            const resumeTarget = __meta?.resumeStep;
            if (resumeTarget) {
              goToStep(resumeTarget);
            }
          } else if (progress?.status === 'completed') {
            // Allow viewing/editing even when completed; default to review step
            goToStep('review-and-launch');
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
  }, [isOpen, organizationId, fallbackContactEmail, setFormData, goToStep, onClose]);

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

    const resumeStep = isLastStep ? currentStep : getAdjacentStep(currentStep, 1);

    // Save current step data before navigation (explicit save)
    try {
      await saveOnboardingData(formData, resumeStep);
      if (isLastStep) {
        await completeOnboarding();
        showSuccess('Onboarding Complete', 'Your business onboarding is finished. You can now publish your assistant.');
        if (onCompleted) {
          await onCompleted();
        }
        onClose();
      } else {
        goNext();
      }
    } catch (error) {
      console.warn('[ONBOARDING][CONTINUE] Failed to save before navigation:', error);
      setSubmitError('Failed to save onboarding progress');
      return;
    } finally {
      setLoading(false);
    }
  };

  const handleBack = async () => {
    if (isLoadingData) {
      return; // Block interactions until saved data load finishes
    }
    if (isFirstStep) {
      onClose();
      return;
    }
    
    const resumeStep = getAdjacentStep(currentStep, -1);

    // Save current step data before navigation (explicit save)
    try {
      await saveOnboardingData(formData, resumeStep);
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
