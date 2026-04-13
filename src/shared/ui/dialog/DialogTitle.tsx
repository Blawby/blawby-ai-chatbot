import type { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DialogTitleProps {
 children: ComponentChildren;
 id: string;
 className?: string;
}

export const DialogTitle: FunctionComponent<DialogTitleProps> = ({ children, id, className }) => (
 <h2 id={id} className={cn('m-0 text-lg font-bold leading-tight text-input-text', className)}>
  {children}
 </h2>
);
