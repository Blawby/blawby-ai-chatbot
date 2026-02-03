import { FunctionComponent } from 'preact';
import { useTranslation } from 'react-i18next';
import { ChatBubbleOvalLeftEllipsisIcon, HomeIcon, ClipboardDocumentListIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';

interface PublicEmbedNavigationProps {
  activeTab: 'home' | 'messages' | 'matters' | 'settings';
  onSelectTab: (tab: 'home' | 'messages' | 'matters' | 'settings') => void;
  showClientTabs?: boolean;
}

const PublicEmbedNavigation: FunctionComponent<PublicEmbedNavigationProps> = ({
  activeTab,
  onSelectTab,
  showClientTabs = false
}) => {
  const { t } = useTranslation();
  const { session } = useSessionContext();
  const isHome = activeTab === 'home';
  const isMessages = activeTab === 'messages';
  const profileName = session?.user?.name?.trim() ?? '';
  const profileEmail = session?.user?.email?.trim() ?? '';
  const profileLabel = profileName || profileEmail || t('embed.navigation.settings');
  const profileImage = session?.user?.image ?? null;

  const baseClasses = 'flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition';
  const activeClasses = 'bg-accent-100 text-accent-700 shadow-sm dark:bg-accent-900/30 dark:text-accent-300';
  const inactiveClasses = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

  const containerClasses = showClientTabs
    ? 'grid grid-cols-4 gap-2'
    : 'flex items-center justify-between gap-3';

  return (
    <div className="border-t border-light-border bg-white/95 px-4 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.12)] dark:border-white/20 dark:bg-dark-bg/95 dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55)]">
      <div className={containerClasses}>
        <button
          type="button"
          className={`${baseClasses} ${isHome ? activeClasses : inactiveClasses}`}
          onClick={() => onSelectTab('home')}
          aria-current={isHome ? 'page' : undefined}
        >
          <HomeIcon className="h-5 w-5" aria-hidden="true" />
          <span>{t('embed.navigation.home')}</span>
        </button>
        <button
          type="button"
          className={`${baseClasses} ${isMessages ? activeClasses : inactiveClasses}`}
          onClick={() => onSelectTab('messages')}
          aria-current={isMessages ? 'page' : undefined}
        >
          <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />
          <span>{t('embed.navigation.messages')}</span>
        </button>
        {showClientTabs && (
          <button
            type="button"
            className={`${baseClasses} ${activeTab === 'matters' ? activeClasses : inactiveClasses}`}
            onClick={() => onSelectTab('matters')}
            aria-current={activeTab === 'matters' ? 'page' : undefined}
          >
            <ClipboardDocumentListIcon className="h-5 w-5" aria-hidden="true" />
            <span>{t('embed.navigation.matters')}</span>
          </button>
        )}
        {showClientTabs && (
          <button
            type="button"
            className={`${baseClasses} ${activeTab === 'settings' ? activeClasses : inactiveClasses}`}
            onClick={() => onSelectTab('settings')}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
          >
            {profileImage || profileName || profileEmail ? (
              <Avatar
                src={profileImage}
                name={profileLabel}
                size="sm"
                className="ring-1 ring-white/20"
              />
            ) : (
              <UserCircleIcon className="h-5 w-5" aria-hidden="true" />
            )}
            <span className="max-w-[96px] truncate">{profileLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PublicEmbedNavigation;
