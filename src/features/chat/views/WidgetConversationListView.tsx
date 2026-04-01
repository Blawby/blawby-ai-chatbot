import { FunctionComponent } from 'preact';
import { useTranslation } from '@/shared/i18n/hooks';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { WorkspaceListHeader } from '@/shared/ui/layout';
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

interface WidgetConversationListViewProps {
  conversations: Conversation[];
  previews: Record<string, ConversationPreview | undefined>;
  practiceName?: string | null;
  isLoading?: boolean;
  error?: unknown;
  onSelectConversation: (conversationId: string) => void;
  onSendMessage: () => void;
  showSendMessageButton?: boolean;
  activeConversationId?: string | null;
}

const WidgetConversationListView: FunctionComponent<WidgetConversationListViewProps> = ({
  conversations,
  previews,
  practiceName,
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
  const practiceSetupTitle = t('conversation.practiceSetup', { defaultValue: 'Practice setup' });
  const sorted = [...conversations].sort((a, b) => {
    const aTime = new Date(a.last_message_at ?? a.updated_at ?? a.created_at).getTime() || 0;
    const bTime = new Date(b.last_message_at ?? b.updated_at ?? b.created_at).getTime() || 0;
    return bTime - aTime;
  });

  return (
    <div className="flex h-full flex-col bg-transparent">
      <WorkspaceListHeader
        title={<div className="workspace-header__title">{t('workspace.conversationList.title')}</div>}
        isLoading={isLoading}
      />

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
          <div className="pt-1 divide-y divide-line-glass/[0.04]">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const title = resolveConversationDisplayTitle(conversation, fallbackName, practiceSetupTitle);
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
                    src={null}
                    name={title}
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
        <div className="bg-transparent px-4 py-4">
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

export default WidgetConversationListView;
