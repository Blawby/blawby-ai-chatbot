/* dialog intentionally uses black scrim for backdrop; custom/no-hardcoded-colors disabled for visual intent */
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
  /**
   * Render as a non-blocking overlay: no backdrop scrim, the app behind stays
   * interactive (clicks fall through), body scroll is not locked, and focus is
   * not trapped. For non-modal announcements like the post-onboarding welcome
   * that must not intercept the user's first navigation click. Default false.
   */
  nonBlocking?: boolean;
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
  nonBlocking = false,
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
    // Non-blocking dialogs don't lock scroll or trap focus — the app behind
    // must stay fully usable while they're shown.
    if (!nonBlocking) lockBodyScroll();
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

      if (!nonBlocking && e.key === 'Tab' && dialogRef.current) {
        trapFocusWithin(e, dialogRef.current);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      dialog?.removeAttribute('data-dialog-open');
      unregisterModal(dialogId);
      if (!nonBlocking) unlockBodyScroll();
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [dialogId, isOpen, nonBlocking]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-4',
        // Non-blocking: let clicks fall through to the app behind so the nav
        // rail and other chrome stay usable while the dialog is shown.
        nonBlocking && 'pointer-events-none'
      )}
      style={{ zIndex: THEME.zIndex.modal }}
    >
      {/* Backdrop Scrim — omitted when non-blocking so the app behind stays
          fully visible and interactive. */}
      {!nonBlocking && (
        <div
          role="presentation"
          // eslint-disable-next-line custom/no-hardcoded-colors
          className="ui-overlay-enter fixed inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/40"
          style={{ zIndex: -1 }}
          onClick={disableBackdropClick ? undefined : () => onCloseRef.current()}
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={nonBlocking ? 'false' : 'true'}
        aria-labelledby={title ? titleId : ariaLabelledBy}
        aria-describedby={description ? descriptionId : ariaDescribedBy}
        tabIndex={-1}
        className={cn(
          'ui-surface-enter relative flex max-h-[90dvh] w-full max-w-lg flex-col text-ink',
          // Re-enable pointer events on the card; the non-blocking wrapper
          // above turns them off for click-through.
          nonBlocking && 'pointer-events-auto',
          contentClassName
        )}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--paper-edge)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-2)',
        }}
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
