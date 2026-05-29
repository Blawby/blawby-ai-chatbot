import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Sparkles } from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { getWorkspaceSettingsPath } from '@/shared/utils/workspace';
import { Button } from '@/shared/ui/Button';
import { NextStepsCard, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';
import { LeftRail, BrandMark, type LeftRailItem } from '@/design-system/layout';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { getClientNavConfig } from '@/shared/config/navConfig';
import type { IconComponent } from '@/shared/ui/Icon';

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  const { canAccessPractice } = useWorkspace();
  const { currentPractice } = useWorkspaceResolver();
  const { navigate, navigateToPricing } = useNavigation();

  const userName = session?.user?.name || session?.user?.email || 'there';
  const userEmail = session?.user?.email ?? null;
  const userImage = session?.user?.image ?? null;
  const showUpgrade = !canAccessPractice;

  const clientPracticeSlug = currentPractice?.slug ?? null;

  const settingsPath = useMemo(() => {
    const routeMatch = location.path.match(/^\/(client|practice)\/([^/]+)/);
    if (routeMatch) {
      const workspace = routeMatch[1] as 'client' | 'practice';
      const slug = decodeURIComponent(routeMatch[2]);
      return getWorkspaceSettingsPath(workspace, slug);
    }
    return clientPracticeSlug ? getWorkspaceSettingsPath('client', clientPracticeSlug) : null;
  }, [clientPracticeSlug, location.path]);

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

  // Build LeftRail items from the canonical client nav config.
  const railItems = useMemo<LeftRailItem[]>(() => {
    if (!clientPracticeSlug) return [];
    const config = getClientNavConfig(
      { practiceSlug: clientPracticeSlug, role: 'client', canAccessPractice: false },
      'home',
    );
    const items: LeftRailItem[] = config.rail.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon as IconComponent,
      href: item.href,
      matchHrefs: item.matchHrefs,
      badge: item.badge,
      variant: item.variant,
      isAction: item.isAction,
      onClick: item.onClick,
      prefetch: item.prefetch,
    }));

    // "Upgrade to Practice" CTA per locked decision §5 — client-shell may
    // append a single CTA chip-style action to the rail.
    if (showUpgrade) {
      items.push({
        id: 'upgrade',
        label: 'Upgrade to Practice',
        icon: Sparkles as IconComponent,
        href: '#',
        isAction: true,
        onClick: () => navigateToPricing(),
      });
    }

    return items;
  }, [clientPracticeSlug, showUpgrade, navigateToPricing]);

  const profileFooter = session?.user ? (
    <SidebarProfileMenu
      user={{ name: userName, email: userEmail, image: userImage }}
      onAccount={() => clientPracticeSlug && navigate(`/client/${encodeURIComponent(clientPracticeSlug)}/settings/account`)}
      onSettings={() => settingsPath && navigate(settingsPath)}
      onSignOut={() => void signOut({ navigate })}
    />
  ) : null;

  const main = (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-12 md:py-10">
      <div className="max-w-4xl mx-auto space-y-7">
        <div>
          <h1 className="text-2xl text-heading">Welcome back, {userName}</h1>
          <p className="mt-2 text-sm text-secondary">
            Here&apos;s an overview of your matter. Check messages, review documents, or pick up where you left off.
          </p>
        </div>

        <NextStepsCard
          title="Your next steps"
          subtitle="A simple checklist to get you started."
          items={clientNextStepsItems}
        />

        <div className="panel p-6 space-y-4">
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
    <div className="flex h-dvh flex-col lg:flex-row">
      <LeftRail
        variant="desktop"
        items={railItems}
        brandMark={<BrandMark />}
        footer={profileFooter}
        className="hidden lg:flex"
      />
      <main className="flex-1 min-h-0 overflow-hidden order-first lg:order-none">
        {main}
      </main>
      <LeftRail
        variant="mobile"
        items={railItems}
        className="lg:hidden"
      />
    </div>
  );
};

export default ClientHomePage;
