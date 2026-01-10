import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { isAxiosError } from 'axios';
import type { ComponentChildren } from 'preact';
import Modal from '@/shared/components/Modal';
import { OnboardingContainer } from './OnboardingContainer';
import { OnboardingStepRenderer } from './OnboardingStepRenderer';
import { OnboardingHeader } from './OnboardingHeader';
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboardingState';
import { useStepValidation } from '@/features/onboarding/hooks/useStepValidation';
import { useStepNavigation } from '@/features/onboarding/hooks/useStepNavigation';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { OnboardingFormData } from '@/features/onboarding/hooks/useOnboardingState';
import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';
import {
  createConnectedAccount,
  getOnboardingStatusPayload,
  getPractice,
  updatePractice,
  updatePracticeDetails,
  type PracticeDetailsUpdate,
  type UpdatePracticeRequest
} from '@/shared/lib/apiClient';
import type { StripeConnectStatus } from '../types';
import {
  extractStripeStatusFromPayload,
} from '../utils';
import {
  ONBOARDING_STEP_SEQUENCE,
  type OnboardingStatusValue,
} from '@/shared/utils/practiceOnboarding';
import {
  buildLocalSnapshot,
  loadLocalOnboardingState,
  saveLocalOnboardingState
} from '@/shared/utils/onboardingStorage';
import { getActiveOrganizationId } from '@/shared/utils/session';
import { getValidatedStripeOnboardingUrl } from '@/shared/utils/stripeOnboarding';

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const trimToString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : undefined;

type NormalizableStringField =
  | 'firmName'
  | 'contactEmail'
  | 'contactPhone'
  | 'website'
  | 'slug'
  | 'profileImage'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'introMessage';

const normalizeServices = (value: unknown): OnboardingFormData['services'] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((service, index) => {
      if (!isPlainObject(service)) {
        return null;
      }
      const title = trimToString(service.title);
      if (!title) {
        return null;
      }
      const description = trimToString(service.description) ?? '';
      const idCandidate = trimToString(service.id);
      const id = idCandidate ?? `service-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      return { id, title, description };
    })
    .filter((item): item is OnboardingFormData['services'][number] => Boolean(item));
};

const normalizeSnapshotData = (snapshot: Record<string, unknown>): Partial<OnboardingFormData> => {
  const normalized: Partial<OnboardingFormData> = {};

  const assignString = (field: NormalizableStringField, value: unknown) => {
    const trimmed = trimToString(value);
    if (trimmed !== undefined) {
      normalized[field] = trimmed as OnboardingFormData[typeof field];
    }
  };

  assignString('firmName', snapshot.firmName);
  assignString('contactEmail', snapshot.contactEmail);
  assignString('contactPhone', snapshot.contactPhone);
  assignString('website', snapshot.website);
  assignString('slug', snapshot.slug);
  assignString('profileImage', snapshot.profileImage);
  assignString('addressLine1', snapshot.addressLine1);
  assignString('addressLine2', snapshot.addressLine2);
  assignString('city', snapshot.city);
  assignString('state', snapshot.state);
  assignString('postalCode', snapshot.postalCode);
  assignString('country', snapshot.country);
  assignString('introMessage', snapshot.introMessage);

  const descriptionValue = trimToString(snapshot.description);
  const legacyOverview = trimToString(snapshot.overview);
  if (descriptionValue !== undefined) {
    normalized.description = descriptionValue;
  } else if (legacyOverview !== undefined) {
    normalized.description = legacyOverview;
  }

  if (typeof snapshot.isPublic === 'boolean') {
    normalized.isPublic = snapshot.isPublic;
  }

  if (snapshot.consultationFee === null) {
    normalized.consultationFee = null;
  } else if (typeof snapshot.consultationFee === 'number' && Number.isFinite(snapshot.consultationFee)) {
    normalized.consultationFee = snapshot.consultationFee;
  }

  if (Object.prototype.hasOwnProperty.call(snapshot, 'services')) {
    normalized.services = normalizeServices(snapshot.services);
  }

  return normalized;
};

const extractResumeStepFromMeta = (meta: unknown): OnboardingStep | undefined => {
  if (!isPlainObject(meta)) {
    return undefined;
  }
  const candidate = meta.resumeStep;
  if (typeof candidate !== 'string') {
    return undefined;
  }
  return STEP_SEQUENCE.includes(candidate as OnboardingStep) ? (candidate as OnboardingStep) : undefined;
};

interface BusinessOnboardingModalProps {
  isOpen: boolean;
  practiceId: string;
  practiceName?: string;
  practiceSlug?: string;
  fallbackContactEmail?: string | undefined;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
  currentStepFromUrl?: OnboardingStep;
  onStepChange?: (step: OnboardingStep) => void;
}

const BusinessOnboardingModal = ({
  isOpen,
  practiceId,
  practiceName,
  practiceSlug,
  fallbackContactEmail,
  onClose,
  onCompleted,
  currentStepFromUrl,
  onStepChange
}: BusinessOnboardingModalProps) => {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const { showError, showSuccess, showWarning } = useToastContext();
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeRequestPending, setStripeRequestPending] = useState(false);
  const [footerContent, setFooterContent] = useState<ComponentChildren | null>(null);
  const { session } = useSessionContext();
  const organizationId = useMemo(() => getActiveOrganizationId(session), [session]);
  const resolveApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (isAxiosError(error)) {
      const data = error.response?.data as { message?: unknown } | undefined;
      if (typeof data?.message === 'string' && data.message.trim().length > 0) {
        return data.message;
      }
      if (typeof error.message === 'string' && error.message.trim().length > 0) {
        return error.message;
      }
    }
    return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
  }, []);
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
    async (
      data: OnboardingFormData,
      resumeStep: OnboardingStep,
      statusOverride?: OnboardingStatusValue,
      currentStep?: OnboardingStep
    ): Promise<string | null> => {
      if (!practiceId) {
        throw new Error('Missing practice');
      }
      if (!organizationId) {
        throw new Error('Missing active organization');
      }

      let saveError: string | null = null;
      try {
        const snapshot = buildLocalSnapshot(data, resumeStep);
        const status = statusOverride ?? 'pending';
        const savedAt = Date.now();
        const completedAt = status === 'completed' ? savedAt : null;

        const practicePayload: UpdatePracticeRequest = {};
        const trimmedName = data.firmName.trim();
        const trimmedEmail = data.contactEmail.trim();
        const trimmedPhone = data.contactPhone?.trim();
        const trimmedSlug = data.slug?.trim();
        const trimmedLogo = data.profileImage.trim();

        if (trimmedName) practicePayload.name = trimmedName;
        if (trimmedEmail) practicePayload.businessEmail = trimmedEmail;
        if (trimmedPhone) practicePayload.businessPhone = trimmedPhone;
        if (trimmedSlug) practicePayload.slug = trimmedSlug;
        if (trimmedLogo) practicePayload.logo = trimmedLogo;

        const shouldPersistDetails = currentStep
          ? STEP_SEQUENCE.indexOf(currentStep) >= STEP_SEQUENCE.indexOf('business-details')
          : true;

        const detailsPayload: PracticeDetailsUpdate = {};
        const trimmedWebsite = data.website?.trim();
        const trimmedAddress1 = data.addressLine1.trim();
        const trimmedAddress2 = data.addressLine2.trim();
        const trimmedCity = data.city.trim();
        const trimmedState = data.state.trim();
        const trimmedPostal = data.postalCode.trim();
        const trimmedCountry = data.country.trim();
        const trimmedIntroMessage = data.introMessage.trim();
        const trimmedDescription = data.description?.trim();

        if (trimmedWebsite) detailsPayload.website = trimmedWebsite;
        if (trimmedAddress1) detailsPayload.addressLine1 = trimmedAddress1;
        if (trimmedAddress2) detailsPayload.addressLine2 = trimmedAddress2;
        if (trimmedCity) detailsPayload.city = trimmedCity;
        if (trimmedState) detailsPayload.state = trimmedState;
        if (trimmedPostal) detailsPayload.postalCode = trimmedPostal;
        if (trimmedCountry) detailsPayload.country = trimmedCountry;
        if (trimmedIntroMessage) detailsPayload.introMessage = trimmedIntroMessage;
        if (trimmedDescription) detailsPayload.description = trimmedDescription;
        if (Array.isArray(data.services) && data.services.length > 0) {
          const normalizedServices = data.services
            .filter((service) => service.title.trim().length > 0)
            .map(({ title, description }) => ({
              title: title.trim(),
              description: description.trim()
            }));
          if (normalizedServices.length > 0) {
            detailsPayload.services = normalizedServices;
          }
        }
        const allowVisibilityUpdate = currentStep === 'review-and-launch' || Boolean(data.isPublic);
        if (allowVisibilityUpdate) {
          detailsPayload.isPublic = Boolean(data.isPublic);
        }

        const runOperation = async (label: string, action: () => Promise<unknown>) => {
          try {
            await action();
          } catch (operationError) {
            const fallbackMessage = `Failed to save ${label}`;
            const message = resolveApiErrorMessage(operationError, fallbackMessage);
            throw new Error(message);
          }
        };

        if (Object.keys(practicePayload).length > 0) {
          await runOperation('practice profile', () => updatePractice(practiceId, practicePayload));
        }

        if (shouldPersistDetails && Object.keys(detailsPayload).length > 0) {
          await runOperation('business details', () => updatePracticeDetails(practiceId, detailsPayload));
        }

        if (data.consultationFee === null) {
          await runOperation('consultation fee', () =>
            updatePractice(practiceId, { consultationFee: null })
          );
        } else if (typeof data.consultationFee === 'number' && Number.isFinite(data.consultationFee)) {
          await runOperation('consultation fee', () =>
            updatePractice(practiceId, { consultationFee: data.consultationFee })
          );
        }

        try {
          saveLocalOnboardingState(organizationId, {
            status,
            resumeStep,
            savedAt,
            completedAt,
            data: snapshot
          });
        } catch (storageError) {
          console.warn('[ONBOARDING][SAVE] Failed to persist local snapshot:', storageError);
          showWarning(
            'Auto-save failed',
            'Your progress may not be saved locally. Please keep this window open while we sync.'
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to save onboarding progress';
        console.error('[ONBOARDING][SAVE] Error:', error);
        showError('Save Failed', errorMessage);
        saveError = errorMessage;
      }
      return saveError;
    },
    [practiceId, organizationId, resolveApiErrorMessage, showError, showWarning]
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
    if (!practiceId) {
      throw new Error('Missing practice');
    }
    if (!organizationId) {
      throw new Error('Missing active organization');
    }

    if (stripeStatus?.details_submitted) {
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

      if (connectedAccount.onboardingUrl) {
        const validatedUrl = getValidatedStripeOnboardingUrl(connectedAccount.onboardingUrl);
        if (validatedUrl) {
          window.location.href = validatedUrl;
          return;
        }
        const message = 'Received an invalid Stripe onboarding link. Please try again.';
        showError('Stripe Setup Failed', message);
        throw new Error(message);
      }

      const message = 'Stripe hosted onboarding is not available. Please try again later.';
      showError('Stripe Setup Failed', message);
      throw new Error(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding';
      showError('Stripe Setup Failed', message);
      throw error;
    } finally {
      setStripeRequestPending(false);
    }
  }, [practiceId, organizationId, stripeStatus, formData.contactEmail, fallbackContactEmail, showError, showSuccess]);

  const handleStepChange = useCallback((step: OnboardingStep, _prevStep: OnboardingStep) => {
    if (onStepChange) onStepChange(step);
  }, [onStepChange]);

  const { currentStep, goNext, goBack, goToStep, progress, isFirstStep, isLastStep } = useStepNavigation(handleStepChange);

  // Initialize validation before handlers that use clearErrors
  const { validateStep, clearErrors } = useStepValidation();

  useEffect(() => {
    if (!currentStepFromUrl) return;
    if (!STEP_SEQUENCE.includes(currentStepFromUrl)) return;
    goToStep(currentStepFromUrl);
  }, [currentStepFromUrl, goToStep]);

  // Load saved data on mount
  useEffect(() => {
    if (!isOpen || !practiceId) return;

    const loadSavedData = async () => {
      setIsLoadingData(true);
      try {
        const practiceRecord = await getPractice(practiceId);
        await fetchStripeStatus();

        const hasValidUrlStep = currentStepFromUrl && STEP_SEQUENCE.includes(currentStepFromUrl);
        const localState = organizationId ? loadLocalOnboardingState(organizationId) : null;

        if (localState?.data && isPlainObject(localState.data)) {
          const snapshotRecord = localState.data;
          const normalizedData = normalizeSnapshotData(snapshotRecord);
          const resumeStep = extractResumeStepFromMeta(snapshotRecord.__meta);
          const contactEmailFromSnapshot = normalizedData.contactEmail;

          setFormData((prev) => ({
            ...prev,
            ...normalizedData,
            contactEmail: contactEmailFromSnapshot ?? prev.contactEmail
              ?? fallbackContactEmail
              ?? practiceRecord.businessEmail
              ?? ''
          }));

          if (!hasValidUrlStep) {
            if (localState.status === 'completed') {
              goToStep('review-and-launch');
            } else if (resumeStep) {
              goToStep(resumeStep);
            }
          }
        } else {
          setFormData((prev) => ({
            ...prev,
            firmName: practiceRecord.name || prev.firmName,
            contactEmail: practiceRecord.businessEmail ?? prev.contactEmail ?? fallbackContactEmail ?? '',
            slug: practiceRecord.slug ?? prev.slug,
            contactPhone: practiceRecord.businessPhone || prev.contactPhone,
            website: practiceRecord.website ?? prev.website,
            profileImage: typeof practiceRecord.logo === 'string' ? practiceRecord.logo : prev.profileImage,
            addressLine1: practiceRecord.addressLine1 ?? prev.addressLine1,
            addressLine2: practiceRecord.addressLine2 ?? prev.addressLine2,
            city: practiceRecord.city ?? prev.city,
            state: practiceRecord.state ?? prev.state,
            postalCode: practiceRecord.postalCode ?? prev.postalCode,
            country: practiceRecord.country ?? prev.country,
            introMessage: practiceRecord.introMessage ?? prev.introMessage,
            description: practiceRecord.description ?? prev.description,
            isPublic: typeof practiceRecord.isPublic === 'boolean' ? practiceRecord.isPublic : prev.isPublic,
            consultationFee: practiceRecord.consultationFee === undefined
              ? prev.consultationFee
              : practiceRecord.consultationFee
          }));

          if (localState?.status === 'completed' && !hasValidUrlStep) {
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
    practiceId,
    fallbackContactEmail,
    setFormData,
    goToStep,
    currentStepFromUrl,
    fetchStripeStatus,
    organizationId
  ]);

  // useStepValidation already initialized above

  const handleStepContinue = useCallback(async () => {
    if (isLoadingData) {
      return; // Block interactions until saved data load finishes
    }
    clearErrors();
    setSubmitError(null);
    setLoading(true);

    // Validate current step before proceeding
    const validationError = validateStep(currentStep, formData);
    if (validationError) {
      showError('Check your details', validationError);
      setLoading(false);
      return;
    }

    if (currentStep === 'stripe-onboarding' && !stripeStatus?.details_submitted) {
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

    const resumeStep = isLastStep ? currentStep : getAdjacentStep(currentStep, 1);

    // Save current step data before navigation (explicit save)
    const saveError = await saveOnboardingData(
      formData,
      resumeStep,
      isLastStep ? 'completed' : undefined,
      currentStep
    );
    if (saveError) {
      console.warn('[ONBOARDING][CONTINUE] Failed to save before navigation:', saveError);
      setSubmitError(saveError);
    }
    if (saveError && !isLastStep) {
      showError('Save failed', saveError);
      setLoading(false);
      return;
    }
    if (isLastStep) {
      if (saveError) {
        setLoading(false);
        return;
      }
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
    setLoading(false);
  }, [
    clearErrors,
    currentStep,
    formData,
    getAdjacentStep,
    goNext,
    isLastStep,
    isLoadingData,
    onClose,
    onCompleted,
    saveOnboardingData,
    showError,
    showSuccess,
    startStripeOnboarding,
    stripeStatus,
    validateStep
  ]);

  const handleBack = useCallback(async () => {
    if (isLoadingData) {
      return; // Block interactions until saved data load finishes
    }
    if (isFirstStep) {
      onClose();
      return;
    }
    
    const resumeStep = getAdjacentStep(currentStep, -1);

    // Save current step data before navigation (explicit save)
    const saveError = await saveOnboardingData(formData, resumeStep, undefined, currentStep);
    if (saveError) {
      console.warn('[ONBOARDING][BACK] Failed to save before navigation:', saveError);
      setSubmitError(saveError);
    }
    
    goBack();
    clearErrors();
    setSubmitError(null);
  }, [
    clearErrors,
    currentStep,
    formData,
    getAdjacentStep,
    goBack,
    isFirstStep,
    isLoadingData,
    onClose,
    saveOnboardingData
  ]);


  const handleClose = () => {
    onClose();
  };

  const actionLoading = loading || isLoadingData || stripeRequestPending;

  if (!isOpen) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} type="fullscreen" showCloseButton={true}>
      <OnboardingContainer
        loading={actionLoading}
        error={submitError}
        footer={footerContent}
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
          practiceSlug={practiceSlug || practiceName?.toLowerCase().replace(/\s+/g, '-') || 'your-firm'}
          disabled={isLoadingData}
          stripeStatus={stripeStatus}
          stripeClientSecret={null}
          stripeLoading={loading || stripeRequestPending}
          onFooterChange={setFooterContent}
          actionLoading={actionLoading}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
        />
            
      </OnboardingContainer>
    </Modal>
  );
};

export default BusinessOnboardingModal;
