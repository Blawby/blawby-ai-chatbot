import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface ButtonGroupProps {
  children: ComponentChildren;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function ButtonGroup({
  children,
  className,
  orientation = 'horizontal',
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        '[&>*]:rounded-none',
        orientation === 'horizontal' && '[&>*:first-child]:rounded-l-full [&>*:last-child]:rounded-r-full',
        orientation === 'vertical' && '[&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl',
        '[&>*+*]:border-l [&>*+*]:border-line-subtle',
        orientation === 'vertical' && '[&>*+*]:border-l-0 [&>*+*]:border-t [&>*+*]:border-line-subtle',
        className,
      )}
    >
      {children}
    </div>
  );
}
