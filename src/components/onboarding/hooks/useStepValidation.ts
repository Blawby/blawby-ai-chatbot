/**
 * useStepValidation - Custom Hook
 * 
 * Validates current step data.
 * Provides validation methods and error state management.
 */

import { useState, useCallback } from 'preact/hooks';
import type { OnboardingFormData } from './useOnboardingState';

export type OnboardingStep = 
  | 'welcome'
  | 'firm-basics'
  | 'trust-account-intro'
  | 'stripe-onboarding'
  | 'business-details'
  | 'services'
  | 'review-and-launch';

export interface ValidationError {
  field: string;
  message: string;
}

export const useStepValidation = () => {
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const validateStep = useCallback((step: OnboardingStep, formData: OnboardingFormData): string | null => {
    const validationErrors: ValidationError[] = [];

    switch (step) {
      case 'firm-basics':
        if (!formData.firmName.trim()) {
          validationErrors.push({ field: 'firmName', message: 'Business name is required' });
        }
        if (!formData.contactEmail.trim()) {
          validationErrors.push({ field: 'contactEmail', message: 'Business email address is required' });
        }
        if (!formData.contactPhone.trim()) {
          validationErrors.push({ field: 'contactPhone', message: 'Business phone number is required' });
        }
        break;

      case 'business-details':
        // Business details are optional, no validation needed
        break;

      case 'services':
        // Services are optional, no validation needed
        break;

      case 'review-and-launch':
        // Final step validation - ensure all required fields are still present
        if (!formData.firmName.trim()) {
          validationErrors.push({ field: 'firmName', message: 'Business name is required' });
        }
        if (!formData.contactEmail.trim()) {
          validationErrors.push({ field: 'contactEmail', message: 'Business email address is required' });
        }
        if (!formData.contactPhone.trim()) {
          validationErrors.push({ field: 'contactPhone', message: 'Business phone number is required' });
        }
        break;

      default:
        // Other steps don't have required fields
        break;
    }

    setErrors(validationErrors);
    
    if (validationErrors.length > 0) {
      return validationErrors[0].message; // Return first error message
    }
    
    return null;
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const getFieldError = useCallback((field: string): string | undefined => {
    return errors.find(error => error.field === field)?.message;
  }, [errors]);

  const hasErrors = errors.length > 0;

  return {
    validateStep,
    clearErrors,
    getFieldError,
    errors,
    hasErrors
  };
};
