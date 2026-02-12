import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { Button } from '@/shared/ui/Button';

interface BottomNavigationProps {
  onGoToChats?: () => void;
}

const BottomNavigation = ({
  onGoToChats
}: BottomNavigationProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface-base border-t border-line-default lg:hidden z-[1200]">
      <div className="flex items-center justify-center gap-4 p-3">
        <Button
          variant="primary"
          size="icon"
          onClick={onGoToChats}
          aria-label="Chats"
          icon={
            <ChatBubbleOvalLeftEllipsisIcon 
              className="w-6 h-6 block" 
              aria-hidden="true"
            />
          }
        />
      </div>
    </div>
  );
};

export default BottomNavigation; 
