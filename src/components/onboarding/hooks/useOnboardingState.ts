/**
 * useOnboardingState - Custom Hook
 * 
 * Manages form data state for onboarding flow.
 * Provides methods to update individual fields or multiple fields at once.
 */

import { useState, useCallback } from 'preact/hooks';

// SSR-safe ID generator using timestamp + counter
let idCounter = 0;
const generateServiceId = () => {
  const timestamp = Date.now();
  const counter = ++idCounter;
  return `service-${timestamp}-${counter}`;
};

export interface OnboardingFormData {
  // Firm basics
  firmName: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
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
  services: Array<{ id: string; title: string; description: string }>;
}

const initialFormData: OnboardingFormData = {
  firmName: '',
  contactEmail: '',
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

export const useOnboardingState = (
  initialData?: Partial<OnboardingFormData>,
  onSave?: (data: OnboardingFormData) => void | Promise<void>
) => {
  const [formData, setFormData] = useState<OnboardingFormData>(() => {
    const merged = { ...initialFormData, ...initialData };
    // Normalize services to ensure each has a stable ID
    merged.services = (merged.services || []).map(service => ({
      ...service,
      id: service.id || generateServiceId()
    }));
    return merged;
  });

  const updateField = useCallback(<K extends keyof OnboardingFormData>(
    field: K,
    value: OnboardingFormData[K]
  ) => {
    setFormData(prev => {
      const newState = {
        ...prev,
        [field]: value
      };
      // Trigger save callback if provided
      if (onSave) {
        void Promise.resolve(onSave(newState)).catch(() => {
          // Silently handle save errors here - they're handled by the auto-save hook
        });
      }
      return newState;
    });
  }, [onSave]);

  const updateFields = useCallback((updates: Partial<OnboardingFormData>) => {
    setFormData(prev => {
      const newState = {
        ...prev,
        ...updates
      };
      // Trigger save callback if provided
      if (onSave) {
        void Promise.resolve(onSave(newState)).catch(() => {
          // Silently handle save errors here - they're handled by the auto-save hook
        });
      }
      return newState;
    });
  }, [onSave]);

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
