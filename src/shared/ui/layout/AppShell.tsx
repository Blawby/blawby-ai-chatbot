import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

type AccentBackdropVariant = 'none' | 'settings' | 'workspace';

type AccentBackdropOverrides = {
  gradientClassName?: string;
  leftOrbClassName?: string;
  rightOrbClassName?: string;
};

interface AppShellProps {
  header?: ComponentChildren;
  sidebar?: ComponentChildren;
  main: ComponentChildren;
  bottomBar?: ComponentChildren;
  backgroundDecor?: ComponentChildren;
  accentBackdropVariant?: AccentBackdropVariant;
  accentBackdropOverrides?: AccentBackdropOverrides;
  className?: string;
  headerClassName?: string;
  sidebarClassName?: string;
  mainClassName?: string;
  bottomBarClassName?: string;
}

export const AppShell = ({
  header,
  sidebar,
  main,
  bottomBar,
  backgroundDecor,
  accentBackdropVariant = 'none',
  accentBackdropOverrides,
  className,
  headerClassName,
  sidebarClassName,
  mainClassName,
  bottomBarClassName
}: AppShellProps) => {
  const hasSidebar = Boolean(sidebar);
  const hasHeader = Boolean(header);
  const hasBottomBar = Boolean(bottomBar);

  const gridClassName = hasSidebar
    ? 'grid-rows-[auto,1fr,auto] md:grid-cols-[280px,1fr] md:grid-rows-[auto,1fr,auto]'
    : 'grid-rows-[auto,1fr,auto] md:grid-cols-1 md:grid-rows-[auto,1fr,auto]';
  const accentDefaults = (() => {
    if (accentBackdropVariant === 'settings') {
      return {
        gradientClassName: 'absolute inset-x-0 top-0 h-[360px] bg-gradient-to-b from-accent-600/25 via-accent-700/10 to-transparent',
        leftOrbClassName: 'absolute -left-10 top-8 h-40 w-40 rounded-full bg-accent-500/20 blur-3xl',
        rightOrbClassName: 'absolute right-8 top-20 h-28 w-28 rounded-full bg-white/[0.08] blur-3xl'
      };
    }
    if (accentBackdropVariant === 'workspace') {
      return {
        gradientClassName: 'absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,rgb(var(--accent-500)_/_0.22)_0%,rgb(var(--accent-600)_/_0.12)_35%,transparent_72%)]',
        leftOrbClassName: 'absolute -left-24 -top-20 h-72 w-72 rounded-full bg-accent-500/25 blur-3xl',
        rightOrbClassName: 'absolute right-8 top-20 h-28 w-28 rounded-full bg-white/[0.08] blur-3xl'
      };
    }
    return null;
  })();
  const showAccentBackdrop = Boolean(accentDefaults);
  const resolvedAccentClasses = accentDefaults
    ? {
      gradientClassName: accentBackdropOverrides?.gradientClassName ?? accentDefaults.gradientClassName,
      leftOrbClassName: accentBackdropOverrides?.leftOrbClassName ?? accentDefaults.leftOrbClassName,
      rightOrbClassName: accentBackdropOverrides?.rightOrbClassName ?? accentDefaults.rightOrbClassName
    }
    : null;

  return (
    <div className={cn('relative grid min-h-dvh w-full bg-surface-base', gridClassName, className)}>
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

      <main
        className={cn(
          'relative z-10 row-start-2 min-h-0 h-full flex flex-col',
          hasSidebar ? 'col-start-1 md:col-start-2' : 'col-start-1',
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
