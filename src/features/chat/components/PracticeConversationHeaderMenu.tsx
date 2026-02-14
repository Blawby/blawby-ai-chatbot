import { FunctionComponent, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { LinkIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { LinkMatterModal } from '@/features/chat/components/LinkMatterModal';

interface PracticeConversationHeaderMenuProps {
  practiceId?: string;
  conversationId?: string;
}

const PracticeConversationHeaderMenu: FunctionComponent<PracticeConversationHeaderMenuProps> = ({
  practiceId,
  conversationId
}) => {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const canLinkMatter = Boolean(practiceId && conversationId);

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-glass/30 bg-surface-glass/40 text-input-text transition hover:bg-surface-glass/60"
            aria-label="Conversation actions"
          >
            <LinkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setIsLinkModalOpen(true)} disabled={!canLinkMatter}>
            Link to matter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canLinkMatter && isLinkModalOpen ? (
        <LinkMatterModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          practiceId={practiceId!}
          conversationId={conversationId!}
          onMatterUpdated={() => {}}
        />
      ) : null}
    </Fragment>
  );
};

export default PracticeConversationHeaderMenu;
