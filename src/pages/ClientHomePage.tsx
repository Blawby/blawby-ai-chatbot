import { useSession } from '@/shared/lib/authClient';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';

const ClientHomePage = () => {
  const { data: session } = useSession();
  const { navigate } = useNavigation();
  const name = session?.user?.name || session?.user?.email || 'there';

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Welcome, {name}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Your client workspace is ready. Start a conversation by visiting a practice page or invite a lawyer to connect with you.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={() => navigate('/p/your-law-firm')}
            >Open a practice chat</Button>
          <Button variant="secondary" onClick={() => navigate('/settings')}
            >Manage account settings</Button>
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Replace the placeholder slug with a real practice URL when sharing.
        </p>
      </div>
    </div>
  );
};

export default ClientHomePage;
