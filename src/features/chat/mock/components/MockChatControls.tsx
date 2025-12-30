import { scenarios } from '../scenarios';
import type { UseMockChatResult } from '../types';
import { formatTimestamp } from '../utils';

interface MockChatControlsProps {
  mock: UseMockChatResult;
}

export function MockChatControls({ mock }: MockChatControlsProps) {
  const {
    state,
    resetConversation,
    simulateScenario,
    setSimulationSpeed,
    setSimulateDeliveryDelay,
    setSimulateTyping,
    setIsAnonymous
  } = mock;
  const userCount = state.messages.filter((m) => m.isUser).length;
  const practiceCount = state.messages.length - userCount;
  const lastActivity = state.messages[state.messages.length - 1]?.timestamp;

  return (
    <div className="w-80 border-r border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mock Chat Controls</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Dev-only simulation</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${state.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-100' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100'}`}>
          {state.status}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Conversation</p>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{state.conversationId}</p>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-2 rounded bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-border transition"
          onClick={resetConversation}
        >
          Reset
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="anonymous-toggle">Anonymous Intake</label>
          <input
            id="anonymous-toggle"
            type="checkbox"
            checked={state.isAnonymous}
            onChange={(e) => setIsAnonymous((e.target as HTMLInputElement).checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="simulate-typing-toggle">Simulate Typing</label>
          <input
            id="simulate-typing-toggle"
            type="checkbox"
            checked={state.simulateTyping}
            onChange={(e) => setSimulateTyping((e.target as HTMLInputElement).checked)}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="delivery-delay-toggle">Delivery Delay</label>
          <input
            id="delivery-delay-toggle"
            type="checkbox"
            checked={state.simulateDeliveryDelay}
            onChange={(e) => setSimulateDeliveryDelay((e.target as HTMLInputElement).checked)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">Speed {state.simulationSpeed.toFixed(1)}x</label>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            value={state.simulationSpeed}
            onInput={(e) => setSimulationSpeed(Number((e.target as HTMLInputElement).value))}
            className="flex-1 accent-blue-500"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>User messages</span>
          <span className="font-semibold">{userCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Practice messages</span>
          <span className="font-semibold">{practiceCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
          <span>Total</span>
          <span className="font-semibold">{state.messages.length}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Last activity</span>
          <span>{lastActivity ? formatTimestamp(lastActivity) : '—'}</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">Scenarios</p>
        <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="w-full text-left bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500 rounded px-3 py-2 transition"
              onClick={() => simulateScenario(scenario.id)}
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{scenario.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{scenario.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
