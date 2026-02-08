import { useEffect, useMemo, useState } from 'preact/hooks';
import { listMatterConversations } from '@/shared/lib/apiClient';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import type { MatterDetail } from '@/features/matters/data/mockMatters';
import type { Conversation } from '@/shared/types/conversation';

interface MatterMessagesPanelProps {
  matter: MatterDetail;
  conversationBasePath?: string;
}

const formatRelativeTime = (dateString: string): string => {
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
};

export const MatterMessagesPanel = ({ matter, conversationBasePath }: MatterMessagesPanelProps) => {
  const { navigate } = useNavigation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matter?.id) {
      setConversations([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listMatterConversations(matter.id, { signal: controller.signal });
        setConversations(data);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to load conversations';
          setError(message);
          setConversations([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [matter?.id]);

  const sortedConversations = useMemo(() => (
    [...conversations].sort((a, b) => {
      const aTime = a.last_message_at ?? a.updated_at;
      const bTime = b.last_message_at ?? b.updated_at;
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
  ), [conversations]);

  const trimmedBasePath = conversationBasePath?.trim() ?? '';
  const basePath = trimmedBasePath.length
    ? trimmedBasePath
    : '/practice/conversations';

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-6 py-4">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Linked conversations</p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{matter.title}</h3>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(basePath)}
        >
          View all conversations
        </Button>
      </header>
      <div className="p-6">
        {loading && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading conversations…</div>
        )}
        {!loading && error && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}
        {!loading && !error && sortedConversations.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No conversations are linked to this matter yet.
          </div>
        )}
        {!loading && !error && sortedConversations.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {sortedConversations.map((conversation) => (
              <div key={conversation.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
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
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {conversation.status ?? 'active'}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => navigate(`${basePath}/${encodeURIComponent(conversation.id)}`)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
