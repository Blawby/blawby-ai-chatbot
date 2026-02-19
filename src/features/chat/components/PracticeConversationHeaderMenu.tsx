import { FunctionComponent, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { LinkIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { Button } from '@/shared/ui/Button';
import { LinkMatterModal } from '@/features/chat/components/LinkMatterModal';
import { useToastContext } from '@/shared/contexts/ToastContext';

interface PracticeConversationHeaderMenuProps {
  practiceId?: string;
  conversationId?: string;
}

const PracticeConversationHeaderMenu: FunctionComponent<PracticeConversationHeaderMenuProps> = ({
  practiceId,
  conversationId
}) => {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const { showSuccess } = useToastContext();
  const canLinkMatter = Boolean(practiceId && conversationId);

  const handleMatterUpdated = () => {
    setIsLinkModalOpen(false);
    showSuccess('Matter linked successfully');
  };

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="icon"
            size="icon-sm"
            className="border border-line-glass/30 bg-surface-glass/40 hover:bg-surface-glass/60"
            aria-label="Conversation actions"
          >
            <LinkIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setIsLinkModalOpen(true)} disabled={!canLinkMatter}>
            Link to matter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canLinkMatter && isLinkModalOpen && practiceId && conversationId ? (
        <LinkMatterModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          practiceId={practiceId}
          conversationId={conversationId}
          onMatterUpdated={handleMatterUpdated}
        />
      ) : null}
    </Fragment>
  );
};

export default PracticeConversationHeaderMenu;
