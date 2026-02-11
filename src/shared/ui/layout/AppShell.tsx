import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface AppShellProps {
  header?: ComponentChildren;
  sidebar?: ComponentChildren;
  main: ComponentChildren;
  bottomBar?: ComponentChildren;
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

  return (
    <div className={cn('grid min-h-dvh w-full bg-white dark:bg-dark-bg', gridClassName, className)}>
      {hasHeader && (
        <header className={cn('col-span-full', headerClassName)}>
          {header}
        </header>
      )}

      {hasSidebar && (
        <aside
          className={cn(
            'row-start-2 min-h-0 overflow-y-auto border-r border-gray-200 dark:border-white/10 hidden md:block',
            sidebarClassName
          )}
        >
          {sidebar}
        </aside>
      )}

      <main
        className={cn(
          'row-start-2 min-h-0 h-full flex flex-col',
          hasSidebar ? 'col-start-1 md:col-start-2' : 'col-start-1',
          mainClassName
        )}
      >
        {main}
      </main>

      {hasBottomBar && (
        <div className={cn('col-span-full row-start-3', bottomBarClassName)}>
          {bottomBar}
        </div>
      )}
    </div>
  );
};
