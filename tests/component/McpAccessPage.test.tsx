import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpAccessPage } from '@/features/settings/pages/McpAccessPage';

const {
  navigate,
  showError,
  showSuccess,
  beginMcpOAuthConnect,
  getConsents,
  deleteConsent,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  beginMcpOAuthConnect: vi.fn(),
  getConsents: vi.fn(),
  deleteConsent: vi.fn(),
}));

const locationState: {
  path: string;
  query: Record<string, string | undefined>;
} = {
  path: '/practice/acme/settings/apps/claude-mcp',
  query: {},
};

vi.mock('preact-iso', () => ({
  useLocation: () => locationState,
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate,
  }),
}));

vi.mock('@/shared/contexts/ToastContext', () => ({
  useToastContext: () => ({
    showError,
    showSuccess,
  }),
}));

vi.mock('@/shared/ui/layout/LoadingSpinner', () => ({
  LoadingSpinner: () => <div>Loading…</div>,
}));

vi.mock('@/shared/lib/mcpOAuth', () => ({
  beginMcpOAuthConnect,
  getMcpResourceUrl: () => 'https://local.blawby.com/api/mcp',
  MCP_OAUTH_STATUS_QUERY_KEY: 'mcp_oauth',
  MCP_OAUTH_MESSAGE_QUERY_KEY: 'message',
}));

vi.mock('@/shared/lib/authClient', () => ({
  authClient: {
    oauth2: {
      getConsents,
      deleteConsent,
    },
  },
}));

describe('McpAccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationState.path = '/practice/acme/settings/apps/claude-mcp';
    locationState.query = {};
    getConsents.mockResolvedValue({ data: [] });
    deleteConsent.mockResolvedValue({ data: {} });
    beginMcpOAuthConnect.mockResolvedValue(undefined);
  });

  it('starts the PKCE connect flow from practice settings', async () => {
    render(<McpAccessPage workspace="practice" practiceSlug="acme" />);

    await waitFor(() => {
      expect(getConsents).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getAllByText('Connect Claude')[0]);

    await waitFor(() => {
      expect(beginMcpOAuthConnect).toHaveBeenCalledWith('/practice/acme/settings/apps/claude-mcp');
    });
  });

  it('handles callback success state and refreshes consents', async () => {
    locationState.query = { mcp_oauth: 'success' };

    render(<McpAccessPage workspace="practice" practiceSlug="acme" />);

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith(
        'Claude connected',
        'Claude can now request access to this practice through MCP.',
      );
      expect(navigate).toHaveBeenCalledWith('/practice/acme/settings/apps/claude-mcp', true);
    });

    expect(getConsents).toHaveBeenCalled();
  });

  it('shows a failed connection state when the callback returns an error even if consent exists', async () => {
    locationState.query = { mcp_oauth: 'error', message: 'invalid_request' };
    getConsents.mockResolvedValue({
      data: [{ id: 'consent-1', created_at: '2026-06-02T10:00:00.000Z' }],
    });

    render(<McpAccessPage workspace="practice" practiceSlug="acme" />);

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith('Claude connection failed', 'invalid_request');
    });

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByText('invalid_request')).toBeInTheDocument();
    expect(screen.queryByText('Authorized')).not.toBeInTheDocument();
  });

  it('redirects client settings access to the practice settings page', async () => {
    locationState.path = '/client/acme/settings/apps/claude-mcp';

    render(<McpAccessPage workspace="client" practiceSlug="acme" />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/practice/acme/settings/apps/claude-mcp', true);
    });
  });
});
