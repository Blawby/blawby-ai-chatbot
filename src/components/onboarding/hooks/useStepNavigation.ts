/**
 * useStepNavigation - Custom Hook
 * 
 * Manages current step index and navigation.
 * Provides step progression and validation.
 */

import { useState, useCallback } from 'preact/hooks';
import type { OnboardingStep } from './useStepValidation';

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'firm-basics',
  'trust-account-intro',
  'stripe-onboarding',
  'business-details',
  'services',
  'review-and-launch'
];

export const useStepNavigation = (
  onStepChange?: (step: OnboardingStep, prevStep: OnboardingStep) => void | Promise<void>
) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = STEP_ORDER[currentStepIndex];
  const totalSteps = STEP_ORDER.length;

  const goNext = useCallback(() => {
    const nextStepIndex = Math.min(currentStepIndex + 1, STEP_ORDER.length - 1);
    const nextStep = STEP_ORDER[nextStepIndex];
    
    // Call onStepChange callback before updating step
    if (onStepChange && nextStep !== currentStep) {
      (async () => {
        try {
          await Promise.resolve(onStepChange(nextStep, currentStep));
          setCurrentStepIndex(nextStepIndex);
        } catch (error) {
          console.error('Error in goNext onStepChange:', error);
          // Prevent advancing on error - state update is skipped
        }
      })();
    } else {
      setCurrentStepIndex(nextStepIndex);
    }
  }, [currentStepIndex, currentStep, onStepChange]);

  const goBack = useCallback(() => {
    const prevStepIndex = Math.max(currentStepIndex - 1, 0);
    const prevStep = STEP_ORDER[prevStepIndex];
    
    // Call onStepChange callback before updating step
    if (onStepChange && prevStep !== currentStep) {
      (async () => {
        try {
          await Promise.resolve(onStepChange(prevStep, currentStep));
          setCurrentStepIndex(prevStepIndex);
        } catch (error) {
          console.error('Error in goBack onStepChange:', error);
          // Prevent going back on error - state update is skipped
        }
      })();
    } else {
      setCurrentStepIndex(prevStepIndex);
    }
  }, [currentStepIndex, currentStep, onStepChange]);

  const goToStep = useCallback((step: OnboardingStep) => {
    const stepIndex = STEP_ORDER.indexOf(step);
    if (stepIndex !== -1 && stepIndex !== currentStepIndex) {
      // Call onStepChange callback before updating step
      if (onStepChange) {
        (async () => {
          try {
            // Capture initial state for callback
            const initialIndex = currentStepIndex;
            const initialStep = STEP_ORDER[initialIndex];
            const targetIndex = STEP_ORDER.indexOf(step);
            
            // Validate transition is still valid before awaiting callback
            if (targetIndex !== -1 && targetIndex !== initialIndex) {
              await Promise.resolve(onStepChange(step, initialStep));
              
              // Re-check validity after async operation completes using state updater
              setCurrentStepIndex((latestIndex) => {
                const latestTargetIndex = STEP_ORDER.indexOf(step);
                // Only update if transition is still valid
                if (latestTargetIndex !== -1 && latestTargetIndex !== latestIndex) {
                  return latestTargetIndex;
                }
                // Return current state if transition is no longer valid
                return latestIndex;
              });
            }
          } catch (error) {
            console.error('Error in goToStep onStepChange:', error);
            // Prevent transition on error - state update is skipped
          }
        })();
      } else {
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [currentStepIndex, currentStep, onStepChange]);

  const canGoNext = currentStepIndex < totalSteps - 1;
  const canGoBack = currentStepIndex > 0;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const progress = {
    current: currentStepIndex + 1,
    total: totalSteps,
    percentage: Math.round(((currentStepIndex + 1) / totalSteps) * 100)
  };

  return {
    currentStep,
    currentStepIndex,
    totalSteps,
    goNext,
    goBack,
    goToStep,
    canGoNext,
    canGoBack,
    isFirstStep,
    isLastStep,
    progress
  };
};
