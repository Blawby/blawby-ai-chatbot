import { App } from './appsData';
import { Button } from '@/shared/ui/Button';
import { EditorShell, SectionDivider } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { Alert } from '@/shared/ui/feedback/Alert';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Icon } from '@/shared/ui/Icon';
import { Plug, Server, Laptop, History } from 'lucide-preact';
import { MCP_SCOPES, groupMcpScopes } from '@/shared/config/mcpScopes';

interface McpAccessPageProps {
  app: App;
  onBack: () => void;
}

/**
 * Practice settings detail for Claude Desktop / MCP access.
 *
 * Dedicated page (not the Clio `AppDetailPage`) because Claude Desktop access
 * uses Blawby's backend Better Auth OAuth provider, not a third-party REST app
 * connection. The frontend only presents the backend-owned client/scopes.
 */
export const McpAccessPage = ({ app, onBack }: McpAccessPageProps) => {
  const scopeGroups = groupMcpScopes(MCP_SCOPES);

  return (
    <EditorShell title={app.name} showBack onBack={onBack} contentMaxWidth={null}>
      <div className="space-y-6">
        <div className="pt-2 pb-2">
          <SettingRow
            label={app.name}
            labelNode={(
              <div className="flex items-center gap-4">
                <div className="field flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-line-subtle">
                  {app.logo ? (
                    <img src={app.logo} alt={`${app.name} logo`} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Icon icon={Plug} className="h-8 w-8 text-ink/80" aria-hidden="true" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-ink">{app.name}</h2>
                  <SettingsBadge variant="info">Not connected</SettingsBadge>
                </div>
              </div>
            )}
          >
            {/* Connect needs the backend-registered Claude Desktop OAuth client id. */}
            <Button variant="secondary" size="sm" disabled>
              Connect
            </Button>
          </SettingRow>
        </div>

        <Alert variant="info" title="Waiting on Claude Desktop client registration">
          Blawby&apos;s backend OAuth provider handles sign-in and consent. Once staging has a Claude Desktop
          OAuth client id registered, this page can start that standard authorize flow.
        </Alert>

        <SectionDivider />

        <SettingSection
          title="MCP server"
          description="The endpoint Claude Desktop connects to once MCP access is enabled."
        >
          <SettingRow
            label="Server URL"
            labelNode={(
              <div className="flex items-center gap-3">
                <Icon icon={Server} className="h-5 w-5 text-dim-2" aria-hidden="true" />
                <span className="text-sm font-medium text-ink">Server URL</span>
              </div>
            )}
            description="Provided by the backend once MCP server access is available."
          >
            <span className="text-sm text-dim-2">Not available yet</span>
          </SettingRow>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="OAuth scopes"
          description="The identity scopes currently expected by the backend OAuth provider."
        >
          <div className="space-y-6">
            {scopeGroups.map((group) => (
              <div key={group.category} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-dim-2">
                  {group.label}
                </h4>
                <div className="space-y-3">
                  {group.scopes.map((scope) => (
                    <div key={scope.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{scope.title}</span>
                        <code className="rounded bg-paper-2/10 px-1.5 py-0.5 font-mono text-xs text-dim-2">
                          {scope.id}
                        </code>
                      </div>
                      <p className="text-sm text-dim-2">{scope.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SettingSection>

        <SettingSection title="Active sessions">
          <EmptyState
            icon={<Icon icon={Laptop} className="h-8 w-8" aria-hidden="true" />}
            title="No active sessions"
            description="Connected Claude Desktop sessions can appear here once the backend exposes a session listing endpoint."
          />
        </SettingSection>

        <SectionDivider />

        <SettingSection title="Activity log">
          <EmptyState
            icon={<Icon icon={History} className="h-8 w-8" aria-hidden="true" />}
            title="No activity yet"
            description="Claude Desktop activity can appear here once the backend exposes an audit log endpoint."
          />
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default McpAccessPage;
