import { FunctionComponent } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';

const DEBUG_UPDATE_EVENT = 'blawby:debug-update';
const UPDATE_THROTTLE_MS = 1000;
const FALLBACK_POLL_INTERVAL_MS = 5000;

interface DebugOverlayProps {
  isVisible?: boolean;
}

interface ToolCall {
  tool: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export const DebugOverlay: FunctionComponent<DebugOverlayProps> = ({ isVisible = false }) => {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [conversationState, setConversationState] = useState<string>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const warningsRef = useRef<Record<string, boolean>>({});
  const lastUpdateRef = useRef<number>(0);

  const isDev = import.meta.env.DEV;
  const shouldRender = isDev && isVisible;

  const logMessage = useCallback((key: string, level: 'warn' | 'error' | 'debug', message: string, detail?: unknown) => {
    if (level === 'debug') {
      console.debug(message, detail);
      return;
    }

    if (!warningsRef.current[key]) {
      warningsRef.current[key] = true;
      console[level](message, detail);
    } else if (level === 'warn') {
      console.debug(message, detail);
    }
  }, []);

  const getWindowProperty = useCallback((key: string): unknown => {
    try {
      return (window as unknown as Record<string, unknown>)[key];
    } catch (accessError) {
      logMessage(`window-${key}`, 'warn', `Failed to access window.${key}`, accessError);
      return undefined;
    }
  }, [logMessage]);

  const validateToolCalls = useCallback((data: unknown): ToolCall[] => {
    if (!Array.isArray(data)) {
      logMessage('toolcalls-array', 'warn', '__toolCalls is not an array, using empty array as fallback', data);
      return [];
    }

    return data.filter((item): item is ToolCall => {
      if (typeof item !== 'object' || item === null) {
        logMessage('toolcalls-item', 'warn', 'Invalid tool call item (not an object)', item);
        return false;
      }

      const call = item as Record<string, unknown>;
      const isValid =
        typeof call.tool === 'string' &&
        typeof call.timestamp === 'number' &&
        call.data !== undefined;

      if (!isValid) {
        logMessage('toolcalls-structure', 'warn', 'Invalid tool call structure', call);
      }

      return isValid;
    });
  }, [logMessage]);

  const validateConversationState = useCallback((data: unknown): string => {
    if (typeof data === 'string') {
      return data;
    }

    logMessage('conversation-state', 'warn', '__conversationState is not a string, using "unknown" as fallback', data);
    return 'unknown';
  }, [logMessage]);

  const updateToolCalls = useCallback((): boolean => {
    try {
      const rawCalls = getWindowProperty('__toolCalls');
      const validatedCalls = validateToolCalls(rawCalls);
      setToolCalls(validatedCalls);
      return true;
    } catch (toolError) {
      logMessage('toolcalls-error', 'error', 'Error updating tool calls', toolError);
      const message = toolError instanceof Error ? toolError.message : 'Unknown error';
      setError(`Tool calls error: ${message}`);
      setToolCalls([]);
      return false;
    }
  }, [getWindowProperty, validateToolCalls, logMessage]);

  const updateConversationState = useCallback((): boolean => {
    try {
      const rawState = getWindowProperty('__conversationState');
      const validatedState = validateConversationState(rawState);
      setConversationState(validatedState);
      return true;
    } catch (stateError) {
      logMessage('conversation-error', 'error', 'Error updating conversation state', stateError);
      const message = stateError instanceof Error ? stateError.message : 'Unknown error';
      setError(`Conversation state error: ${message}`);
      setConversationState('unknown');
      return false;
    }
  }, [getWindowProperty, validateConversationState, logMessage]);

  const updateFromGlobals = useCallback((force = false) => {
    if (!shouldRender) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastUpdateRef.current < UPDATE_THROTTLE_MS) {
      return;
    }

    lastUpdateRef.current = now;

    const toolCallsSuccess = updateToolCalls();
    const conversationStateSuccess = updateConversationState();

    if (toolCallsSuccess && conversationStateSuccess) {
      setError(null);
      setLastUpdated(new Date());
    }
  }, [shouldRender, updateToolCalls, updateConversationState]);

  useEffect(() => {
    if (!shouldRender || typeof window === 'undefined') {
      return;
    }

    updateFromGlobals(true);

    const handleDebugUpdate = () => updateFromGlobals(false);
    window.addEventListener(DEBUG_UPDATE_EVENT, handleDebugUpdate);

    const fallbackInterval = window.setInterval(handleDebugUpdate, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener(DEBUG_UPDATE_EVENT, handleDebugUpdate);
      window.clearInterval(fallbackInterval);
    };
  }, [shouldRender, updateFromGlobals]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't interfere with typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return;
    }

    if (event.key === 'Escape') {
      setIsExpanded(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsExpanded(!isExpanded);
    }
  }, [isExpanded]);

  // Add keyboard event listener when visible
  useEffect(() => {
    if (!shouldRender) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shouldRender, handleKeyDown]);

  if (!shouldRender) return null;

  return (
    <div 
      className="fixed top-4 left-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50" 
      data-testid="debug-overlay"
      role="region"
      aria-label="Debug information overlay"
      aria-live="polite"
    >
      <div className="mb-2 flex justify-between items-center">
        <strong>Debug Overlay</strong>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 rounded px-1"
          aria-label={isExpanded ? 'Collapse debug overlay' : 'Expand debug overlay'}
          aria-expanded={isExpanded}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>
      
      {error && (
        <div className="mb-2 p-2 bg-red-600 bg-opacity-50 rounded border border-red-400" role="alert" aria-live="assertive">
          <div className="text-red-200 font-semibold">Error:</div>
          <div className="text-red-100 text-xs">{error}</div>
        </div>
      )}
      
      <div className="mb-2">
        <div><strong>Conversation State:</strong> <span aria-label={`Current conversation state is ${conversationState}`}>{conversationState}</span></div>
      </div>
      
      <div className="mb-2">
        <div><strong>Tool Calls ({toolCalls.length}):</strong></div>
        {toolCalls.length === 0 ? (
          <div className="text-gray-400" aria-label="No tool calls have been detected">No tool calls detected</div>
        ) : (
          <div className="max-h-32 overflow-y-auto" role="list" aria-label="List of tool calls">
            {toolCalls.map((call, index) => (
              <div 
                key={index} 
                className="text-green-400" 
                role="listitem"
                aria-label={`Tool call ${index + 1}: ${call.tool} at ${new Date(call.timestamp).toLocaleTimeString()}`}
              >
                {call.tool} ({new Date(call.timestamp).toLocaleTimeString()})
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="text-xs text-gray-400" aria-label={lastUpdated ? `Last updated at ${lastUpdated.toLocaleTimeString()}` : 'No successful updates yet'}>
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
      </div>
      
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-gray-600" role="region" aria-label="Additional debug information">
          <div className="text-xs text-gray-300">
            <div>Press <kbd className="bg-gray-700 px-1 rounded">Esc</kbd> to collapse</div>
            <div>Press <kbd className="bg-gray-700 px-1 rounded">Enter</kbd> or <kbd className="bg-gray-700 px-1 rounded">Space</kbd> to toggle</div>
          </div>
        </div>
      )}
    </div>
  );
};
