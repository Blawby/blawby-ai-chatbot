import { FunctionComponent, VNode } from 'preact';
import { useTranslation } from 'react-i18next';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  HomeIcon,
  ClipboardDocumentListIcon,
  UserCircleIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Logo } from '@/shared/ui/Logo';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { cn } from '@/shared/utils/cn';

export type WorkspaceNavTab = 'home' | 'messages' | 'matters' | 'settings' | 'clients';

interface WorkspaceNavProps {
  variant: 'bottom' | 'sidebar';
  activeTab: WorkspaceNavTab;
  onSelectTab: (tab: WorkspaceNavTab) => void;
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

  const renderButton = (
    tab: WorkspaceNavTab,
    icon: VNode,
    label: string,
    options?: { truncate?: boolean }
  ) => (
    <button
      type="button"
      className={cn(baseClasses, activeTab === tab ? activeClasses : inactiveClasses)}
      onClick={() => onSelectTab(tab)}
      aria-current={activeTab === tab ? 'page' : undefined}
    >
      {icon}
      <span className={cn(options?.truncate ? 'truncate max-w-[96px]' : '')}>{label}</span>
    </button>
  );

  const settingsButton = (showClientTabs || showPracticeTabs)
    ? (
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
    )
    : null;

  return (
    <div
      className={cn(
        variant === 'bottom'
          ? 'border-t border-light-border bg-light-card-bg px-4 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.12)] dark:border-dark-border dark:bg-dark-card-bg dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55)]'
          : 'h-full border-r border-light-border bg-light-card-bg px-2 py-3 shadow-[0_0_24px_rgba(15,23,42,0.06)] dark:border-dark-border dark:bg-dark-card-bg',
        className
      )}
    >
      {variant === 'sidebar' ? (
        <div className="flex h-full flex-col">
          <div className="px-3 pb-4 pt-2">
            <Logo size="sm" showText className="text-gray-900 dark:text-white" />
          </div>
          <nav className="flex min-h-0 flex-1 flex-col px-2 pb-6">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {renderButton('home', <HomeIcon className="h-5 w-5" aria-hidden="true" />, t('workspace.navigation.home'))}
              {renderButton('messages', <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />, t('workspace.navigation.messages'))}
              {(showClientTabs || showPracticeTabs) && renderButton(
                'matters',
                <ClipboardDocumentListIcon className="h-5 w-5" aria-hidden="true" />,
                t('workspace.navigation.matters')
              )}
              {showPracticeTabs && renderButton(
                'clients',
                <UsersIcon className="h-5 w-5" aria-hidden="true" />,
                t('workspace.navigation.clients')
              )}
            </div>
            <div className="border-t border-light-border pt-3 dark:border-dark-border">
              {settingsButton}
            </div>
          </nav>
        </div>
      ) : (
        <nav className={containerClasses}>
          {renderButton(
            'home',
            <HomeIcon className="h-5 w-5" aria-hidden="true" />,
            t('workspace.navigation.home')
          )}
          {renderButton(
            'messages',
            <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />,
            t('workspace.navigation.messages')
          )}
          {(showClientTabs || showPracticeTabs) && renderButton(
            'matters',
            <ClipboardDocumentListIcon className="h-5 w-5" aria-hidden="true" />,
            t('workspace.navigation.matters')
          )}
          {showPracticeTabs && renderButton(
            'clients',
            <UsersIcon className="h-5 w-5" aria-hidden="true" />,
            t('workspace.navigation.clients')
          )}
          {settingsButton}
        </nav>
      )}
    </div>
  );
};

export default WorkspaceNav;
