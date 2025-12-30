import type { DebugEvent } from '@/features/chat/mock/types';
import type { Service } from '@/features/services/types';

export interface MockServicesState {
  scenario: 'onboarding' | 'editing';
  services: Service[];
  practiceLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

export type { DebugEvent };
export type { Service };

export interface UseMockServicesResult {
  state: MockServicesState;
  debugEvents: DebugEvent[];
  setScenario: (scenario: 'onboarding' | 'editing') => void;
  updateServices: (services: Service[]) => void;
  reset: () => void;
  clearDebugEvents: () => void;
  addDebugEvent: (type: string, data?: Record<string, unknown>) => void;
}
