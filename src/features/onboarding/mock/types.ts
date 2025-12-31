import type { DebugEvent } from '@/features/chat/mock/types';
import type { OnboardingFormData } from '@/features/onboarding/hooks';
import type { StripeConnectStatus } from '@/features/onboarding/types';

export type MockScenario =
  | 'welcome'
  | 'firm-basics'
  | 'trust-account-intro'
  | 'stripe-onboarding'
  | 'business-details'
  | 'services'
  | 'review-and-launch'
  | 'settings-practice'
  | 'settings-services'
  | 'settings-team';

export interface MockOnboardingState {
  scenario: MockScenario;
  onboardingData: OnboardingFormData;
  stripeStatus: StripeConnectStatus | null;
  stripeClientSecret: string | null;
  practiceLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

export type { DebugEvent };

export interface UseMockOnboardingResult {
  state: MockOnboardingState;
  debugEvents: DebugEvent[];
  setScenario: (scenario: MockScenario) => void;
  updateOnboardingData: (updates: Partial<OnboardingFormData>) => void;
  updateServices: (services: OnboardingFormData['services']) => void;
  setStripeStatus: (status: StripeConnectStatus | null) => void;
  setStripeClientSecret: (clientSecret: string | null) => void;
  reset: () => void;
  clearDebugEvents: () => void;
  addDebugEvent: (type: string, data?: Record<string, unknown>) => void;
}
