import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  HomeIcon,
  ClipboardDocumentListIcon,
  UserCircleIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { cn } from '@/shared/utils/cn';

interface WorkspaceNavProps {
  variant: 'bottom' | 'sidebar';
  activeTab: 'home' | 'messages' | 'matters' | 'settings' | 'clients';
  onSelectTab: (tab: 'home' | 'messages' | 'matters' | 'settings' | 'clients') => void;
  showClientTabs?: boolean;
  showPracticeTabs?: boolean;
  className?: string;
}

const WorkspaceNav: FunctionComponent<WorkspaceNavProps> = ({
  variant,
  activeTab,
  onSelectTab,
  showClientTabs = false,
  showPracticeTabs = false,
  className
}) => {
  const { t } = useTranslation();
  const { session } = useSessionContext();
  const profileName = session?.user?.name?.trim() ?? '';
  const profileEmail = session?.user?.email?.trim() ?? '';
  const profileLabel = profileName || profileEmail || t('workspace.navigation.settings');
  const profileImage = session?.user?.image ?? null;

  const baseClasses = variant === 'bottom'
    ? 'flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition'
    : 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition';
  const activeClasses = 'bg-accent-100 text-accent-700 shadow-sm dark:bg-accent-900/30 dark:text-accent-300';
  const inactiveClasses = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

  const containerClasses = variant === 'bottom'
    ? (showPracticeTabs
      ? 'grid grid-cols-5 gap-2'
      : showClientTabs
      ? 'grid grid-cols-4 gap-2'
      : 'flex items-center justify-between gap-3')
    : 'flex h-full flex-col gap-2 px-2';

  return (
    <div
      className={cn(
        variant === 'bottom'
          ? 'border-t border-light-border bg-white/95 px-4 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.12)] dark:border-white/20 dark:bg-dark-bg/95 dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55)]'
          : 'h-full border-r border-light-border bg-white/95 px-2 py-3 shadow-[0_0_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-dark-bg/95',
        className
      )}
    >
      <nav className={containerClasses}>
        <button
          type="button"
          className={cn(baseClasses, activeTab === 'home' ? activeClasses : inactiveClasses)}
          onClick={() => onSelectTab('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          <HomeIcon className="h-5 w-5" aria-hidden="true" />
          <span>{t('workspace.navigation.home')}</span>
        </button>
        <button
          type="button"
          className={cn(baseClasses, activeTab === 'messages' ? activeClasses : inactiveClasses)}
          onClick={() => onSelectTab('messages')}
          aria-current={activeTab === 'messages' ? 'page' : undefined}
        >
          <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />
          <span>{t('workspace.navigation.messages')}</span>
        </button>
        {(showClientTabs || showPracticeTabs) && (
          <button
            type="button"
            className={cn(baseClasses, activeTab === 'matters' ? activeClasses : inactiveClasses)}
            onClick={() => onSelectTab('matters')}
            aria-current={activeTab === 'matters' ? 'page' : undefined}
          >
            <ClipboardDocumentListIcon className="h-5 w-5" aria-hidden="true" />
            <span>{t('workspace.navigation.matters')}</span>
          </button>
        )}
        {showPracticeTabs && (
          <button
            type="button"
            className={cn(baseClasses, activeTab === 'clients' ? activeClasses : inactiveClasses)}
            onClick={() => onSelectTab('clients')}
            aria-current={activeTab === 'clients' ? 'page' : undefined}
          >
            <UsersIcon className="h-5 w-5" aria-hidden="true" />
            <span>{t('workspace.navigation.clients')}</span>
          </button>
        )}
        {(showClientTabs || showPracticeTabs) && (
          <button
            type="button"
            className={cn(baseClasses, activeTab === 'settings' ? activeClasses : inactiveClasses)}
            onClick={() => onSelectTab('settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            {profileImage || profileName || profileEmail ? (
              <Avatar
                src={profileImage}
                name={profileLabel}
                size="xs"
                className="h-5 w-5 ring-1 ring-white/20"
                aria-hidden="true"
              />
            ) : (
              <UserCircleIcon className="h-5 w-5" aria-hidden="true" />
            )}
            <span className={cn('truncate', variant === 'bottom' ? 'max-w-[96px]' : '')}>{profileLabel}</span>
          </button>
        )}
      </nav>
    </div>
  );
};

export default WorkspaceNav;
