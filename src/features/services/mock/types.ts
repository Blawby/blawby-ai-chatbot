import type { DebugEvent } from '@/features/chat/mock/types';

export interface Service {
  id: string;
  title: string;
  description: string;
}

export interface MockServicesState {
  scenario: 'onboarding' | 'editing';
  services: Service[];
  practiceLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

export type { DebugEvent };

export interface UseMockServicesResult {
  state: MockServicesState;
  debugEvents: DebugEvent[];
  setScenario: (scenario: 'onboarding' | 'editing') => void;
  updateServices: (services: Service[]) => void;
  reset: () => void;
  clearDebugEvents: () => void;
  addDebugEvent: (type: string, data?: Record<string, unknown>) => void;
}

