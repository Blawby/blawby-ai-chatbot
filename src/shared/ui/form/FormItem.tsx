import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface FormItemProps {
  children: ComponentChildren;
  className?: string;
}

export const FormItem = ({
  children,
  className = ''
}: FormItemProps) => {
  return (
    <div className={cn('space-y-2', className)}>
      {children}
    </div>
  );
};
