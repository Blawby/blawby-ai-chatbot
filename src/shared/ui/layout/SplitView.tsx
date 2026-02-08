import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface SplitViewProps {
  primary: ComponentChildren;
  secondary: ComponentChildren;
  tertiary?: ComponentChildren;
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  tertiaryClassName?: string;
}

export const SplitView = ({
  primary,
  secondary,
  tertiary,
  className,
  primaryClassName,
  secondaryClassName,
  tertiaryClassName
}: SplitViewProps) => {
  const hasTertiary = Boolean(tertiary);
  const gridClassName = hasTertiary
    ? 'grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] xl:grid-cols-[minmax(0,320px)_1fr_minmax(0,320px)]'
    : 'grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr]';

  return (
    <div className={cn('grid h-full min-h-0 w-full', gridClassName, className)}>
      <aside
        className={cn(
          'min-h-0 border-b border-gray-200 dark:border-white/10 md:border-b-0 md:border-r md:overflow-y-auto',
          primaryClassName
        )}
      >
        {primary}
      </aside>
      <section className={cn('min-h-0 md:overflow-y-auto', secondaryClassName)}>
        {secondary}
      </section>
      {hasTertiary && (
        <aside
          className={cn(
            'min-h-0 border-t border-gray-200 dark:border-white/10 md:border-t-0 md:border-l md:overflow-y-auto',
            tertiaryClassName
          )}
        >
          {tertiary}
        </aside>
      )}
    </div>
  );
};
