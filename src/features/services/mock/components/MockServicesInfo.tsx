import type { UseMockServicesResult } from '../types';

interface MockServicesInfoProps {
  mock: UseMockServicesResult;
}

export function MockServicesInfo({ mock }: MockServicesInfoProps) {
  const { state } = mock;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Active Components</p>
        <ul className="mt-2 space-y-2 text-xs text-gray-700 dark:text-gray-200">
          <li className="flex items-center justify-between">
            <span>ServicesStep</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100 text-[11px]">mounted</span>
          </li>
          <li className="flex items-center justify-between">
            <span>PracticePage</span>
            <span className={`px-2 py-1 rounded text-[11px] ${
              state.practiceLoaded 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100'
            }`}>
              {state.practiceLoaded ? 'loaded' : 'loading'}
            </span>
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Current State</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-200">
          <StateTile label="Scenario" value={state.scenario} />
          <StateTile label="Services" value={state.services.length} />
          <StateTile label="Practice loaded" value={state.practiceLoaded ? 'Yes' : 'No'} />
          <StateTile label="Loading" value={state.isLoading ? 'Yes' : 'No'} />
          {state.error && (
            <>
              <StateTile label="Error" value="Yes" />
              <StateTile label="Error msg" value={(() => {
                const error = state.error as unknown;
                const errorStr = error instanceof Error 
                  ? error.message 
                  : error == null 
                    ? '' 
                    : String(error);
                return errorStr.slice(0, 10).trim();
              })()} />
            </>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Services List</p>
        <div className="mt-2 space-y-2">
          {state.services.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No services configured</p>
          ) : (
            state.services.map((service) => (
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
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Component Tree</p>
        <pre className="mt-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 whitespace-pre leading-5">
{`MockServicesPage
  ├─ MockServicesControls (left)
  ├─ Main Content
  │   ├─ ServicesStep (onboarding)
  │   └─ PracticePage (settings)
  └─ MockServicesInfo (right)`}
        </pre>
      </div>
    </div>
  );
}

function StateTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2">
      <p className="text-[11px] uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}

