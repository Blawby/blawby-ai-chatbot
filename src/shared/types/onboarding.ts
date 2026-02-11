import type { FormData } from '@/shared/ui/form';

export interface OnboardingPersonalInfo extends FormData {
  fullName: string;
  birthday?: string;
  agreedToTerms: boolean;
}

export const sanitizeOnboardingPersonalInfo = (info: OnboardingPersonalInfo) => ({
  ...info
});

export type OnboardingPrimaryUseCase =
  | 'messaging'
  | 'legal_payments'
  | 'matter_management'
  | 'intake_forms'
  | 'other';

export interface OnboardingUseCase {
  primaryUseCase: OnboardingPrimaryUseCase;
  productUsage: OnboardingPrimaryUseCase[];
  additionalInfo?: string;
}

export interface OnboardingFormData {
  personalInfo: OnboardingPersonalInfo;
  useCase: OnboardingUseCase;
}
