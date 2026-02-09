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

interface WorkspaceSidebarNavProps {
  activeTab: 'home' | 'messages' | 'matters' | 'settings' | 'clients';
  onSelectTab: (tab: 'home' | 'messages' | 'matters' | 'settings' | 'clients') => void;
  showClientTabs?: boolean;
  showPracticeTabs?: boolean;
  className?: string;
}

const WorkspaceSidebarNav: FunctionComponent<WorkspaceSidebarNavProps> = ({
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

  const baseClasses = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition';
  const activeClasses = 'bg-accent-100 text-accent-700 shadow-sm dark:bg-accent-900/30 dark:text-accent-300';
  const inactiveClasses = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

  return (
    <nav className={cn('flex h-full flex-col gap-2 px-3 py-4', className)}>
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
            />
          ) : (
            <UserCircleIcon className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="truncate">{profileLabel}</span>
        </button>
      )}
    </nav>
  );
};

export default WorkspaceSidebarNav;
