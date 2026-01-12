import { useMemo, useEffect, useRef } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useInbox } from '@/shared/hooks/useInbox';
import { Button } from '@/shared/ui/Button';
import { linkConversationToUser } from '@/shared/lib/apiClient';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return 'Unknown';
  if (date > now) return 'Just now';
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export const PracticeDashboardPage = () => {
  const { navigate } = useNavigation();
  const { currentPractice } = usePracticeManagement();
  const { activePracticeId } = useSessionContext();
  const linkingHandledRef = useRef(false);

  const {
    conversations,
    stats,
    isLoading
  } = useInbox({
    practiceId: activePracticeId || undefined,
    limit: 5,
    autoRefresh: false
  });

  const highlightCards = useMemo(() => ([
    { label: 'Active chats', value: stats?.active ?? 0 },
    { label: 'Unassigned', value: stats?.unassigned ?? 0 },
    { label: 'High priority', value: stats?.highPriority ?? 0 },
  ]), [stats?.active, stats?.unassigned, stats?.highPriority]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (linkingHandledRef.current) return;

    const postAuthRedirectKey = 'post-auth-redirect';
    const url = new URL(window.location.href);
    const conversationId = url.searchParams.get('conversationId');
    const practiceId = url.searchParams.get('practiceId');
    const postAuthRedirect = sessionStorage.getItem(postAuthRedirectKey);
    const isSafeRedirect = (path: string) => {
      try {
        const parsed = new URL(path, window.location.origin);
        return parsed.origin === window.location.origin;
      } catch {
        return path.startsWith('/') && !path.match(/^\/[\\/]/);
      }
    };

    if (!conversationId || !practiceId) {
      if (postAuthRedirect) {
        sessionStorage.removeItem(postAuthRedirectKey);
        if (isSafeRedirect(postAuthRedirect)) {
          navigate(postAuthRedirect);
        }
      }
      return;
    }

    linkingHandledRef.current = true;

    const cleanupUrl = () => {
      url.searchParams.delete('conversationId');
      url.searchParams.delete('practiceId');
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', cleaned);
    };

    (async () => {
      try {
        await linkConversationToUser(conversationId, practiceId);
      } catch (error) {
        console.error('[Dashboard] Failed to link conversation from OAuth redirect', error);
      }

      if (postAuthRedirect) {
        sessionStorage.removeItem(postAuthRedirectKey);
        if (isSafeRedirect(postAuthRedirect)) {
          navigate(postAuthRedirect);
          return;
        }
      }

      cleanupUrl();
    })();
  }, [navigate]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {currentPractice?.name ? `${currentPractice.name} dashboard` : 'Practice dashboard'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Track new leads, keep your team aligned, and jump back into active conversations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlightCards.map(card => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-4"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent conversations</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isLoading ? 'Loading updates...' : 'Jump back into the latest client threads.'}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/practice/chats')}>
              View all chats
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No conversations yet. Share your practice link to start collecting leads.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {conversations.slice(0, 5).map((conversation) => (
                <div key={conversation.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Conversation {conversation.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {conversation.last_message_at
                        ? `Last message ${formatRelativeTime(conversation.last_message_at)}`
                        : 'No messages yet'}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {conversation.status ?? 'active'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
