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
    const nextStepIndex = Math.min(currentStepIndex + 1, totalSteps - 1);
    const nextStep = STEP_ORDER[nextStepIndex];
    
    // Call onStepChange callback before updating step
    if (onStepChange && nextStep !== currentStep) {
      void Promise.resolve(onStepChange(nextStep, currentStep)).catch(() => {
        // Silently handle errors here - they're handled by the auto-save hook
      });
    }
    
    setCurrentStepIndex(nextStepIndex);
  }, [currentStepIndex, totalSteps, currentStep, onStepChange]);

  const goBack = useCallback(() => {
    const prevStepIndex = Math.max(currentStepIndex - 1, 0);
    const prevStep = STEP_ORDER[prevStepIndex];
    
    // Call onStepChange callback before updating step
    if (onStepChange && prevStep !== currentStep) {
      void Promise.resolve(onStepChange(prevStep, currentStep)).catch(() => {
        // Silently handle errors here - they're handled by the auto-save hook
      });
    }
    
    setCurrentStepIndex(prevStepIndex);
  }, [currentStepIndex, currentStep, onStepChange]);

  const goToStep = useCallback((step: OnboardingStep) => {
    const stepIndex = STEP_ORDER.indexOf(step);
    if (stepIndex !== -1 && stepIndex !== currentStepIndex) {
      // Call onStepChange callback before updating step
      if (onStepChange) {
        void Promise.resolve(onStepChange(step, currentStep)).catch(() => {
          // Silently handle errors here - they're handled by the auto-save hook
        });
      }
      
      setCurrentStepIndex(stepIndex);
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
