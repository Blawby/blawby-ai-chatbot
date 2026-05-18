import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { THEME } from '@/shared/utils/constants';
import { isTopmostModal, lockBodyScroll, registerModal, unlockBodyScroll, unregisterModal } from '@/shared/utils/modalStack';
import { focusInitialElement, trapFocusWithin } from './focusUtils';

export interface FullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
  showCloseButton?: boolean;
  disableBackdropClick?: boolean;
  ariaLabel?: string;
}

export const Fullscreen: FunctionComponent<FullscreenProps> = ({
  isOpen,
  onClose,
  children,
  showCloseButton = true,
  disableBackdropClick = false,
  ariaLabel,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogId = `fullscreen-${useId()}`;
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    registerModal(dialogId);
    lockBodyScroll();
    const dialog = dialogRef.current;
    if (dialog) {
      focusInitialElement(dialog);
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }

      if (!isTopmostModal(dialogId)) {
        return;
      }

      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        trapFocusWithin(e, dialogRef.current);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      unregisterModal(dialogId);
      unlockBodyScroll();
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [dialogId, isOpen, onClose, portalContainer]);

  if (!isOpen || !portalContainer) return null;

  return createPortal(
    <div
      className="ui-overlay-enter fixed inset-0 h-full w-full overflow-y-auto"
      style={{ zIndex: THEME.zIndex.modal }}
    >
      {disableBackdropClick ? (
        <div className="absolute inset-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0"
          onMouseDown={onClose}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="ui-surface-enter relative z-10 flex min-h-full w-full flex-col text-input-text backdrop-blur-3xl shadow-2xl"
        style={{
          background: 'linear-gradient(to bottom right, var(--glass-bg-top), var(--glass-bg-mid), var(--glass-bg-bottom))'
        }}
      >
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 rounded-full text-input-placeholder hover:bg-surface-hover hover:text-input-text"
            icon={<Icon icon={X} className="h-4 w-4" />}
          />
        )}
        {children}
      </div>
    </div>,
    portalContainer
  );
};
