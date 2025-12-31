import type { UseMockOnboardingResult } from '../types';

interface MockOnboardingInfoProps {
  mock: UseMockOnboardingResult;
}

export function MockOnboardingInfo({ mock }: MockOnboardingInfoProps) {
  const { state } = mock;
  const services = state.onboardingData.services;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Current scenario</p>
        <div className="mt-2 space-y-2 text-xs text-gray-700 dark:text-gray-200">
          <div className="flex items-center justify-between">
            <span>Step/page</span>
            <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100 text-[11px]">
              {state.scenario}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Practice loaded</span>
            <span className={`px-2 py-1 rounded text-[11px] ${
              state.practiceLoaded
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100'
            }`}>
              {state.practiceLoaded ? 'ready' : 'loading'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Onboarding data</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-200">
          <StateTile label="Firm" value={state.onboardingData.firmName} />
          <StateTile label="Email" value={state.onboardingData.contactEmail} />
          <StateTile label="Phone" value={state.onboardingData.contactPhone || '—'} />
          <StateTile label="Website" value={state.onboardingData.website || '—'} />
          <StateTile label="Address" value={state.onboardingData.city ? `${state.onboardingData.city}, ${state.onboardingData.state}` : '—'} />
          <StateTile label="Visibility" value={state.onboardingData.isPublic ? 'Public' : 'Private'} />
          <StateTile label="Services" value={services.length} />
        </div>
      </div>

      <div className="rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-3 space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Stripe status</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {state.stripeStatus ? 'Embedded onboarding configured' : 'No client secret configured'}
        </p>
        {state.stripeStatus && (
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-200">
            <StateTile label="Account" value={state.stripeStatus.stripe_account_id || 'pending'} />
            <StateTile label="Charges" value={state.stripeStatus.charges_enabled ? 'enabled' : 'pending'} />
            <StateTile label="Payouts" value={state.stripeStatus.payouts_enabled ? 'enabled' : 'pending'} />
            <StateTile label="Details" value={state.stripeStatus.details_submitted ? 'submitted' : 'incomplete'} />
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Services preview</p>
        <div className="mt-2 space-y-2">
          {services.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No services configured</p>
          ) : (
            services.map((service) => (
              <div key={service.id} className="text-xs bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-2">
                <p className="font-semibold text-gray-800 dark:text-gray-100">{service.title}</p>
                {service.description && (
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{service.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Component tree</p>
        <pre className="mt-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 whitespace-pre leading-5">
{`MockPracticeOnboardingAndSettingsPage
  ├─ MockOnboardingControls (left)
  ├─ Main Content (onboarding steps & settings pages)
  └─ MockOnboardingInfo (right)`}
        </pre>
      </div>
    </div>
  );
}

function StateTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2">
      <p className="text-[11px] uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 break-words">{value}</p>
    </div>
  );
}
