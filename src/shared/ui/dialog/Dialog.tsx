import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { THEME } from '@/shared/utils/constants';
import { isTopmostModal, lockBodyScroll, registerModal, unlockBodyScroll, unregisterModal } from '@/shared/utils/modalStack';
import { DialogHeader } from './DialogHeader';
import { focusInitialElement, trapFocusWithin } from './focusUtils';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
  title?: ComponentChildren;
  description?: ComponentChildren;
  showCloseButton?: boolean;
  disableBackdropClick?: boolean;
  contentClassName?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
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
  ariaLabelledBy,
  ariaDescribedBy,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dialogUid = useId();
  const titleUid = useId();
  const descriptionUid = useId();
  const dialogId = `dialog-${dialogUid}`;
  const titleId = ariaLabelledBy ?? `dialog-title-${titleUid}`;
  const descriptionId = ariaDescribedBy ?? `dialog-description-${descriptionUid}`;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    registerModal(dialogId);
    lockBodyScroll();
    if (dialog) {
      dialog.setAttribute('data-dialog-open', 'true');
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
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        trapFocusWithin(e, dialogRef.current);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      dialog?.removeAttribute('data-dialog-open');
      unregisterModal(dialogId);
      unlockBodyScroll();
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [dialogId, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: THEME.zIndex.modal }}
    >
      <div
        role="presentation"
        aria-hidden="true"
        className="ui-overlay-enter absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={disableBackdropClick ? undefined : () => onCloseRef.current()}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : ariaLabelledBy}
        aria-describedby={description ? descriptionId : ariaDescribedBy}
        tabIndex={-1}
        className={cn(
          'ui-surface-enter relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line-glass/30 bg-surface-overlay/95 text-input-text shadow-2xl backdrop-blur-xl',
          contentClassName
        )}
      >
        {(title || description || showCloseButton) && (
          <DialogHeader
            title={title}
            description={description}
            titleId={title ? titleId : undefined}
            descriptionId={description ? descriptionId : undefined}
            onClose={onCloseRef.current}
            showCloseButton={showCloseButton}
          />
        )}
        {children}
      </div>
    </div>,
    document.body
  );
};
