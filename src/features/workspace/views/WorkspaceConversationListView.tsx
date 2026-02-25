/**
 * WorkspaceConversationListView - Clean conversation list component
 *
 * Dedicated component for displaying and managing conversation lists
 * with proper separation of concerns and reusability.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { ChatBubbleLeftRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { Conversation } from '@/shared/types/conversation';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export interface WorkspaceConversationListViewProps {
  practice: Practice | null;
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  onStartNewConversation?: () => void;
  onSelectConversation?: (conversationId: string) => void;
  onRefreshConversations?: () => void;
}

const WorkspaceConversationListView: FunctionComponent<WorkspaceConversationListViewProps> = ({
  practice,
  conversations,
  isLoading,
  error,
  onStartNewConversation,
  onSelectConversation,
  onRefreshConversations,
}) => {
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = (a.updated_at || a.created_at || 0) as number;
      const bTime = (b.updated_at || b.created_at || 0) as number;
      return bTime - aTime;
    });
  }, [conversations]);

  const handleSelectConversation = (conversationId: string) => {
    onSelectConversation?.(conversationId);
  };

  const handleStartNewConversation = () => {
    onStartNewConversation?.();
  };

  const handleRefresh = () => {
    onRefreshConversations?.();
  };

  if (error) {
    return (
      <Page className="h-full">
        <PageHeader
          title="Conversations"
          subtitle="Manage your client conversations"
        />
        
        <div className="glass-card p-6 text-center">
          <div className="text-red-600 mb-4">Error loading conversations</div>
          <p className="text-sm text-input-placeholder mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="secondary">
            Try Again
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page className="h-full">
      <PageHeader
        title="Conversations"
        subtitle={`Manage your client conversations${practice ? ` for ${practice.name}` : ''}`}
        actions={
          <Button
            onClick={handleStartNewConversation}
            variant="primary"
            disabled={!practice}
            className="flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            New Conversation
          </Button>
        }
      />

      <div className="space-y-4">
        {isLoading && conversations.length === 0 ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-background rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-background rounded w-3/4 mb-2" />
                    <div className="h-3 bg-background rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <ChatBubbleLeftRightIcon className="w-16 h-16 mx-auto mb-4 text-input-placeholder opacity-50" />
            <h3 className="text-lg font-semibold text-input-text mb-2">No conversations yet</h3>
            <p className="text-input-placeholder mb-6">
              Start your first conversation to begin helping clients
            </p>
            <Button
              onClick={handleStartNewConversation}
              variant="primary"
              disabled={!practice}
            >
              Start First Conversation
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedConversations.map((conversation) => (
              <div
                key={conversation.id}
                className="glass-card p-4 hover:bg-accent-50/50 transition-colors cursor-pointer"
                onClick={() => handleSelectConversation(conversation.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSelectConversation(conversation.id);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-accent-100 rounded-full flex items-center justify-center">
                    <ChatBubbleLeftRightIcon className="w-6 h-6 text-accent-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-input-text truncate">
                        {conversation.user_info?.title || 'New Conversation'}
                      </h4>
                      <span className="text-xs text-input-placeholder ml-2">
                        {formatRelativeTime(conversation.updated_at || conversation.created_at)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-input-placeholder">
                      <span>
                        {conversation.participants.length} participant{conversation.participants.length !== 1 ? 's' : ''}
                      </span>
                      {conversation.status && (
                        <span className="capitalize">{conversation.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
};

export default WorkspaceConversationListView;
