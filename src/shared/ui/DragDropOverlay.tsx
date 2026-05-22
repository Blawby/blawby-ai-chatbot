import { FunctionComponent } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { FileText, Image, MessageSquare } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { THEME } from '@/shared/utils/constants';
import { resolveOverlayMount } from '@/shared/ui/overlays/WidgetOverlayRoot';

interface DragDropOverlayProps {
  isVisible: boolean;
  onClose?: () => void;
}

/**
 * Page-wide drop overlay shown while files are being dragged onto the app.
 * Light, semi-transparent background — no heavy modal — with a centered
 * "Add anything" prompt that mirrors the reference design.
 */
const DragDropOverlay: FunctionComponent<DragDropOverlayProps> = ({ isVisible, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    setPortalTarget(resolveOverlayMount());
  }, []);

  useEffect(() => {
    if (isVisible && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [isVisible]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, onClose, handleKeyDown]);

  if (!isVisible || !portalTarget) return null;

  return createPortal(
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 flex items-center justify-center bg-surface-app-frame/40 backdrop-blur-[2px]"
      style={{ zIndex: THEME.zIndex.modal }}
      role="status"
      aria-label="Drop files to add to the conversation"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        {/* Icon stack — overlapping "talk + image + doc" tiles to mirror the
            reference. Tilted at slight angles so they read as a sticker stack. */}
        <div className="relative h-16 w-20">
          <div className="absolute left-1 top-1 flex h-12 w-12 -rotate-12 items-center justify-center rounded-2xl bg-accent-500/90 shadow-lg ring-1 ring-line-subtle">
            <Icon icon={MessageSquare} className="h-6 w-6 text-[rgb(var(--accent-foreground))]" aria-hidden="true" />
          </div>
          <div className="absolute right-0 top-0 flex h-12 w-12 rotate-6 items-center justify-center rounded-2xl bg-input-text/85 shadow-lg ring-1 ring-line-subtle">
            <Icon icon={FileText} className="h-6 w-6 text-surface-app-frame" aria-hidden="true" />
          </div>
          <div className="absolute bottom-0 left-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500 shadow-lg ring-1 ring-line-subtle">
            <Icon icon={Image} className="h-6 w-6 text-[rgb(var(--accent-foreground))]" aria-hidden="true" />
          </div>
        </div>
        <div>
          <h3 className="m-0 text-2xl font-semibold text-input-text">Add anything</h3>
          <p className="mt-1 text-sm text-input-placeholder">
            Drop any file here to add it to the conversation
          </p>
        </div>
      </div>
    </div>,
    portalTarget,
  );
};

export default DragDropOverlay;
