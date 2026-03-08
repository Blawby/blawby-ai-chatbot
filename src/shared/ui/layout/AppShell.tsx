import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { getAccentBackdropDefaults, type AccentBackdropVariant } from './accentBackdrop';

type AccentBackdropOverrides = {
  gradientClassName?: string;
  leftOrbClassName?: string;
  rightOrbClassName?: string;
};

export interface AppShellProps {
  header?: ComponentChildren;
  sidebar?: ComponentChildren;
  secondarySidebar?: ComponentChildren;
  listPanel?: ComponentChildren;
  inspector?: ComponentChildren;
  inspectorMobileOpen?: boolean;
  onInspectorMobileClose?: () => void;
  mobileSecondaryNavOpen?: boolean;
  onMobileSecondaryNavClose?: () => void;
  main: ComponentChildren;
  bottomBar?: ComponentChildren;
  backgroundDecor?: ComponentChildren;
  accentBackdropVariant?: AccentBackdropVariant;
  accentBackdropOverrides?: AccentBackdropOverrides;
  className?: string;
  headerClassName?: string;
  sidebarClassName?: string;
  secondarySidebarClassName?: string;
  listPanelClassName?: string;
  inspectorClassName?: string;
  mainClassName?: string;
  bottomBarClassName?: string;
}

export const AppShell = ({
  header,
  sidebar,
  secondarySidebar,
  listPanel,
  inspector,
  inspectorMobileOpen = false,
  onInspectorMobileClose,
  mobileSecondaryNavOpen = false,
  onMobileSecondaryNavClose,
  main,
  bottomBar,
  backgroundDecor,
  accentBackdropVariant = 'none',
  accentBackdropOverrides,
  className,
  headerClassName,
  sidebarClassName,
  secondarySidebarClassName,
  listPanelClassName,
  inspectorClassName,
  mainClassName,
  bottomBarClassName
}: AppShellProps) => {
  const hasSidebar = Boolean(sidebar);
  const hasSecondarySidebar = Boolean(secondarySidebar);
  const hasListPanel = Boolean(listPanel);
  const hasInspector = Boolean(inspector);
  const hasHeader = Boolean(header);
  const hasBottomBar = Boolean(bottomBar);
  const showMobileInspector = hasInspector && inspectorMobileOpen;
  const showMobileSecondaryNav = hasSecondarySidebar && mobileSecondaryNavOpen;

  const leftPanelCount = (hasSidebar ? 1 : 0) + (hasSecondarySidebar ? 1 : 0) + (hasListPanel ? 1 : 0);
  const mainColStartClass = leftPanelCount === 0
    ? 'col-start-1 lg:col-start-1'
    : leftPanelCount === 1
      ? 'col-start-1 lg:col-start-2'
      : leftPanelCount === 2
        ? 'col-start-1 lg:col-start-3'
        : 'col-start-1 lg:col-start-4';
  const secondarySidebarColStartClass = hasSidebar ? 'lg:col-start-2' : 'lg:col-start-1';
  const listPanelColStartClass = hasSidebar && hasSecondarySidebar
    ? 'lg:col-start-3'
    : hasSidebar || hasSecondarySidebar
      ? 'lg:col-start-2'
      : 'lg:col-start-1';
  const inspectorColStartClass = leftPanelCount === 0
    ? 'lg:col-start-2'
    : leftPanelCount === 1
      ? 'lg:col-start-3'
      : leftPanelCount === 2
        ? 'lg:col-start-4'
        : 'lg:col-start-5';
  const gridClassName = hasInspector
    ? hasSidebar && hasSecondarySidebar && hasListPanel
      ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,240px,280px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
      : hasSidebar && hasSecondarySidebar
        ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,240px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
        : hasSidebar && hasListPanel
          ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,280px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
          : hasSecondarySidebar && hasListPanel
            ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[240px,280px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
            : hasSidebar
              ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
              : hasSecondarySidebar
                ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[240px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
                : hasListPanel
                  ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[280px,1fr,336px] lg:grid-rows-[auto,1fr,auto]'
                  : 'grid-rows-[auto,1fr,auto] lg:grid-cols-[1fr,336px] lg:grid-rows-[auto,1fr,auto]'
    : hasSidebar && hasSecondarySidebar && hasListPanel
      ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,240px,280px,1fr] lg:grid-rows-[auto,1fr,auto]'
      : hasSidebar && hasSecondarySidebar
        ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,240px,1fr] lg:grid-rows-[auto,1fr,auto]'
        : hasSidebar && hasListPanel
          ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,280px,1fr] lg:grid-rows-[auto,1fr,auto]'
          : hasSecondarySidebar && hasListPanel
            ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[240px,280px,1fr] lg:grid-rows-[auto,1fr,auto]'
            : hasSidebar
              ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[64px,1fr] lg:grid-rows-[auto,1fr,auto]'
              : hasSecondarySidebar
                ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[240px,1fr] lg:grid-rows-[auto,1fr,auto]'
                : hasListPanel
                  ? 'grid-rows-[auto,1fr,auto] lg:grid-cols-[280px,1fr] lg:grid-rows-[auto,1fr,auto]'
                  : 'grid-rows-[auto,1fr,auto] lg:grid-cols-1 lg:grid-rows-[auto,1fr,auto]';
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
    <div className={cn('relative grid h-full min-h-full w-full bg-surface-base', gridClassName, className)}>
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
            'relative z-10 row-start-2 min-h-0 overflow-y-auto border-r border-line-glass/15 bg-transparent hidden lg:block',
            sidebarClassName
          )}
        >
          {sidebar}
        </aside>
      )}

      {hasSecondarySidebar && (
        <aside
          className={cn(
            'relative z-10 row-start-2 min-h-0 overflow-y-auto bg-surface-nav-secondary hidden lg:block',
            !hasListPanel ? 'border-r border-line-glass/15' : undefined,
            secondarySidebarColStartClass,
            secondarySidebarClassName
          )}
        >
          {secondarySidebar}
        </aside>
      )}

      {hasListPanel && (
        <aside
          className={cn(
            'relative z-10 row-start-2 min-h-0 overflow-y-auto bg-surface-nav-list px-2 pt-3 pb-2 hidden lg:block',
            listPanelColStartClass,
            listPanelClassName
          )}
        >
          {listPanel}
        </aside>
      )}

      <main
        className={cn(
          'relative z-10 row-start-2 min-h-0 h-full flex flex-col bg-surface-base',
          mainColStartClass,
          mainClassName
        )}
      >
        {main}
      </main>

      {hasInspector && (
        <aside
          className={cn(
            'relative z-10 row-start-2 min-h-0 overflow-y-auto border-l border-line-glass/15 hidden lg:block',
            inspectorColStartClass,
            inspectorClassName
          )}
        >
          {inspector}
        </aside>
      )}

      {showMobileInspector && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          {onInspectorMobileClose ? (
            <button
              type="button"
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => onInspectorMobileClose()}
              aria-label="Close inspector"
            />
          ) : (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          )}
          <aside className="absolute right-0 top-0 h-dvh w-full max-w-2xl overflow-y-auto border-l border-line-glass/15 bg-surface-base">
            {inspector}
          </aside>
        </div>
      )}

      {showMobileSecondaryNav && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          {onMobileSecondaryNavClose ? (
            <button
              type="button"
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => onMobileSecondaryNavClose()}
              aria-label="Close navigation"
            />
          ) : (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          )}
          <aside className="absolute left-0 top-0 h-dvh w-full max-w-xs overflow-y-auto border-r border-line-glass/15 bg-surface-base">
            {secondarySidebar}
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
