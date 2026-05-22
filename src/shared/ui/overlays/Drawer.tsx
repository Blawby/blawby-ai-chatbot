import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { X } from 'lucide-preact';
import { THEME } from '@/shared/utils/constants';
import { isTopmostModal, lockBodyScroll, registerModal, unlockBodyScroll, unregisterModal } from '@/shared/utils/modalStack';
import { focusInitialElement, trapFocusWithin } from '@/shared/ui/dialog/focusUtils';
import { resolveOverlayMount } from '@/shared/ui/overlays/WidgetOverlayRoot';

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
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayId = `drawer-${useId()}`;
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    setPortalTarget(resolveOverlayMount());
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    registerModal(overlayId);
    lockBodyScroll();

    const surface = drawerRef.current;
    if (surface) {
      focusInitialElement(surface);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostModal(overlayId)) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab' && drawerRef.current) {
        trapFocusWithin(event, drawerRef.current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unregisterModal(overlayId);
      unlockBodyScroll();
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open, onClose, overlayId]);

  if (!portalTarget) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      style={{ zIndex: THEME.zIndex.modal }}
      aria-hidden={!open}
    >
      <div
        role="presentation"
        className="absolute inset-0 bg-input-text/40 backdrop-blur-sm dark:bg-surface-app-frame/70"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'fixed flex flex-col panel rounded-none',
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
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-subtle">
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
    </div>,
    portalTarget,
  );
}
