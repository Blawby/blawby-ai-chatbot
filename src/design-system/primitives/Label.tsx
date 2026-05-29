import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface LabelProps {
  htmlFor?: string;
  children: ComponentChildren;
  className?: string;
  required?: boolean;
}

export function Label({ htmlFor, children, className, required }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className={cn('label', className)}>
      {children}
      {required && (
        <span className="text-neg" aria-hidden="true">
          {' *'}
        </span>
      )}
    </label>
  );
}
