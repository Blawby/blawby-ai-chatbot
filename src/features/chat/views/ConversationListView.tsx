import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { InteractiveListItem } from '@/shared/ui/layout';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';
import { resolveConversationDisplayTitle } from '@/shared/utils/conversationDisplay';

interface ConversationPreview {
  content: string;
  role: 'user' | 'system' | 'assistant' | string;
  createdAt: string;
}

interface ConversationListViewProps {
  conversations: Conversation[];
  previews: Record<string, ConversationPreview | undefined>;
  practiceName?: string | null;
  practiceLogo?: string | null;
  isLoading?: boolean;
  error?: unknown;
  onSelectConversation: (conversationId: string) => void;
  onSendMessage: () => void;
  showSendMessageButton?: boolean;
  activeConversationId?: string | null;
}

const ConversationListView: FunctionComponent<ConversationListViewProps> = ({
  conversations,
  previews,
  practiceName,
  practiceLogo: _practiceLogo,
  isLoading = false,
  error = null,
  onSelectConversation,
  onSendMessage,
  showSendMessageButton = true,
  activeConversationId = null,
}) => {
  const { t } = useTranslation();
  const errorMessage = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : error != null
        ? t('workspace.conversationList.error', { defaultValue: 'Failed to load conversations.' })
        : null;
  const fallbackName = typeof practiceName === 'string' ? practiceName.trim() : '';
  const sorted = conversations
    .filter((conversation) => conversation.user_info?.mode !== 'PRACTICE_ONBOARDING')
    .sort((a, b) => {
    const aTime = new Date(a.updated_at).getTime();
    const bTime = new Date(b.updated_at).getTime();
    return bTime - aTime;
  });

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-6 text-sm text-input-text/80">{t('workspace.conversationList.loading')}</div>
        ) : errorMessage ? (
          <div className="py-6 text-sm text-[rgb(var(--error-foreground))]">
            {errorMessage}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-sm text-input-text/80">{t('workspace.conversationList.empty')}</div>
        ) : (
          <div className="pt-1 divide-y divide-line-glass/[0.04]">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const title = resolveConversationDisplayTitle(conversation, fallbackName);
              const timeLabel = formatRelativeTime(conversation.updated_at);
              const previewText = preview?.content
                ? preview.content
                : t('workspace.conversationList.previewPlaceholder');
              const unreadCount = Math.max(0, Number(conversation.unread_count ?? 0));
              const isUnread = unreadCount > 0;
              const isActive = activeConversationId === conversation.id;

              return (
                <InteractiveListItem
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation.id)}
                  isSelected={isActive}
                  padding="px-4 py-3"
                  className="gap-3"
                >
                  <Avatar
                    src={null}
                    name={title}
                    size="md"
                    className="ring-1 ring-line-glass/10"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          'block truncate text-input-text',
                          chatTypography.previewName,
                          isUnread && 'font-bold'
                        )}>
                          {title}
                        </span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {conversation.lead?.is_lead && (
                            <span className="flex-shrink-0 rounded-full status-warning px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              {t('conversation.badge.lead', { defaultValue: 'Lead' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {timeLabel && (
                          <span className={chatTypography.headerTime}>{timeLabel}</span>
                        )}
                        {isUnread && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 py-0.5 text-[11px] font-semibold text-[rgb(var(--accent-foreground))]">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={cn(
                      'truncate text-sm',
                      isUnread ? 'font-semibold text-input-text' : 'text-input-placeholder'
                    )}>
                      <ChatText text={previewText} className="truncate" />
                    </div>
                  </div>
                </InteractiveListItem>
              );
            })}
          </div>
        )}
      </div>

      {showSendMessageButton ? (
        <div className="border-t border-line-glass/30 bg-transparent px-4 py-4">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            icon={PaperAirplaneIcon} iconClassName="h-4 w-4"
            iconPosition="right"
            onClick={onSendMessage}
          >
            {t('workspace.conversationList.sendMessage')}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default ConversationListView;
