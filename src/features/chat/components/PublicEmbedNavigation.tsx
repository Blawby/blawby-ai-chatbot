import { FunctionComponent } from 'preact';
import { ChatBubbleOvalLeftEllipsisIcon, HomeIcon } from '@heroicons/react/24/outline';

interface PublicEmbedNavigationProps {
  activeTab: 'home' | 'messages';
  onSelectTab: (tab: 'home' | 'messages') => void;
}

const PublicEmbedNavigation: FunctionComponent<PublicEmbedNavigationProps> = ({
  activeTab,
  onSelectTab
}) => {
  const isHome = activeTab === 'home';
  const isMessages = activeTab === 'messages';

  const baseClasses = 'flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition';
  const activeClasses = 'bg-accent-100 text-accent-700 shadow-sm dark:bg-accent-900/30 dark:text-accent-300';
  const inactiveClasses = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

  return (
    <div className="border-t border-light-border bg-white/95 px-4 py-2 shadow-[0_-6px_20px_rgba(15,23,42,0.12)] dark:border-white/20 dark:bg-dark-bg/95 dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={`${baseClasses} ${isHome ? activeClasses : inactiveClasses}`}
          onClick={() => onSelectTab('home')}
          aria-current={isHome ? 'page' : undefined}
        >
          <HomeIcon className="h-5 w-5" aria-hidden="true" />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={`${baseClasses} ${isMessages ? activeClasses : inactiveClasses}`}
          onClick={() => onSelectTab('messages')}
          aria-current={isMessages ? 'page' : undefined}
        >
          <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" aria-hidden="true" />
          <span>Messages</span>
        </button>
      </div>
    </div>
  );
};

export default PublicEmbedNavigation;
