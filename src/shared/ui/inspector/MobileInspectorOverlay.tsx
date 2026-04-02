import type { ComponentChildren, FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { THEME } from '@/shared/utils/constants';
import { lockBodyScroll, unlockBodyScroll } from '@/shared/utils/modalStack';

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
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
    <div className="fixed inset-0 lg:hidden" style={{ zIndex: THEME.zIndex.modal }}>
      <button
        type="button"
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close inspector"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Inspector"
        className="absolute inset-y-0 right-0 flex w-full max-w-[min(42rem,100vw)] flex-col overflow-hidden border-l border-line-glass/15 bg-surface-nav-secondary shadow-2xl"
      >
        {children}
      </aside>
    </div>,
    document.body
  );
};
