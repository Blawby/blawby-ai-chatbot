import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { THEME } from '@/shared/utils/constants';
import { lockBodyScroll, unlockBodyScroll } from '@/shared/utils/modalStack';

export interface FullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
  showCloseButton?: boolean;
  disableBackdropClick?: boolean;
}

export const Fullscreen: FunctionComponent<FullscreenProps> = ({
  isOpen,
  onClose,
  children,
  showCloseButton = true,
  disableBackdropClick: _disableBackdropClick = false,
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
      role="dialog"
      aria-modal="true"
      className="ui-overlay-enter fixed inset-0 h-full w-full overflow-y-auto"
      style={{ zIndex: THEME.zIndex.modal }}
    >
      <div className="ui-surface-enter min-h-full w-full flex flex-col border border-line-glass/30 bg-surface-overlay/95 text-input-text shadow-2xl backdrop-blur-xl">
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 rounded-full text-input-placeholder hover:bg-surface-hover hover:text-input-text"
            icon={<Icon icon={XMarkIcon} className="h-4 w-4" />}
          />
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};
