import { useSession } from '@/shared/lib/authClient';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { useSubscription } from '@/shared/hooks/useSubscription';

const ClientHomePage = () => {
  const { data: session } = useSession();
  const { navigate } = useNavigation();
  const { isPracticeEnabled } = useSubscription();
  const name = session?.user?.name || session?.user?.email || 'there';
  const showUpgrade = !isPracticeEnabled;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your client workspace is ready. Keep track of your conversations and return to active matters any time.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your next steps</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A simple checklist to get you started.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-accent-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Create your case</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Start an intake so you can reuse the details across future chats.
                </p>
              </div>
              {/* TODO: Add case creation flow that doesn't require a practice chat link. */}
            </div>

            {showUpgrade && (
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Upgrade to legal practice
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Accept client intake forms, manage your team, and unlock practice tools.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/pricing')}
                >
                  View plans
                </Button>
              </div>
            )}
          </div>
        </div>

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
