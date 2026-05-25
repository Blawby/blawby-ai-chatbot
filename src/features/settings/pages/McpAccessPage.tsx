import { App } from './appsData';
import { Button } from '@/shared/ui/Button';
import { EditorShell, SectionDivider } from '@/shared/ui/layout';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { SettingSection } from '@/features/settings/components/SettingSection';
import { SettingsBadge } from '@/features/settings/components/SettingsBadge';
import { Alert } from '@/shared/ui/feedback/Alert';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Icon } from '@/shared/ui/Icon';
import { Plug, Server, CircleDollarSign, Laptop, History } from 'lucide-preact';
import { MCP_SCOPES, groupMcpScopes } from '@/shared/config/mcpScopes';

interface McpAccessPageProps {
  app: App;
  onBack: () => void;
}

/**
 * Practice settings detail for Claude Desktop / MCP access.
 *
 * Dedicated page (not the Clio `AppDetailPage`) because MCP access is modelled
 * around OAuth scopes, sessions, money-action approvals, and an audit log —
 * not the Clio shape of REST endpoint "actions" + developer metadata.
 *
 * Backend MCP contracts (DCR connect, live sessions, editable threshold, audit
 * log) land in Blawby/blawby-backend#282. Until then this page shows accurate
 * status and disabled/empty states rather than pretending those work.
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
                <div className="input-surface flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-line-subtle">
                  {app.logo ? (
                    <img src={app.logo} alt={`${app.name} logo`} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Icon icon={Plug} className="h-8 w-8 text-input-text/80" aria-hidden="true" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-input-text">{app.name}</h2>
                  <SettingsBadge variant="info">Not connected</SettingsBadge>
                </div>
              </div>
            )}
          >
            {/* Real connect uses Claude Desktop dynamic client registration, which
                is gated on backend MCP support. Disabled until that lands so we
                never claim a working connect flow. */}
            <Button variant="secondary" size="sm" disabled>
              Connect
            </Button>
          </SettingRow>
        </div>

        <Alert variant="info" title="Connecting Claude Desktop is coming soon">
          Claude Desktop connects to your practice over the Model Context Protocol (MCP) using OAuth.
          Dynamic registration becomes available once MCP server support is enabled for your practice —
          the scopes and approval rules below describe what that access will allow.
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
                <Icon icon={Server} className="h-5 w-5 text-input-placeholder" aria-hidden="true" />
                <span className="text-sm font-medium text-input-text">Server URL</span>
              </div>
            )}
            description="Provided automatically when your practice's MCP server is provisioned."
          >
            <span className="text-sm text-input-placeholder">Not configured yet</span>
          </SettingRow>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="Access scopes"
          description="What Claude Desktop can do with your practice data once you authorize it."
        >
          <div className="space-y-6">
            {scopeGroups.map((group) => (
              <div key={group.category} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                  {group.label}
                </h4>
                <div className="space-y-3">
                  {group.scopes.map((scope) => (
                    <div key={scope.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-input-text">{scope.title}</span>
                        <code className="rounded bg-surface-utility/10 px-1.5 py-0.5 font-mono text-xs text-input-placeholder">
                          {scope.id}
                        </code>
                      </div>
                      <p className="text-sm text-input-placeholder">{scope.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SettingSection>

        <SectionDivider />

        <SettingSection
          title="Money-action approvals"
          description="Actions that move money always ask for your approval before they run."
        >
          <SettingRow
            label="Approval threshold"
            labelNode={(
              <div className="flex items-center gap-3">
                <Icon icon={CircleDollarSign} className="h-5 w-5 text-input-placeholder" aria-hidden="true" />
                <span className="text-sm font-medium text-input-text">Approval threshold</span>
              </div>
            )}
            description="Money actions above this amount require your approval. The default is $0, so every refund or invoice send needs explicit approval. Editing unlocks with MCP support."
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-input-text">$0</span>
              <Button variant="secondary" size="sm" disabled>
                Edit
              </Button>
            </div>
          </SettingRow>
        </SettingSection>

        <SectionDivider />

        <SettingSection title="Active sessions">
          <EmptyState
            icon={<Icon icon={Laptop} className="h-8 w-8" aria-hidden="true" />}
            title="No active sessions"
            description="Connected Claude Desktop sessions, their granted scopes, and revoke controls appear here once MCP support is enabled."
          />
        </SettingSection>

        <SectionDivider />

        <SettingSection title="Activity log">
          <EmptyState
            icon={<Icon icon={History} className="h-8 w-8" aria-hidden="true" />}
            title="No activity yet"
            description="Agent actions taken through Claude Desktop will be recorded here once your practice is connected."
          />
        </SettingSection>
      </div>
    </EditorShell>
  );
};

export default McpAccessPage;
