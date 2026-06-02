import { useMemo, useState, useEffect, useCallback } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useNavigation } from '@/shared/utils/navigation';
import { cn } from '@/shared/utils/cn';
import { type App, mockApps } from './appsData';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { GeneralPage } from './GeneralPage';
import { NotificationsPage } from './NotificationsPage';
import { AccountPage } from './AccountPage';
import { PayoutsPage } from './PayoutsPage';
import { SecurityPage } from './SecurityPage';
import { HelpPage } from './HelpPage';
import { MFAEnrollmentPage } from './MFAEnrollmentPage';
import { PracticePage } from './PracticePage';
import { PracticeTeamPage } from './PracticeTeamPage';
import { EngagementTemplatesPage } from './EngagementTemplatesPage';
import { IntelligencePage } from './IntelligencePage';
import { AppsPage } from './AppsPage';
import { AppDetailPage } from './AppDetailPage';
import { McpAccessPage } from './McpAccessPage';
import { SessionsPage } from './SessionsPage';
import { AuditLogPage } from './AuditLogPage';
import { ExportDataPage } from './ExportDataPage';
import { SettingsShell } from '@/features/settings/components/SettingsShell';
import { getSettingsNavConfig } from '@/shared/config/navConfig';

export type SettingsView =
  | 'general'
  | 'notifications'
  | 'account'
  | 'practice'
  | 'practice-payouts'
  | 'practice-team'
  | 'engagement-templates'
  | 'intelligence'
  | 'apps'
  | 'app-detail'
  | 'security'
  | 'sessions'
  | 'audit-log'
  | 'export-data'
  | 'help'
  | 'mfa-enrollment'
  ;

export interface SettingsContentProps {
  isMobile?: boolean;
  onClose?: () => void;
  className?: string;
  workspace?: 'client' | 'practice';
  practiceSlug?: string;
  view?: SettingsView;
  appId?: string;
  apps?: App[];
}

// Hero text per view — matches the design file headings exactly.
// All settings pages use the same flat layout: crumb → serif h1 → lede → content.
// The existing editor-shell-hero__* CSS classes in index.css handle the typography.
interface SettingsViewHero {
  crumb: string;
  accentTitle: ComponentChildren;
  lede: string;
}

const SETTINGS_VIEW_HERO: Partial<Record<SettingsView, SettingsViewHero>> = {
  general: {
    crumb: 'Settings · Account',
    accentTitle: <>Look &amp; <em>feel.</em></>,
    lede: 'Customize how Blawby looks for you. These settings are per-user — they don\'t affect your team or clients.',
  },
  notifications: {
    crumb: 'Settings · Account',
    accentTitle: <>How we <em>reach you.</em></>,
    lede: 'Choose which events send you email or push notifications.',
  },
  account: {
    crumb: 'Settings · Account',
    accentTitle: <>Your <em>account</em>, on your terms.</>,
    lede: 'Name, email, plan, and the controls you need to close out cleanly.',
  },
  security: {
    crumb: 'Settings · Account',
    accentTitle: <>Password &amp; <em>security.</em></>,
    lede: 'Manage your login credentials, two-factor authentication, and account security.',
  },
  sessions: {
    crumb: 'Settings · Account',
    accentTitle: <>Active <em>sessions.</em></>,
    lede: 'See where your account is signed in. Revoke any session you don\'t recognize.',
  },
  'audit-log': {
    crumb: 'Settings · Account',
    accentTitle: <>Audit <em>log.</em></>,
    lede: 'Every action in your workspace is recorded. Use this for compliance reviews, bar audits, and troubleshooting.',
  },
  'export-data': {
    crumb: 'Settings · Account',
    accentTitle: <>Export your <em>data.</em></>,
    lede: 'Download your practice data at any time. Your data is always yours — Blawby never restricts portability.',
  },
  practice: {
    crumb: 'Settings · Practice',
    accentTitle: <>Profile &amp; <em>practice areas.</em></>,
    lede: 'Your firm identity, bar credentials, and the areas of law you practice. This information grounds the assistant\'s scope.',
  },
  'practice-team': {
    crumb: 'Settings · Practice',
    accentTitle: <>Your <em>team.</em></>,
    lede: 'Manage who has access to your workspace. Each seat includes full assistant access with their own conversation history.',
  },
  'practice-payouts': {
    crumb: 'Settings · Practice',
    accentTitle: <>Payouts &amp; <em>billing.</em></>,
    lede: 'Stripe Connect, payout schedule, and trust accounting settings.',
  },
  'engagement-templates': {
    crumb: 'Settings · Practice',
    accentTitle: <>Engagement <em>templates.</em></>,
    lede: 'Reusable templates for engagement letters and retainer agreements.',
  },
  intelligence: {
    crumb: 'Settings · Intelligence',
    accentTitle: <>How the <em>assistant</em> works for you.</>,
    lede: 'Blawby\'s assistant is grounded in your matters, intakes, and ledger — never in someone else\'s data. Tune how it behaves below.',
  },
  apps: {
    crumb: 'Settings · Intelligence',
    accentTitle: <>Apps &amp; <em>integrations.</em></>,
    lede: 'Connect Clio, Stripe, Google Calendar, and other services the assistant can act on with your approval.',
  },
  'app-detail': {
    crumb: 'Settings · Intelligence · Apps',
    accentTitle: <>App <em>connection.</em></>,
    lede: 'Review permissions and manage this integration.',
  },
  'mfa-enrollment': {
    crumb: 'Settings · Account · Security',
    accentTitle: <>Set up <em>two-factor.</em></>,
    lede: 'Scan the QR code with your authenticator app to enable two-factor authentication.',
  },
  help: {
    crumb: 'Settings · Support',
    accentTitle: <>Get <em>unstuck.</em></>,
    lede: 'Documentation, contact, and the small print.',
  },
};

const SettingsRouter = ({
  view,
  appId,
  apps,
  handleAppUpdate,
  toSettingsPath,
  onBackToWorkspace,
  navSections,
  orgLabel,
}: {
  view: SettingsView;
  appId?: string;
  apps: App[];
  handleAppUpdate: (targetAppId: string, updates: Partial<App>) => void;
  toSettingsPath: (subPath?: string) => string;
  onBackToWorkspace: () => void;
  navSections: Array<{ label?: string; items: Array<{ id: string; label: string; href: string; icon?: unknown; badge?: number | null }> }>;
  orgLabel?: string;
}) => {
  const { navigate } = useNavigation();

  const content = (() => {
    switch (view) {
      case 'general':              return <GeneralPage />;
      case 'notifications':        return <NotificationsPage />;
      case 'account':              return <AccountPage />;
      case 'security':             return <SecurityPage />;
      case 'sessions':             return <SessionsPage />;
      case 'audit-log':            return <AuditLogPage />;
      case 'export-data':          return <ExportDataPage />;
      case 'help':                 return <HelpPage />;
      case 'practice':             return <PracticePage />;
      case 'practice-payouts':     return <PayoutsPage />;
      case 'practice-team':        return <PracticeTeamPage />;
      case 'engagement-templates': return <EngagementTemplatesPage />;
      case 'intelligence':         return <IntelligencePage />;
      case 'mfa-enrollment':       return <MFAEnrollmentPage onBack={() => navigate(toSettingsPath('security'))} />;
      case 'apps':
        return (
          <AppsPage
            apps={apps}
            onSelect={(id) => navigate(toSettingsPath(`apps/${id}`))}
          />
        );
      case 'app-detail': {
        const currentApp = appId ? apps.find((a) => a.id === appId) : null;
        if (!currentApp) {
          return <AppsPage apps={apps} onSelect={(id) => navigate(toSettingsPath(`apps/${id}`))} />;
        }
        if (currentApp.id === 'claude-mcp') {
          return (
            <McpAccessPage
              app={currentApp}
              onBack={() => navigate(toSettingsPath('apps'))}
              onUpdate={(updates) => handleAppUpdate(currentApp.id, updates)}
            />
          );
        }
        return (
          <AppDetailPage
            app={currentApp}
            onBack={() => navigate(toSettingsPath('apps'))}
            onUpdate={handleAppUpdate}
          />
        );
      }
      default:
        return <GeneralPage />;
    }
  })();

  const hero = SETTINGS_VIEW_HERO[view];

  const activeNavItemId = view === 'app-detail'
    ? 'apps'
    : view === 'mfa-enrollment'
      ? 'security'
      : view;

  return (
    <SettingsShell
      orgLabel={orgLabel}
      onBack={onBackToWorkspace}
      crumb={hero?.crumb ?? ''}
      title={hero?.accentTitle ?? ''}
      lede={hero?.lede ?? ''}
      sections={navSections}
      activeItemId={activeNavItemId}
      onNavigate={navigate}
    >
      {content}
    </SettingsShell>
  );
};

export const SettingsContent = (props: SettingsContentProps) => {
  const {
    className = '',
    workspace = 'practice',
    practiceSlug = 'workspace',
    view = 'general',
    appId,
    apps: initialApps,
  } = props;

  const { navigate } = useNavigation();
  const [appUpdates, setAppUpdates] = useState<Record<string, Partial<App>>>({});
  const { isPending: sessionPending } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { canAccessPractice } = useWorkspace();

  const settingsBasePath = `/${workspace}/${encodeURIComponent(practiceSlug)}/settings`;
  const workspaceBasePath = `/${workspace}/${encodeURIComponent(practiceSlug)}`;
  const orgLabel = useMemo(() => {
    let decodedSlug = practiceSlug;
    try {
      decodedSlug = decodeURIComponent(practiceSlug);
    } catch {
      decodedSlug = practiceSlug;
    }
    const name = decodedSlug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return workspace === 'practice'
      ? `${name || 'Workspace'} · practice`
      : `${name || 'Workspace'} · client`;
  }, [practiceSlug, workspace]);
  const toSettingsPath = (subPath?: string) => {
    if (!subPath) return settingsBasePath;
    return `${settingsBasePath}/${subPath.replace(/^\/+/, '')}`;
  };

  const isPracticeScopedView = view === 'practice-payouts'
    || view === 'practice-team'
    || view === 'engagement-templates'
    || view === 'intelligence'
    || view === 'practice'
    || view === 'apps'
    || view === 'app-detail';

  useEffect(() => {
    if (sessionPending) return;
    if (isPracticeScopedView && !canAccessPractice) {
      navigate(`${settingsBasePath}/general`, true);
    }
  }, [canAccessPractice, isPracticeScopedView, navigate, sessionPending, settingsBasePath]);

  useEffect(() => {
    if (initialApps) setAppUpdates({});
  }, [initialApps]);

  const apps = useMemo(() => {
    const sourceApps = initialApps ?? mockApps;
    return sourceApps.map((app) => ({ ...app, ...appUpdates[app.id] }));
  }, [appUpdates, initialApps]);

  const handleAppUpdate = useCallback((targetAppId: string, updates: Partial<App>) => {
    setAppUpdates((prev) => ({
      ...prev,
      [targetAppId]: { ...prev[targetAppId], ...updates },
    }));
  }, []);

  const navConfig = useMemo(() => getSettingsNavConfig({
    practiceSlug,
    role: normalizePracticeRole(activeMemberRole) ?? null,
    canAccessPractice,
  }), [activeMemberRole, canAccessPractice, practiceSlug]);

  const settingsNavSections = useMemo(() => (
    (navConfig.secondary ?? []).map((section) => ({
      label: section.label,
      items: section.items
        .filter((item): item is typeof item & { href: string } => typeof item.href === 'string')
        .map((item) => ({
          id: item.id,
          label: item.label,
          href: item.href,
          icon: item.icon,
          badge: item.badge ?? null,
        })),
    }))
  ), [navConfig.secondary]);

  return (
    <div className={cn('h-full min-h-0 overflow-hidden', className)}>
      <SettingsRouter
        view={view}
        appId={appId}
        apps={apps}
        handleAppUpdate={handleAppUpdate}
        toSettingsPath={toSettingsPath}
        onBackToWorkspace={() => navigate(workspaceBasePath)}
        navSections={settingsNavSections}
        orgLabel={orgLabel}
      />
    </div>
  );
};

export default SettingsContent;
