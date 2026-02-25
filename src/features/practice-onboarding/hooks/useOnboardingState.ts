/**
 * useOnboardingState - Centralized state management for practice onboarding
 *
 * Extracts state management logic from PracticeSetup component
 * to provide a single source of truth for onboarding data.
 */

import { useState, useCallback, useMemo } from 'preact/hooks';
import type { ExtractedFields } from '../types/onboardingFields';

export interface OnboardingState {
  // Chat state
  isLoading: boolean;
  extracted: ExtractedFields;
  pendingSave: ExtractedFields | null;
  isSaving: boolean;
  saveError: string | null;
  scanStatusText: string | null;
  
  // Modal state
  basicsModalOpen: boolean;
  contactModalOpen: boolean;
  isModalSaving: boolean;
  
  // Form drafts
  basicsDraft: {
    name: string;
    slug: string;
    introMessage: string;
    accentColor: string;
  };
  contactDraft: {
    website: string;
    businessEmail: string;
    businessPhone: string;
    address?: {
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
}

export interface OnboardingActions {
  setIsLoading: (loading: boolean) => void;
  setExtracted: (fields: ExtractedFields) => void;
  setPendingSave: (fields: ExtractedFields | null) => void;
  setIsSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  setScanStatusText: (text: string | null) => void;
  
  // Modal actions
  setBasicsModalOpen: (open: boolean) => void;
  setContactModalOpen: (open: boolean) => void;
  setIsModalSaving: (saving: boolean) => void;
  
  // Draft actions
  setBasicsDraft: (draft: OnboardingState['basicsDraft']) => void;
  setContactDraft: (draft: OnboardingState['contactDraft']) => void;
}

const initialState: OnboardingState = {
  // Chat state
  isLoading: false,
  extracted: {},
  pendingSave: null,
  isSaving: false,
  saveError: null,
  scanStatusText: null,
  
  // Modal state
  basicsModalOpen: false,
  contactModalOpen: false,
  isModalSaving: false,
  
  // Form drafts
  basicsDraft: {
    name: '',
    slug: '',
    introMessage: '',
    accentColor: '#D4AF37',
  },
  contactDraft: {
    website: '',
    businessEmail: '',
    businessPhone: '',
    address: undefined,
  },
};

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(initialState);

  const actions = useMemo<OnboardingActions>(() => ({
    setIsLoading: (loading) => setState(prev => ({ ...prev, isLoading: loading })),
    setExtracted: (extracted) => setState(prev => ({ ...prev, extracted })),
    setPendingSave: (pendingSave) => setState(prev => ({ ...prev, pendingSave })),
    setIsSaving: (isSaving) => setState(prev => ({ ...prev, isSaving })),
    setSaveError: (saveError) => setState(prev => ({ ...prev, saveError })),
    setScanStatusText: (scanStatusText) => setState(prev => ({ ...prev, scanStatusText })),
    
    setBasicsModalOpen: (basicsModalOpen) => setState(prev => ({ ...prev, basicsModalOpen })),
    setContactModalOpen: (contactModalOpen) => setState(prev => ({ ...prev, contactModalOpen })),
    setIsModalSaving: (isModalSaving) => setState(prev => ({ ...prev, isModalSaving })),
    
    setBasicsDraft: (basicsDraft) => setState(prev => ({ ...prev, basicsDraft })),
    setContactDraft: (contactDraft) => setState(prev => ({ ...prev, contactDraft })),
  }), []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    actions,
    resetState,
  };
};
