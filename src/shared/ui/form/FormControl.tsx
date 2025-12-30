import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface FormControlProps {
  children: ComponentChildren;
  className?: string;
}

export const FormControl = ({
  children,
  className = ''
}: FormControlProps) => {
  return (
    <div className={cn('relative', className)}>
      {children}
    </div>
  );
};
