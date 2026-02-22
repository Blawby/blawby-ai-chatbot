import { FunctionComponent, type ComponentChildren } from 'preact';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';

interface WorkspaceConversationHeaderProps {
  practiceName?: string | null;
  practiceLogo?: string | null;
  activeLabel?: string;
  presenceStatus?: 'active' | 'inactive' | 'away';
  onBack?: () => void;
  loading?: boolean;
  rightSlot?: ComponentChildren;
}

const WorkspaceConversationHeader: FunctionComponent<WorkspaceConversationHeaderProps> = ({
  practiceName,
  practiceLogo,
  activeLabel,
  presenceStatus,
  onBack,
  loading = false,
  rightSlot
}) => {
  const { t } = useTranslation();
  const resolvedName = typeof practiceName === 'string'
    ? practiceName.trim()
    : '';
  const resolvedActive = (() => {
    if (typeof activeLabel === 'string' && activeLabel.trim().length > 0) {
      return activeLabel.trim();
    }
    switch (presenceStatus) {
      case 'active':
        return t('workspace.header.activeNow');
      case 'inactive':
        return t('workspace.header.inactive');
      case 'away':
        return t('workspace.header.away');
      default:
        return t('workspace.header.unknown');
    }
  })();
  const resolvedStatus = presenceStatus === 'away' ? 'inactive' : presenceStatus;

  return (
    <header className="workspace-header workspace-conversation-header">
      <Button
        type="button"
        variant="icon"
        size="icon-sm"
        onClick={onBack}
        className="workspace-header__icon"
        aria-label={t('workspace.header.back')}
      >
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Avatar
        src={practiceLogo}
        name={resolvedName}
        size="sm"
        className="workspace-header__avatar-ring"
        status={resolvedStatus}
      />
      <div className="workspace-header__identity">
        <div className="workspace-header__title">
          {resolvedName}
        </div>
        <div className="workspace-header__subtitle">{resolvedActive}</div>
      </div>
      {rightSlot && (
        <div className="workspace-header__right">
          {rightSlot}
        </div>
      )}
      {loading ? <div className="workspace-header__loading" aria-hidden="true" /> : null}
    </header>
  );
};

export default WorkspaceConversationHeader;
