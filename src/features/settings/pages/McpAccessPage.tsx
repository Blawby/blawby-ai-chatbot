import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Copy, RefreshCw } from 'lucide-preact';
import type { App } from './appsData';
import { Button } from '@/shared/ui/Button';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { authClient } from '@/shared/lib/authClient';
import { MCP_SCOPES } from '@/shared/config/mcpScopes';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import {
  beginMcpOAuthConnect,
  getMcpResourceUrl,
  MCP_OAUTH_MESSAGE_QUERY_KEY,
  MCP_OAUTH_STATUS_QUERY_KEY,
} from '@/shared/lib/mcpOAuth';
import { getWorkspaceSettingsPath } from '@/shared/utils/workspace';
import { useNavigation } from '@/shared/utils/navigation';

interface OAuthConsentSummary {
  id: string;
  client_id?: string;
  clientId?: string;
  scopes?: string[];
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
  updated_at?: string | Date | null;
  updatedAt?: string | Date | null;
}

interface BetterAuthResult<T> {
  data?: T | null;
  error?: { message?: string; error_description?: string } | null;
}

interface McpAccessPageProps {
  onUpdate?: (updates: Partial<App>) => void;
  workspace: 'practice' | 'client';
  practiceSlug?: string;
}

const getConsentTimestamp = (consent: OAuthConsentSummary): string | Date | null =>
  consent.updated_at ?? consent.updatedAt ?? consent.created_at ?? consent.createdAt ?? null;

const getConsentConnectedAt = (consent: OAuthConsentSummary | null): string | undefined => {
  if (!consent) return undefined;
  const timestamp = getConsentTimestamp(consent);
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

export const McpAccessPage = ({ onUpdate, workspace, practiceSlug }: McpAccessPageProps) => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { showError, showSuccess } = useToastContext();
  const [consents, setConsents] = useState<OAuthConsentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const handledOAuthStatusRef = useRef<string | null>(null);
  const isPracticeWorkspace = workspace === 'practice';

  const mcpUrl = getMcpResourceUrl();
  const practiceSettingsPath = practiceSlug
    ? getWorkspaceSettingsPath('practice', practiceSlug, 'apps/claude-mcp')
    : null;
  const clientSettingsPath = practiceSlug
    ? getWorkspaceSettingsPath('client', practiceSlug, 'apps/claude-mcp')
    : null;
  const oauthStatus = typeof location.query?.[MCP_OAUTH_STATUS_QUERY_KEY] === 'string'
    ? location.query[MCP_OAUTH_STATUS_QUERY_KEY]
    : null;
  const oauthMessage = typeof location.query?.[MCP_OAUTH_MESSAGE_QUERY_KEY] === 'string'
    ? location.query[MCP_OAUTH_MESSAGE_QUERY_KEY]
    : null;

  const latestConsent = useMemo(() => {
    if (consents.length === 0) return null;
    return [...consents].sort((a, b) => {
      const aTime = new Date(getConsentTimestamp(a) ?? 0).getTime();
      const bTime = new Date(getConsentTimestamp(b) ?? 0).getTime();
      return bTime - aTime;
    })[0];
  }, [consents]);

  const publishConsentStatus = useCallback((nextConsents: OAuthConsentSummary[]) => {
    if (!onUpdate) return;
    const latest = nextConsents.length > 0
      ? [...nextConsents].sort((a, b) => {
        const aTime = new Date(getConsentTimestamp(a) ?? 0).getTime();
        const bTime = new Date(getConsentTimestamp(b) ?? 0).getTime();
        return bTime - aTime;
      })[0]
      : null;
    onUpdate({
      connected: nextConsents.length > 0,
      connectedAt: getConsentConnectedAt(latest),
      comingSoon: false,
    });
  }, [onUpdate]);

  const loadConsents = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await authClient.oauth2.getConsents() as BetterAuthResult<OAuthConsentSummary[]>;
      if (result.error) throw new Error(result.error.message ?? result.error.error_description ?? 'Failed to load authorizations.');
      const nextConsents = result.data ?? [];
      setConsents(nextConsents);
      publishConsentStatus(nextConsents);
    } catch (err) {
      showError('Unable to load authorizations', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsLoading(false);
    }
  }, [publishConsentStatus, showError]);

  useEffect(() => { void loadConsents(); }, [loadConsents]);

  useEffect(() => {
    if (workspace !== 'client' || !practiceSettingsPath || !clientSettingsPath) return;
    if (location.path !== clientSettingsPath) return;
    navigate(practiceSettingsPath, true);
  }, [clientSettingsPath, location.path, navigate, practiceSettingsPath, workspace]);

  useEffect(() => {
    if (!oauthStatus || handledOAuthStatusRef.current === `${oauthStatus}:${oauthMessage ?? ''}`) return;
    handledOAuthStatusRef.current = `${oauthStatus}:${oauthMessage ?? ''}`;

    if (oauthStatus === 'success') {
      setConnectionError(null);
      showSuccess('Claude connected', 'Claude can now request access to this practice through MCP.');
      void loadConsents();
    } else if (oauthStatus === 'error') {
      setConnectionError(oauthMessage ?? 'Unable to complete authorization.');
      showError('Claude connection failed', oauthMessage ?? 'Unable to complete authorization.');
    }

    if (location.path) {
      navigate(location.path, true);
    }
  }, [loadConsents, location.path, navigate, oauthMessage, oauthStatus, showError, showSuccess]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      showSuccess('Copied', 'MCP server URL copied to clipboard.');
    } catch {
      showError('Copy failed', 'Select and copy the URL manually.');
    }
  };

  const handleConnect = useCallback(async () => {
    if (!isPracticeWorkspace || !practiceSettingsPath) {
      showError('Practice-only setting', 'Connect Claude from the practice workspace settings page.');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);
    try {
      await beginMcpOAuthConnect(practiceSettingsPath);
    } catch (err) {
      setIsConnecting(false);
      showError('Unable to start authorization', err instanceof Error ? err.message : 'Unexpected error.');
    }
  }, [isPracticeWorkspace, practiceSettingsPath, showError]);

  const handleRevoke = useCallback(async (consentId: string) => {
    setRevokingId(consentId);
    try {
      const result = await authClient.oauth2.deleteConsent({ id: consentId }) as BetterAuthResult<unknown>;
      if (result.error) throw new Error(result.error.message ?? result.error.error_description ?? 'Failed to revoke.');
      setConnectionError(null);
      showSuccess('Access revoked', 'Claude will need to request access again the next time it connects.');
      await loadConsents();
    } catch (err) {
      showError('Unable to revoke', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setRevokingId(null);
    }
  }, [loadConsents, showError, showSuccess]);

  if (!isPracticeWorkspace) {
    return (
      <SettingSection
        first
        title="Claude Desktop"
        description="Claude MCP access is managed from the practice workspace settings."
      >
        <SettingsCard className="max-w-[860px]">
          <p className="text-sm text-dim">
            Open this integration from the practice workspace to connect Claude Desktop or revoke its access.
          </p>
        </SettingsCard>
      </SettingSection>
    );
  }

  return (
    <div className="space-y-8">
      <SettingSection
        first
        title="Setup"
        description="Connect Claude from this page, then use the MCP server URL in Claude Desktop. The first connection opens your browser so you can approve access."
      >
        <SettingsCard className="max-w-[860px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting…' : 'Connect Claude'}
            </Button>
            <p className="text-[13px] text-dim">
              This pre-authorizes Claude Desktop for this practice so future connections can reuse consent.
            </p>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-dim mb-2">MCP server URL</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 rounded-[12px] border border-rule bg-paper px-3.5 py-2.5 font-mono text-[13px] text-ink break-all">
              {mcpUrl}
            </code>
            <Button
              variant="secondary"
              size="sm"
              icon={Copy}
              iconClassName="h-4 w-4"
              onClick={() => void handleCopyUrl()}
            >
              Copy
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-dim">
            Paste this URL into Claude Desktop&apos;s MCP server configuration. Claude discovers the auth server automatically — no other setup needed.
          </p>
        </SettingsCard>
      </SettingSection>

      <SettingSection
        title="Connection status"
        description="Shows whether Claude has been authorized to access your Blawby practice data."
      >
        <SettingsCard className="max-w-[860px]">
          <div className="flex items-center justify-between gap-4">
            <div>
              {isLoading ? (
                <div className="flex items-center">
                  <LoadingSpinner size="sm" ariaLabel="Loading Claude MCP authorizations" className="text-dim" />
                </div>
              ) : connectionError ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-[var(--warn,#f59e0b)]" />
                    <span className="text-sm font-medium text-ink">Connection failed</span>
                  </div>
                  <p className="mt-0.5 text-xs text-dim">
                    {connectionError}
                  </p>
                  {latestConsent && getConsentTimestamp(latestConsent) ? (
                    <p className="mt-2 text-xs text-dim">
                      Existing consent last approved {formatDate(getConsentTimestamp(latestConsent) as string | Date)}.
                    </p>
                  ) : null}
                </>
              ) : consents.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-[var(--pos,#22c55e)]" />
                    <span className="text-sm font-medium text-ink">Authorized</span>
                  </div>
                  {latestConsent && getConsentTimestamp(latestConsent) ? (
                    <p className="mt-0.5 text-xs text-dim">
                      Last approved {formatDate(getConsentTimestamp(latestConsent) as string | Date)}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-rule" />
                    <span className="text-sm font-medium text-ink">Not connected</span>
                  </div>
                  <p className="mt-0.5 text-xs text-dim">
                    Configure Claude Desktop with the server URL above, then connect from Claude.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleConnect()}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting…' : 'Connect Claude'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                iconClassName="h-4 w-4"
                onClick={() => void loadConsents()}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>
          </div>
        </SettingsCard>
      </SettingSection>

      {consents.length > 0 ? (
        <SettingSection
          title="Authorized access"
          description="Revoke Claude's access here. It will need to sign in and request access again the next time it connects."
        >
          <SettingsCard className="max-w-[860px] px-0 py-0">
            <div className="divide-y divide-rule">
              {consents.map((consent) => {
                const ts = getConsentTimestamp(consent);
                const isRevoking = revokingId === consent.id;
                return (
                  <div key={consent.id} className="flex items-start justify-between gap-4 px-5 py-4 max-sm:flex-col">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        Authorized {ts ? formatDate(ts as string | Date) : 'recently'}
                      </p>
                      {Array.isArray(consent.scopes) && consent.scopes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {consent.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-dim"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleRevoke(consent.id)}
                      disabled={isRevoking}
                    >
                      {isRevoking ? 'Revoking…' : 'Revoke access'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        </SettingSection>
      ) : null}

      <SettingSection
        title="Permissions"
        description="Scopes Claude can request when connecting to this workspace."
      >
        <SettingsCard className="max-w-[860px]">
          <div className="flex flex-wrap gap-2">
            {MCP_SCOPES.map((scope) => (
              <div key={scope.id} className="rounded-[12px] border border-rule px-3 py-2">
                <p className="text-[13px] font-medium text-ink">{scope.title}</p>
                <p className="mt-0.5 text-xs text-dim">{scope.description}</p>
              </div>
            ))}
          </div>
        </SettingsCard>
      </SettingSection>
    </div>
  );
};
