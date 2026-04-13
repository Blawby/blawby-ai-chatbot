const QUICK_ACTION_DEBUG_NAMESPACE = '[QuickActionDebug]';

declare global {
 interface Window {
  __blawbyQuickActionDebug?: boolean;
 }
}

export const isQuickActionDebugEnabled = (): boolean => {
 if (!import.meta.env.DEV) return false;
 if (typeof window === 'undefined') return false;
 try {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debugQuickActions') === '1') return true;
  if (window.__blawbyQuickActionDebug === true) return true;
  if (typeof localStorage !== 'undefined' && localStorage.getItem('debugQuickActions') === '1') return true;
 } catch {
  // Ignore URL/localStorage access failures and fall through to the explicit flag.
 }
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
