import { FunctionComponent, ComponentChildren } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface ChatDockedActionProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  children: ComponentChildren;
  className?: string;
  containerClassName?: string;
  showCloseButton?: boolean;
}

export const ChatDockedAction: FunctionComponent<ChatDockedActionProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  containerClassName,
  showCloseButton = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            mass: 0.8
          }}
          className={cn(
            "mx-2 mb-4 overflow-hidden rounded-2xl border border-white/10 bg-surface-glass p-6 shadow-2xl backdrop-blur-xl",
            containerClassName
          )}
        >
          {(title || description || (showCloseButton && onClose)) && (
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {title && (
                  <h3 className="text-lg font-bold text-input-text truncate leading-tight">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-sm text-input-placeholder mt-1">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && onClose && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Dismiss"
                  className="text-input-placeholder hover:text-input-text hover:bg-white/10 shrink-0"
                >
                  <Icon icon={XMarkIcon} className="h-5 w-5" />
                </Button>
              )}
            </div>
          )}
          <div className={cn("relative", className)}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatDockedAction;
