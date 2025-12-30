import { ComponentChildren } from 'preact';
import { useFormContext, FormError } from './Form';
import { cn } from '@/shared/utils/cn';

export interface FormFieldProps {
  name: string;
  children: (props: FormFieldRenderProps) => ComponentChildren;
  className?: string;
}

export interface FormFieldRenderProps {
  value: unknown;
  error: FormError | undefined;
  onChange: (value: unknown) => void;
  className?: string;
}

export const FormField = ({
  name,
  children,
  className = ''
}: FormFieldProps) => {
  const { data, errors, setFieldValue, clearFieldError } = useFormContext();
  
  const fieldValue = data[name];
  const fieldError = errors.find(error => error.field === name);
  
  const handleChange = (value: unknown) => {
    setFieldValue(name, value);
    if (fieldError) {
      clearFieldError(name);
    }
  };

  const renderProps: FormFieldRenderProps = {
    value: fieldValue,
    error: fieldError,
    onChange: handleChange,
    className
  };

  return (
    <div className={cn('form-field', className)}>
      {children(renderProps)}
    </div>
  );
};
