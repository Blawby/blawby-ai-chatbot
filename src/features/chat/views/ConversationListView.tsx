import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';

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
          <div className="py-6 text-sm text-red-500 dark:text-red-300">
            {errorMessage}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-sm text-input-text/80">{t('workspace.conversationList.empty')}</div>
        ) : (
          <div className="space-y-1 px-2 py-2">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const fallbackTitle = resolveConversationDisplayTitle(conversation, fallbackName);
              const title = resolveConversationContactName(conversation) || fallbackTitle;
              const timeLabel = formatRelativeTime(conversation.updated_at);
              const previewText = (preview?.content ?? conversation.last_message_content ?? '').trim();
              const isUnread = Number(conversation.unread_count ?? 0) > 0;
              const isActive = activeConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation.id)}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                    isActive ? 'nav-item-active' : 'nav-item-inactive'
                  )}
                >
                  <Avatar
                    src={null}
                    name={title}
                    size="md"
                    className="ring-1 ring-line-glass/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          'block truncate',
                          chatTypography.previewName,
                          isUnread ? 'font-bold text-accent-utility' : 'text-input-text'
                        )}>
                          {title}
                        </span>
                        {conversation.lead?.is_lead ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                              {t('conversation.badge.lead', { defaultValue: 'Lead' })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {timeLabel && (
                          <span className={cn(
                            chatTypography.headerTime,
                            isUnread ? 'font-medium text-accent-utility/75' : 'text-input-placeholder'
                          )}>{timeLabel}</span>
                        )}
                      </div>
                    </div>
                    {previewText ? (
                      <div className={cn(
                        'mt-0.5 truncate text-xs leading-5',
                        isUnread
                          ? 'font-semibold text-accent-utility/85'
                          : 'text-input-placeholder'
                      )}>
                        <ChatText text={previewText} className="truncate" />
                      </div>
                    ) : null}
                  </div>
                </button>
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
