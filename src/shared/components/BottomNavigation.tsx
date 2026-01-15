import {
  ChatBubbleOvalLeftEllipsisIcon,
  BellIcon
} from "@heroicons/react/24/outline";

interface BottomNavigationProps {
  activeTab: 'chats' | 'notifications';
  onGoToChats?: () => void;
  onGoToNotifications?: () => void;
  hasUnreadNotifications?: boolean;
}

const BottomNavigation = ({
  activeTab,
  onGoToChats,
  onGoToNotifications,
  hasUnreadNotifications = false
}: BottomNavigationProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg border-t border-gray-200 dark:border-dark-border lg:hidden z-[1200]">
      <div className="flex items-center justify-center gap-4 p-3">
        <button
          aria-label="Chats"
          aria-current={activeTab === 'chats' ? 'page' : undefined}
          onClick={onGoToChats}
          className={`flex items-center justify-center rounded-lg transition-colors leading-none p-2 ${
            activeTab === 'chats'
              ? 'bg-accent-500 text-gray-900 dark:text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6 block" />
        </button>
        <button
          aria-label={hasUnreadNotifications ? 'Notifications (unread)' : 'Notifications'}
          aria-current={activeTab === 'notifications' ? 'page' : undefined}
          onClick={onGoToNotifications}
          className={`relative flex items-center justify-center rounded-lg transition-colors leading-none p-2 ${
            activeTab === 'notifications'
              ? 'bg-accent-500 text-gray-900 dark:text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          <BellIcon className="w-6 h-6 block" />
          {hasUnreadNotifications && (
            <span
              className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ${
                activeTab === 'notifications'
                  ? 'bg-white ring-2 ring-accent-500 dark:bg-gray-900 dark:ring-accent-500'
                  : 'bg-accent-500 ring-2 ring-white dark:ring-dark-bg'
              }`}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation; 
