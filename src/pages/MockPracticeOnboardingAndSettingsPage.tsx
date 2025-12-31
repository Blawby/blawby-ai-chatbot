import { useEffect, useState } from 'preact/hooks';
import { WelcomeStep } from '@/features/onboarding/steps/WelcomeStep';
import { FirmBasicsStep } from '@/features/onboarding/steps/FirmBasicsStep';
import { TrustAccountIntroStep } from '@/features/onboarding/steps/TrustAccountIntroStep';
import { StripeOnboardingStep } from '@/features/onboarding/steps/StripeOnboardingStep';
import { BusinessDetailsStep } from '@/features/onboarding/steps/BusinessDetailsStep';
import { ServicesStep } from '@/features/onboarding/steps/ServicesStep';
import { ReviewAndLaunchStep } from '@/features/onboarding/steps/ReviewAndLaunchStep';
import { ToastProvider } from '@/shared/contexts/ToastContext';
import { SessionProvider } from '@/shared/contexts/SessionContext';
import { DebugPanel } from '@/features/chat/mock/components/DebugPanel';
import { useMockOnboarding } from '@/features/onboarding/mock/useMockOnboarding';
import { MockOnboardingControls, MockOnboardingInfo } from '@/features/onboarding/mock/components';
import type { MockScenario } from '@/features/onboarding/mock/types';



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

const settingsScenarioSet = new Set<MockScenario>(['settings-practice', 'settings-services', 'settings-team']);

export function MockPracticeOnboardingAndSettingsPage() {
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV || import.meta.env.MODE === 'development');
  const mock = useMockOnboarding();
  const [settingsView, setSettingsView] = useState<'practice' | 'services' | 'team'>('practice');

  useEffect(() => {
    const dev = import.meta.env.MODE === 'development' || import.meta.env.DEV;
    setIsDevMode(dev);
    if (!dev) {
      window.location.href = '/';
    }
  }, []);

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
            practiceSlug="mock-law-firm"
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
                        ? 'Practice Services (mock preview)'
                        : settingsView === 'team'
                          ? 'Practice Team (mock preview)'
                          : 'Practice Settings (mock preview)'}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {meta.subtitle}
                    </p>
                  </div>
                  <div className="h-[calc(100%-80px)] p-6 space-y-6">
                    {settingsView === 'practice' && (
                      <div className="grid gap-4">
                        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-4">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Practice basics</h3>
                          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-200">
                            <div>
                              <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Name</dt>
                              <dd className="font-semibold">{mock.state.onboardingData.firmName}</dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Visibility</dt>
                              <dd className="font-semibold">{mock.state.onboardingData.isPublic ? 'Public' : 'Private'}</dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Email</dt>
                              <dd className="font-semibold">{mock.state.onboardingData.contactEmail}</dd>
                            </div>
                            <div>
                              <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Phone</dt>
                              <dd className="font-semibold">{mock.state.onboardingData.contactPhone || 'Not set'}</dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Website</dt>
                              <dd className="font-semibold">{mock.state.onboardingData.website || 'Not set'}</dd>
                            </div>
                          </dl>
                        </div>

                        <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-4">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Address & overview</h3>
                          <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">
                            {[
                              mock.state.onboardingData.addressLine1,
                              mock.state.onboardingData.addressLine2,
                              [mock.state.onboardingData.city, mock.state.onboardingData.state].filter(Boolean).join(', '),
                              mock.state.onboardingData.postalCode,
                              mock.state.onboardingData.country
                            ].filter(Boolean).join(' • ')}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{mock.state.onboardingData.overview}</p>
                        </div>
                      </div>
                    )}

                    {settingsView === 'services' && (
                      <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Services (mock)</h3>
                        <div className="mt-3 space-y-2">
                          {mock.state.onboardingData.services.map((service) => (
                            <div key={service.id} className="rounded border border-gray-200 dark:border-dark-border p-3">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{service.title}</p>
                              {service.description && (
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{service.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {settingsView === 'team' && (
                      <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Team (mock)</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                          Team management UI is mocked here to avoid backend calls. Imagine invitations and members lists populated with sample data.
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-gray-800 dark:text-gray-100">
                          <li className="flex items-center justify-between">
                            <span>Mock Owner (owner)</span>
                            <span className="text-xs text-gray-500">owner@mock-law.test</span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span>Mock Attorney (attorney)</span>
                            <span className="text-xs text-gray-500">attorney@mock-law.test</span>
                          </li>
                        </ul>
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
