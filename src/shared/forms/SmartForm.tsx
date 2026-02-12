import { Form, FormField, FormItem } from '@/shared/ui/form';
import { cn } from '@/shared/utils/cn';
import { getFieldEntry, applyFieldAdapter, reverseFieldAdapter } from './fieldRegistry';
import { useState } from 'preact/hooks';
import type { z } from 'zod';
import type { FormData } from '@/shared/ui/form/Form';

export interface SmartFormConfig<T extends z.ZodType> {
  schema: T;
  fields: (keyof z.infer<T>)[];
  layout: 'grid' | 'stacked';
  initialValues: () => z.infer<T>;
}

export interface SmartFormProps<T extends z.ZodType> {
  // Form configuration
  config: SmartFormConfig<T>;
  
  // Form behavior
  onSubmit: (data: z.infer<T>) => void | Promise<void>;
  disabled?: boolean;
  submitText?: string;
  cancelText?: string;
  onCancel?: () => void;
  showActions?: boolean;
  
  // UI customization
  labels?: Partial<Record<keyof z.infer<T>, string>>;
  placeholders?: Partial<Record<keyof z.infer<T>, string>>;
  errors?: Partial<Record<keyof z.infer<T>, string>>;
  variant?: 'default' | 'error';
  
  // Styling
  className?: string;
  gridSize?: 'sm' | 'md' | 'lg';
}

export function SmartForm<T extends z.ZodType>({
  config,
  onSubmit,
  disabled = false,
  submitText = 'Save',
  cancelText = 'Cancel',
  onCancel,
  showActions = true,
  labels = {},
  placeholders = {},
  errors = {},
  variant = 'default',
  className = '',
  gridSize = 'md',
}: SmartFormProps<T>) {
  const handleSubmit = async (formData: FormData) => {
    // Apply field adapters in reverse direction for submission
    const adaptedData: z.infer<T> = {} as z.infer<T>;
    
    for (const fieldId of config.fields) {
      const fieldKey = fieldId as string;
      adaptedData[fieldId as keyof z.infer<T>] = reverseFieldAdapter(
        fieldKey,
        formData[fieldKey]
      ) as z.infer<T>[keyof z.infer<T>];
    }
    
    await onSubmit(adaptedData);
  };

  const renderField = (fieldId: string) => {
    const fieldEntry = getFieldEntry(fieldId);
    const Component = fieldEntry.component;
    
    return (
      <FormField name={fieldId}>
        {({ value, error, onChange }) => {
          // Apply field adapters for form display
          const adaptedValue = applyFieldAdapter(fieldId, value);
          
          // Build component props
          const componentProps: Record<string, unknown> = {
            value: adaptedValue,
            onChange: (newValue: unknown) => onChange(newValue),
            disabled,
            label: labels[fieldId] || fieldEntry.label,
            placeholder: placeholders[fieldId] || fieldEntry.placeholder,
            error: errors[fieldId] || error?.message,
            variant: errors[fieldId] || error ? 'error' : variant,
          };
          
          // Add specific props for different component types
          if (fieldId === 'address') {
            componentProps.required = { address: true, city: true, state: true, postalCode: true, country: true };
            componentProps.validationLevel = 'loose';
            componentProps.enableAutocomplete = true;
            componentProps.size = gridSize;
            componentProps.showCountry = true;
          }
          
          // Add options for select components
          if (fieldEntry.options) {
            componentProps.options = fieldEntry.options;
          }
          
          return <Component {...componentProps} />;
        }}
      </FormField>
    );
  };

  const gridClasses = {
    sm: 'grid gap-4 sm:grid-cols-1',
    md: 'grid gap-4 sm:grid-cols-2',
    lg: 'grid gap-4 sm:grid-cols-3',
  }[gridSize];

  const containerClasses = cn(
    config.layout === 'grid' ? gridClasses : 'space-y-4',
    className
  );

  // Compute initial data only once to avoid re-computation when config is recreated
  const [stableInitialData] = useState(() => config.initialValues());

  return (
    <Form
      initialData={stableInitialData as FormData}
      onSubmit={handleSubmit}
      schema={config.schema}
      className={containerClasses}
    >
      {config.fields.map((fieldId) => (
        <FormItem key={String(fieldId)}>
          {renderField(String(fieldId))}
        </FormItem>
      ))}

      {showActions && (onCancel || submitText) && (
        <div className={cn(
          'flex gap-3 pt-4',
          config.layout === 'grid' && 'col-span-full'
        )}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="px-4 py-2 text-sm font-medium text-input-text glass-input rounded-md hover:bg-surface-glass/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          )}
          <button
            type="submit"
            disabled={disabled}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitText}
          </button>
        </div>
      )}
    </Form>
  );
}
