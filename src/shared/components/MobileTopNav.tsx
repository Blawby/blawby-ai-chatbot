import { Bars3Icon, SparklesIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from 'framer-motion';
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
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed top-0 left-0 right-0 bg-surface-base border-b border-line-default lg:hidden z-50 pt-safe"
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileTopNav; 
