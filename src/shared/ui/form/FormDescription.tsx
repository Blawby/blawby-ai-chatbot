import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface FormDescriptionProps {
  children: ComponentChildren;
  className?: string;
}

export const FormDescription = ({
  children,
  className = ''
}: FormDescriptionProps) => {
  return (
    <p className={cn(
      'text-xs text-input-placeholder dark:text-input-placeholder mt-1',
      className
    )}>
      {children}
    </p>
  );
};
