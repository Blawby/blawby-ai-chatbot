import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import {
  Bell,
  Briefcase,
  Building2,
  FileText,
  Home,
  LifeBuoy,
  MessageSquare,
  Puzzle,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  User,
  Users,
} from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/lib/authClient';
import { getWorkspaceSettingsPath } from '@/shared/utils/workspace';
import { Button } from '@/shared/ui/Button';
import { NextStepsCard, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';
import { Sidebar } from '@/shared/ui/nav/Sidebar';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { WorkspaceShellHeader } from '@/shared/ui/layout/WorkspaceShellHeader';
import { AppShell } from '@/shared/ui/layout/AppShell';

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  const { canAccessPractice } = useWorkspace();
  const { currentPractice, practices } = useWorkspaceResolver();
  const { navigate, navigateToPricing } = useNavigation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const userName = session?.user?.name || session?.user?.email || 'there';
  const userEmail = session?.user?.email ?? null;
  const userImage = session?.user?.image ?? null;
  const showUpgrade = !canAccessPractice;

  const clientPracticeSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
  const clientBasePath = clientPracticeSlug
    ? `/client/${encodeURIComponent(clientPracticeSlug)}`
    : null;
  const orgName = currentPractice?.name?.trim() || userName;
  const orgInitial = (orgName.charAt(0) || 'B').toUpperCase();

  const settingsPath = useMemo(() => {
    const routeMatch = location.path.match(/^\/(client|practice)\/([^/]+)/);
    if (routeMatch) {
      const workspace = routeMatch[1] as 'client' | 'practice';
      const slug = decodeURIComponent(routeMatch[2]);
      const matchesKnownPractice =
        currentPractice?.slug === slug || practices.some((p) => p.slug === slug);
      if (matchesKnownPractice) {
        return getWorkspaceSettingsPath(workspace, slug);
      }
    }
    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    return fallbackSlug ? getWorkspaceSettingsPath('client', fallbackSlug) : null;
  }, [currentPractice?.slug, location.path, practices]);

  const clientNextStepsItems = useMemo<NextStepsItem[]>(() => {
    const items: NextStepsItem[] = [
      {
        id: 'client-case',
        title: 'Create your case',
        description: 'Start an intake so you can reuse the details across future chats.',
        status: 'pending'
      }
    ];

    if (showUpgrade) {
      items.push({
        id: 'client-upgrade',
        title: 'Upgrade to legal practice',
        description: 'Accept client intake forms, manage your team, and unlock practice tools.',
        status: 'pending',
        action: {
          label: 'View plans',
          onClick: () => navigateToPricing(),
          variant: 'secondary' as const,
          size: 'sm' as const
        }
      });
    }

    return items;
  }, [navigateToPricing, showUpgrade]);

  const sidebarUser = { name: userName, email: userEmail, image: userImage };

  const renderSidebar = (forceExpanded: boolean) => (
    <Sidebar
      activeItemId="home"
      collapsed={forceExpanded ? false : desktopCollapsed}
      onToggleCollapsed={forceExpanded ? undefined : () => setDesktopCollapsed((v) => !v)}
      onItemActivate={() => setMobileSidebarOpen(false)}
    >
      <Sidebar.Org
        name={orgName}
        subtitle="Client Portal"
        logo={
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--accent-500))] text-sm font-bold text-[rgb(var(--accent-foreground))]"
          >
            {orgInitial}
          </span>
        }
        onCollapseClick={forceExpanded ? undefined : () => setDesktopCollapsed((v) => !v)}
      />
      <Sidebar.Section first label="Navigation">
        <Sidebar.Item id="home" icon={Home} label="Home" />
        {clientBasePath ? (
          <>
            <Sidebar.Item
              id="matters"
              icon={Briefcase}
              label="My Matter"
              href={`${clientBasePath}/matters`}
            />
            <Sidebar.Item
              id="invoices"
              icon={FileText}
              label="Invoices"
              href={`${clientBasePath}/invoices`}
            />
            <Sidebar.Item
              id="messages"
              icon={MessageSquare}
              label="Messages"
              href={`${clientBasePath}/conversations`}
            />
          </>
        ) : null}
        {showUpgrade ? (
          <Sidebar.Item
            id="upgrade"
            icon={Sparkles}
            label="Upgrade to Practice"
            onClick={() => navigateToPricing()}
          />
        ) : null}
      </Sidebar.Section>
      {clientBasePath ? (
        <Sidebar.Section label="Workspace">
          <Sidebar.Item id="settings" icon={SettingsIcon} label="Settings" expandable>
            <Sidebar.SubGroupLabel label="Personal" first />
            <Sidebar.SubItem
              id="settings-notifications"
              icon={Bell}
              label="Notifications"
              href={`${clientBasePath}/settings/notifications`}
            />
            <Sidebar.SubGroupLabel label="Account" />
            <Sidebar.SubItem
              id="settings-security"
              icon={Shield}
              label="Security"
              href={`${clientBasePath}/settings/security`}
            />
            <Sidebar.SubItem
              id="settings-profile"
              icon={User}
              label="Profile"
              href={`${clientBasePath}/settings/account`}
            />
            {canAccessPractice && (
              <>
                <Sidebar.SubGroupLabel label="Practice" />
                <Sidebar.SubItem
                  id="settings-practice"
                  icon={Building2}
                  label="Practice"
                  href={`${clientBasePath}/settings/practice`}
                />
                <Sidebar.SubItem
                  id="settings-team"
                  icon={Users}
                  label="Team"
                  href={`${clientBasePath}/settings/practice/team`}
                />
                <Sidebar.SubItem
                  id="settings-apps"
                  icon={Puzzle}
                  label="Apps"
                  href={`${clientBasePath}/settings/apps`}
                />
              </>
            )}
            <Sidebar.SubGroupLabel label="Support" />
            <Sidebar.SubItem
              id="settings-help"
              icon={LifeBuoy}
              label="Help"
              href={`${clientBasePath}/settings/help`}
            />
          </Sidebar.Item>
        </Sidebar.Section>
      ) : null}
      <Sidebar.Footer>
        <SidebarProfileMenu
          user={sidebarUser}
          collapsed={forceExpanded ? false : desktopCollapsed}
          onAccount={() => settingsPath && navigate(settingsPath)}
          onSignOut={() => void signOut({ navigate })}
        />
      </Sidebar.Footer>
    </Sidebar>
  );

  const header = (
    <WorkspaceShellHeader
      orgInitial={orgInitial}
      title="Home"
      onMenuClick={() => setMobileSidebarOpen(true)}
    />
  );

  const main = (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-12 md:py-10">
      <div className="max-w-4xl mx-auto space-y-7">
        <div>
          <h1 className="text-2xl text-heading">Welcome back, {userName}</h1>
          <p className="mt-2 text-sm text-secondary">
            Here's an overview of your matter. Check messages, review documents, or pick up where you left off.
          </p>
        </div>

        <NextStepsCard
          title="Your next steps"
          subtitle="A simple checklist to get you started."
          items={clientNextStepsItems}
        />

        <div className="glass-panel p-6 space-y-4">
          <div>
            <h2 className="text-lg text-heading">Manage your account</h2>
            <p className="text-sm text-secondary">
              Update your preferences, notifications, and security settings.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={!settingsPath}
            onClick={() => settingsPath && navigate(settingsPath)}
          >
            Manage account settings
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      className="bg-transparent h-dvh"
      accentBackdropVariant="none"
      header={header}
      sidebar={renderSidebar(false)}
      desktopSidebarCollapsed={desktopCollapsed}
      mobileSidebar={renderSidebar(true)}
      mobileSidebarOpen={mobileSidebarOpen}
      onMobileSidebarClose={() => setMobileSidebarOpen(false)}
      main={main}
      mainClassName="min-h-0 h-full overflow-hidden"
    />
  );
};

export default ClientHomePage;
