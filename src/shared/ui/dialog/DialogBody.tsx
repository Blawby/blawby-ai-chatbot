import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogBodyProps {
  children: ComponentChildren;
  className?: string;
}

export const DialogBody: FunctionComponent<DialogBodyProps> = ({ children, className }) => (
  <div className={cn('min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3', className)}>
    {children}
  </div>
);
