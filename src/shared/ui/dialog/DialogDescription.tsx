import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogDescriptionProps {
 children: ComponentChildren;
 id?: string;
 className?: string;
}

export const DialogDescription: FunctionComponent<DialogDescriptionProps> = ({ children, id, className }) => (
 <p id={id} className={cn('m-0 text-sm leading-6 text-input-placeholder', className)}>
  {children}
 </p>
);
