import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { NextStepsCard, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';

const ClientHomePage = () => {
  const { session, activeOrganizationId } = useSessionContext();
  const { navigate } = useNavigation();
  const name = session?.user?.name || session?.user?.email || 'there';
  const showUpgrade = !activeOrganizationId;

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
          onClick: () => navigate('/pricing'),
          variant: 'secondary' as const,
          size: 'sm' as const
        }
      });
    }

    return items;
  }, [navigate, showUpgrade]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-input-text">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-input-placeholder">
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
            <h2 className="text-lg font-semibold text-input-text">Manage your account</h2>
            <p className="text-sm text-input-placeholder">
              Update your preferences, notifications, and security settings.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            Manage account settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClientHomePage;
