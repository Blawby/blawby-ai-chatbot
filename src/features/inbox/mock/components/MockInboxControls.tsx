import type { UseMockInboxResult } from '../types';

interface MockInboxControlsProps {
  mock: UseMockInboxResult;
}

export function MockInboxControls({ mock }: MockInboxControlsProps) {
  const { state, scenarios } = mock;

  return (
    <div className="w-80 border-r border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mock Inbox Controls</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Dev-only simulation</p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${state.isLoading ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'}`}
        >
          {state.isLoading ? 'loading' : 'ready'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Scenario</p>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 capitalize">{state.scenario.replace('-', ' ')}</p>
          </div>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-border transition"
            onClick={() => {
              mock.refresh();
              mock.addDebugEvent('reset');
            }}
          >
            Reset
          </button>
        </div>

        <label
          className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase"
          htmlFor="mock-inbox-scenario"
        >
          Scenario Presets
        </label>
        <select
          id="mock-inbox-scenario"
          value={state.scenario}
          onChange={(e) => mock.setScenario(e.currentTarget.value)}
          className="w-full text-sm border border-gray-200 dark:border-dark-border rounded px-3 py-2 bg-white dark:bg-dark-bg text-gray-800 dark:text-gray-100"
        >
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Mock Data</p>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Conversations</span>
          <span className="font-semibold">{mock.conversations.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition"
            onClick={() => mock.addConversation()}
          >
            Add Conversation
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-red-400 dark:hover:border-red-500 transition"
            onClick={() => mock.removeConversation()}
          >
            Remove Latest
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Filter Presets</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition"
            onClick={() => mock.setFilters({ status: 'active' })}
          >
            Active
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition"
            onClick={() => mock.setFilters({ status: 'archived' })}
          >
            Archived
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition"
            onClick={() => mock.setFilters({ assignedTo: 'unassigned' })}
          >
            Unassigned
          </button>
          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition"
            onClick={() => mock.setFilters({ priority: 'high' })}
          >
            High Priority
          </button>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition w-full"
          onClick={() => mock.setFilters({ status: undefined, assignedTo: undefined, priority: undefined, tags: undefined })}
        >
          Clear Filters
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Simulation</p>
        <button
          type="button"
          className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition w-full"
          onClick={() => mock.refresh()}
        >
          Refresh Data
        </button>
        <button
          type="button"
          className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 transition w-full"
          onClick={() => mock.addDebugEvent('simulate_assignment', { conversationId: mock.conversations[0]?.id })}
        >
          Log Assignment Event
        </button>
      </div>
    </div>
  );
}
