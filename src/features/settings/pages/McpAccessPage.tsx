import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Copy, RefreshCw } from 'lucide-preact';
import type { App } from './appsData';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SettingsCard } from '@/features/settings/components/SettingsCard';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { formatDate } from '@/shared/utils/dateTime';
import { authClient } from '@/shared/lib/authClient';
import { getWorkerApiUrl } from '@/config/urls';
import { MCP_SCOPES } from '@/shared/config/mcpScopes';

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
  app: App;
  onBack: () => void;
  onUpdate?: (updates: Partial<App>) => void;
}

const getMcpServerUrl = () => `${getWorkerApiUrl()}/api/mcp`;

const getConsentTimestamp = (consent: OAuthConsentSummary): string | Date | null =>
  consent.updated_at ?? consent.updatedAt ?? consent.created_at ?? consent.createdAt ?? null;

export const McpAccessPage = ({ onUpdate }: McpAccessPageProps) => {
  const { showError, showSuccess } = useToastContext();
  const [consents, setConsents] = useState<OAuthConsentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const mcpUrl = getMcpServerUrl();

  const latestConsent = useMemo(() => {
    if (consents.length === 0) return null;
    return [...consents].sort((a, b) => {
      const aTime = new Date(getConsentTimestamp(a) ?? 0).getTime();
      const bTime = new Date(getConsentTimestamp(b) ?? 0).getTime();
      return bTime - aTime;
    })[0];
  }, [consents]);

  const loadConsents = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await authClient.oauth2.getConsents() as BetterAuthResult<OAuthConsentSummary[]>;
      if (result.error) throw new Error(result.error.message ?? result.error.error_description ?? 'Failed to load authorizations.');
      setConsents(result.data ?? []);
    } catch (err) {
      showError('Unable to load authorizations', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => { void loadConsents(); }, [loadConsents]);

  useEffect(() => {
    onUpdate?.({
      connected: consents.length > 0,
      connectedAt: latestConsent ? new Date(getConsentTimestamp(latestConsent) ?? Date.now()).toISOString() : undefined,
      comingSoon: false,
    });
  }, [consents.length, latestConsent, onUpdate]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      showSuccess('Copied', 'MCP server URL copied to clipboard.');
    } catch {
      showError('Copy failed', 'Select and copy the URL manually.');
    }
  };

  const handleRevoke = useCallback(async (consentId: string) => {
    setRevokingId(consentId);
    try {
      const result = await authClient.oauth2.deleteConsent({ id: consentId }) as BetterAuthResult<unknown>;
      if (result.error) throw new Error(result.error.message ?? result.error.error_description ?? 'Failed to revoke.');
      showSuccess('Access revoked', 'Claude will need to request access again the next time it connects.');
      await loadConsents();
    } catch (err) {
      showError('Unable to revoke', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setRevokingId(null);
    }
  }, [loadConsents, showError, showSuccess]);

  return (
    <div className="space-y-8">
      <SettingSection
        first
        title="Setup"
        description="Add this MCP server URL in Claude Desktop. When Claude connects for the first time, it opens your browser so you can sign in and approve access."
      >
        <SettingsCard className="max-w-[860px]">
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
            Paste this URL into Claude Desktop's MCP server configuration. Claude discovers the auth server automatically — no other setup needed.
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
                <p className="text-sm text-dim">Loading…</p>
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
