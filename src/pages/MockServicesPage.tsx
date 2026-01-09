import { useEffect, useState, useMemo } from 'preact/hooks';
import { ServicesStep } from '@/features/onboarding/steps/ServicesStep';
import { PracticePage } from '@/features/settings/pages/PracticePage';
import { PracticeServicesPage } from '@/features/settings/pages/PracticeServicesPage';
import { PracticeTeamPage } from '@/features/settings/pages/PracticeTeamPage';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionContext, type SessionContextValue } from '@/shared/contexts/SessionContext';
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

const _mockPractice: Practice = {
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
        website: 'https://mocklawfirm.com',
        profileImage: null,
        addressLine1: '123 Main St',
        addressLine2: 'Suite 100',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
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

// Mock session data - matches Better Auth's expected format
const mockSession = {
  data: {
    user: {
      id: 'mock-user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      name: 'Mock User',
      email: 'owner@mock-law.test',
      practiceId: MOCK_PRACTICE_ID,
      activePracticeId: MOCK_PRACTICE_ID,
      primaryWorkspace: 'practice' as const,
      preferredPracticeId: MOCK_PRACTICE_ID,
      hasPractice: true
    },
    session: {
      id: 'mock-session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      userId: 'mock-user-1',
      token: 'mock-token'
    }
  },
  isPending: false
};

// Mock SessionProvider that provides hardcoded data without API calls
function MockSessionProvider({ children }: { children: preact.ComponentChildren }) {
  const value = useMemo<SessionContextValue>(() => ({
    session: mockSession.data,
    isPending: false,
    error: null,
    activePracticeId: mockSession.data.user.activePracticeId,
    isAnonymous: false,
    primaryWorkspace: 'practice' as const,
    preferredPracticeId: MOCK_PRACTICE_ID,
    hasPractice: true
  }), []);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function MockServicesPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockServices();
  const [settingsView, setSettingsView] = useState<'practice' | 'services' | 'team'>('practice');
  const { updateServices: _updateServices } = mock;

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

  // No global interceptors - use hardcoded mock data only

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
      <MockSessionProvider>
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
      </MockSessionProvider>
    </ToastProvider>
  );
}
