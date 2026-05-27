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

  // md (768px): tablet 2-col — [listPanel? | main], sidebar stays as drawer.
  // lg (1024px): desktop — [sidebar? | listPanel? | main].
  // xl (1280px): desktop+inspector — [sidebar? | listPanel? | main | inspector?].
  const mdMainColStart = hasListPanel ? 'md:col-start-2' : 'md:col-start-1';
  const lgMainColStart = leftPanelCount === 0
    ? 'lg:col-start-1'
    : leftPanelCount === 1
      ? 'lg:col-start-2'
      : 'lg:col-start-3';
  const mainColStartClass = `col-start-1 ${mdMainColStart} ${lgMainColStart}`;

  const listPanelColStartClass = `md:col-start-1 ${hasSidebar ? 'lg:col-start-2' : 'lg:col-start-1'}`;

  const inspectorColStartClass = leftPanelCount === 0
    ? 'xl:col-start-2'
    : leftPanelCount === 1
      ? 'xl:col-start-3'
      : 'xl:col-start-4';

  // md grid: listPanel + main only (no sidebar, no inspector at this breakpoint).
  const mdGridCols = hasListPanel ? '260px 1fr' : '1fr';

  // lg grid: sidebar + listPanel + main (inspector moves to fixed column only at xl).
  const lgGridCols = ((): string => {
    const cols: string[] = [];
    if (hasSidebar) cols.push(sidebarColWidth);
    if (hasListPanel) cols.push('280px');
    cols.push('1fr');
    return cols.join(' ');
  })();

  // xl grid: adds the inspector column.
  const xlGridCols = hasInspector ? `${lgGridCols} 336px` : lgGridCols;

  const gridClassName = 'grid-rows-[auto,1fr,auto] md:grid-cols-[var(--app-md-grid-cols)] lg:grid-cols-[var(--app-lg-grid-cols)] xl:grid-cols-[var(--app-xl-grid-cols)]';
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
      style={{ '--app-md-grid-cols': mdGridCols, '--app-lg-grid-cols': lgGridCols, '--app-xl-grid-cols': xlGridCols } as JSX.CSSProperties}
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


      {hasSidebar && (
        <aside
          className={cn(
            // overflow-visible so the Sidebar's collapsed-state toggle button can stick
            // off the right edge. z-20 (vs z-10 on Main/List/Inspector) keeps the
            // overflow painted above neighboring grid items.
            // On desktop the sidebar spans rows 1-2 so it sits flush against the
            // header bar that lives in row 1 above listPanel/main/inspector.
            'relative z-20 row-start-2 min-h-0 overflow-visible hidden lg:block lg:row-start-1 lg:row-span-2',
            sidebarClassName
          )}
        >
          {sidebar}
        </aside>
      )}

      {/* Header — on desktop sits in row 1 spanning listPanel/main/inspector
          so it reads as "above the conversation list", not pushed to the right
          of it. On mobile it lives in row 1 spanning the full width since
          listPanel/inspector are drawers. */}
      {hasHeader && (
        <header
          className={cn(
            'relative z-10 col-span-full row-start-1',
            hasSidebar ? 'lg:col-start-2 lg:col-end-[-1]' : 'lg:col-start-1 lg:col-end-[-1]',
            headerClassName
          )}
        >
          {header}
        </header>
      )}


      {hasListPanel && (
        <aside
          className={cn(
            'relative z-10 p-2 row-start-2 min-h-0 overflow-y-auto bg-surface-collection hidden md:block',
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
            'relative z-10 row-start-2 min-h-0 overflow-y-auto bg-surface-nav-secondary hidden xl:block',
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
