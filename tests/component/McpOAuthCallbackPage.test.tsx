import { render, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import McpOAuthCallbackPage from '@/pages/McpOAuthCallbackPage';

const NativeURL = URL;

const {
  navigate,
  buildMcpSettingsReturnPath,
  clearMcpOAuthState,
  exchangeMcpAuthorizationCode,
  readMcpOAuthState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  buildMcpSettingsReturnPath: vi.fn((basePath: string, status: 'success' | 'error', message?: string) => {
    const params = new URLSearchParams({ mcp_oauth: status });
    if (message) params.set('message', message);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }),
  clearMcpOAuthState: vi.fn(),
  exchangeMcpAuthorizationCode: vi.fn(),
  readMcpOAuthState: vi.fn(),
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate,
  }),
}));

vi.mock('@/shared/ui/layout/LoadingScreen', () => ({
  LoadingScreen: () => <div>Loading…</div>,
}));

vi.mock('@/shared/lib/mcpOAuth', () => ({
  buildMcpSettingsReturnPath,
  clearMcpOAuthState,
  exchangeMcpAuthorizationCode,
  readMcpOAuthState,
}));

let currentCallbackUrl = 'http://localhost/oauth/callback';

const setCurrentUrl = (path: string) => {
  currentCallbackUrl = new NativeURL(path, 'http://localhost').toString();
};

describe('McpOAuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentUrl('/oauth/callback');
    vi.stubGlobal('URL', class extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        const resolvedInput =
          typeof input === 'string' && input === window.location.href
            ? currentCallbackUrl
            : input;
        super(resolvedInput as string, base as string | undefined);
      }
    });
    readMcpOAuthState.mockReturnValue({
      verifier: 'verifier-123',
      state: 'state-123',
      returnPath: '/practice/acme/settings/apps/claude-mcp',
    });
  });

  it('exchanges the code and returns to the originating practice settings page', async () => {
    setCurrentUrl('/oauth/callback?code=code-123&state=state-123');
    exchangeMcpAuthorizationCode.mockResolvedValue(new Response(JSON.stringify({ access_token: 'token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    render(<McpOAuthCallbackPage />);

    await waitFor(() => {
      expect(exchangeMcpAuthorizationCode).toHaveBeenCalledWith('code-123', 'verifier-123');
      expect(navigate).toHaveBeenCalledWith('/practice/acme/settings/apps/claude-mcp?mcp_oauth=success', true);
    });
    expect(clearMcpOAuthState).toHaveBeenCalled();
  });

  it('fails fast on state mismatch and skips token exchange', async () => {
    readMcpOAuthState.mockReturnValue({
      verifier: 'verifier-123',
      state: 'expected-state',
      returnPath: '/practice/acme/settings/apps/claude-mcp',
    });
    setCurrentUrl('/oauth/callback?code=code-123&state=wrong-state');

    render(<McpOAuthCallbackPage />);

    await waitFor(() => {
      expect(exchangeMcpAuthorizationCode).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(
        '/practice/acme/settings/apps/claude-mcp?mcp_oauth=error&message=Authorization+failed%3A+state+mismatch.',
        true,
      );
    });
  });

  it('returns to settings when the provider sends an OAuth error', async () => {
    setCurrentUrl('/oauth/callback?error=access_denied&state=state-123');

    render(<McpOAuthCallbackPage />);

    await waitFor(() => {
      expect(exchangeMcpAuthorizationCode).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(
        '/practice/acme/settings/apps/claude-mcp?mcp_oauth=error&message=access_denied',
        true,
      );
    });
  });

  it('surfaces token exchange failures from the backend response', async () => {
    setCurrentUrl('/oauth/callback?code=code-123&state=state-123');
    exchangeMcpAuthorizationCode.mockResolvedValue(new Response(JSON.stringify({ error_description: 'invalid_grant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));

    render(<McpOAuthCallbackPage />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        '/practice/acme/settings/apps/claude-mcp?mcp_oauth=error&message=invalid_grant',
        true,
      );
    });
  });
});
