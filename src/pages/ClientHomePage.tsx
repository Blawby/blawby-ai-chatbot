import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { useNavigation } from '@/shared/utils/navigation';
import { getWorkspaceSettingsPath } from '@/shared/utils/workspace';
import { Button } from '@/shared/ui/Button';
import { NextStepsCard, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  const { canAccessPractice } = useWorkspace();
  const { currentPractice, practices } = useWorkspaceResolver();
  const { navigate, navigateToPricing } = useNavigation();
  const name = session?.user?.name || session?.user?.email || 'there';
  const showUpgrade = !canAccessPractice;
  const routeMatch = location.path.match(/^\/(client|practice)\/([^/]+)/);
  const settingsPath = useMemo(() => {
    if (routeMatch) {
      const workspace = routeMatch[1] as 'client' | 'practice';
      const slug = decodeURIComponent(routeMatch[2]);
      return getWorkspaceSettingsPath(workspace, slug);
    }
    const fallbackSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
    return fallbackSlug ? getWorkspaceSettingsPath('client', fallbackSlug) : null;
  }, [currentPractice?.slug, practices, routeMatch]);

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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl text-heading">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-secondary">
            Your client workspace is ready. Keep track of your conversations and return to active matters any time.
          </p>
        </div>

        <NextStepsCard
          title="Your next steps"
          subtitle="A simple checklist to get you started."
          items={clientNextStepsItems}
        />

        <div className="glass-card p-6 space-y-4">
          <div>
            <h2 className="text-lg text-heading">Manage your account</h2>
            <p className="text-sm text-secondary">
              Update your preferences, notifications, and security settings.
            </p>
          </div>
          <Button variant="secondary" onClick={() => settingsPath && navigate(settingsPath)}>
            Manage account settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClientHomePage;
