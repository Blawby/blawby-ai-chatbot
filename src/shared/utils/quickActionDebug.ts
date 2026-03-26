const QUICK_ACTION_DEBUG_NAMESPACE = '[QuickActionDebug]';

declare global {
  interface Window {
    __blawbyQuickActionDebug?: boolean;
  }
}

export const isQuickActionDebugEnabled = (): boolean => {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return window.__blawbyQuickActionDebug === true;
};

export const quickActionDebugLog = (
  message: string,
  payload?: Record<string, unknown>
): void => {
  if (!isQuickActionDebugEnabled()) return;
  if (payload) {
    console.info(`${QUICK_ACTION_DEBUG_NAMESPACE} ${message}`, payload);
    return;
  }
  console.info(`${QUICK_ACTION_DEBUG_NAMESPACE} ${message}`);
};
