import type { FormData } from '@/shared/ui/form';

export interface OnboardingPersonalInfo extends FormData {
  fullName: string;
  birthday?: string;
  agreedToTerms: boolean;
}

export type OnboardingPrimaryUseCase =
  | 'personal'
  | 'business'
  | 'research'
  | 'documents'
  | 'other';

export interface OnboardingUseCase {
  primaryUseCase: OnboardingPrimaryUseCase;
  additionalInfo?: string;
}

export interface OnboardingFormData {
  personalInfo: OnboardingPersonalInfo;
  useCase: OnboardingUseCase;
}
