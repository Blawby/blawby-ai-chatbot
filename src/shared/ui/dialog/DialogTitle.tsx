import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogTitleProps {
  children: ComponentChildren;
  className?: string;
}

export const DialogTitle: FunctionComponent<DialogTitleProps> = ({ children, className }) => (
  <h2 className={cn('m-0 text-lg font-bold leading-tight text-input-text', className)}>
    {children}
  </h2>
);
