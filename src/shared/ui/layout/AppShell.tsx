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
  listPanel?: ComponentChildren;
  inspector?: ComponentChildren;
  inspectorMobileOpen?: boolean;
  onInspectorMobileClose?: () => void;
  main: ComponentChildren;
  bottomBar?: ComponentChildren;
  backgroundDecor?: ComponentChildren;
  accentBackdropVariant?: AccentBackdropVariant;
  accentBackdropOverrides?: AccentBackdropOverrides;
  className?: string;
  headerClassName?: string;
  listPanelClassName?: string;
  inspectorClassName?: string;
  mainClassName?: string;
  bottomBarClassName?: string;
}

/**
 * AppShell — workspace shell that composes header + optional list panel +
 * main + optional inspector + optional bottom bar.
 *
 * The legacy `sidebar` / `desktopSidebarCollapsed` / `mobileSidebar` /
 * `mobileSidebarOpen` / `onMobileSidebarClose` props were removed in 5e.1
 * (locked decision §5 — no sidebar collapse; LeftRail composes outside
 * AppShell directly in each shell). Callers wrap AppShell with their own
 * LeftRail composition.
 */
export const AppShell = ({
  header,
  listPanel,
  inspector,
  inspectorMobileOpen = false,
  onInspectorMobileClose,
  main,
  bottomBar,
  backgroundDecor,
  accentBackdropVariant = 'none',
  accentBackdropOverrides,
  className,
  headerClassName,
  listPanelClassName,
  inspectorClassName,
  mainClassName,
  bottomBarClassName
}: AppShellProps) => {
  const hasListPanel = Boolean(listPanel);
  const hasInspector = Boolean(inspector);
  const hasHeader = Boolean(header);
  const hasBottomBar = Boolean(bottomBar);
  const showMobileInspector = hasInspector && inspectorMobileOpen;

  // md (768px): [listPanel? | main].
  // lg (1024px): [listPanel? | main].
  // xl (1280px): adds the inspector column.
  const mdMainColStart = hasListPanel ? 'md:col-start-2' : 'md:col-start-1';
  const lgMainColStart = hasListPanel ? 'lg:col-start-2' : 'lg:col-start-1';
  const mainColStartClass = `col-start-1 ${mdMainColStart} ${lgMainColStart}`;

  const listPanelColStartClass = 'md:col-start-1 lg:col-start-1';

  const inspectorColStartClass = hasListPanel ? 'xl:col-start-3' : 'xl:col-start-2';

  const mdGridCols = hasListPanel ? '260px 1fr' : '1fr';

  const lgGridCols = ((): string => {
    const cols: string[] = [];
    if (hasListPanel) cols.push('280px');
    cols.push('1fr');
    return cols.join(' ');
  })();

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

      {hasHeader && (
        <header
          className={cn(
            'relative z-10 col-span-full row-start-1 lg:col-start-1 lg:col-end-[-1]',
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

      {hasBottomBar && (
        <div className={cn('relative z-10 col-span-full row-start-3', bottomBarClassName)}>
          {bottomBar}
        </div>
      )}
    </div>
  );
};
