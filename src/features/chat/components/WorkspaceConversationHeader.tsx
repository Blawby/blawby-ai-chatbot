import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';

interface WorkspaceConversationHeaderProps {
  practiceName?: string | null;
  practiceLogo?: string | null;
  activeLabel?: string;
  presenceStatus?: 'active' | 'inactive';
  onBack?: () => void;
}

const WorkspaceConversationHeader: FunctionComponent<WorkspaceConversationHeaderProps> = ({
  practiceName,
  practiceLogo,
  activeLabel,
  presenceStatus,
  onBack
}) => {
  const { t } = useTranslation();
  const resolvedName = typeof practiceName === 'string'
    ? practiceName.trim()
    : '';
  const resolvedActive = typeof activeLabel === 'string' && activeLabel.trim().length > 0
    ? activeLabel.trim()
    : t('workspace.header.activeNow');

  return (
    <header className="flex min-h-[56px] items-center gap-3 border-b border-light-border bg-light-bg px-4 py-3 dark:border-dark-border dark:bg-dark-bg">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10"
        aria-label={t('workspace.header.back')}
      >
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <Avatar
        src={practiceLogo}
        name={resolvedName}
        size="sm"
        className="ring-2 ring-white/10"
        status={presenceStatus}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {resolvedName}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400">{resolvedActive}</div>
      </div>
    </header>
  );
};

export default WorkspaceConversationHeader;
