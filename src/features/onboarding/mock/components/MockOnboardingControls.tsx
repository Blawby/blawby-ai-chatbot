import type { MockScenario, UseMockOnboardingResult } from '../types';

interface MockOnboardingControlsProps {
  mock: UseMockOnboardingResult;
}

const onboardingOptions: Array<{ id: MockScenario; label: string; description: string }> = [
  { id: 'welcome', label: 'Welcome', description: 'Landing step shown before onboarding starts.' },
  { id: 'firm-basics', label: 'Firm basics', description: 'Name, email, phone, and website fields.' },
  { id: 'trust-account-intro', label: 'Trust account intro', description: 'Explains trust account requirements.' },
  { id: 'stripe-onboarding', label: 'Stripe onboarding', description: 'Stripe Connect verification state.' },
  { id: 'business-details', label: 'Business details', description: 'Address and overview content.' },
  { id: 'services', label: 'Services', description: 'Add and edit services for the practice.' },
  { id: 'review-and-launch', label: 'Review and launch', description: 'Final summary and visibility toggle.' }
];

const settingsOptions: Array<{ id: MockScenario; label: string; description: string }> = [
  { id: 'settings-practice', label: 'Practice settings', description: 'Main practice configuration page.' },
  { id: 'settings-services', label: 'Services settings', description: 'Manage practice services in settings.' },
  { id: 'settings-team', label: 'Team settings', description: 'Invite and manage team members.' }
];

export function MockOnboardingControls({ mock }: MockOnboardingControlsProps) {
  const { state, reset, addDebugEvent } = mock;

  const statusLabel = state.error
    ? 'error'
    : state.practiceLoaded
      ? 'ready'
      : 'loading';

  const handleScenarioChange = (scenario: MockScenario) => {
    mock.setScenario(scenario);
    addDebugEvent('scenario_selected', { scenario });
  };

  const setStripeMode = (mode: 'verified' | 'pending' | 'unavailable') => {
    if (mode === 'unavailable') {
      mock.setStripeStatus(null);
      mock.setStripeClientSecret(null);
      return;
    }

    mock.setStripeStatus({
      practice_uuid: 'mock-practice-services',
      stripe_account_id: mode === 'pending' ? undefined : 'acct_mock123',
      charges_enabled: mode === 'verified',
      payouts_enabled: mode === 'verified',
      details_submitted: mode !== 'pending'
    });
    mock.setStripeClientSecret(mode === 'pending' ? 'pi_mock_pending_secret' : 'pi_mock_client_secret');
  };

  return (
    <div className="w-80 border-r border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mock practice onboarding &amp; settings</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Dev-only simulation</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          state.error
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100'
            : statusLabel === 'ready'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100'
        }`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Scenario</p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 capitalize">{state.scenario}</p>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-border transition"
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">Onboarding steps</p>
        <div className="space-y-2">
          {onboardingOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`w-full text-left bg-white dark:bg-dark-bg border rounded px-3 py-2 transition ${
                state.scenario === option.id
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500'
              }`}
              onClick={() => handleScenarioChange(option.id)}
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{option.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">Settings pages</p>
        <div className="space-y-2">
          {settingsOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`w-full text-left bg-white dark:bg-dark-bg border rounded px-3 py-2 transition ${
                state.scenario === option.id
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500'
              }`}
              onClick={() => handleScenarioChange(option.id)}
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{option.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase">Stripe mock</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/30 transition"
            onClick={() => setStripeMode('verified')}
          >
            Verified
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition"
            onClick={() => setStripeMode('pending')}
          >
            Pending
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            onClick={() => setStripeMode('unavailable')}
          >
            No client secret
          </button>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <p><strong>Status:</strong> {state.stripeStatus ? 'Configured' : 'Not configured'}</p>
          <p><strong>Client secret:</strong> {state.stripeClientSecret ? 'present' : 'missing'}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Services count</span>
          <span className="font-semibold">{state.onboardingData.services.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Practice loaded</span>
          <span className={`font-semibold ${state.practiceLoaded ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
            {state.practiceLoaded ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Loading</span>
          <span className={`font-semibold ${state.isLoading ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400'}`}>
            {state.isLoading ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
    </div>
  );
}
