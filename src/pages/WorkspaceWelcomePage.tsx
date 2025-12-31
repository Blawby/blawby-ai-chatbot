import { useEffect, useMemo, useState } from 'preact/hooks';
import { useSession, updateUser } from '@/shared/lib/authClient';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { setActivePractice } from '@/shared/lib/apiClient';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';

const WorkspaceWelcomePage = () => {
  const { data: session, isPending } = useSession();
  const { navigate } = useNavigation();
  const { preferredPracticeId, hasPractice } = useWorkspace();
  const { currentPractice, practices, loading: practicesLoading } = usePracticeManagement();
  const [submitting, setSubmitting] = useState<'client' | 'practice' | null>(null);

  const resolvedPracticeId = useMemo(() => {
    return preferredPracticeId ?? currentPractice?.id ?? practices[0]?.id ?? null;
  }, [preferredPracticeId, currentPractice?.id, practices]);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      navigate('/auth', true);
      return;
    }
    const user = session.user as { primaryWorkspace?: string | null };
    if (user.primaryWorkspace) {
      navigate(user.primaryWorkspace === 'practice' ? '/practice' : '/app', true);
    }
  }, [isPending, navigate, session?.user]);

  const handleSelect = async (choice: 'client' | 'practice') => {
    if (!session?.user) {
      navigate('/auth', true);
      return;
    }

    setSubmitting(choice);
    const nextPreferredPracticeId = choice === 'practice' ? resolvedPracticeId : null;

    try {
      await updateUser({
        primaryWorkspace: choice,
        preferredPracticeId: nextPreferredPracticeId
      } as Parameters<typeof updateUser>[0]);

      if (choice === 'practice') {
        if (nextPreferredPracticeId) {
          await setActivePractice(nextPreferredPracticeId);
          navigate('/practice', true);
        } else {
          navigate('/cart', true);
        }
      } else {
        navigate('/app', true);
      }
    } catch (_error) {
      navigate(choice === 'practice' ? '/practice' : '/app', true);
    } finally {
      setSubmitting(null);
    }
  };

  if (isPending || practicesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Choose your workspace
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You can switch anytime from your profile menu.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">I'm a client</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Find lawyers, manage your conversations, and keep your intake history organized.
            </p>
            <Button
              variant="primary"
              className="mt-6 w-full"
              onClick={() => handleSelect('client')}
              disabled={submitting !== null}
            >
              {submitting === 'client' ? 'Setting up...' : 'Enter client workspace'}
            </Button>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">I'm a lawyer</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage your practice, team inbox, billing, and onboarding setup.
            </p>
            <div className="mt-6 space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <p>
                {hasPractice
                  ? "We'll take you to your practice workspace."
                  : "No practice found yet - you'll be guided to set one up."}
              </p>
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => handleSelect('practice')}
              disabled={submitting !== null}
            >
              {submitting === 'practice' ? 'Setting up...' : 'Enter practice workspace'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceWelcomePage;
