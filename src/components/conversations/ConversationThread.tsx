import { FunctionComponent } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { useConversationMessages } from '../../hooks/useConversationMessages';
import { MessageComposer } from './MessageComposer';

interface ConversationThreadProps {
  conversationId?: string | null;
}

export const ConversationThread: FunctionComponent<ConversationThreadProps> = ({ conversationId }) => {
  const {
    messages,
    loading,
    error,
    hasMore,
    loadMore,
    sendMessage,
    markRead
  } = useConversationMessages({ conversationId, autoConnect: true });

  const lastReadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!messages.length || !conversationId) {
      return;
    }
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.id !== lastReadRef.current) {
      lastReadRef.current = lastMessage.id;
      markRead(lastMessage.id).catch(err => console.warn('Failed to mark conversation as read', err));
    }
  }, [messages, conversationId, markRead]);

  const body = useMemo(() => {
    if (!conversationId) {
      return <div className="p-6 text-sm text-muted-foreground">Select a conversation to begin.</div>;
    }
    if (loading && !messages.length) {
      return <div className="p-6 text-sm text-muted-foreground">Loading conversation…</div>;
    }
    if (error) {
      return <div className="p-6 text-sm text-destructive">{error}</div>;
    }
    if (!messages.length) {
      return <div className="p-6 text-sm text-muted-foreground">This conversation is empty. Send the first message to get started.</div>;
    }
    return null;
  }, [conversationId, loading, messages.length, error]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto bg-background">
        {body ?? (
          <div className="flex h-full flex-col">
            {hasMore && (
              <div className="px-4 py-2 text-center">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => loadMore().catch(err => console.error('Failed to load earlier messages', err))}
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            <div className="flex-1 space-y-3 px-4 py-3">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`max-w-xl rounded-lg border border-border px-3 py-2 text-sm shadow-sm ${
                    message.role === 'user' ? 'bg-primary/10 text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <div className="text-xs text-muted-foreground">
                    {new Date(message.created_at).toLocaleString()}
                    {message.is_edited ? ' · edited' : ''}
                  </div>
                  <div className={`mt-1 whitespace-pre-wrap ${message.is_deleted ? 'italic text-muted-foreground' : ''}`}>
                    {message.is_deleted ? 'Message removed' : message.content || '(no content)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <MessageComposer
        onSend={async content => {
          await sendMessage(content);
        }}
        disabled={!conversationId}
      />
    </div>
  );
};
