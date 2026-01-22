import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/outline";

interface BottomNavigationProps {
  onGoToChats?: () => void;
}

const BottomNavigation = ({
  onGoToChats
}: BottomNavigationProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg border-t border-gray-200 dark:border-dark-border lg:hidden z-[1200]">
      <div className="flex items-center justify-center gap-4 p-3">
        <button
          aria-label="Chats"
          onClick={onGoToChats}
          className={`flex items-center justify-center rounded-lg transition-colors leading-none p-2 ${
            'bg-accent-500 text-gray-900 dark:text-white'
          }`}
        >
          <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6 block" />
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation; 
