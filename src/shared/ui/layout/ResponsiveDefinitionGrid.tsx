import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

type ResponsiveDefinitionGridProps = {
  children: ComponentChildren;
  className?: string;
};

export type { ResponsiveDefinitionGridProps };

/**
 * Shared definition-list grid that waits for container width before splitting
 * into two columns. This keeps detail panes readable in narrow inspectors.
 */
export const ResponsiveDefinitionGrid = ({
  children,
  className,
}: ResponsiveDefinitionGridProps) => {
  return (
    <div
      className={cn(
        'grid grid-cols-1 divide-y divide-line-subtle @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0 @2xl:divide-line-subtle',
        className
      )}
    >
      {children}
    </div>
  );
};

export default ResponsiveDefinitionGrid;
