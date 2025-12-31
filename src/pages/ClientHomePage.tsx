import { useSession } from '@/shared/lib/authClient';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';

const ClientHomePage = () => {
  const { data: session } = useSession();
  const { navigate } = useNavigation();
  const { currentPractice, practices } = usePracticeManagement();
  const name = session?.user?.name || session?.user?.email || 'there';
  const practiceList = practices ?? [];
  const practiceSlug = currentPractice?.slug || practiceList.find(practice => practice.slug)?.slug || null;

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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent chats</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Start a chat with a practice to see updates here.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-start">
            <Button
              variant="primary"
              onClick={() => {
                if (practiceSlug) {
                  navigate(`/p/${practiceSlug}`);
                }
              }}
              disabled={!practiceSlug}
            >
              Open a practice chat
            </Button>
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              Manage account settings
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {practiceSlug
              ? `Practice link ready: /p/${practiceSlug}`
              : 'Open a practice link to begin chatting.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientHomePage;
