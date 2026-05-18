import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
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
        aria-hidden="true"
        tabIndex={-1}
      />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inspector"
        tabIndex={-1}
        className="ui-surface-enter-right absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col overflow-visible bg-surface-nav-secondary rounded-r-none rounded-l-2xl shadow-glass ring-1 ring-line-glass/20"
      >
        {/* Visible close button — backdrop click + Escape are kept as fallback
            paths, but a dedicated control matches the rest of our drawer chrome
            and is reachable on touch screens where the backdrop area is small. */}
        <Button
          type="button"
          variant="icon"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close inspector"
          icon={X} iconClassName="h-5 w-5"
          className="absolute right-3 top-3 z-10 p-0 rounded-full bg-surface-utility/30 hover:bg-surface-utility/50"
        />
        {children}
      </aside>
    </div>,
    document.body
  );
};
