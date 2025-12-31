import { useState, useCallback, useEffect } from 'preact/hooks';
import type { UseMockServicesResult, MockServicesState, Service, DebugEvent } from './types';

const initialOnboardingServices: Service[] = [];

const initialEditingServices: Service[] = [
  {
    id: 'service-1',
    title: 'Personal Injury',
    description: 'Representation for accident victims seeking compensation.'
  },
  {
    id: 'service-2',
    title: 'Family Law',
    description: 'Divorce, custody, and family matters.'
  },
  {
    id: 'service-3',
    title: 'Business Law',
    description: 'Corporate formation, contracts, and compliance.'
  },
  {
    id: 'service-4',
    title: 'Small Business and Nonprofits',
    description: 'Legal support for small businesses and nonprofit leaders.'
  },
  {
    id: 'service-5',
    title: 'Employment Law',
    description: 'Workplace rights and employment dispute assistance.'
  },
  {
    id: 'service-6',
    title: 'Tenant Rights',
    description: 'Support for housing disputes and tenant protections.'
  },
  {
    id: 'service-7',
    title: 'Probate and Estate Planning',
    description: 'Estate planning and administration services.'
  },
  {
    id: 'service-8',
    title: 'Special Education and IEP Advocacy',
    description: 'Guidance for IEP planning and education rights.'
  }
];

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useMockServices(): UseMockServicesResult {
  const [state, setState] = useState<MockServicesState>({
    scenario: 'onboarding',
    services: initialOnboardingServices,
    practiceLoaded: false,
    isLoading: false,
    error: null
  });

  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  const addDebugEvent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    setDebugEvents((events) => [
      {
        id: randomId('event'),
        type,
        data,
        timestamp: new Date().toISOString()
      },
      ...events
    ]);
  }, []);

  const setScenario = useCallback((scenario: 'onboarding' | 'editing') => {
    addDebugEvent('scenario_changed', { scenario });
    setState((prev) => ({
      ...prev,
      scenario,
      services: scenario === 'onboarding' ? initialOnboardingServices : initialEditingServices,
      practiceLoaded: scenario === 'onboarding', // Onboarding doesn't need practice loaded
      isLoading: scenario === 'editing' // Start loading for editing scenario
    }));
  }, [addDebugEvent]);

  // Simulate practice loading for editing scenario
  useEffect(() => {
    if (state.scenario === 'editing' && !state.practiceLoaded && state.isLoading) {
      const timer = setTimeout(() => {
        addDebugEvent('practice_loaded', { scenario: 'editing' });
        setState((prev) => ({
          ...prev,
          practiceLoaded: true,
          isLoading: false
        }));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.scenario, state.practiceLoaded, state.isLoading, addDebugEvent]);

  const updateServices = useCallback((services: Service[]) => {
    addDebugEvent('services_updated', { count: services.length });
    setState((prev) => ({
      ...prev,
      services
    }));
  }, [addDebugEvent]);

  const reset = useCallback(() => {
    addDebugEvent('reset');
    setState({
      scenario: 'onboarding',
      services: initialOnboardingServices,
      practiceLoaded: false,
      isLoading: false,
      error: null
    });
  }, [addDebugEvent]);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  return {
    state,
    debugEvents,
    setScenario,
    updateServices,
    reset,
    clearDebugEvents,
    addDebugEvent
  };
}
