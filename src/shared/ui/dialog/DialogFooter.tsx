import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogFooterProps {
  children: ComponentChildren;
  className?: string;
}

export const DialogFooter: FunctionComponent<DialogFooterProps> = ({ children, className }) => (
  <div className={cn('flex flex-col-reverse gap-2 px-5 pb-5 pt-2 sm:flex-row sm:justify-end', className)}>
    {children}
  </div>
);
