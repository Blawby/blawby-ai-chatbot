import type { FormData } from '@/shared/ui/form';

export interface OnboardingPersonalInfo extends FormData {
  fullName: string;
  birthday?: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}

export const sanitizeOnboardingPersonalInfo = (info: OnboardingPersonalInfo) => ({
  ...info,
  password: info.password ? '<redacted>' : '',
  confirmPassword: info.confirmPassword ? '<redacted>' : ''
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
