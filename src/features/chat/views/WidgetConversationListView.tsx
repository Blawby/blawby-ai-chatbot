import { FunctionComponent } from 'preact';
import { useTranslation } from '@/shared/i18n/hooks';
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { WorkspaceListHeader, SkeletonLoader } from '@/shared/ui/layout';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';

const WidgetConversationListSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="divide-y divide-line-glass/[0.04] pt-1">
    {Array.from({ length: rows }, (_, i) => {
      const titleW = ['w-32', 'w-40', 'w-28', 'w-36', 'w-44', 'w-32'][i % 6];
      const previewW = ['w-44', 'w-52', 'w-36', 'w-48', 'w-40', 'w-44'][i % 6];
      return (
        <div
          key={i}
          className="flex w-full items-start gap-3 px-4 py-3"
          aria-hidden="true"
        >
          <SkeletonLoader variant="avatar" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <SkeletonLoader variant="text" height="h-3.5" width={titleW} rounded="rounded-md" />
              <SkeletonLoader variant="text" height="h-2.5" width="w-10" rounded="rounded" />
            </div>
            <SkeletonLoader variant="text" height="h-3" width={previewW} rounded="rounded-md" />
          </div>
        </div>
      );
    })}
  </div>
);

const WidgetConversationListEmptyState = ({
  title,
  hint,
}: { title: string; hint: string }) => (
  <div className="flex flex-1 items-center justify-center px-6 py-10">
    <div className="flex max-w-xs flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-overlay/60 ring-1 ring-line-glass/20">
        <Icon
          icon={ChatBubbleLeftRightIcon}
          className="h-6 w-6 text-input-placeholder"
        />
      </div>
      <p className="text-sm font-medium text-input-text">{title}</p>
      <p className="text-xs leading-5 text-input-placeholder">{hint}</p>
    </div>
  </div>
);

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
  const sorted = conversations
    .filter((conversation) => conversation.user_info?.mode !== 'PRACTICE_ONBOARDING')
    .sort((a, b) => {
    const aTime = new Date(a.updated_at).getTime();
    const bTime = new Date(b.updated_at).getTime();
    return bTime - aTime;
  });

  return (
    <div className="flex h-full flex-col bg-transparent">
      <WorkspaceListHeader
        title={<div className="workspace-header__title">{t('workspace.conversationList.title')}</div>}
        isLoading={isLoading}
      />

      <div className="flex flex-1 flex-col overflow-y-auto">
        {isLoading ? (
          <WidgetConversationListSkeleton />
        ) : errorMessage ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <p className="max-w-xs text-center text-sm text-red-500 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <WidgetConversationListEmptyState
            title={t('workspace.conversationList.empty', { defaultValue: 'No conversations yet' })}
            hint={t('workspace.conversationList.emptyHint', {
              defaultValue: 'New conversations will appear here as they come in.',
            })}
          />
        ) : (
          <div className="pt-1 divide-y divide-line-glass/[0.04]">
            {sorted.map((conversation) => {
              const preview = previews[conversation.id];
              const contactName = resolveConversationContactName(conversation);
              const title = resolveConversationDisplayTitle(conversation, fallbackName);
              const avatarName = contactName || fallbackName || 'Contact';
              const timeLabel = formatRelativeTime(conversation.updated_at);
              const previewText = preview?.content
                ? preview.content
                : t('workspace.conversationList.previewPlaceholder');
              const unreadCount = Math.max(0, Number(conversation.unread_count ?? 0));
              const isUnread = unreadCount > 0;
              const isActive = activeConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                    isActive ? 'bg-surface-utility/10' : 'hover:bg-surface-utility/5'
                  )}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <Avatar
                    src={null}
                    name={avatarName}
                    size="md"
                    className="ring-2 ring-line-glass/10"
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
