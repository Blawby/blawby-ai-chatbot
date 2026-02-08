import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface FormGridProps {
  children: ComponentChildren;
  className?: string;
}

export const FormGrid = ({
  children,
  className
}: FormGridProps) => (
  <div className={cn('@container grid grid-cols-1 gap-4 @md:grid-cols-2', className)}>
    {children}
  </div>
);
