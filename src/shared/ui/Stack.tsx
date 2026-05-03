import type { ComponentChildren, JSX } from 'preact';
import { forwardRef } from 'preact/compat';
import { cn } from '@/shared/utils/cn';

export interface StackProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'size'> {
  direction?: 'horizontal' | 'vertical';
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  children?: ComponentChildren;
  className?: string;
  as?: 'div' | 'section' | 'nav' | 'ul' | 'ol';
}

const gapMap: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
};

const alignMap: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyMap: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  {
    direction = 'vertical',
    gap = 3,
    align,
    justify,
    wrap = false,
    children,
    className,
    as: Tag = 'div',
    ...rest
  },
  ref,
) {
  // Tag is a runtime-dynamic element; refs and attribute types intersect to {} across
  // div/section/nav/ul/ol. Cast through `any` so the public StackProps API stays typed
  // as HTMLDivElement attributes without each Tag's narrower attribute set fighting it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component = Tag as any;
  return (
    <Component
      ref={ref}
      className={cn(
        'flex',
        direction === 'horizontal' ? 'flex-row' : 'flex-col',
        gapMap[gap],
        align && alignMap[align],
        justify && justifyMap[justify],
        wrap && 'flex-wrap',
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
});
