import { Bars3Icon, SparklesIcon } from "@heroicons/react/24/outline";
import { Button } from '@/shared/ui/Button';

interface MobileTopNavProps {
  onOpenSidebar: () => void;
  onPlusClick?: () => void;
  isVisible?: boolean;
}

const MobileTopNav = ({
  onOpenSidebar,
  onPlusClick,
  isVisible = true
}: MobileTopNavProps) => {
  return (
    <div
      aria-hidden={!isVisible}
      className={`fixed top-0 left-0 right-0 glass-panel rounded-none border-b border-line-glass/30 lg:hidden z-50 pt-safe transition-all duration-300 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : '-translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={onOpenSidebar}
            icon={Bars3Icon}
            iconClassName="w-5 h-5"
            aria-label="Open menu"
          />
          {onPlusClick && (
            <Button
              variant="primary"
              size="md"
              onClick={onPlusClick}
              icon={SparklesIcon}
              iconClassName="w-4 h-4"
              aria-label="Get Plus"
            >
              Get Plus
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileTopNav;
