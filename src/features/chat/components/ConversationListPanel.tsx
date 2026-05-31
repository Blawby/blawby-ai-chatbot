import type { FunctionComponent } from 'preact';
import { Panel } from '@/shared/ui/layout/Panel';
import { cn } from '@/shared/utils/cn';
import MessagesListPanel from '@/features/chat/components/MessagesListPanel';
import type { Conversation } from '@/shared/types/conversation';
import type { SegOption } from '@/design-system/patterns';

interface ConversationPreview {
  content: string;
  role: 'user' | 'system' | 'assistant' | string;
  createdAt: string;
}

interface ConversationListPanelTabs<T extends string> {
  value: T;
  options: ReadonlyArray<SegOption<T>>;
  onChange: (value: T) => void;
}

export interface ConversationListPanelProps {
  /** Conversations to render in the 340px column. */
  conversations: Conversation[];
  /** Preview map keyed by conversation id (last-message snippet). */
  conversationPreviews: Record<string, ConversationPreview | undefined>;
  /** Initial load state — renders a skeleton list when true. */
  isLoading?: boolean;
  /** Surface error state from the conversations fetch. */
  error?: unknown;
  /** Currently-selected conversation id (used for the active row highlight). */
  activeConversationId?: string | null;
  /** Fires when a row is selected. */
  onSelect: (conversationId: string) => void;
  /** Fires when the user clicks the compose / new-conversation button. */
  onNew?: () => void;
  /** Display name fallback when a conversation has no contact (e.g. practice assistant). */
  practiceName?: string | null;
  /** Practice logo URL — passed through to the row avatars. */
  practiceLogo?: string | null;
  /** Optional draft entry pinned to the top of the list. */
  draftEntry?: { contactName?: string; contactEmail?: string } | null;
  /** Fires when the pinned draft row is selected. */
  onSelectDraftEntry?: () => void;
  /** Optional segmented filter rendered above the search box. */
  tabs?: ConversationListPanelTabs<string> | null;
  /** Extra classes applied to the outer 340px wrapper. */
  className?: string;
}

/**
 * ConversationListPanel — the 340px thread list column of the 4-column
 * chat-first Conversations surface (per the Conversations.html canonical
 * mockup). Hosts the gradient {@link Panel} card + {@link MessagesListPanel}
 * composition that used to live inline in WorkspacePage.
 *
 * Layout slot: column 2 of `240px | 340px | 1fr | 400px` on `lg+`. The
 * surrounding AppShell sizes the column; this component only declares its
 * intrinsic structure (flex column, full-height card with gradient).
 */
export const ConversationListPanel: FunctionComponent<ConversationListPanelProps> = ({
  conversations,
  conversationPreviews,
  isLoading = false,
  error = null,
  activeConversationId = null,
  onSelect,
  onNew,
  practiceName,
  practiceLogo,
  draftEntry = null,
  onSelectDraftEntry,
  tabs = null,
  className,
}) => {
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col gap-2', className)}>
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <MessagesListPanel
          conversations={conversations}
          previews={conversationPreviews}
          practiceName={practiceName}
          practiceLogo={practiceLogo}
          isLoading={isLoading}
          error={error}
          onSelectConversation={onSelect}
          onCompose={onNew}
          draftEntry={draftEntry}
          onSelectDraftEntry={onSelectDraftEntry}
          activeConversationId={activeConversationId}
          tabs={tabs}
        />
      </Panel>
    </div>
  );
};

export default ConversationListPanel;
