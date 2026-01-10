import type { UseMockChatResult } from '../types';

interface MockChatInfoProps {
  mock: UseMockChatResult;
}

export function MockChatInfo({ mock }: MockChatInfoProps) {
  const { state, previewFiles, intakeStatus } = mock;
  const userCount = state.messages.filter((m) => m.isUser).length;
  const practiceCount = state.messages.length - userCount;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-dark-border bg-light-card-bg dark:bg-dark-card-bg p-4 flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Active Components</p>
        <ul className="mt-2 space-y-2 text-xs text-gray-700 dark:text-gray-200">
          <li className="flex items-center justify-between">
            <span>ChatContainer</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100 text-[11px]">mounted</span>
          </li>
          <li className="flex items-center justify-between">
            <span>VirtualMessageList</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100 text-[11px]">mounted</span>
          </li>
          <li className="flex items-center justify-between">
            <span>MessageComposer</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-100 text-[11px]">mounted</span>
          </li>
          <li className="flex items-center justify-between">
            <span>AIThinkingIndicator</span>
            <span className={`px-2 py-1 rounded text-[11px] ${state.isTyping ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100' : 'bg-gray-100 text-gray-600 dark:bg-dark-bg dark:text-gray-300'}`}>
              {state.isTyping ? 'active' : 'idle'}
            </span>
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Current State</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-200">
          <StateTile label="Total messages" value={state.messages.length} />
          <StateTile label="User messages" value={userCount} />
          <StateTile label="Practice messages" value={practiceCount} />
          <StateTile label="Status" value={state.status} />
          <StateTile label="Typing" value={state.isTyping ? 'Yes' : 'No'} />
          <StateTile label="Simulation speed" value={`${state.simulationSpeed.toFixed(1)}x`} />
          <StateTile label="Anonymous" value={state.isAnonymous ? 'Yes' : 'No'} />
          <StateTile label="Intake step" value={intakeStatus.step} />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Props description</p>
        <ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-200">
          <li className="flex items-center justify-between">
            <span>previewFiles</span>
            <span className="font-semibold">{previewFiles.length}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>uploadingFiles</span>
            <span className="font-semibold">0</span>
          </li>
          <li className="flex items-center justify-between">
            <span>isReadyToUpload</span>
            <span className="font-semibold">true</span>
          </li>
          <li className="flex items-center justify-between">
            <span>isSessionReady</span>
            <span className="font-semibold">true</span>
          </li>
        </ul>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Component Tree</p>
        <pre className="mt-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded p-3 whitespace-pre leading-5">
{`ChatContainer
  ├─ VirtualMessageList
  │   └─ Message (x${state.messages.length})
  └─ MessageComposer`}
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
