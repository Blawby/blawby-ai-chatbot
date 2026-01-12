import { useMemo } from 'preact/hooks';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { NextStepsCard, type NextStepsItem } from '@/shared/ui/cards/NextStepsCard';

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const { navigate } = useNavigation();
  const { isPracticeEnabled } = useSubscription();
  const name = session?.user?.name || session?.user?.email || 'there';
  const showUpgrade = !isPracticeEnabled;

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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your client workspace is ready. Keep track of your conversations and return to active matters any time.
          </p>
        </div>

        <NextStepsCard
          title="Your next steps"
          subtitle="A simple checklist to get you started."
          items={clientNextStepsItems}
        />

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage your account</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
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
