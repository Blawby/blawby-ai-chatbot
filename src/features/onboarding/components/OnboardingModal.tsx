import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import Modal from '@/shared/components/Modal';
import PersonalInfoStep from './PersonalInfoStep';
import UseCaseStep from './UseCaseStep';
import { updateUser, getSession, useSession } from '@/shared/lib/authClient';
import type { OnboardingData } from '@/shared/types/user';
import { toOnboardingData, fromOnboardingData } from '@/shared/types/user';
import { useToastContext } from '@/shared/contexts/ToastContext';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: OnboardingData) => void;
}

type OnboardingStep = 'personal' | 'useCase';

const OnboardingModal = ({ isOpen, onClose, onComplete }: OnboardingModalProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('personal');
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    personalInfo: {
      fullName: '',
      birthday: '',
      agreedToTerms: false
    },
    useCase: {
      primaryUseCase: 'personal',
      additionalInfo: undefined
    },
    skippedSteps: []
  });
  const hasLoadedRef = useRef(false);

  // Load existing user data if available
  useEffect(() => {
    if (isOpen && session?.user && !hasLoadedRef.current) {
      // Load existing onboarding data from session if available
      // Note: session.user.onboardingData comes from database as string, but our type expects OnboardingData | null
      // We need to handle the type mismatch by treating it as the raw database value
      const rawOnboardingData = (session.user as Record<string, unknown>).onboardingData as string | null;
      const existingOnboardingData = toOnboardingData(rawOnboardingData);
      
      if (existingOnboardingData) {
        // If we have existing onboarding data, merge it into state
        setOnboardingData(prev => ({
          ...prev,
          ...existingOnboardingData,
          personalInfo: {
            ...prev.personalInfo,
            ...existingOnboardingData.personalInfo,
            birthday: existingOnboardingData.personalInfo?.birthday ?? ''
          }
        }));
      } else if (session.user.name) {
        // Otherwise, pre-fill with user's name if available
        setOnboardingData(prev => ({
          ...prev,
          personalInfo: {
            ...prev.personalInfo,
            fullName: session.user.name
          }
        }));
      }
      
      hasLoadedRef.current = true;
    } else if (!isOpen) {
      // Reset the ref when modal closes
      hasLoadedRef.current = false;
    }
  }, [isOpen, session?.user]);

  const handleStepComplete = async (step: OnboardingStep, data: Partial<OnboardingData>) => {
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

  const handleComplete = async (data?: OnboardingData) => {
    // Use provided data snapshot or fall back to current state
    const sourceData = data || onboardingData;
    const completedData = {
      ...sourceData,
      completedAt: new Date().toISOString()
    };

    try {
      // Save onboarding data to user preferences (single source of truth)
      await updateUser({
        onboardingCompleted: true,
        onboardingData: fromOnboardingData(completedData)
      } as Parameters<typeof updateUser>[0]);

      // Refresh session to get updated fields immediately (best-effort)
      // eslint-disable-next-line no-empty
      try { await getSession(); } catch {}

      // Legacy localStorage cache removed - server truth is used instead

      // Show success notification
      showSuccess(
        t('onboarding.completed.title', 'Onboarding Complete!'),
        t('onboarding.completed.message', 'Welcome to Blawby AI! Your preferences have been saved.')
      );

      onComplete(completedData);
      onClose();
    } catch (error) {
      // Log the error for debugging in development
      if (import.meta.env.DEV) {
         
        console.error('Failed to save onboarding data:', error);
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
            onBack={onClose}
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
