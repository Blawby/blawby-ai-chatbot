import { getWorkerApiUrl, getBackendApiUrl } from '@/config/urls';
import { MCP_SCOPES } from '@/shared/config/mcpScopes';

export const MCP_OAUTH_CLIENT_ID = 'blawby-claude-mcp';
export const MCP_OAUTH_CALLBACK_PATH = '/oauth/callback';
export const MCP_OAUTH_STATUS_QUERY_KEY = 'mcp_oauth';
export const MCP_OAUTH_MESSAGE_QUERY_KEY = 'message';

const PKCE_VERIFIER_KEY = 'mcpOAuth:pkceVerifier';
const PKCE_STATE_KEY = 'mcpOAuth:state';
const RETURN_PATH_KEY = 'mcpOAuth:returnPath';

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const randomBase64Url = (size: number): string => toBase64Url(crypto.getRandomValues(new Uint8Array(size)));

const buildCallbackUrl = (): string => `${getWorkerApiUrl()}${MCP_OAUTH_CALLBACK_PATH}`;

const setSessionItem = (key: string, value: string): void => {
  window.sessionStorage.setItem(key, value);
};

const getSessionItem = (key: string): string | null => window.sessionStorage.getItem(key);

const removeSessionItem = (key: string): void => {
  window.sessionStorage.removeItem(key);
};

export async function beginMcpOAuthConnect(returnPath: string): Promise<void> {
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(16);
  const challengeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = toBase64Url(new Uint8Array(challengeDigest));

  setSessionItem(PKCE_VERIFIER_KEY, verifier);
  setSessionItem(PKCE_STATE_KEY, state);
  setSessionItem(RETURN_PATH_KEY, returnPath);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MCP_OAUTH_CLIENT_ID,
    redirect_uri: buildCallbackUrl(),
    resource: getMcpResourceUrl(),
    scope: MCP_SCOPES.map((scope) => scope.id).join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.href = `${getWorkerApiUrl()}/api/auth/oauth2/authorize?${params.toString()}`;
}

export function readMcpOAuthState(): {
  verifier: string | null;
  state: string | null;
  returnPath: string | null;
} {
  return {
    verifier: getSessionItem(PKCE_VERIFIER_KEY),
    state: getSessionItem(PKCE_STATE_KEY),
    returnPath: getSessionItem(RETURN_PATH_KEY),
  };
}

export function clearMcpOAuthState(): void {
  removeSessionItem(PKCE_VERIFIER_KEY);
  removeSessionItem(PKCE_STATE_KEY);
  removeSessionItem(RETURN_PATH_KEY);
}

export function buildMcpSettingsReturnPath(basePath: string, status: 'success' | 'error', message?: string): string {
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set(MCP_OAUTH_STATUS_QUERY_KEY, status);
  if (message) {
    url.searchParams.set(MCP_OAUTH_MESSAGE_QUERY_KEY, message);
  } else {
    url.searchParams.delete(MCP_OAUTH_MESSAGE_QUERY_KEY);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getMcpResourceUrl(): string {
  return `${getBackendApiUrl().replace(/\/+$/, '')}/mcp`;
}

export async function exchangeMcpAuthorizationCode(code: string, verifier: string): Promise<Response> {
  return fetch(`${getWorkerApiUrl()}/api/auth/oauth2/token`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: buildCallbackUrl(),
      client_id: MCP_OAUTH_CLIENT_ID,
      code_verifier: verifier,
      resource: getMcpResourceUrl(),
    }),
  });
}
