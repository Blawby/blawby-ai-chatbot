import { useEffect, useState } from 'preact/hooks';
import { ServicesStep } from '@/features/onboarding/steps/ServicesStep';
import { PracticePage } from '@/features/settings/pages/PracticePage';
import { PracticeServicesPage } from '@/features/settings/pages/PracticeServicesPage';
import { PracticeTeamPage } from '@/features/settings/pages/PracticeTeamPage';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider } from '@/shared/contexts/SessionContext';
import { apiClient } from '@/shared/lib/apiClient';
import { authClient } from '@/shared/lib/authClient';
import type { Practice } from '@/shared/lib/apiClient';
import { useMockServices } from '@/features/services/mock/useMockServices';
import { MockServicesControls } from '@/features/services/mock/components/MockServicesControls';
import { MockServicesInfo } from '@/features/services/mock/components/MockServicesInfo';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';

// Mock practice data - reflects exact state after completing onboarding + Stripe
const MOCK_PRACTICE_ID = 'mock-practice-services';
const onboardingCompletedAt = Date.now() - 1000 * 60 * 60 * 24 * 20; // 20 days ago
const mockServiceDetails = [
  {
    id: 'service-1',
    title: 'Personal Injury',
    description: 'Representation for accident victims seeking compensation'
  },
  {
    id: 'service-2',
    title: 'Family Law',
    description: 'Divorce, custody, and family matters'
  },
  {
    id: 'service-3',
    title: 'Business Law',
    description: 'Corporate formation, contracts, and compliance'
  },
  {
    id: 'service-4',
    title: 'Small Business and Nonprofits',
    description: 'Legal support for small businesses and nonprofit leaders.'
  },
  {
    id: 'service-5',
    title: 'Employment Law',
    description: 'Protect your rights in the workplace.'
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

const mockPractice: Practice = {
  id: MOCK_PRACTICE_ID,
  slug: 'mock-law-firm',
  name: 'Mock Law Firm',
  description: 'A mock practice for comparing onboarding and settings UI',
  kind: 'business',
  subscriptionStatus: 'active', // Active after Stripe onboarding
  subscriptionTier: 'business',
  seats: 3,
  subscriptionPeriodEnd: Date.now() / 1000 + (30 * 24 * 60 * 60), // 30 days from now
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 days ago
  updatedAt: new Date().toISOString(),
  businessEmail: 'owner@mock-law.test',
  businessPhone: '+1-555-0123',
  logo: null,
  businessOnboardingStatus: 'completed', // Completed onboarding
  businessOnboardingCompletedAt: onboardingCompletedAt,
  businessOnboardingSkipped: false,
  businessOnboardingHasDraft: false,
  config: {
    ownerEmail: 'owner@mock-law.test',
    profileImage: null,
    introMessage: 'Welcome to Mock Law Firm. How can we help you today?',
    description: 'We provide excellent legal services',
    availableServices: [
      'Personal Injury',
      'Family Law',
      'Business Law',
      'Small Business and Nonprofits',
      'Employment Law',
      'Tenant Rights',
      'Probate and Estate Planning',
      'Special Education and IEP Advocacy'
    ],
    serviceQuestions: {},
    brandColor: '#2563eb',
    accentColor: '#3b82f6',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    }
  },
  metadata: {
    conversationConfig: {
      ownerEmail: 'owner@mock-law.test',
      introMessage: 'Welcome to Mock Law Firm. How can we help you today?',
      description: 'We provide excellent legal services',
      availableServices: [
        'Personal Injury',
        'Family Law',
        'Business Law',
        'Small Business and Nonprofits',
        'Employment Law',
        'Tenant Rights',
        'Probate and Estate Planning',
        'Special Education and IEP Advocacy'
      ],
      serviceQuestions: {},
      domain: '',
      brandColor: '#2563eb',
      accentColor: '#3b82f6',
      profileImage: null,
      voice: {
        enabled: false,
        provider: 'cloudflare',
        voiceId: null,
        displayName: null,
        previewUrl: null
      },
      metadata: {
        serviceDetails: mockServiceDetails
      }
    },
    onboarding: {
      status: 'completed', // This drives businessOnboardingStatus = 'completed'
      completed: true,
      skipped: false,
      completedAt: onboardingCompletedAt,
      lastSavedAt: onboardingCompletedAt,
      data: {
        firmName: 'Mock Law Firm',
        contactEmail: 'owner@mock-law.test',
        contactPhone: '+1-555-0123',
        profileImage: null,
        addressLine1: '123 Main St',
        addressLine2: 'Suite 100',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
        primaryColor: '#2563eb',
        accentColor: '#3b82f6',
        introMessage: 'Welcome to Mock Law Firm. How can we help you today?',
        overview: 'We provide excellent legal services',
        isPublic: true,
        services: mockServiceDetails,
        __meta: {
          resumeStep: 'review-and-launch',
          savedAt: onboardingCompletedAt
        }
      }
    }
  }
};

// Mock session data
const mockSession = {
  data: {
    user: {
      id: 'mock-user-1',
      email: 'owner@mock-law.test',
      name: 'Mock User',
      practiceId: MOCK_PRACTICE_ID,
      activePracticeId: MOCK_PRACTICE_ID
    }
  },
  isPending: false
};

// Store original useSession
const originalUseSession = authClient.useSession;

export function MockServicesPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockServices();
  const [settingsView, setSettingsView] = useState<'practice' | 'services' | 'team'>('practice');
  const { updateServices } = mock;

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  // Override useSession and mock axios requests
  useEffect(() => {
    if (!isDevMode) return;

    console.log('[MockServicesPage] Setting up mock interceptors and session');

    const isPlainObject = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);

    const parsePayload = (data: unknown): Record<string, unknown> | null => {
      if (!data) return null;
      if (typeof data === 'string') {
        try {
          return JSON.parse(data) as Record<string, unknown>;
        } catch (err) {
          console.warn('[MockServicesPage] Failed to parse payload', err);
          return null;
        }
      }
      return isPlainObject(data) ? data : null;
    };

    const resolveServiceDetails = (config: Record<string, unknown>): typeof mockServiceDetails => {
      const metadata = isPlainObject(config.metadata) ? (config.metadata as Record<string, unknown>) : {};
      const serviceDetails = metadata.serviceDetails;
      if (Array.isArray(serviceDetails)) {
        const parsed = serviceDetails
          .map((item) => {
            if (!isPlainObject(item)) return null;
            const title = typeof item.title === 'string' ? item.title : '';
            if (!title.trim()) return null;
            return {
              id: typeof item.id === 'string' ? item.id : `service-${Date.now()}`,
              title,
              description: typeof item.description === 'string' ? item.description : ''
            };
          })
          .filter((item): item is (typeof mockServiceDetails)[number] => item !== null);
        if (parsed.length > 0) return parsed;
      }

      const available = Array.isArray(config.availableServices)
        ? config.availableServices.filter((item): item is string => typeof item === 'string')
        : [];
      return available.map((title, index) => ({
        id: `service-${index + 1}`,
        title,
        description: ''
      }));
    };

    const applyPracticeUpdate = (payload: Record<string, unknown>) => {
      if (typeof payload.name === 'string') {
        mockPractice.name = payload.name;
      }
      if (isPlainObject(payload.metadata)) {
        mockPractice.metadata = {
          ...(mockPractice.metadata ?? {}),
          ...payload.metadata
        };

        const conversationConfig = (payload.metadata as Record<string, unknown>).conversationConfig;
        if (isPlainObject(conversationConfig)) {
          mockPractice.metadata = {
            ...(mockPractice.metadata ?? {}),
            conversationConfig
          };
          mockPractice.config = {
            ...(mockPractice.config ?? {}),
            ...conversationConfig
          };
          if (Array.isArray(conversationConfig.availableServices)) {
            mockPractice.config = {
              ...(mockPractice.config ?? {}),
              availableServices: conversationConfig.availableServices
            };
          }
          const updatedServices = resolveServiceDetails(conversationConfig);
          updateServices(updatedServices);
        }
      }
    };
    
    // Override authClient.useSession to return mock session
    const authClientOverrideTarget = authClient as unknown as {
      useSession: () => typeof mockSession;
    };
    authClientOverrideTarget.useSession = () => mockSession;

    // Add request interceptor to change baseURL to same origin for MSW interception
    const requestInterceptor = apiClient.interceptors.request.use(
      (config) => {
        // Force baseURL to same origin so MSW can intercept (if enabled)
        // or our response interceptor can catch it
        if (import.meta.env.DEV) {
          config.baseURL = window.location.origin;
        }
        return config;
      }
    );

    // Add response interceptor to apiClient - add it AFTER existing interceptors
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        // Intercept responses for practice endpoints
        const url = response.config.url || '';
        
        // Mock practice list endpoint
        if (url.includes('/api/practice/list')) {
          console.log('[MockServicesPage] Intercepting practice list, returning mock data');
          return {
            ...response,
            data: { practices: [mockPractice] }
          };
        }
        
        // Mock practice update endpoint
        if (
          url.includes(`/api/practice/${mockPractice.id}`) &&
          response.config.method?.toLowerCase() === 'put'
        ) {
          const payload = parsePayload(response.config.data);
          if (payload) {
            applyPracticeUpdate(payload);
          }
          console.log('[MockServicesPage] Intercepting practice update, returning mock data');
          return {
            ...response,
            data: { practice: mockPractice }
          };
        }

        // Mock single practice endpoint
        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          console.log('[MockServicesPage] Intercepting practice get, returning mock data');
          return {
            ...response,
            data: { practice: mockPractice }
          };
        }
        
        // Mock members endpoint
        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          console.log('[MockServicesPage] Intercepting members, returning mock data');
          return {
            ...response,
            data: {
              members: [
                {
                  userId: 'mock-user-1',
                  role: 'owner',
                  email: 'owner@mock-law.test',
                  name: 'Mock Owner',
                  image: null,
                  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30
                },
                {
                  userId: 'mock-user-2',
                  role: 'attorney',
                  email: 'attorney@mock-law.test',
                  name: 'Mock Attorney',
                  image: null,
                  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10
                }
              ]
            }
          };
        }
        
        // Mock invitations endpoint
        if (url.includes('/api/practice/invitations')) {
          console.log('[MockServicesPage] Intercepting invitations, returning mock data');
          return {
            ...response,
            data: { invitations: [] }
          };
        }
        
        return response;
      },
      (error) => {
        // If it's a practice endpoint and we're mocking, return mock data instead of error
        const url = error.config?.url || '';
        console.log('[MockServicesPage] Request failed for:', url, error.response?.status);
        
        if (url.includes('/api/practice/list')) {
          console.log('[MockServicesPage] Returning mock practice list data');
          return Promise.resolve({
            data: { practices: [mockPractice] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }
        
        if (
          url.includes(`/api/practice/${mockPractice.id}`) &&
          error.config?.method?.toLowerCase() === 'put'
        ) {
          const payload = parsePayload(error.config?.data);
          if (payload) {
            // Intentionally apply updates in dev mocks to keep UI state consistent.
            applyPracticeUpdate(payload);
          }
          console.log('[MockServicesPage] Returning mock practice update data');
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          console.log('[MockServicesPage] Returning mock practice data');
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }
        
        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          console.log('[MockServicesPage] Returning mock members data');
          return Promise.resolve({
            data: {
              members: [
                {
                  userId: 'mock-user-1',
                  role: 'owner',
                  email: 'owner@mock-law.test',
                  name: 'Mock Owner',
                  image: null,
                  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30
                },
                {
                  userId: 'mock-user-2',
                  role: 'attorney',
                  email: 'attorney@mock-law.test',
                  name: 'Mock Attorney',
                  image: null,
                  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10
                }
              ]
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }
        
        if (url.includes('/api/practice/invitations')) {
          console.log('[MockServicesPage] Returning mock invitations data');
          return Promise.resolve({
            data: { invitations: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }
        
        console.log('[MockServicesPage] Not intercepting, passing through error');
        return Promise.reject(error);
      }
    );

    return () => {
      // Clean up interceptors on unmount
      apiClient.interceptors.request.eject(requestInterceptor);
      apiClient.interceptors.response.eject(responseInterceptor);
      // Restore original useSession
      const authClientRestoreTarget = authClient as unknown as {
        useSession: typeof originalUseSession;
      };
      authClientRestoreTarget.useSession = originalUseSession;
    };
  }, [isDevMode, updateServices]);

  useEffect(() => {
    if (mock.state.scenario === 'editing') {
      setSettingsView('practice');
    }
  }, [mock.state.scenario]);

  const handleMockNavigate = (path: string) => {
    if (path.startsWith('/settings/practice/services')) {
      setSettingsView('services');
      return;
    }
    if (path.startsWith('/settings/practice/team')) {
      setSettingsView('team');
      return;
    }
    if (path.startsWith('/settings/practice')) {
      setSettingsView('practice');
    }
  };

  if (!isDevMode) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-300">
        Redirecting…
      </div>
    );
  }

  return (
    <ToastProvider>
      <SessionProvider>
        <div className="flex h-screen bg-white dark:bg-dark-bg">
          {/* Left Sidebar - Controls */}
          <MockServicesControls mock={mock} />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 flex">
              {/* Onboarding Services View */}
              {mock.state.scenario === 'onboarding' && (
                <div className="flex-1 border-r border-gray-200 dark:border-dark-border overflow-y-auto">
                  <div className="p-6 max-w-4xl mx-auto">
                    <div className="mb-6 pb-4 border-b border-gray-200 dark:border-dark-border">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        Onboarding Services Step
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Current onboarding UI for adding services during practice setup
                      </p>
                    </div>
                    <ServicesStep
                      data={mock.state.services}
                      onChange={(services) => {
                        mock.updateServices(services);
                      }}
                      onContinue={() => {
                        console.log('Continue clicked');
                        mock.addDebugEvent('onboarding_continue');
                      }}
                      onBack={() => {
                        console.log('Back clicked');
                        mock.addDebugEvent('onboarding_back');
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Settings Page View - Actual PracticePage */}
              {mock.state.scenario === 'editing' && (
                <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
                  <div className="mb-4 p-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      {settingsView === 'services'
                        ? 'Practice Services Page'
                        : settingsView === 'team'
                          ? 'Practice Team Page'
                          : 'Practice Settings Page'}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Current settings UI (where services management could be added)
                    </p>
                  </div>
                  <div className="h-[calc(100%-80px)]">
                    {mock.state.practiceLoaded ? (
                      <>
                        {settingsView === 'practice' && (
                          <PracticePage className="h-full" onNavigate={handleMockNavigate} />
                        )}
                        {settingsView === 'services' && (
                          <PracticeServicesPage onNavigate={handleMockNavigate} />
                        )}
                        {settingsView === 'team' && (
                          <PracticeTeamPage onNavigate={handleMockNavigate} />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
                          <p className="text-sm text-gray-500">Loading practice...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Debug Panel */}
            <DebugPanel events={mock.debugEvents} onClear={mock.clearDebugEvents} />
          </div>

          {/* Right Sidebar - Info */}
          <MockServicesInfo mock={mock} />
        </div>
      </SessionProvider>
    </ToastProvider>
  );
}
