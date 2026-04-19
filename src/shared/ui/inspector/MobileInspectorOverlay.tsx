import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef } from 'preact/hooks';
import { THEME } from '@/shared/utils/constants';
import { isTopmostModal, lockBodyScroll, registerModal, unlockBodyScroll, unregisterModal } from '@/shared/utils/modalStack';
import { focusInitialElement, trapFocusWithin } from '@/shared/ui/dialog/focusUtils';

type MobileInspectorOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
};

export const MobileInspectorOverlay: FunctionComponent<MobileInspectorOverlayProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  const asideRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayId = `inspector-${useId()}`;

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    registerModal(overlayId);
    lockBodyScroll();
    const aside = asideRef.current;
    if (aside) {
      focusInitialElement(aside);
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (!isTopmostModal(overlayId)) {
        return;
      }

      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab' && asideRef.current) {
        trapFocusWithin(event, asideRef.current);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      unregisterModal(overlayId);
      unlockBodyScroll();
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [isOpen, onClose, overlayId]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 lg:hidden" style={{ zIndex: THEME.zIndex.modal }}>
      <button
        type="button"
        className="absolute inset-0 bg-input-text/10 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close inspector"
      />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inspector"
        tabIndex={-1}
        className="ui-surface-enter-right absolute inset-y-0 right-0 flex w-full max-w-[min(42rem,100vw)] flex-col overflow-visible glass-panel rounded-r-none rounded-l-2xl shadow-glass ring-1 ring-line-glass/20"
      >
        {children}
      </aside>
    </div>,
    document.body
  );
};
