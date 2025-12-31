import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type {
  DebugEvent,
  MockOnboardingState,
  MockScenario,
  UseMockOnboardingResult
} from './types';
import type { OnboardingFormData } from '@/features/onboarding/hooks';
import type { StripeConnectStatus } from '@/features/onboarding/types';

const mockServiceDetails: OnboardingFormData['services'] = [
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

const settingsScenarios = new Set<MockScenario>([
  'settings-practice',
  'settings-services',
  'settings-team'
]);

const initialStripeStatus: StripeConnectStatus = {
  practice_uuid: 'mock-practice-services',
  stripe_account_id: 'acct_mock123',
  charges_enabled: true,
  payouts_enabled: true,
  details_submitted: true
};

const randomId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const createInitialOnboardingData = (): OnboardingFormData => ({
  firmName: 'Mock Law Firm',
  contactEmail: 'owner@mock-law.test',
  contactPhone: '+1-555-0123',
  website: 'https://mocklawfirm.com',
  profileImage: '',
  addressLine1: '123 Main St',
  addressLine2: 'Suite 100',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94102',
  country: 'US',
  introMessage: 'Welcome to Mock Law Firm. How can we help you today?',
  overview: 'We provide excellent legal services and personalized client care.',
  isPublic: true,
  services: mockServiceDetails.map((service) => ({ ...service }))
});

export function useMockOnboarding(): UseMockOnboardingResult {
  const [state, setState] = useState<MockOnboardingState>(() => ({
    scenario: 'welcome',
    onboardingData: createInitialOnboardingData(),
    practiceLoaded: true,
    isLoading: false,
    stripeStatus: initialStripeStatus,
    stripeClientSecret: 'pi_mock_client_secret',
    error: null
  }));
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

  const setScenario = useCallback((scenario: MockScenario) => {
    addDebugEvent('scenario_changed', { scenario });
    setState((prev) => {
      const isSettingsScenario = settingsScenarios.has(scenario);
      return {
        ...prev,
        scenario,
        practiceLoaded: isSettingsScenario ? false : true,
        isLoading: isSettingsScenario,
        error: null
      };
    });
  }, [addDebugEvent]);

  useEffect(() => {
    if (settingsScenarios.has(state.scenario) && !state.practiceLoaded && state.isLoading) {
      const timer = setTimeout(() => {
        addDebugEvent('practice_loaded', { scenario: state.scenario });
        setState((prev) => ({
          ...prev,
          practiceLoaded: true,
          isLoading: false
        }));
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.scenario, state.practiceLoaded, state.isLoading, addDebugEvent]);

  const updateOnboardingData = useCallback((updates: Partial<OnboardingFormData>) => {
    setState((prev) => ({
      ...prev,
      onboardingData: { ...prev.onboardingData, ...updates }
    }));
  }, []);

  const updateServices = useCallback((services: OnboardingFormData['services']) => {
    addDebugEvent('services_updated', { count: services.length });
    setState((prev) => ({
      ...prev,
      onboardingData: { ...prev.onboardingData, services }
    }));
  }, [addDebugEvent]);

  const setStripeStatus = useCallback((status: StripeConnectStatus | null) => {
    addDebugEvent('stripe_status_updated', { status });
    setState((prev) => ({ ...prev, stripeStatus: status }));
  }, [addDebugEvent]);

  const setStripeClientSecret = useCallback((clientSecret: string | null) => {
    addDebugEvent('stripe_client_secret_updated', { clientSecret: clientSecret ? 'set' : 'cleared' });
    setState((prev) => ({ ...prev, stripeClientSecret: clientSecret }));
  }, [addDebugEvent]);

  const reset = useCallback(() => {
    addDebugEvent('reset');
    setState({
      scenario: 'welcome',
      onboardingData: createInitialOnboardingData(),
      practiceLoaded: true,
      isLoading: false,
      stripeStatus: initialStripeStatus,
      stripeClientSecret: 'pi_mock_client_secret',
      error: null
    });
  }, [addDebugEvent]);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  return useMemo(() => ({
    state,
    debugEvents,
    setScenario,
    updateOnboardingData,
    updateServices,
    reset,
    clearDebugEvents,
    addDebugEvent,
    setStripeStatus,
    setStripeClientSecret
  }), [
    state,
    debugEvents,
    setScenario,
    updateOnboardingData,
    updateServices,
    reset,
    clearDebugEvents,
    addDebugEvent,
    setStripeStatus,
    setStripeClientSecret
  ]);
}
