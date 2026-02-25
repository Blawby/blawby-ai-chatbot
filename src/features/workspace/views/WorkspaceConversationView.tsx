/**
 * WorkspaceConversationView - Clean conversation view component
 *
 * Dedicated component for displaying individual conversations
 * with proper separation of concerns and clean architecture.
 */

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { Page } from '@/shared/ui/layout/Page';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import type { ChatMessageUI } from '../../../../worker/types';
import type { Practice } from '@/shared/hooks/usePracticeManagement';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export interface WorkspaceConversationViewProps {
  practice: Practice | null;
  messages: ChatMessageUI[];
  isLoading: boolean;
  isSocketReady: boolean;
  messagesReady: boolean;
  error: string | null;
  onSendMessage?: (message: string) => void;
  onBackToList?: () => void;
  chatView?: React.ReactNode;
}

const WorkspaceConversationView: FunctionComponent<WorkspaceConversationViewProps> = ({
  practice,
  messages,
  isLoading,
  isSocketReady,
  messagesReady,
  error,
  onSendMessage,
  onBackToList,
  chatView,
}) => {
  const practiceName = practice?.name || 'Your Practice';
  const messageCount = messages.length;

  const handleBack = () => {
    onBackToList?.();
  };

  const conversationTitle = useMemo(() => {
    // Try to get title from first user message or metadata
    const firstUserMessage = messages.find(m => m.isUser);
    if (firstUserMessage?.content) {
      const content = firstUserMessage.content;
      return content.length > 50 ? `${content.substring(0, 47)}...` : content;
    }
    return 'Conversation';
  }, [messages]);

  if (error) {
    return (
      <Page className="h-full">
        <PageHeader
          title="Conversation"
          subtitle="Error loading conversation"
          actions={
            <Button onClick={handleBack} variant="secondary" className="flex items-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </Button>
          }
        />
        
        <div className="glass-card p-6 text-center">
          <div className="text-red-600 mb-4">Error loading conversation</div>
          <p className="text-sm text-input-placeholder mb-4">{error}</p>
          <Button onClick={handleBack} variant="secondary">
            Back to Conversations
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page className="h-full">
      <PageHeader
        title={conversationTitle}
        subtitle={`${messageCount} message${messageCount !== 1 ? 's' : ''} • ${practiceName}`}
        actions={
          <Button onClick={handleBack} variant="secondary" className="flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </Button>
        }
      />

      <div className="h-full flex flex-col">
        {/* Chat Content */}
        <div className="flex-1 min-h-0">
          {chatView || (
            <div className="glass-card p-6 h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-input-placeholder mb-4">
                  {isLoading ? 'Loading conversation...' : 
                   !messagesReady ? 'Preparing messages...' :
                   !isSocketReady ? 'Connecting...' :
                   'Chat interface would be rendered here'}
                </div>
                {messages.length === 0 && messagesReady && (
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        {messagesReady && (
          <div className="glass-card p-4 mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-background border border-line-glass/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && onSendMessage) {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) {
                      onSendMessage(target.value);
                      target.value = '';
                    }
                  }
                }}
              />
              <Button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Type a message..."]') as HTMLInputElement;
                  if (input?.value.trim() && onSendMessage) {
                    onSendMessage(input.value);
                    input.value = '';
                  }
                }}
                disabled={!isSocketReady}
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
};

export default WorkspaceConversationView;
