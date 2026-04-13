const WIDGET_RUNTIME_CONTEXT_KEY = 'blawby_widget_runtime_context';
const WIDGET_AUTH_TOKEN_KEY = 'blawby_widget_auth_token';
const WIDGET_AUTH_TOKEN_EXP_KEY = 'blawby_widget_auth_token_exp';
const WIDGET_QUERY_AUTH_TOKEN_KEY = 'blawby_widget_query_auth_token';
const WIDGET_QUERY_AUTH_TOKEN_EXP_KEY = 'blawby_widget_query_auth_token_exp';

const safeSessionStorageGet = (key: string): string | null => {
 if (typeof window === 'undefined') return null;
 try {
  return window.sessionStorage.getItem(key);
 } catch {
  return null;
 }
};

const safeSessionStorageSet = (key: string, value: string): void => {
 if (typeof window === 'undefined') return;
 try {
  window.sessionStorage.setItem(key, value);
 } catch {
  // ignore storage failures
 }
};

const safeSessionStorageRemove = (key: string): void => {
 if (typeof window === 'undefined') return;
 try {
  window.sessionStorage.removeItem(key);
 } catch {
  // ignore storage failures
 }
};

export const isWidgetRuntimeContext = (): boolean => {
 if (typeof window === 'undefined') return false;
 if (new URLSearchParams(window.location.search).get('v') === 'widget') return true;
 return safeSessionStorageGet(WIDGET_RUNTIME_CONTEXT_KEY) === '1';
};

export const setWidgetRuntimeContext = (enabled: boolean): void => {
 if (enabled) {
  safeSessionStorageSet(WIDGET_RUNTIME_CONTEXT_KEY, '1');
  return;
 }
 safeSessionStorageRemove(WIDGET_RUNTIME_CONTEXT_KEY);
};

export const persistWidgetAuthToken = (
 token: string,
 expiresAt?: string | null,
 options?: { queryToken?: string | null; queryTokenExpiresAt?: string | null }
): void => {
 if (!token || token.trim().length === 0) return;
 safeSessionStorageSet(WIDGET_AUTH_TOKEN_KEY, token.trim());
 if (typeof expiresAt === 'string' && expiresAt.trim().length > 0) {
  safeSessionStorageSet(WIDGET_AUTH_TOKEN_EXP_KEY, expiresAt.trim());
 } else {
  safeSessionStorageRemove(WIDGET_AUTH_TOKEN_EXP_KEY);
 }
 const queryToken = options?.queryToken?.trim();
 if (queryToken) {
  safeSessionStorageSet(WIDGET_QUERY_AUTH_TOKEN_KEY, queryToken);
  const queryTokenExpiresAt = options?.queryTokenExpiresAt?.trim();
  if (queryTokenExpiresAt) {
   safeSessionStorageSet(WIDGET_QUERY_AUTH_TOKEN_EXP_KEY, queryTokenExpiresAt);
  } else {
   safeSessionStorageRemove(WIDGET_QUERY_AUTH_TOKEN_EXP_KEY);
  }
 } else {
  safeSessionStorageRemove(WIDGET_QUERY_AUTH_TOKEN_KEY);
  safeSessionStorageRemove(WIDGET_QUERY_AUTH_TOKEN_EXP_KEY);
 }
};

export const clearWidgetAuthToken = (): void => {
 safeSessionStorageRemove(WIDGET_AUTH_TOKEN_KEY);
 safeSessionStorageRemove(WIDGET_AUTH_TOKEN_EXP_KEY);
 safeSessionStorageRemove(WIDGET_QUERY_AUTH_TOKEN_KEY);
 safeSessionStorageRemove(WIDGET_QUERY_AUTH_TOKEN_EXP_KEY);
};

const isTokenExpired = (expiresAtKey: string): boolean => {
 const expiresAt = safeSessionStorageGet(expiresAtKey);
 if (!expiresAt) return false;
 const expMs = Date.parse(expiresAt);
 if (!Number.isFinite(expMs)) return true;
 return Date.now() >= expMs;
};

export const getWidgetAuthToken = (options?: { source?: 'authorization' | 'query' }): string | null => {
 const source = options?.source ?? 'authorization';
 const tokenKey = source === 'query' ? WIDGET_QUERY_AUTH_TOKEN_KEY : WIDGET_AUTH_TOKEN_KEY;
 const expiresAtKey = source === 'query' ? WIDGET_QUERY_AUTH_TOKEN_EXP_KEY : WIDGET_AUTH_TOKEN_EXP_KEY;
 const token = safeSessionStorageGet(tokenKey);
 if (!token || token.trim().length === 0) return null;
 if (isTokenExpired(expiresAtKey)) {
  safeSessionStorageRemove(tokenKey);
  safeSessionStorageRemove(expiresAtKey);
  return null;
 }
 return token.trim();
};

export const withWidgetAuthHeaders = (headers?: HeadersInit): Headers => {
 const merged = new Headers(headers ?? {});
 const token = getWidgetAuthToken();
 if (token) {
  merged.set('Authorization', `Bearer ${token}`);
 }
 return merged;
};

export const appendWidgetTokenToUrl = (url: string): string => {
 const token = getWidgetAuthToken({ source: 'query' });
 if (!token) return url;
 try {
  const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  parsed.searchParams.set('bw_token', token);
  return parsed.toString();
 } catch {
  return url;
 }
};
