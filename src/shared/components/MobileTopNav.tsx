import { Bars3Icon, SparklesIcon, BellIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/shared/ui/Button';

interface MobileTopNavProps {
  onOpenSidebar: () => void;
  onPlusClick?: () => void;
  onOpenNotifications?: () => void;
  hasUnreadNotifications?: boolean;
  isVisible?: boolean;
}

const MobileTopNav = ({
  onOpenSidebar,
  onPlusClick,
  onOpenNotifications,
  hasUnreadNotifications = false,
  isVisible = true
}: MobileTopNavProps) => {

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed top-0 left-0 right-0 bg-white dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border lg:hidden z-50 pt-safe"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 30
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu Button */}
              <Button
                variant="ghost"
                size="md"
                onClick={onOpenSidebar}
                icon={<Bars3Icon className="w-5 h-5" aria-hidden="true" focusable="false" />}
                aria-label="Open menu"
              />
              
              {/* Get Plus Button */}
              {onPlusClick && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={onPlusClick}
                  icon={<SparklesIcon className="w-4 h-4" />}
                  aria-label="Get Plus"
                >
                  Get Plus
                </Button>
              )}
            </div>
            {onOpenNotifications && (
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative rounded-full p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10"
                aria-label={
                  hasUnreadNotifications
                    ? 'Open notifications, you have unread notifications'
                    : 'Open notifications'
                }
              >
                <BellIcon className="h-5 w-5" />
                {hasUnreadNotifications && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-white dark:ring-dark-bg" />
                )}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileTopNav; 
