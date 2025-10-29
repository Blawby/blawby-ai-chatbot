/**
 * useOnboardingState - Custom Hook
 * 
 * Manages form data state for onboarding flow.
 * Provides methods to update individual fields or multiple fields at once.
 */

import { useState, useCallback } from 'preact/hooks';

export interface OnboardingFormData {
  // Firm basics
  firmName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  profileImage: string;
  
  // Business details
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  primaryColor: string;
  accentColor: string;
  introMessage: string;
  overview: string;
  isPublic: boolean;
  
  // Services
  services: Array<{ title: string; description: string }>;
}

const initialFormData: OnboardingFormData = {
  firmName: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  profileImage: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  primaryColor: '#2563eb',
  accentColor: '#3b82f6',
  introMessage: '',
  overview: '',
  isPublic: false,
  services: []
};

export const useOnboardingState = (initialData?: Partial<OnboardingFormData>) => {
  const [formData, setFormData] = useState<OnboardingFormData>({
    ...initialFormData,
    ...initialData
  });

  const updateField = useCallback(<K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const updateFields = useCallback((updates: Partial<OnboardingFormData>) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
  }, []);

  const setFormDataDirect = useCallback((data: OnboardingFormData) => {
    setFormData(data);
  }, []);

  return {
    formData,
    updateField,
    updateFields,
    resetForm,
    setFormData: setFormDataDirect
  };
};
