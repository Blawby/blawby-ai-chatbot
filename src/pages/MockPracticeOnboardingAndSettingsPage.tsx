import { useEffect, useState } from 'preact/hooks';
import { WelcomeStep } from '@/features/onboarding/steps/WelcomeStep';
import { FirmBasicsStep } from '@/features/onboarding/steps/FirmBasicsStep';
import { TrustAccountIntroStep } from '@/features/onboarding/steps/TrustAccountIntroStep';
import { StripeOnboardingStep } from '@/features/onboarding/steps/StripeOnboardingStep';
import { BusinessDetailsStep } from '@/features/onboarding/steps/BusinessDetailsStep';
import { ServicesStep } from '@/features/onboarding/steps/ServicesStep';
import { ReviewAndLaunchStep } from '@/features/onboarding/steps/ReviewAndLaunchStep';
import { PracticePage } from '@/features/settings/pages/PracticePage';
import { PracticeServicesPage } from '@/features/settings/pages/PracticeServicesPage';
import { PracticeTeamPage } from '@/features/settings/pages/PracticeTeamPage';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider } from '@/shared/contexts/SessionContext';
import { apiClient } from '@/shared/lib/apiClient';
import { authClient } from '@/shared/lib/authClient';
import type { Practice } from '@/shared/lib/apiClient';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';
import type { OnboardingFormData } from '@/features/onboarding/hooks';
import { useMockOnboarding } from '@/features/onboarding/mock/useMockOnboarding';
import { MockOnboardingControls, MockOnboardingInfo } from '@/features/onboarding/mock/components';
import type { MockScenario } from '@/features/onboarding/mock/types';

const MOCK_PRACTICE_ID = 'mock-practice-services';
const onboardingCompletedAt = Date.now() - 1000 * 60 * 60 * 24 * 20; // 20 days ago
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

const scenarioMeta: Record<MockScenario, { title: string; subtitle: string }> = {
  welcome: {
    title: 'Welcome step',
    subtitle: 'Landing screen shown before onboarding begins.'
  },
  'firm-basics': {
    title: 'Firm basics',
    subtitle: 'Business name, contact email, phone, and website.'
  },
  'trust-account-intro': {
    title: 'Trust account intro',
    subtitle: 'Context for IOLTA trust compliance.'
  },
  'stripe-onboarding': {
    title: 'Stripe onboarding',
    subtitle: 'Verify payouts using Stripe Connect.'
  },
  'business-details': {
    title: 'Business details',
    subtitle: 'Address and overview fields.'
  },
  services: {
    title: 'Services',
    subtitle: 'Add and manage services during onboarding.'
  },
  'review-and-launch': {
    title: 'Review and launch',
    subtitle: 'Summary of onboarding data and visibility toggle.'
  },
  'settings-practice': {
    title: 'Practice settings',
    subtitle: 'Primary practice configuration page.'
  },
  'settings-services': {
    title: 'Services settings',
    subtitle: 'Manage existing services after onboarding.'
  },
  'settings-team': {
    title: 'Team settings',
    subtitle: 'Invite and manage team members.'
  }
};

const onboardingScenarioIds: MockScenario[] = [
  'welcome',
  'firm-basics',
  'trust-account-intro',
  'stripe-onboarding',
  'business-details',
  'services',
  'review-and-launch'
];

const onboardingScenarioSet = new Set(onboardingScenarioIds);
const settingsScenarioSet = new Set<MockScenario>(['settings-practice', 'settings-services', 'settings-team']);

const baseOnboardingData: OnboardingFormData = {
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
  services: mockServiceDetails
};

const mockPractice: Practice = {
  id: MOCK_PRACTICE_ID,
  slug: 'mock-law-firm',
  name: baseOnboardingData.firmName,
  description: 'A mock practice for comparing onboarding and settings UI',
  kind: 'business',
  subscriptionStatus: 'active',
  subscriptionTier: 'business',
  seats: 3,
  subscriptionPeriodEnd: Date.now() / 1000 + 30 * 24 * 60 * 60,
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  updatedAt: new Date().toISOString(),
  businessEmail: baseOnboardingData.contactEmail,
  businessPhone: baseOnboardingData.contactPhone || '',
  logo: null,
  businessOnboardingStatus: 'completed',
  businessOnboardingCompletedAt: onboardingCompletedAt,
  businessOnboardingSkipped: false,
  businessOnboardingHasDraft: false,
  config: {
    ownerEmail: baseOnboardingData.contactEmail,
    profileImage: null,
    introMessage: baseOnboardingData.introMessage,
    description: baseOnboardingData.overview,
    availableServices: baseOnboardingData.services.map((service) => service.title),
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
      ownerEmail: baseOnboardingData.contactEmail,
      introMessage: baseOnboardingData.introMessage,
      description: baseOnboardingData.overview,
      availableServices: baseOnboardingData.services.map((service) => service.title),
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
        serviceDetails: baseOnboardingData.services
      }
    },
    onboarding: {
      status: 'completed',
      completed: true,
      skipped: false,
      completedAt: onboardingCompletedAt,
      lastSavedAt: onboardingCompletedAt,
      data: {
        ...baseOnboardingData,
        __meta: {
          resumeStep: 'review-and-launch',
          savedAt: onboardingCompletedAt
        }
      }
    }
  }
};

const originalUseSession = authClient.useSession;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePayload = (data: unknown): Record<string, unknown> | null => {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch (err) {
      console.warn('[MockPracticeOnboardingAndSettings] Failed to parse payload', err);
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

const syncPracticeWithOnboarding = (data: OnboardingFormData, scenario: MockScenario) => {
  mockPractice.name = data.firmName || mockPractice.name;
  mockPractice.slug = 'mock-law-firm';
  mockPractice.businessEmail = data.contactEmail;
  mockPractice.businessPhone = data.contactPhone || '';
  mockPractice.updatedAt = new Date().toISOString();
  mockPractice.config = {
    ...(mockPractice.config ?? {}),
    ownerEmail: data.contactEmail,
    profileImage: data.profileImage || null,
    introMessage: data.introMessage,
    description: data.overview,
    availableServices: data.services.map((service) => service.title),
    serviceQuestions: (mockPractice.config as Record<string, unknown> | undefined)?.serviceQuestions ?? {},
    brandColor: '#2563eb',
    accentColor: '#3b82f6',
    metadata: {
      subscriptionPlan: 'business',
      planStatus: 'active'
    }
  };

  const resumeStep = onboardingScenarioSet.has(scenario) ? scenario : 'review-and-launch';

  mockPractice.metadata = {
    ...(mockPractice.metadata ?? {}),
    conversationConfig: {
      ...(mockPractice.metadata?.conversationConfig ?? {}),
      ownerEmail: data.contactEmail,
      introMessage: data.introMessage,
      description: data.overview,
      availableServices: data.services.map((service) => service.title),
      serviceQuestions: (mockPractice.metadata?.conversationConfig as Record<string, unknown> | undefined)?.serviceQuestions ?? {},
      domain: '',
      brandColor: '#2563eb',
      accentColor: '#3b82f6',
      profileImage: data.profileImage || null,
      metadata: {
        ...(mockPractice.metadata?.conversationConfig?.metadata ?? {}),
        serviceDetails: data.services
      }
    },
    onboarding: {
      status: 'completed',
      completed: true,
      skipped: false,
      completedAt: onboardingCompletedAt,
      lastSavedAt: onboardingCompletedAt,
      data: {
        ...data,
        __meta: {
          resumeStep,
          savedAt: onboardingCompletedAt
        }
      }
    }
  };
};

export function MockPracticeOnboardingAndSettingsPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockOnboarding();
  const [settingsView, setSettingsView] = useState<'practice' | 'services' | 'team'>('practice');
  const { updateOnboardingData, updateServices } = mock;

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    syncPracticeWithOnboarding(mock.state.onboardingData, mock.state.scenario);
  }, [mock.state.onboardingData, mock.state.scenario]);

  useEffect(() => {
    if (settingsScenarioSet.has(mock.state.scenario)) {
      setSettingsView(
        mock.state.scenario === 'settings-services'
          ? 'services'
          : mock.state.scenario === 'settings-team'
            ? 'team'
            : 'practice'
      );
    }
  }, [mock.state.scenario]);

  useEffect(() => {
    if (!isDevMode) return;

    console.log('[MockPracticeOnboardingAndSettings] Setting up mock interceptors and session');

    const applyPracticeUpdate = (payload: Record<string, unknown>) => {
      const onboardingUpdates: Partial<OnboardingFormData> = {};

      if (typeof payload.name === 'string') {
        mockPractice.name = payload.name;
        onboardingUpdates.firmName = payload.name;
      }

      if (typeof payload.businessEmail === 'string') {
        mockPractice.businessEmail = payload.businessEmail;
        onboardingUpdates.contactEmail = payload.businessEmail;
      }

      if (typeof payload.businessPhone === 'string') {
        mockPractice.businessPhone = payload.businessPhone;
        onboardingUpdates.contactPhone = payload.businessPhone;
      }

      if (isPlainObject(payload.metadata)) {
        const conversationConfig = (payload.metadata as Record<string, unknown>).conversationConfig;
        if (isPlainObject(conversationConfig)) {
          const updatedServices = resolveServiceDetails(conversationConfig);
          updateServices(updatedServices);
          onboardingUpdates.services = updatedServices;
          if (typeof conversationConfig.description === 'string') {
            onboardingUpdates.overview = conversationConfig.description;
          }
          if (typeof conversationConfig.ownerEmail === 'string') {
            onboardingUpdates.contactEmail = conversationConfig.ownerEmail;
          }
        }
      }

      if (Object.keys(onboardingUpdates).length > 0) {
        updateOnboardingData(onboardingUpdates);
      }
    };

    const authClientOverrideTarget = authClient as unknown as {
      useSession: () => typeof mockSession;
    };
    authClientOverrideTarget.useSession = () => mockSession;

    const requestInterceptor = apiClient.interceptors.request.use((config) => {
      if (import.meta.env.DEV) {
        config.baseURL = window.location.origin;
      }
      return config;
    });

    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        const url = response.config.url || '';

        if (url.includes('/api/practice/list')) {
          console.log('[MockPracticeOnboardingAndSettings] Intercepting practice list, returning mock data');
          return {
            ...response,
            data: { practices: [mockPractice] }
          };
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && response.config.method?.toLowerCase() === 'put') {
          const payload = parsePayload(response.config.data);
          if (payload) {
            applyPracticeUpdate(payload);
          }
          console.log('[MockPracticeOnboardingAndSettings] Intercepting practice update, returning mock data');
          return {
            ...response,
            data: { practice: mockPractice }
          };
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          console.log('[MockPracticeOnboardingAndSettings] Intercepting practice get, returning mock data');
          return {
            ...response,
            data: { practice: mockPractice }
          };
        }

        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          console.log('[MockPracticeOnboardingAndSettings] Intercepting members, returning mock data');
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

        if (url.includes('/api/practice/invitations')) {
          console.log('[MockPracticeOnboardingAndSettings] Intercepting invitations, returning mock data');
          return {
            ...response,
            data: { invitations: [] }
          };
        }

        return response;
      },
      (error) => {
        const url = error.config?.url || '';
        console.log('[MockPracticeOnboardingAndSettings] Request failed for:', url, error.response?.status);

        if (url.includes('/api/practice/list')) {
          console.log('[MockPracticeOnboardingAndSettings] Returning mock practice list data');
          return Promise.resolve({
            data: { practices: [mockPractice] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && error.config?.method?.toLowerCase() === 'put') {
          const payload = parsePayload(error.config?.data);
          if (payload) {
            applyPracticeUpdate(payload);
          }
          console.log('[MockPracticeOnboardingAndSettings] Returning mock practice update data');
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}`) && !url.includes('/members') && !url.includes('/invitations')) {
          console.log('[MockPracticeOnboardingAndSettings] Returning mock practice data');
          return Promise.resolve({
            data: { practice: mockPractice },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        if (url.includes(`/api/practice/${mockPractice.id}/members`)) {
          console.log('[MockPracticeOnboardingAndSettings] Returning mock members data');
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
          console.log('[MockPracticeOnboardingAndSettings] Returning mock invitations data');
          return Promise.resolve({
            data: { invitations: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config
          });
        }

        console.log('[MockPracticeOnboardingAndSettings] Not intercepting, passing through error');
        return Promise.reject(error);
      }
    );

    return () => {
      apiClient.interceptors.request.eject(requestInterceptor);
      apiClient.interceptors.response.eject(responseInterceptor);
      const authClientRestoreTarget = authClient as unknown as {
        useSession: typeof originalUseSession;
      };
      authClientRestoreTarget.useSession = originalUseSession;
    };
  }, [isDevMode, updateOnboardingData, updateServices]);

  const handleMockNavigate = (path: string) => {
    if (path.startsWith('/settings/practice/services')) {
      setSettingsView('services');
      mock.setScenario('settings-services');
      return;
    }
    if (path.startsWith('/settings/practice/team')) {
      setSettingsView('team');
      mock.setScenario('settings-team');
      return;
    }
    if (path.startsWith('/settings/practice')) {
      setSettingsView('practice');
      mock.setScenario('settings-practice');
    }
  };

  const renderOnboardingContent = () => {
    switch (mock.state.scenario) {
      case 'welcome':
        return <WelcomeStep />;
      case 'firm-basics':
        return (
          <FirmBasicsStep
            data={{
              firmName: mock.state.onboardingData.firmName,
              contactEmail: mock.state.onboardingData.contactEmail,
              contactPhone: mock.state.onboardingData.contactPhone,
              website: mock.state.onboardingData.website
            }}
            onChange={(data) => {
              mock.updateOnboardingData({
                firmName: data.firmName,
                contactEmail: data.contactEmail,
                contactPhone: data.contactPhone,
                website: data.website
              });
            }}
          />
        );
      case 'trust-account-intro':
        return <TrustAccountIntroStep />;
      case 'stripe-onboarding':
        return (
          <StripeOnboardingStep
            status={mock.state.stripeStatus}
            loading={mock.state.isLoading}
            clientSecret={mock.state.stripeClientSecret}
            onActionLoadingChange={(loading) => {
              mock.addDebugEvent('stripe_action_loading', { loading });
            }}
          />
        );
      case 'business-details':
        return (
          <BusinessDetailsStep
            data={{
              addressLine1: mock.state.onboardingData.addressLine1,
              addressLine2: mock.state.onboardingData.addressLine2,
              city: mock.state.onboardingData.city,
              state: mock.state.onboardingData.state,
              postalCode: mock.state.onboardingData.postalCode,
              country: mock.state.onboardingData.country,
              overview: mock.state.onboardingData.overview
            }}
            onChange={(data) => {
              mock.updateOnboardingData({
                addressLine1: data.addressLine1,
                addressLine2: data.addressLine2,
                city: data.city,
                state: data.state,
                postalCode: data.postalCode,
                country: data.country,
                overview: data.overview
              });
            }}
          />
        );
      case 'services':
        return (
          <ServicesStep
            data={mock.state.onboardingData.services}
            onChange={(services) => {
              mock.updateServices(services);
            }}
          />
        );
      case 'review-and-launch':
        return (
          <ReviewAndLaunchStep
            data={mock.state.onboardingData}
            practiceSlug={mockPractice.slug}
            onVisibilityChange={(isPublic) => mock.updateOnboardingData({ isPublic })}
          />
        );
      default:
        return null;
    }
  };

  const isSettingsScenario = settingsScenarioSet.has(mock.state.scenario);
  const meta = scenarioMeta[mock.state.scenario];

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
          <MockOnboardingControls mock={mock} />

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 flex">
              {!isSettingsScenario && (
                <div className="flex-1 border-r border-gray-200 dark:border-dark-border overflow-y-auto">
                  <div className="p-6 max-w-4xl mx-auto">
                    <div className="mb-6 pb-4 border-b border-gray-200 dark:border-dark-border">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                        {meta.title}
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {meta.subtitle}
                      </p>
                    </div>
                    {renderOnboardingContent()}
                  </div>
                </div>
              )}

              {isSettingsScenario && (
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
                      {meta.subtitle}
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

            <DebugPanel events={mock.debugEvents} onClear={mock.clearDebugEvents} />
          </div>

          <MockOnboardingInfo mock={mock} />
        </div>
      </SessionProvider>
    </ToastProvider>
  );
}
