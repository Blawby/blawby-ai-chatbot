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
        'label block mb-1.5',
        required && 'after:content-["*"] after:ml-1 after:text-neg',
        className
      )}
    >
      {children}
    </label>
  );
};
