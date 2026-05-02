import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';
import { getAccentBackdropDefaults, type AccentBackdropVariant } from './accentBackdrop';
import { MobileInspectorOverlay } from '@/shared/ui/inspector/MobileInspectorOverlay';

type AccentBackdropOverrides = {
  gradientClassName?: string;
  leftOrbClassName?: string;
  rightOrbClassName?: string;
};

export interface AppShellProps {
  header?: ComponentChildren;
  /**
   * Unified sidebar (Pencil GtRGH). Renders as a 260px column on desktop and as a
   * full-height drawer on mobile when {@link mobileSidebarOpen} is true.
   */
  sidebar?: ComponentChildren;
  /** When true, the desktop sidebar column shrinks to a 64px icon rail. The Sidebar
   *  component itself adapts its content based on its own `collapsed` prop. */
  desktopSidebarCollapsed?: boolean;
  /** Optional override rendered in the mobile drawer instead of `sidebar`.
   *  Useful when the desktop sidebar is collapsed but the mobile drawer should
   *  still render the full expanded layout. */
  mobileSidebar?: ComponentChildren;
  listPanel?: ComponentChildren;
  inspector?: ComponentChildren;
  inspectorMobileOpen?: boolean;
  onInspectorMobileClose?: () => void;
  mobileSidebarOpen?: boolean;
  onMobileSidebarClose?: () => void;
  main: ComponentChildren;
  bottomBar?: ComponentChildren;
  backgroundDecor?: ComponentChildren;
  accentBackdropVariant?: AccentBackdropVariant;
  accentBackdropOverrides?: AccentBackdropOverrides;
  className?: string;
  headerClassName?: string;
  sidebarClassName?: string;
  listPanelClassName?: string;
  inspectorClassName?: string;
  mainClassName?: string;
  bottomBarClassName?: string;
}

export const AppShell = ({
  header,
  sidebar,
  desktopSidebarCollapsed = false,
  mobileSidebar,
  listPanel,
  inspector,
  inspectorMobileOpen = false,
  onInspectorMobileClose,
  mobileSidebarOpen = false,
  onMobileSidebarClose,
  main,
  bottomBar,
  backgroundDecor,
  accentBackdropVariant = 'none',
  accentBackdropOverrides,
  className,
  headerClassName,
  sidebarClassName,
  listPanelClassName,
  inspectorClassName,
  mainClassName,
  bottomBarClassName
}: AppShellProps) => {
  const hasSidebar = Boolean(sidebar);
  const hasListPanel = Boolean(listPanel);
  const hasInspector = Boolean(inspector);
  const hasHeader = Boolean(header);
  const hasBottomBar = Boolean(bottomBar);
  const showMobileInspector = hasInspector && inspectorMobileOpen;
  const showMobileSidebar = hasSidebar && mobileSidebarOpen;

  // Sidebar column width: full 260px when expanded, 64px icon-rail when collapsed.
  // The Sidebar component itself adapts its content based on the same flag.
  const sidebarColWidth = desktopSidebarCollapsed ? '64px' : '260px';

  const leftPanelCount = (hasSidebar ? 1 : 0) + (hasListPanel ? 1 : 0);
  const mainColStartClass = leftPanelCount === 0
    ? 'col-start-1 lg:col-start-1'
    : leftPanelCount === 1
      ? 'col-start-1 lg:col-start-2'
      : 'col-start-1 lg:col-start-3';
  const listPanelColStartClass = hasSidebar ? 'lg:col-start-2' : 'lg:col-start-1';
  const inspectorColStartClass = leftPanelCount === 0
    ? 'lg:col-start-2'
    : leftPanelCount === 1
      ? 'lg:col-start-3'
      : 'lg:col-start-4';

  // Build the grid columns dynamically; expose via CSS var so Tailwind's arbitrary-value
  // class can pick it up at the lg breakpoint without a permutation explosion.
  const lgGridCols = ((): string => {
    const cols: string[] = [];
    if (hasSidebar) cols.push(sidebarColWidth);
    if (hasListPanel) cols.push('280px');
    cols.push('1fr');
    if (hasInspector) cols.push('336px');
    return cols.join(' ');
  })();
  const gridClassName = 'grid-rows-[auto,1fr,auto] lg:grid-cols-[var(--app-grid-cols)] lg:grid-rows-[auto,1fr,auto]';
  const accentDefaults = getAccentBackdropDefaults(accentBackdropVariant);
  const showAccentBackdrop = Boolean(accentDefaults);
  const resolvedAccentClasses = accentDefaults
    ? {
      gradientClassName: accentBackdropOverrides?.gradientClassName ?? accentDefaults.gradientClassName,
      leftOrbClassName: accentBackdropOverrides?.leftOrbClassName ?? accentDefaults.leftOrbClassName,
      rightOrbClassName: accentBackdropOverrides?.rightOrbClassName ?? accentDefaults.rightOrbClassName
    }
    : null;

  return (
    <div
      className={cn('relative grid h-full min-h-full w-full bg-surface-app-frame', gridClassName, className)}
      style={{ '--app-grid-cols': lgGridCols } as JSX.CSSProperties}
    >
      {backgroundDecor && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {backgroundDecor}
        </div>
      )}
      {showAccentBackdrop && resolvedAccentClasses && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={resolvedAccentClasses.gradientClassName} />
          <div className={resolvedAccentClasses.leftOrbClassName} />
          <div className={resolvedAccentClasses.rightOrbClassName} />
        </div>
      )}

      {hasHeader && (
        <header className={cn('relative z-10 col-span-full', headerClassName)}>
          {header}
        </header>
      )}

      {hasSidebar && (
        <aside
          className={cn(
            // overflow-visible so the Sidebar's collapsed-state toggle button can stick
            // off the right edge. z-20 (vs z-10 on Main/List/Inspector) keeps the
            // overflow painted above neighboring grid items.
            'relative z-20 row-start-2 min-h-0 overflow-visible hidden lg:block',
            sidebarClassName
          )}
        >
          {sidebar}
        </aside>
      )}


      {hasListPanel && (
        <aside
          className={cn(
            'relative z-10 p-2 row-start-2 min-h-0 overflow-y-auto bg-surface-collection hidden lg:block',
            listPanelColStartClass,
            listPanelClassName
          )}
        >
          {listPanel}
        </aside>
      )}

      <main
        className={cn(
          'relative z-10 row-start-2 min-h-0 h-full flex flex-col bg-surface-workspace',
          mainColStartClass,
          mainClassName
        )}
      >
        {main}
      </main>

      {hasInspector && (
        <aside
          className={cn(
            'relative z-10 row-start-2 min-h-0 overflow-y-auto bg-surface-nav-secondary hidden lg:block',
            inspectorColStartClass,
            inspectorClassName
          )}
        >
          {inspector}
        </aside>
      )}

      {showMobileInspector && (
        <MobileInspectorOverlay onClose={onInspectorMobileClose ?? (() => {})} isOpen>
          {inspector}
        </MobileInspectorOverlay>
      )}

      {showMobileSidebar && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          {onMobileSidebarClose ? (
            <button
              type="button"
              className="absolute inset-0 bg-[rgb(var(--surface-app-frame))]/60 backdrop-blur-sm"
              onClick={() => onMobileSidebarClose()}
              aria-label="Close navigation"
            />
          ) : (
            <div className="absolute inset-0 bg-surface-app-frame/60 dark:bg-surface-overlay/60 backdrop-blur-sm" />
          )}
          <aside className="absolute left-0 top-0 h-dvh w-[280px] max-w-full overflow-y-auto">
            {mobileSidebar ?? sidebar}
          </aside>
        </div>
      )}

      {hasBottomBar && (
        <div className={cn('relative z-10 col-span-full row-start-3', bottomBarClassName)}>
          {bottomBar}
        </div>
      )}
    </div>
  );
};
