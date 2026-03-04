import { FunctionComponent, type ComponentChildren } from 'preact';
import { useTranslation } from 'react-i18next';
import { DetailHeader } from '@/shared/ui/layout';

interface WorkspaceConversationHeaderProps {
  practiceName?: string | null;
  activeLabel?: string;
  presenceStatus?: 'active' | 'inactive' | 'away';
  onBack?: () => void;
  rightSlot?: ComponentChildren;
}

const WorkspaceConversationHeader: FunctionComponent<WorkspaceConversationHeaderProps> = ({
  practiceName,
  activeLabel,
  presenceStatus,
  onBack,
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

  return (
    <DetailHeader
      title={resolvedName}
      subtitle={resolvedActive}
      showBack={Boolean(onBack)}
      onBack={onBack}
      actions={rightSlot}
      className="workspace-conversation-header"
    />
  );
};

export default WorkspaceConversationHeader;
