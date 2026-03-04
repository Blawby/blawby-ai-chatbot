import { FunctionComponent, type ComponentChildren } from 'preact';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';
import { cn } from '@/shared/utils/cn';

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
  error?: string | null;
  onClose?: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSendMessage: () => void;
  showBackButton?: boolean;
  showSendMessageButton?: boolean;
  activeConversationId?: string | null;
  headerControls?: ComponentChildren;
  showTitle?: boolean;
  assignedToFilter?: 'none' | null;
}

const resolveConversationTitle = (conversation: Conversation, fallback: string) => {
  if (conversation.user_info?.mode === 'PRACTICE_ONBOARDING') {
    const onboardingTitle = typeof conversation.user_info?.title === 'string'
      ? conversation.user_info.title.trim()
      : '';
    return onboardingTitle || 'Practice setup';
  }
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
  error = null,
  onClose,
  onSelectConversation,
  onSendMessage,
  showBackButton = true,
  showSendMessageButton = true,
  activeConversationId = null,
  headerControls,
  showTitle = true,
}) => {
  const { t } = useTranslation();
  const fallbackName = typeof practiceName === 'string' ? practiceName.trim() : '';
  const sorted = [...conversations].sort((a, b) => {
    const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
    const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
    return bTime - aTime;
  });

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="workspace-header">
        {showBackButton && onClose ? (
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            onClick={onClose}
            className="workspace-header__icon"
            aria-label={t('common.back')}
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
        {showTitle ? (
          <div className="workspace-header__identity">
            <div className="workspace-header__title">{t('workspace.conversationList.title')}</div>
          </div>
        ) : null}
        {headerControls ? (
          <div className={cn(
            'workspace-header__right',
            !showTitle && 'ml-0 flex w-full max-w-none justify-center'
          )}>
            {headerControls}
          </div>
        ) : null}
        {isLoading ? <div className="workspace-header__loading" aria-hidden="true" /> : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-6 text-sm text-input-text/80">{t('workspace.conversationList.loading')}</div>
        ) : error ? (
          <div className="py-6 text-sm text-red-500 dark:text-red-300">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-6 text-sm text-input-text/80">{t('workspace.conversationList.empty')}</div>
        ) : (
          <div className="divide-y divide-line-glass/20">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const title = resolveConversationTitle(conversation, fallbackName);
              const timeLabel = preview?.createdAt
                ? formatRelativeTime(preview.createdAt)
                : (conversation.last_message_at ? formatRelativeTime(conversation.last_message_at) : '');
              const previewText = preview?.content
                ? preview.content
                : t('workspace.conversationList.previewPlaceholder');
              const isOnboardingConversation = conversation.user_info?.mode === 'PRACTICE_ONBOARDING';
              const unreadCount = Math.max(0, Number(conversation.unread_count ?? 0));
              const isUnread = unreadCount > 0;
              const isActive = activeConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                    isActive ? 'bg-white/10' : 'hover:bg-white/5'
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <Avatar
                    src={practiceLogo}
                    name={fallbackName}
                    size="md"
                    className="ring-2 ring-white/10"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          'block truncate',
                          chatTypography.previewName,
                          isUnread && 'font-bold text-input-text'
                        )}>
                          {title}
                        </span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {conversation.lead?.is_lead && (
                            <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                              {t('conversation.badge.lead', { defaultValue: 'Lead' })}
                            </span>
                          )}
                          {isOnboardingConversation && (
                            <span className="flex-shrink-0 rounded-full border border-line-glass/40 bg-surface-panel/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-input-text">
                              {t('conversation.badge.setup', { defaultValue: 'Setup' })}
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
            icon={<PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />}
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
