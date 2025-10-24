import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from '@/i18n/hooks';
import Modal from '../Modal';
import PersonalInfoStep from './PersonalInfoStep';
import UseCaseStep from './UseCaseStep';
// User profile updates are handled by the Blawby Backend API
import type { OnboardingData } from '../../types/user';
import { toOnboardingData, fromOnboardingData } from '../../types/user';
import { useToastContext } from '../../contexts/ToastContext';
import { useSession } from '../../contexts/AuthContext';

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
      birthday: undefined,
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
        setOnboardingData(prev => ({ ...prev, ...existingOnboardingData }));
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

  const handleSkip = async (step: OnboardingStep) => {
    // Compute merged snapshot locally to avoid stale state
    const mergedData = {
      ...onboardingData,
      skippedSteps: [...onboardingData.skippedSteps, step]
    };
    
    setOnboardingData(mergedData);

    if (step === 'useCase') {
      // Skip use case step and complete onboarding
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
      // TODO: When backend API supports user updates, implement proper API call
      // For now, store onboarding data locally since backend doesn't support user updates yet
      
      // Store onboarding data in localStorage as a temporary solution
      try {
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('onboardingData', JSON.stringify(completedData));
        
        // Also store user preferences that might be used by the app
        if (completedData.personalInfo?.fullName) {
          localStorage.setItem('userDisplayName', completedData.personalInfo.fullName);
        }
      } catch (storageError) {
        // Handle localStorage failures (private browsing, quota exceeded, etc.)
        if (import.meta.env.DEV) {
          console.warn('Failed to cache onboarding completion in localStorage:', storageError);
        }
        // Continue execution - this is just a cache, not critical
      }

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
            onSkip={async () => await handleSkip('useCase')}
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
      <div className="h-full bg-white dark:bg-dark-bg flex flex-col">
        {renderStep()}
      </div>
    </Modal>
  );
};

export default OnboardingModal;
