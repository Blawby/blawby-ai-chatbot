import type { FunctionComponent } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Search, SquarePen } from 'lucide-preact';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Input } from '@/shared/ui/input/Input';
import { Button } from '@/shared/ui/Button';
import { SegmentedToggle, type SegmentedToggleOption } from '@/shared/ui/input/SegmentedToggle';
import { cn } from '@/shared/utils/cn';
import ConversationListView from '@/features/chat/views/ConversationListView';
import type { Conversation } from '@/shared/types/conversation';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';

interface ConversationPreview {
  content: string;
  role: 'user' | 'system' | 'assistant' | string;
  createdAt: string;
}

interface MessagesListPanelTabs<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedToggleOption<T>>;
  onChange: (value: T) => void;
}

interface MessagesListPanelProps {
  conversations: Conversation[];
  previews: Record<string, ConversationPreview | undefined>;
  practiceName?: string | null;
  practiceLogo?: string | null;
  isLoading?: boolean;
  error?: unknown;
  onSelectConversation: (conversationId: string) => void;
  onCompose?: () => void;
  /** Optional draft entry rendered as a synthetic row pinned to the top of
   *  the list. Pass when a draft conversation is in flight; clicking the row
   *  re-opens the draft view. */
  draftEntry?: { contactName?: string; contactEmail?: string } | null;
  onSelectDraftEntry?: () => void;
  activeConversationId?: string | null;
  /** Optional segmented filter (mobile tab bar). Pass to render
   *  segmented tabs above the search input — typically only on mobile where
   *  the sidebar's secondary-nav filters aren't visible. */
  tabs?: MessagesListPanelTabs<string> | null;
}

/**
 * "Messages" list column. Wraps ConversationListView with a header
 * row (title + count badge + compose action) and a search input that filters
 * the list client-side by contact name and last-message preview.
 */
const MessagesListPanel: FunctionComponent<MessagesListPanelProps> = ({
  conversations,
  previews,
  practiceName,
  practiceLogo,
  isLoading = false,
  error = null,
  onSelectConversation,
  onCompose,
  draftEntry = null,
  onSelectDraftEntry,
  activeConversationId = null,
  tabs = null,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const contactName = resolveConversationContactName(conversation) || '';
      const fallbackTitle = resolveConversationDisplayTitle(conversation, practiceName ?? '') || '';
      const previewText = (previews[conversation.id]?.content ?? conversation.last_message_content ?? '').toString();
      return (
        contactName.toLowerCase().includes(query) ||
        fallbackTitle.toLowerCase().includes(query) ||
        previewText.toLowerCase().includes(query)
      );
    });
  }, [conversations, previews, practiceName, searchQuery]);

  const visibleCount = filteredConversations.length;
  const totalCount = conversations.length;
  const badgeCount = searchQuery.trim() ? visibleCount : totalCount;
  const formattedBadge = badgeCount > 99 ? '99+' : String(badgeCount).padStart(2, '0');

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-input-text">
            {t('workspace.conversationList.title', { defaultValue: 'Messages' })}
          </h2>
          <span
            className="inline-flex h-5 min-w-[28px] items-center justify-center rounded-full bg-accent-500/15 px-1.5 text-[11px] font-semibold text-accent-utility"
            aria-label={t('workspace.conversationList.countLabel', {
              defaultValue: '{{count}} conversations',
              count: badgeCount,
            })}
          >
            {formattedBadge}
          </span>
        </div>
        {onCompose ? (
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            onClick={onCompose}
            icon={SquarePen}
            iconClassName="h-4 w-4"
            aria-label={t('workspace.conversationList.compose', { defaultValue: 'New message' })}
          />
        ) : null}
      </header>
      {tabs && tabs.options.length > 0 ? (
        <div className="px-4 pb-3">
          <SegmentedToggle
            value={tabs.value}
            options={tabs.options}
            onChange={tabs.onChange}
            ariaLabel={t('workspace.conversationList.filterLabel', { defaultValue: 'Filter messages' })}
            className="flex w-full"
          />
        </div>
      ) : null}
      <div className="px-4 pb-3">
        <Input
          type="search"
          value={searchQuery}
          onChange={setSearchQuery}
          icon={Search}
          iconPosition="left"
          size="sm"
          placeholder={t('workspace.conversationList.searchPlaceholder', { defaultValue: 'Search messages...' })}
          aria-label={t('workspace.conversationList.searchPlaceholder', { defaultValue: 'Search messages...' })}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {draftEntry ? (
          <button
            type="button"
            onClick={() => onSelectDraftEntry?.()}
            className={cn(
              'mx-2 mt-2 mb-1 flex w-[calc(100%-1rem)] items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
              activeConversationId === null && 'nav-item-active'
            )}
            aria-current={activeConversationId === null ? 'page' : undefined}
          >
            <Avatar
              src={null}
              name={draftEntry.contactName ?? 'New conversation'}
              size="md"
              className="ring-1 ring-line-subtle"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <span className="block truncate text-sm font-semibold text-input-text">
                  {draftEntry.contactName ?? t('workspace.conversationList.draftPlaceholder', { defaultValue: 'New conversation' })}
                </span>
                <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-utility">
                  {t('workspace.conversationList.draftBadge', { defaultValue: 'Draft' })}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-input-placeholder">
                {draftEntry.contactEmail ?? t('workspace.conversationList.draftHint', { defaultValue: 'Pick a contact and send the first message' })}
              </div>
            </div>
          </button>
        ) : null}
        <ConversationListView
          conversations={filteredConversations}
          previews={previews}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          isLoading={isLoading}
          error={error}
          onSelectConversation={onSelectConversation}
          onSendMessage={onCompose ?? (() => undefined)}
          showSendMessageButton={false}
          activeConversationId={activeConversationId}
        />
      </div>
    </div>
  );
};

export default MessagesListPanel;
