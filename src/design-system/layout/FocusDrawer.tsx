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

export type FocusDrawerPosition = 'left' | 'right' | 'bottom';
export type FocusDrawerPresentation = 'mobile' | 'desktop';

export interface FocusDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  children: ComponentChildren;
  /**
   * - `mobile` (default): portal-mounted overlay with backdrop, focus trap,
   *   body scroll lock, modal stack registration. Slides in from the chosen
   *   `position`.
   * - `desktop`: inline sticky panel, no portal/backdrop/focus trap. Sits at
   *   the chosen `position` (left/right edges only — `bottom` falls back to
   *   `mobile` semantics since an inline footer drawer is uncommon).
   */
  presentation?: FocusDrawerPresentation;
  /** Edge the drawer attaches to. Defaults to `right` (matches inspector use). */
  position?: FocusDrawerPosition;
  className?: string;
  showCloseButton?: boolean;
  ariaLabel?: string;
}

/**
 * FocusDrawer — DS overlay/inline drawer attached to a viewport edge.
 *
 * Replaces the legacy `Drawer` (overlays/Drawer.tsx) and
 * `MobileInspectorOverlay` (inspector/MobileInspectorOverlay.tsx) with a
 * single DS-tokens component supporting:
 *
 * - `presentation='desktop'` + `position='right'|'left'`: inline sticky 400px
 *   side rail with shadow-3 (no portal, no backdrop, no focus trap).
 * - `presentation='mobile'` + any position: portal-mounted overlay with
 *   backdrop, focus trap, scroll lock, modal stack registration.
 */
export function FocusDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  presentation = 'mobile',
  position = 'right',
  className,
  showCloseButton = true,
  ariaLabel,
}: FocusDrawerProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayId = `focus-drawer-${useId()}`;
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  // Inline desktop only supports side rails; bottom falls back to overlay.
  const effectivePresentation: FocusDrawerPresentation =
    presentation === 'desktop' && position === 'bottom' ? 'mobile' : presentation;

  useEffect(() => {
    if (effectivePresentation !== 'mobile') return;
    setPortalTarget(resolveOverlayMount());
  }, [effectivePresentation]);

  useEffect(() => {
    if (!isOpen || effectivePresentation !== 'mobile') return;

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
  }, [isOpen, onClose, overlayId, effectivePresentation]);

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

  if (effectivePresentation === 'desktop') {
    return (
      <aside
        ref={(node) => { asideRef.current = node; }}
        className={cn('focus-drawer focus-drawer-inline', position, className)}
        aria-label={ariaLabel || 'Detail panel'}
      >
        {header}
        {body}
      </aside>
    );
  }

  if (!portalTarget) return null;

  const positionAnchor = {
    right: 'inset-y-0 right-0',
    left: 'inset-y-0 left-0',
    bottom: 'inset-x-0 bottom-0',
  } as const;

  const enterClass = {
    right: 'ui-surface-enter-right',
    left: 'ui-surface-enter-left',
    bottom: 'ui-surface-enter-bottom',
  } as const;

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
          'focus-drawer focus-drawer-overlay absolute',
          position,
          positionAnchor[position],
          enterClass[position],
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
