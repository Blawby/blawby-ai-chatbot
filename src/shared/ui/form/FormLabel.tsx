import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface FormLabelProps {
  children: ComponentChildren;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}

export const FormLabel = ({
  children,
  htmlFor,
  required = false,
  className = ''
}: FormLabelProps) => {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'block text-sm font-medium text-gray-900 dark:text-gray-100',
        required && 'after:content-["*"] after:ml-1 after:text-red-500',
        className
      )}
    >
      {children}
    </label>
  );
};
