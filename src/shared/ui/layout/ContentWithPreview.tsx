import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

/**
 * Two-column form-left / preview-right layout.
 * Extracted from InvoiceForm so any editor or settings page
 * with a live preview pane can share the same grid — no UI drift.
 *
 * Without `preview`: renders a single scrollable content column.
 * With `preview`: invoice-style previews default to a wider right pane, while
 * widget previews use a narrower portrait pane so forms keep more horizontal room.
 *
 * Used by: InvoiceForm, SettingsPage (when preview prop is provided).
 */
export interface ContentWithPreviewProps {
  children: ComponentChildren;
  preview?: ComponentChildren;
  previewVariant?: 'default' | 'widget';
  className?: string;
  contentClassName?: string;
  previewClassName?: string;
}

export function ContentWithPreview({
  children,
  preview,
  previewVariant = 'default',
  className,
  contentClassName,
  previewClassName,
}: ContentWithPreviewProps) {
  const hasPreview =
    preview !== null &&
    preview !== undefined &&
    preview !== false &&
    (Array.isArray(preview) ? preview.filter(Boolean).length > 0 : true);

  if (!hasPreview) {
    return (
      <div className={cn('min-h-0 overflow-y-auto', contentClassName, className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 gap-8 lg:gap-10',
        previewVariant === 'widget'
          ? 'lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_460px]'
          : 'lg:grid-cols-[minmax(0,1fr)_520px]',
        className
      )}
    >
      <div className={cn('min-h-0 overflow-y-auto', contentClassName)}>
        {children}
      </div>
      <div
        className={cn(
          'min-h-0 overflow-y-auto border-t border-line-glass/30 glass-panel px-6 py-6 lg:border-l lg:border-t-0',
          previewClassName
        )}
      >
        {preview}
      </div>
    </div>
  );
}
