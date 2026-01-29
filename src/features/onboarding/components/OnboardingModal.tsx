import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import PersonalInfoStep from './PersonalInfoStep';
import UseCaseStep from './UseCaseStep';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getPreferencesCategory, updatePreferencesCategory } from '@/shared/lib/preferencesApi';
import { updateUser } from '@/shared/lib/authClient';
import type { OnboardingPreferences, ProductUsage } from '@/shared/types/preferences';
import type { OnboardingFormData } from '@/shared/types/onboarding';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: OnboardingFormData) => void;
}

type OnboardingStep = 'personal' | 'useCase';

const OnboardingModal = ({ isOpen, onClose, onComplete }: OnboardingModalProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();
  const { session } = useSessionContext();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('personal');
  const [onboardingData, setOnboardingData] = useState<OnboardingFormData>({
    personalInfo: {
      fullName: '',
      birthday: '',
      agreedToTerms: false
    },
    useCase: {
      primaryUseCase: 'messaging',
      productUsage: ['messaging'],
      additionalInfo: undefined
    }
  });
  const hasLoadedRef = useRef(false);
  const resolvePrimaryUseCase = (value: string | undefined): OnboardingFormData['useCase']['primaryUseCase'] => {
    switch (value) {
      case 'messaging':
      case 'legal_payments':
      case 'matter_management':
      case 'intake_forms':
      case 'other':
        return value;
      case 'personal':
        return 'messaging';
      case 'business':
        return 'legal_payments';
      case 'research':
        return 'matter_management';
      case 'documents':
        return 'intake_forms';
      default:
        return 'other';
    }
  };

  const normalizeProductUsage = (values: unknown): ProductUsage[] => {
    if (!Array.isArray(values)) return [];
    const mapped = values.map((value) => {
      switch (value) {
        case 'messaging':
        case 'legal_payments':
        case 'matter_management':
        case 'intake_forms':
        case 'other':
          return value;
        case 'communication':
          return 'messaging';
        case 'billing':
          return 'legal_payments';
        case 'case_management':
          return 'matter_management';
        case 'document_management':
        case 'client_management':
          return 'intake_forms';
        default:
          return null;
      }
    }).filter((value): value is ProductUsage => value !== null);
    return Array.from(new Set(mapped));
  };

  // Load existing user data if available
  useEffect(() => {
    if (isOpen && session?.user && !hasLoadedRef.current) {
      const loadPreferences = async () => {
        try {
          const prefs = await getPreferencesCategory<OnboardingPreferences>('onboarding');
          setOnboardingData(prev => ({
            personalInfo: {
              ...prev.personalInfo,
              fullName: session.user.name || prev.personalInfo.fullName,
              birthday: prefs?.birthday ?? ''
            },
            useCase: {
              primaryUseCase: prefs?.primary_use_case
                ? resolvePrimaryUseCase(prefs.primary_use_case)
                : prev.useCase.primaryUseCase,
              productUsage: (() => {
                const fromPrefs = normalizeProductUsage(prefs?.product_usage);
                if (fromPrefs.length > 0) return fromPrefs;
                if (prefs?.primary_use_case) return [resolvePrimaryUseCase(prefs.primary_use_case)];
                return prev.useCase.productUsage;
              })(),
              additionalInfo: prefs?.use_case_additional_info ?? prev.useCase.additionalInfo
            }
          }));
        } catch (error) {
          console.error('Failed to load onboarding preferences:', error);
        } finally {
          hasLoadedRef.current = true;
        }
      };

      void loadPreferences();
    } else if (!isOpen) {
      // Reset the ref when modal closes
      hasLoadedRef.current = false;
    }
  }, [isOpen, session?.user]);

  const handleStepComplete = async (step: OnboardingStep, data: Partial<OnboardingFormData>) => {
    // Compute merged snapshot locally to avoid stale state
    const mergedData = {
      ...onboardingData,
      ...data
    };
    
    setOnboardingData(mergedData);

    if (step === 'personal') {
      setCurrentStep('useCase');
    } else if (step === 'useCase') {
      // After use case step, complete onboarding and redirect to main app
      await handleComplete(mergedData);
    }
  };

  const handleComplete = async (data?: OnboardingFormData) => {
    // Use provided data snapshot or fall back to current state
    const sourceData = data || onboardingData;

    try {
      if (import.meta.env.DEV) {
        console.debug('[ONBOARDING][SAVE] updating onboarding preferences');
      }

      if (sourceData.personalInfo.fullName.trim()) {
        await updateUser({ name: sourceData.personalInfo.fullName.trim() });
      }

      await updatePreferencesCategory('onboarding', {
        birthday: sourceData.personalInfo.birthday,
        primary_use_case: sourceData.useCase.primaryUseCase,
        use_case_additional_info: sourceData.useCase.additionalInfo,
        product_usage: sourceData.useCase.productUsage,
        completed: true
      });

      // Legacy localStorage cache removed - server truth is used instead

      // Show success notification
      showSuccess(
        t('onboarding.completed.title', 'Onboarding Complete!'),
        t('onboarding.completed.message', 'Welcome to Blawby AI! Your preferences have been saved.')
      );

      onComplete(sourceData);
      onClose();
    } catch (error) {
      // Log the error for debugging in development
      if (import.meta.env.DEV) {
         
        console.error('[ONBOARDING][SAVE] failed to save onboarding data', error);
      }
      
      // Show error notification to user
      showError(
        t('onboarding.error.title', 'Save Failed'),
        t('onboarding.error.message', 'Unable to save your onboarding data. Please try again.')
      );
      
      // Don't close the modal or call onComplete - keep state consistent
      // User can retry by completing the step again
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'personal':
        return (
          <PersonalInfoStep
            data={onboardingData.personalInfo}
            onComplete={async (data) => await handleStepComplete('personal', { personalInfo: data })}
          />
        );
      case 'useCase':
        return (
          <UseCaseStep
            data={onboardingData.useCase}
            onComplete={async (data) => await handleStepComplete('useCase', { useCase: data })}
          />
        );
      default:
        return null;
    }
  };

  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="fullscreen"
      showCloseButton={false}
    >
      <div className="h-full bg-white dark:bg-dark-bg flex flex-col" data-testid="onboarding-modal">
        {renderStep()}
      </div>
    </Modal>
  );
};

export default OnboardingModal;
