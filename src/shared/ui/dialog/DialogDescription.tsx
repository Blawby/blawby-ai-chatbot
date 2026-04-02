import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogDescriptionProps {
  children: ComponentChildren;
  className?: string;
}

export const DialogDescription: FunctionComponent<DialogDescriptionProps> = ({ children, className }) => (
  <p className={cn('m-0 text-sm leading-6 text-input-placeholder', className)}>
    {children}
  </p>
);
