import { FunctionComponent, memo } from 'preact/compat';
import { useTranslation } from 'react-i18next';
import {
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { VList } from 'virtua';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { SkeletonLoader } from '@/shared/ui/layout';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import type { Conversation } from '@/shared/types/conversation';
import { chatTypography } from '@/features/chat/styles/chatTypography';
import { ChatText } from '@/features/chat/components/ChatText';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';

/**
 * Placeholder rows shaped like ConversationItem (avatar + title + time +
 * preview line). Used during initial load so the sidebar reads as "list
 * coming" rather than a flat status string.
 */
const ConversationListSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="px-2 py-2">
    {Array.from({ length: rows }, (_, i) => {
      const titleW = ['w-32', 'w-40', 'w-28', 'w-36', 'w-44', 'w-32'][i % 6];
      const previewW = ['w-44', 'w-52', 'w-36', 'w-48', 'w-40', 'w-44'][i % 6];
      return (
        <div
          key={i}
          className="mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-2.5"
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

/**
 * Centered, illustrated empty state for the conversation list. Replaces a
 * tiny left-aligned line of text with something that fills the panel and
 * signals "this is where conversations will appear" — softly framed icon,
 * title, and a one-line hint.
 */
const ConversationListEmptyState = ({
  title,
  hint,
}: { title: string; hint: string }) => (
  <div className="flex h-full flex-1 items-center justify-center px-6 py-10">
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

interface ConversationItemProps {
  conversation: Conversation;
  preview: ConversationPreview | undefined;
  fallbackName: string;
  isActive: boolean;
  onSelect: (id: string) => void;
}

const ConversationItem = memo(({ conversation, preview, fallbackName, isActive, onSelect }: ConversationItemProps) => {
  const { t } = useTranslation();
  const contactName = resolveConversationContactName(conversation);
  const fallbackTitle = resolveConversationDisplayTitle(conversation, fallbackName);
  const title = contactName || fallbackTitle;
  const avatarName = contactName || fallbackName || 'Contact';
  const timeLabel = formatRelativeTime(conversation.updated_at);
  const previewText = (preview?.content ?? conversation.last_message_content ?? '').trim();
  const isUnread = Number(conversation.unread_count ?? 0) > 0;

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      type="button"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
        isActive ? 'nav-item-active' : 'nav-item-inactive'
      )}
    >
      <Avatar
        src={null}
        name={avatarName}
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
});

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
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <div className="flex h-full flex-col bg-transparent">
      {isLoading ? (
        <ConversationListSkeleton />
      ) : errorMessage ? (
        <div className="flex h-full flex-1 items-center justify-center px-6 py-10">
          <p className="max-w-xs text-center text-sm text-red-500 dark:text-red-300">
            {errorMessage}
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <ConversationListEmptyState
          title={t('workspace.conversationList.empty', { defaultValue: 'No conversations yet' })}
          hint={t('workspace.conversationList.emptyHint', {
            defaultValue: 'New conversations will appear here as they come in.',
          })}
        />
      ) : (
        <VList style={{ flex: 1, minHeight: 0 }} className="px-2 py-2">
          {sorted.map((conversation) => (
            <div key={conversation.id} className="mb-1">
              <ConversationItem
                conversation={conversation}
                preview={previews[conversation.id]}
                fallbackName={fallbackName}
                isActive={activeConversationId === conversation.id}
                onSelect={onSelectConversation}
              />
            </div>
          ))}
        </VList>
      )}

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
