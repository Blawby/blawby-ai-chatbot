import { scenarios } from '../scenarios';
import type { UseMockInboxResult } from '../types';

interface MockInboxInfoProps {
  mock: UseMockInboxResult;
}

export function MockInboxInfo({ mock }: MockInboxInfoProps) {
  const currentScenario = scenarios.find((scenario) => scenario.id === mock.currentScenario);

  return (
    <div className="w-80 border-l border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Scenario Info</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{currentScenario?.description}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Stats</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-200">
          <div className="flex items-center justify-between">
            <span>Total</span>
            <span className="font-semibold">{mock.stats.total}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Active</span>
            <span className="font-semibold">{mock.stats.active}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Unassigned</span>
            <span className="font-semibold">{mock.stats.unassigned}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Assigned to me</span>
            <span className="font-semibold">{mock.stats.assignedToMe}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>High/Urgent</span>
            <span className="font-semibold">{mock.stats.highPriority}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Archived</span>
            <span className="font-semibold">{mock.stats.archived}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Closed</span>
            <span className="font-semibold">{mock.stats.closed}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Current Filters</p>
        <div className="text-xs bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 space-y-1">
          <p><span className="text-gray-500">Status:</span> {mock.state.filters.status ?? 'any'}</p>
          <p><span className="text-gray-500">Priority:</span> {mock.state.filters.priority ?? 'any'}</p>
          <p><span className="text-gray-500">Assigned:</span> {mock.state.filters.assignedTo ?? 'any'}</p>
          <p><span className="text-gray-500">Tags:</span> {mock.state.filters.tags?.join(', ') || 'any'}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Mock Data</p>
        <div className="text-xs bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 space-y-1">
          <p><span className="text-gray-500">Scenario:</span> {mock.currentScenario}</p>
          <p><span className="text-gray-500">Practice ID:</span> {mock.state.practiceId}</p>
          <p><span className="text-gray-500">Last refreshed:</span> {mock.state.lastRefreshedAt}</p>
          <p><span className="text-gray-500">Conversations:</span> {mock.conversations.length}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">API Endpoints</p>
        <div className="text-xs bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 space-y-1 text-gray-600 dark:text-gray-300">
          <p>GET /api/inbox/conversations</p>
          <p>GET /api/inbox/stats</p>
          <p>GET /api/inbox/conversations/:id</p>
          <p>PUT /api/inbox/conversations/:id</p>
          <p>POST /api/inbox/conversations/:id/assign</p>
          <p>POST /api/inbox/conversations/:id/archive</p>
        </div>
      </div>
    </div>
  );
}
