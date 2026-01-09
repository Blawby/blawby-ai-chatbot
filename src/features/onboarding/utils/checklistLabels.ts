import { ONBOARDING_STEP_SEQUENCE } from '@/shared/utils/practiceOnboarding';
import type { OnboardingStep } from '@/features/onboarding/hooks/useStepValidation';

export const CHECKLIST_STEP_ORDER: OnboardingStep[] = [
  'firm-basics',
  'stripe-onboarding',
  'business-details',
  'services',
  'review-and-launch'
];

export const validateChecklistLabels = (
  labels: Partial<Record<OnboardingStep, string>>,
  expectedSteps: OnboardingStep[] = CHECKLIST_STEP_ORDER,
  context: string
): void => {
  const missing = expectedSteps.filter((step) => !labels[step]);
  if (missing.length === 0) {
    return;
  }

  const formatted = missing.map((step) => `'${step}'`).join(', ');
  const fallback = expectedSteps.length === ONBOARDING_STEP_SEQUENCE.length
    ? 'ONBOARDING_STEP_SEQUENCE'
    : expectedSteps.join(', ');

  const message = `[${context}] Checklist labels missing for: ${formatted}. Expected steps (${fallback}).`;
  if (typeof globalThis === 'object' && typeof globalThis?.console?.warn === 'function') {
    globalThis.console.warn(message);
  } else {
    console.warn(message);
  }
};
