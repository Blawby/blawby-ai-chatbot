import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ContentWithBuilderProps {
  children: ComponentChildren;
  sidebar?: ComponentChildren;
  inspector?: ComponentChildren;
  className?: string;
  contentClassName?: string;
  sidebarClassName?: string;
  inspectorClassName?: string;
}

export function ContentWithBuilder({
  children,
  sidebar,
  inspector,
  className,
  contentClassName,
  sidebarClassName,
  inspectorClassName,
}: ContentWithBuilderProps) {
  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)_280px] lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[240px_minmax(0,1fr)_340px]',
        className
      )}
    >
      <aside
        className={cn(
          'min-h-0 overflow-x-visible overflow-y-auto bg-surface-navigation px-4 py-4',
          sidebarClassName
        )}
      >
        {sidebar}
      </aside>
      <main className={cn('min-h-0 overflow-y-auto px-6 py-6 xl:px-8', contentClassName)}>
        {children}
      </main>
      <aside
        className={cn(
          'min-h-0 overflow-y-auto bg-surface-utility px-4 py-4',
          inspectorClassName
        )}
      >
        {inspector}
      </aside>
    </div>
  );
}
