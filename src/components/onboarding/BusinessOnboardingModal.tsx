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
import {
  createConnectedAccount,
  getOnboardingStatusPayload,
  getPractice,
  updatePractice,
  type Practice,
  type UpdatePracticeRequest
} from '../../lib/apiClient';
import type { StripeConnectStatus } from './types';
import {
  extractStripeStatusFromPayload,
} from './utils';
import {
  buildPracticeOnboardingMetadata,
  extractProgressFromPracticeMetadata,
  ONBOARDING_STEP_SEQUENCE,
  type OnboardingStatusValue,
  type PersistedOnboardingSnapshot,
} from '../../utils/practiceOnboarding';

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

const STEP_SEQUENCE: OnboardingStep[] = ONBOARDING_STEP_SEQUENCE;

interface BusinessOnboardingModalProps {
  isOpen: boolean;
  organizationId: string;
  organizationName?: string;
  fallbackContactEmail?: string | undefined;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
  currentStepFromUrl?: OnboardingStep;
  onStepChange?: (step: OnboardingStep) => void;
}

const BusinessOnboardingModal = ({
  isOpen,
  organizationId,
  organizationName,
  fallbackContactEmail,
  onClose,
  onCompleted,
  currentStepFromUrl,
  onStepChange
}: BusinessOnboardingModalProps) => {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const { showError, showSuccess } = useToastContext();
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeRequestPending, setStripeRequestPending] = useState(false);
  const [practiceMetadata, setPracticeMetadata] = useState<Record<string, unknown> | null>(null);
  const [practiceSnapshot, setPracticeSnapshot] = useState<Practice | null>(null);
  const fetchStripeStatus = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    try {
      const payload = await getOnboardingStatusPayload(organizationId);
      const status = extractStripeStatusFromPayload(payload);
      if (status) {
        setStripeStatus(status);
      }
    } catch (error) {
      console.warn('[ONBOARDING][STATUS] Failed to load Stripe status:', error);
    }
  }, [organizationId]);
  
  // Create save function that calls the API
  const saveOnboardingData = useCallback(
    async (data: OnboardingFormData, resumeStep: OnboardingStep, statusOverride?: OnboardingStatusValue) => {
      if (!organizationId) {
        throw new Error('Missing organization');
      }

      try {
        const snapshot: PersistedOnboardingSnapshot = {
          ...data,
          __meta: {
            resumeStep,
            savedAt: Date.now()
          }
        };

        const metadata = buildPracticeOnboardingMetadata(
          practiceMetadata ?? practiceSnapshot?.metadata,
          {
            snapshot,
            resumeStep,
            status: statusOverride ?? 'pending',
            savedAt: Date.now()
          }
        );

        const updatePayload: UpdatePracticeRequest = {
          name: data.firmName,
          businessEmail: data.contactEmail,
          businessPhone: data.contactPhone,
          logo: data.profileImage,
          metadata
        };

        const updatedPractice = await updatePractice(organizationId, updatePayload);
        setPracticeSnapshot(updatedPractice);
        setPracticeMetadata(
          updatedPractice.metadata && typeof updatedPractice.metadata === 'object' && !Array.isArray(updatedPractice.metadata)
            ? (updatedPractice.metadata as Record<string, unknown>)
            : null
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to save onboarding progress';
        console.error('[ONBOARDING][SAVE] Error:', errorMessage);
        showError('Save Failed', 'Could not save your progress. Please try again.');
        throw error;
      }
    },
    [organizationId, practiceMetadata, practiceSnapshot, showError]
  );

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
  const startStripeOnboarding = useCallback(async () => {
    if (!organizationId) {
      throw new Error('Missing organization');
    }

    if (stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled) {
      showSuccess('Already Connected', 'Your Stripe account is already connected.');
      return;
    }

    const email = formData.contactEmail || fallbackContactEmail;
    if (!email) {
      const message = 'Enter a contact email before connecting Stripe.';
      showError('Stripe Setup', message);
      throw new Error(message);
    }

    setStripeRequestPending(true);
    try {
      const connectedAccount = await createConnectedAccount({
        practiceEmail: email,
        practiceUuid: organizationId
      });

      const secret = connectedAccount.clientSecret ?? '';
      setStripeClientSecret(secret.length > 0 ? secret : null);

      await fetchStripeStatus();

      showSuccess(
        'Stripe Session Created',
        'Complete the Stripe onboarding form to finish trust account setup.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding';
      showError('Stripe Setup Failed', message);
      throw error;
    } finally {
      setStripeRequestPending(false);
    }
  }, [organizationId, stripeStatus, formData.contactEmail, fallbackContactEmail, fetchStripeStatus, showError, showSuccess]);

  const handleStepChange = useCallback((step: OnboardingStep, _prevStep: OnboardingStep) => {
    if (onStepChange) onStepChange(step);
  }, [onStepChange]);

  const { currentStep, goNext, goBack, goToStep, progress, isFirstStep, isLastStep } = useStepNavigation(handleStepChange);

  // Initialize validation before handlers that use clearErrors
  const { validateStep, clearErrors, errors } = useStepValidation();

  // Advance to next step without saving (Skip for now)
  const handleSkip = useCallback(() => {
    if (isLoadingData) return;
    goNext();
    clearErrors();
    setSubmitError(null);
  }, [isLoadingData, goNext, clearErrors]);

  useEffect(() => {
    if (!currentStepFromUrl) return;
    if (!STEP_SEQUENCE.includes(currentStepFromUrl)) return;
    goToStep(currentStepFromUrl);
  }, [currentStepFromUrl, goToStep]);

  // Load saved data on mount
  useEffect(() => {
    if (!isOpen || !organizationId) return;

    const loadSavedData = async () => {
      setIsLoadingData(true);
      try {
        const practiceRecord = await getPractice(organizationId);
        setPracticeSnapshot(practiceRecord);
        const metadataRecord =
          practiceRecord.metadata && typeof practiceRecord.metadata === 'object' && !Array.isArray(practiceRecord.metadata)
            ? (practiceRecord.metadata as Record<string, unknown>)
            : null;
        setPracticeMetadata(metadataRecord);

        await fetchStripeStatus();

        const progress = extractProgressFromPracticeMetadata(metadataRecord);
        const hasValidUrlStep = currentStepFromUrl && STEP_SEQUENCE.includes(currentStepFromUrl);

        if (progress?.data) {
          const { __meta, ...restRaw } = progress.data;
          const rest = restRaw as unknown as OnboardingFormData;
          setFormData((prev) => ({
            ...prev,
            ...rest,
            contactEmail: rest.contactEmail ?? prev.contactEmail ?? fallbackContactEmail ?? ''
          }));

          if (!hasValidUrlStep) {
            if (progress.status === 'completed') {
              goToStep('review-and-launch');
            } else if (__meta?.resumeStep && STEP_SEQUENCE.includes(__meta.resumeStep)) {
              goToStep(__meta.resumeStep);
            }
          }
        } else {
          setFormData((prev) => ({
            ...prev,
            firmName: practiceRecord.name || prev.firmName,
            contactEmail: practiceRecord.businessEmail ?? prev.contactEmail ?? fallbackContactEmail ?? '',
            contactPhone: practiceRecord.businessPhone || prev.contactPhone,
            profileImage: typeof practiceRecord.logo === 'string' ? practiceRecord.logo : prev.profileImage
          }));

          if (progress?.status === 'completed' && !hasValidUrlStep) {
            goToStep('review-and-launch');
          }
        }
      } catch (error) {
        console.warn('[ONBOARDING][LOAD] Failed to load saved data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    void loadSavedData();
  }, [
    isOpen,
    organizationId,
    fallbackContactEmail,
    setFormData,
    goToStep,
    currentStepFromUrl,
    fetchStripeStatus
  ]);

  // useStepValidation already initialized above

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

    if (currentStep === 'stripe-onboarding' && !stripeClientSecret) {
      if (stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled) {
        // Already connected – allow navigation to continue
      } else {
        try {
          await startStripeOnboarding();
        } catch (error) {
          console.error('[ONBOARDING][STRIPE] Failed to start onboarding session:', error);
          setSubmitError('Unable to start Stripe onboarding. Please try again.');
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    const resumeStep = isLastStep ? currentStep : getAdjacentStep(currentStep, 1);

    // Save current step data before navigation (explicit save)
    try {
      await saveOnboardingData(formData, resumeStep, isLastStep ? 'completed' : undefined);
      if (isLastStep) {
        showSuccess('Onboarding Complete', 'Your business onboarding is finished. You can now publish your assistant.');
        try {
          if (onCompleted) {
            await onCompleted();
          }
        } catch (e) {
          console.warn('[ONBOARDING][COMPLETE] onCompleted callback failed:', e);
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
          onSkip={handleSkip}
          stripeStatus={stripeStatus}
          stripeClientSecret={stripeClientSecret}
          stripeLoading={loading || stripeRequestPending}
        />
            
      </OnboardingContainer>
    </Modal>
  );
};

export default BusinessOnboardingModal;
