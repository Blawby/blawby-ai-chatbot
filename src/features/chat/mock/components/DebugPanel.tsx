import { useState } from 'preact/hooks';
import type { DebugEvent } from '../types';

interface DebugPanelProps {
  events: DebugEvent[];
  onClear: () => void;
}

export function DebugPanel({ events, onClear }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-t border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg h-72 flex flex-col">
      <button
        type="button"
        className="flex items-center justify-between px-4 py-2 text-left text-sm font-semibold text-gray-800 dark:text-gray-100"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>Debug Events</span>
        <span className="flex items-center gap-2">
          <span className="text-xs rounded-full bg-gray-100 dark:bg-dark-surface px-2 py-1 text-gray-600 dark:text-gray-300">{events.length}</span>
          <span className="text-xs text-blue-600 dark:text-blue-400">{isOpen ? 'Hide' : 'Show'}</span>
        </span>
      </button>
      {isOpen && (
        <>
          <div className="flex items-center justify-between px-4 pb-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">Newest first</p>
            <button
              type="button"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 text-xs font-mono">
            {events.map((event) => (
              <div key={event.id} className="border border-gray-200 dark:border-dark-border rounded p-3 bg-gray-50 dark:bg-dark-surface">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{event.type}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <pre className="whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400">No events yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
