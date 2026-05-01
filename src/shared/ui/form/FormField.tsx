import { ComponentChildren } from 'preact';
import { useComputed } from '@preact/signals';
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
  const { dataSignal, errorsSignal, setFieldValue, clearFieldError } = useFormContext();

  // Per-field computed signals — only re-render when this field's slice changes.
  const fieldValue = useComputed(() => (dataSignal.value as Record<string, unknown>)[name]);
  const fieldError = useComputed(() => errorsSignal.value.find((e) => e.field === name));

  const currentError = fieldError.value;
  const handleChange = (value: unknown) => {
    setFieldValue(name, value);
    if (currentError) {
      clearFieldError(name);
    }
  };

  const renderProps: FormFieldRenderProps = {
    value: fieldValue.value,
    error: currentError,
    onChange: handleChange,
    className,
  };

  return (
    <div className={cn('form-field', className)}>
      {children(renderProps)}
    </div>
  );
};
