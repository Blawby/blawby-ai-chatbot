import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { THEME } from '@/shared/utils/constants';
import { lockBodyScroll, unlockBodyScroll } from '@/shared/utils/modalStack';
import { DialogHeader } from './DialogHeader';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
  title?: ComponentChildren;
  description?: ComponentChildren;
  showCloseButton?: boolean;
  disableBackdropClick?: boolean;
  contentClassName?: string;
}

export const Dialog: FunctionComponent<DialogProps> = ({
  isOpen,
  onClose,
  children,
  title,
  description,
  showCloseButton = true,
  disableBackdropClick = false,
  contentClassName,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    lockBodyScroll();

    return () => {
      document.removeEventListener('keydown', handleEscape);
      unlockBodyScroll();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: THEME.zIndex.modal }}
    >
      <button
        type="button"
        aria-label={disableBackdropClick ? undefined : 'Close dialog'}
        className="ui-overlay-enter absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={disableBackdropClick ? undefined : onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'ui-surface-enter relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-overlay/95 text-input-text shadow-2xl backdrop-blur-xl',
          contentClassName
        )}
      >
        {(title || description || showCloseButton) && (
          <DialogHeader
            title={title}
            description={description}
            onClose={onClose}
            showCloseButton={showCloseButton}
          />
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};
