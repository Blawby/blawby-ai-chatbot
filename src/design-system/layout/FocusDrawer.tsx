import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-preact';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/shared/ui/Button';
import { THEME } from '@/shared/utils/constants';
import { isTopmostModal, lockBodyScroll, registerModal, unlockBodyScroll, unregisterModal } from '@/shared/utils/modalStack';
import { focusInitialElement, trapFocusWithin } from '@/shared/ui/dialog/focusUtils';
import { resolveOverlayMount } from '@/shared/ui/overlays/WidgetOverlayRoot';

export interface FocusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  children: ComponentChildren;
  /** Mobile: render full-screen overlay with backdrop. Desktop: render inline
   *  as a sticky 400px right rail (no portal, no backdrop). Default 'mobile'
   *  matches MobileInspectorOverlay semantics. */
  presentation?: 'mobile' | 'desktop';
  className?: string;
  showCloseButton?: boolean;
  ariaLabel?: string;
}

/**
 * FocusDrawer — DS right-rail overlay/inline drawer.
 *
 * - `presentation='mobile'` (default): portal-mounted full-height overlay with
 *   backdrop, focus trap, body scroll lock, modal stack registration. Replaces
 *   MobileInspectorOverlay for mobile-only inspector use.
 * - `presentation='desktop'`: inline 400px right rail with shadow-3. No portal,
 *   no backdrop, no focus trap. Suitable for desktop-side inspector content
 *   that lives alongside the main view.
 */
export function FocusDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  presentation = 'mobile',
  className,
  showCloseButton = true,
  ariaLabel,
}: FocusDrawerProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayId = `focus-drawer-${useId()}`;
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (presentation !== 'mobile') return;
    setPortalTarget(resolveOverlayMount());
  }, [presentation]);

  useEffect(() => {
    if (!isOpen || presentation !== 'mobile') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    registerModal(overlayId);
    lockBodyScroll();
    const aside = asideRef.current;
    if (aside) {
      focusInitialElement(aside);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostModal(overlayId)) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab' && asideRef.current) {
        trapFocusWithin(event, asideRef.current);
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
  }, [isOpen, onClose, overlayId, presentation]);

  if (!isOpen) return null;

  const header = (title || subtitle || showCloseButton) ? (
    <header className="focus-drawer-header">
      <div className="min-w-0">
        {title && <div className="focus-drawer-title">{title}</div>}
        {subtitle && <div className="focus-drawer-subtitle">{subtitle}</div>}
      </div>
      {showCloseButton && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close"
          icon={X}
          iconClassName="h-4 w-4"
        />
      )}
    </header>
  ) : null;

  const body = <div className="focus-drawer-body">{children}</div>;

  if (presentation === 'desktop') {
    return (
      <aside
        ref={(node) => { asideRef.current = node; }}
        className={cn('focus-drawer focus-drawer-inline', className)}
        aria-label={ariaLabel || 'Detail panel'}
      >
        {header}
        {body}
      </aside>
    );
  }

  if (!portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 lg:hidden"
      style={{ zIndex: THEME.zIndex.modal }}
    >
      <button
        type="button"
        className="absolute inset-0"
        style={{ background: 'color-mix(in oklab, var(--ink) 35%, transparent)' }}
        onClick={onClose}
        aria-hidden="true"
        tabIndex={-1}
      />
      <aside
        ref={(node) => { asideRef.current = node; }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || 'Detail panel'}
        tabIndex={-1}
        className={cn(
          'focus-drawer focus-drawer-overlay absolute inset-y-0 right-0 ui-surface-enter-right',
          className
        )}
      >
        {header}
        {body}
      </aside>
    </div>,
    portalTarget
  );
}
