import type { ComponentChildren } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { X } from 'lucide-preact';
import { lockBodyScroll, unlockBodyScroll } from '@/shared/utils/modalStack';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
  title?: string;
  side?: 'left' | 'right' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

const sizeMap = {
  left: { sm: 'w-72', md: 'w-96', lg: 'w-[480px]', full: 'w-screen' },
  right: { sm: 'w-72', md: 'w-96', lg: 'w-[480px]', full: 'w-screen' },
  bottom: { sm: 'h-1/4', md: 'h-1/2', lg: 'h-3/4', full: 'h-screen' },
};

const positionClasses = {
  left: 'inset-y-0 left-0',
  right: 'inset-y-0 right-0',
  bottom: 'inset-x-0 bottom-0',
};

const translateOpen = { left: 'translate-x-0', right: 'translate-x-0', bottom: 'translate-y-0' };
const translateClosed = { left: '-translate-x-full', right: 'translate-x-full', bottom: 'translate-y-full' };

export function Drawer({
  open,
  onClose,
  children,
  title,
  side = 'right',
  size = 'md',
  className,
}: DrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      lockBodyScroll();
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        unlockBodyScroll();
      };
    }
  }, [open, handleKeyDown]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[300] transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'fixed flex flex-col glass-panel rounded-none',
          positionClasses[side],
          sizeMap[side][size],
          side !== 'bottom' && 'h-full',
          side === 'bottom' && 'w-full',
          'transition-transform duration-300 ease-out',
          open ? translateOpen[side] : translateClosed[side],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-glass/15">
            <h2 className="text-base font-semibold text-input-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="btn btn-ghost btn-icon-xs"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
