import type { UseMockServicesResult } from '../types';

interface MockServicesControlsProps {
  mock: UseMockServicesResult;
}

export function MockServicesControls({ mock }: MockServicesControlsProps) {
  const { state, reset, addDebugEvent } = mock;

  return (
    <div className="w-80 border-r border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mock Services Controls</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Dev-only simulation</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          state.error 
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100' 
            : state.practiceLoaded || state.scenario === 'onboarding'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100'
        }`}>
          {state.error ? 'error' : state.practiceLoaded || state.scenario === 'onboarding' ? 'ready' : 'loading'}
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
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">Scenarios</p>
        <div className="space-y-2">
          <button
            type="button"
            className={`w-full text-left bg-white dark:bg-dark-bg border rounded px-3 py-2 transition ${
              state.scenario === 'onboarding'
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500'
            }`}
            onClick={() => {
              mock.setScenario('onboarding');
              addDebugEvent('scenario_selected', { scenario: 'onboarding' });
            }}
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Onboarding</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">First time adding services during practice setup</p>
          </button>
          <button
            type="button"
            className={`w-full text-left bg-white dark:bg-dark-bg border rounded px-3 py-2 transition ${
              state.scenario === 'editing'
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500'
            }`}
            onClick={() => {
              mock.setScenario('editing');
              addDebugEvent('scenario_selected', { scenario: 'editing' });
            }}
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Editing Settings</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Editing existing services in practice settings</p>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Services count</span>
          <span className="font-semibold">{state.services.length}</span>
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

