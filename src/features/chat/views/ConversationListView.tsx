import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';

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
  onClose?: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSendMessage: () => void;
  showBackButton?: boolean;
}

const resolveConversationTitle = (conversation: Conversation, fallback: string) => {
  const title = typeof conversation.user_info?.title === 'string'
    ? conversation.user_info?.title.trim()
    : '';
  if (title) return title;
  return fallback;
};

const ConversationListView: FunctionComponent<ConversationListViewProps> = ({
  conversations,
  previews,
  practiceName,
  practiceLogo,
  isLoading = false,
  onClose,
  onSelectConversation,
  onSendMessage,
  showBackButton = true
}) => {
  const { t } = useTranslation();
  const fallbackName = typeof practiceName === 'string' ? practiceName.trim() : '';
  const sorted = [...conversations].sort((a, b) => {
    const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
    const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
    return bTime - aTime;
  });

  return (
    <div className="flex h-full flex-col bg-light-bg dark:bg-dark-bg">
      <div className="relative flex min-h-[56px] items-center justify-center border-b border-light-border px-4 py-3 dark:border-dark-border">
        {showBackButton && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('workspace.conversationList.title')}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="py-6 text-sm text-gray-500 dark:text-gray-400">{t('workspace.conversationList.loading')}</div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-sm text-gray-500 dark:text-gray-400">{t('workspace.conversationList.empty')}</div>
        ) : (
          <div className="divide-y divide-light-border dark:divide-dark-border">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const title = resolveConversationTitle(conversation, fallbackName);
              const timeLabel = preview?.createdAt
                ? formatRelativeTime(preview.createdAt)
                : (conversation.last_message_at ? formatRelativeTime(conversation.last_message_at) : '');
              const previewText = preview?.content
                ? preview.content
                : t('workspace.conversationList.previewPlaceholder');

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className="flex w-full items-center gap-3 py-4 text-left"
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <Avatar
                    src={practiceLogo}
                    name={fallbackName}
                    size="md"
                    className="ring-2 ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                        <span className={`truncate ${chatTypography.previewName}`}>
                          {title}
                        </span>
                        {conversation.lead?.is_lead && (
                          <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                            {t('conversation.badge.lead')}
                          </span>
                        )}
                      </div>
                      {timeLabel && (
                        <span className={chatTypography.headerTime}>{timeLabel}</span>
                      )}
                    </div>
                    <div className="mt-1 truncate">
                      <ChatText text={previewText} className="truncate" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t-1 border-light-border px-4 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] dark:border-dark-border">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          icon={<PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />}
          iconPosition="right"
          onClick={onSendMessage}
        >
          {t('workspace.conversationList.sendMessage')}
        </Button>
      </div>
    </div>
  );
};

export default ConversationListView;
