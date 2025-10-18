import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from '@/i18n/hooks';
import Modal from '../Modal';
import PersonalInfoStep from './PersonalInfoStep';
import UseCaseStep from './UseCaseStep';
import { mockUserDataService, OnboardingData } from '../../utils/mockUserData';
import { useToastContext } from '../../contexts/ToastContext';
import { authClient } from '../../lib/authClient';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: OnboardingData) => void;
}

type OnboardingStep = 'personal' | 'useCase';

const OnboardingModal = ({ isOpen, onClose, onComplete }: OnboardingModalProps) => {
  const { t } = useTranslation('common');
  const { showError, showSuccess } = useToastContext();
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

  // Load existing user data if available
  useEffect(() => {
    if (isOpen) {
      const loadUserData = async () => {
        try {
          // Get real user data from Better Auth session
          const session = await authClient.getSession();
          if (session?.data?.user?.name) {
            setOnboardingData(prev => ({
              ...prev,
              personalInfo: {
                ...prev.personalInfo,
                fullName: session.data.user.name
              }
            }));
          }
        } catch (error) {
          // Fallback to mock data if session fails
          console.warn('Failed to load user session for onboarding:', error);
          const userProfile = mockUserDataService.getUserProfile();
          if (userProfile.name) {
            setOnboardingData(prev => ({
              ...prev,
              personalInfo: {
                ...prev.personalInfo,
                fullName: userProfile.name
              }
            }));
          }
        }
      };
      
      loadUserData();
    }
  }, [isOpen]);

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
      // Save onboarding data to user preferences (single source of truth)
      mockUserDataService.setPreferences({
        onboardingCompleted: true,
        onboardingData: completedData
      });

      // Cache the completion status in localStorage for quick access
      // This is just a cache, not the source of truth
      try {
        localStorage.setItem('onboardingCompleted', 'true');
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
