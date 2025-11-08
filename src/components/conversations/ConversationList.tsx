import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { useConversations } from '../../hooks/useConversations';

interface ConversationListProps {
  organizationId?: string;
  selectedConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
  statusFilter?: 'open' | 'locked' | 'archived';
}

export const ConversationList: FunctionComponent<ConversationListProps> = ({
  organizationId,
  selectedConversationId,
  onSelectConversation,
  statusFilter = 'open'
}) => {
  const { conversations, loading, error, hasMore, loadMore } = useConversations({
    organizationId,
    status: statusFilter,
    autoFetch: Boolean(organizationId)
  });

  const emptyState = useMemo(() => {
    if (loading) {
      return 'Loading conversations…';
    }
    if (error) {
      return error;
    }
    if (!conversations.length) {
      return 'No conversations yet';
    }
    return null;
  }, [loading, error, conversations.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversations</h3>
      </div>

      <div className="flex-1 overflow-auto">
        {emptyState ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{emptyState}</div>
        ) : (
          <ul className="px-2 space-y-1">
            {conversations.map(conversation => {
              const isActive = conversation.id === selectedConversationId;
              const title = conversation.title?.trim() || 'Untitled conversation';
              const subtitle = conversation.lastMessageAt
                ? new Date(conversation.lastMessageAt).toLocaleString()
                : 'No messages yet';

              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation?.(conversation.id)}
                    className={`w-full text-left rounded-md px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="text-sm font-medium line-clamp-1">{title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {subtitle}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasMore && (
        <div className="px-3 py-2">
          <button
            type="button"
            className="w-full rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            onClick={() => loadMore().catch(err => console.error('Failed to load more conversations', err))}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};
