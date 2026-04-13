import { FunctionComponent, ComponentChildren } from 'preact';
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
 if (!isOpen) return null;

 return (
  <div
   className={cn(
    'ui-surface-enter mx-2 mb-4 overflow-hidden shadow-glass glass-card p-6 text-input-text border-none',
    containerClassName
   )}
  >
   {(title || description || (showCloseButton && onClose)) && (
    <div className="mb-4 flex items-start justify-between gap-4">
     <div className="flex-1 min-w-0">
      {title && (
       <h3 className="truncate text-lg font-bold leading-tight text-input-text">
        {title}
       </h3>
      )}
      {description && (
       <p className="mt-1 text-sm text-input-placeholder">
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
       className="shrink-0 text-input-placeholder hover:bg-surface-hover hover:text-input-text"
      >
       <Icon icon={XMarkIcon} className="h-5 w-5" />
      </Button>
     )}
    </div>
   )}
   <div className={cn('relative', className)}>
    {children}
   </div>
  </div>
 );
};

export default ChatDockedAction;
