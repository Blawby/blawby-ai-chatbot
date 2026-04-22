import type { ComponentChildren } from 'preact';
import { ChevronLeftIcon, XMarkIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';
import { ContentWithBuilder } from './ContentWithBuilder';
import { ContentWithPreview } from './ContentWithPreview';

/**
 * Canonical layout for full-screen editor and detail surfaces.
 *
 * Mobile:   Single column, sticky header at top, preview stacks below content.
 * Desktop:  Sticky header full-width; content/preview in ContentWithPreview grid.
 *
 * Header uses the shared `workspace-header` CSS class — same visual language
 * as DetailHeader so all chrome in the app is consistent.
 */
export interface EditorShellProps {
  title: ComponentChildren;
  subtitle?: string;
  layout?: 'default' | 'builder';
  /**
   * If true, renders a back button in the leading slot.
   */
  showBack?: boolean;
  /**
   * Editor-style detail pages can use the invoice-style close icon while
   * route-drill pages keep the chevron.
   */
  backVariant?: 'back' | 'close';
  /**
   * Callback for the back button.
   */
  onBack?: () => void;
  /**
   * Leading slot — custom icon or actions. Rendered left of the title.
   * If showBack is true, this is rendered alongside the back button.
   */
  leadingAction?: ComponentChildren;
  /** Trailing slot — Save button, badge, etc. Rendered right of the title. */
  actions?: ComponentChildren;
  sidebar?: ComponentChildren;
  inspector?: ComponentChildren;
  /**
   * Optional right-column pane (widget preview, invoice preview, etc.).
   * When omitted the layout is single-column.
   */
  preview?: ComponentChildren;
  previewVariant?: 'default' | 'widget';
  children: ComponentChildren;
  className?: string;
  /**
   * Max-width applied to the form content column.
   * Defaults to `max-w-xl`; pass `null` to remove the cap (e.g. list/team pages).
   */
  contentMaxWidth?: string | null;
  contentClassName?: string;
  previewClassName?: string;
  sidebarClassName?: string;
  inspectorClassName?: string;
  /**
   * Callback for the inspector toggle.
   */
  onInspector?: () => void;
  /**
   * Whether the inspector is currently open.
   */
  inspectorOpen?: boolean;
}

export function EditorShell({
  title,
  subtitle,
  layout = 'default',
  showBack,
  backVariant = 'back',
  onBack,
  leadingAction,
  actions,
  sidebar,
  inspector,
  preview,
  previewVariant = 'default',
  children,
  className,
  contentMaxWidth = 'max-w-xl',
  contentClassName,
  previewClassName,
  sidebarClassName,
  inspectorClassName,
  onInspector,
  inspectorOpen = false,
}: EditorShellProps) {
  const BackIcon = backVariant === 'close' ? XMarkIcon : ChevronLeftIcon;
  const backLabel = backVariant === 'close' ? 'Close' : 'Back';

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Sticky header — workspace-header matches DetailHeader's visual language */}
      <header className="workspace-header sticky top-0 z-20">
        {(leadingAction || showBack) ? (
          <div className="workspace-header__icon flex items-center gap-2">
            {showBack ? (
              <Button
                type="button"
                variant="icon"
                size="icon-sm"
                onClick={onBack}
                aria-label={backLabel}
                icon={BackIcon}
                iconClassName="h-5 w-5"
              />
            ) : null}
            {leadingAction}
          </div>
        ) : null}
        
        <div className="workspace-header__identity">
          <h1 className="workspace-header__title text-base">{title}</h1>
          {subtitle ? <p className="workspace-header__subtitle">{subtitle}</p> : null}
        </div>
        
        {actions || onInspector ? (
          <div className="workspace-header__right flex items-center gap-2">
            {actions}
            {onInspector ? (
              <Button
                type="button"
                variant={inspectorOpen ? 'secondary' : 'icon'}
                size="icon-sm"
                onClick={onInspector}
                aria-label={inspectorOpen ? 'Close inspector' : 'Open inspector'}
                icon={EllipsisVerticalIcon}
                iconClassName="h-5 w-5"
              />
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Scrollable content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {layout === 'builder' ? (
          <ContentWithBuilder
            className="flex-1"
            sidebar={sidebar}
            inspector={inspector}
            contentClassName={cn(contentMaxWidth ?? undefined, contentClassName)}
            sidebarClassName={sidebarClassName}
            inspectorClassName={inspectorClassName}
          >
            {children}
          </ContentWithBuilder>
        ) : (
          <ContentWithPreview
            preview={preview}
            previewVariant={previewVariant}
            className="flex-1"
            contentClassName={cn('px-6 py-6', contentMaxWidth ?? undefined, contentClassName)}
            previewClassName={cn(
              'flex items-start justify-center bg-gray-50 p-6',
              previewClassName
            )}
          >
            {children}
          </ContentWithPreview>
        )}
      </div>
    </div>
  );
}
