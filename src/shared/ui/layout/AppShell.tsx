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
  mainClassName?: string;
  bottomBarClassName?: string;
}

export const AppShell = ({
  header,
  sidebar,
  secondarySidebar,
  listPanel,
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
  mainClassName,
  bottomBarClassName
}: AppShellProps) => {
  const hasSidebar = Boolean(sidebar);
  const hasSecondarySidebar = Boolean(secondarySidebar);
  const hasListPanel = Boolean(listPanel);
  const hasHeader = Boolean(header);
  const hasBottomBar = Boolean(bottomBar);

  const leftPanelCount = (hasSidebar ? 1 : 0) + (hasSecondarySidebar ? 1 : 0) + (hasListPanel ? 1 : 0);
  const mainColStartClass = leftPanelCount === 0
    ? 'col-start-1 md:col-start-1'
    : leftPanelCount === 1
      ? 'col-start-1 md:col-start-2'
      : leftPanelCount === 2
        ? 'col-start-1 md:col-start-3'
        : 'col-start-1 md:col-start-4';
  const secondarySidebarColStartClass = hasSidebar ? 'md:col-start-2' : 'md:col-start-1';
  const listPanelColStartClass = hasSidebar && hasSecondarySidebar
    ? 'md:col-start-3'
    : hasSidebar || hasSecondarySidebar
      ? 'md:col-start-2'
      : 'md:col-start-1';
  const gridClassName = hasSidebar && hasSecondarySidebar && hasListPanel
    ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[64px,240px,280px,1fr] md:grid-rows-[auto,1fr,auto]'
    : hasSidebar && hasSecondarySidebar
      ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[64px,240px,1fr] md:grid-rows-[auto,1fr,auto]'
      : hasSidebar && hasListPanel
        ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[64px,280px,1fr] md:grid-rows-[auto,1fr,auto]'
        : hasSecondarySidebar && hasListPanel
          ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[240px,280px,1fr] md:grid-rows-[auto,1fr,auto]'
          : hasSidebar
            ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[64px,1fr] md:grid-rows-[auto,1fr,auto]'
            : hasSecondarySidebar
              ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[240px,1fr] md:grid-rows-[auto,1fr,auto]'
              : hasListPanel
                ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[280px,1fr] md:grid-rows-[auto,1fr,auto]'
                : 'grid-rows-[auto,1fr,auto] md:grid-cols-1 md:grid-rows-[auto,1fr,auto]';
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
            'relative z-10 row-start-2 min-h-0 overflow-y-auto border-r border-line-glass/15 hidden md:block',
            sidebarClassName
          )}
        >
          {sidebar}
        </aside>
      )}

      {hasSecondarySidebar && (
        <aside
          className={cn(
            'relative z-10 row-start-2 min-h-0 overflow-y-auto border-r border-line-glass/15 hidden md:block',
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
            'relative z-10 row-start-2 min-h-0 overflow-y-auto border-r border-line-glass/15 hidden md:block',
            listPanelColStartClass,
            listPanelClassName
          )}
        >
          {listPanel}
        </aside>
      )}

      <main
        className={cn(
          'relative z-10 row-start-2 min-h-0 h-full flex flex-col',
          mainColStartClass,
          mainClassName
        )}
      >
        {main}
      </main>

      {hasBottomBar && (
        <div className={cn('relative z-10 col-span-full row-start-3', bottomBarClassName)}>
          {bottomBar}
        </div>
      )}
    </div>
  );
};
