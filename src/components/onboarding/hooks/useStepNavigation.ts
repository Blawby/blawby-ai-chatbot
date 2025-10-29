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

export const useStepNavigation = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = STEP_ORDER[currentStepIndex];
  const totalSteps = STEP_ORDER.length;

  const goNext = useCallback(() => {
    setCurrentStepIndex(prev => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const goBack = useCallback(() => {
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: OnboardingStep) => {
    const stepIndex = STEP_ORDER.indexOf(step);
    if (stepIndex !== -1) {
      setCurrentStepIndex(stepIndex);
    }
  }, []);

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
