import { Form, FormField, FormItem, type FormData as FormDataType } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input/Input';
import { EmailInput } from '@/shared/ui/input/EmailInput';
import { PhoneInput } from '@/shared/ui/input/PhoneInput';
import { Select, type SelectOption } from '@/shared/ui/input/Select';
import { AddressInput } from './AddressInput';
import { cn } from '@/shared/utils/cn';
import type { Address } from '@/shared/types/address';

// Common status options
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

// Common currency options
const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'usd', label: 'USD' },
  { value: 'cad', label: 'CAD' },
  { value: 'eur', label: 'EUR' },
  { value: 'gbp', label: 'GBP' },
];

export interface AddressFormFields {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  currency?: string;
  address?: Address;
  opposingParty?: string;
  description?: string;
}

export interface AddressFormProps {
  // Form data
  initialValues: Partial<AddressFormFields>;
  onSubmit: (values: AddressFormFields) => void | Promise<void>;
  
  // UI configuration
  fields: Array<{
    name: keyof AddressFormFields;
    label: string;
    required?: boolean;
    placeholder?: string;
    type?: 'text' | 'email' | 'phone' | 'select' | 'address';
    options?: SelectOption[];
  }>;
  
  // Form behavior
  disabled?: boolean;
  submitText?: string;
  cancelText?: string;
  onCancel?: () => void;
  validationLevel?: 'loose' | 'strict';
  
  // Advanced features (like intake form)
  labels?: Record<string, string>;  // For internationalization
  placeholders?: Record<string, string>;  // For internationalization
  requiredFields?: Record<string, boolean>;  // Dynamic required fields
  errors?: Record<string, string>;  // Form error integration
  variant?: 'default' | 'error';  // Error variant
  
  // Styling
  className?: string;
  layout?: 'grid' | 'stacked';
  gridSize?: 'sm' | 'md' | 'lg';
}

export const AddressForm = ({
  initialValues,
  onSubmit,
  fields,
  disabled = false,
  submitText = 'Save',
  cancelText = 'Cancel',
  onCancel,
  validationLevel = 'loose',
  labels = {},
  placeholders = {},
  requiredFields = {},
  errors = {},
  variant = 'default',
  className = '',
  layout = 'grid',
  gridSize = 'md',
}: AddressFormProps) => {
  const handleSubmit = async (formData: FormDataType) => {
    await onSubmit(formData as AddressFormFields);
  };

  const renderField = (fieldConfig: AddressFormProps['fields'][0]) => {
    const { name, label, required, placeholder, type = 'text', options } = fieldConfig;

    return (
      <FormField name={name}>
        {({ value, error, onChange }) => {
          switch (type) {
            case 'email':
              return (
                <EmailInput
                  label={labels[name] || label}
                  value={value as string}
                  onChange={(newValue) => onChange(newValue)}
                  placeholder={placeholders[name] || placeholder}
                  required={requiredFields[name] || required}
                  disabled={disabled}
                />
              );

            case 'phone':
              return (
                <PhoneInput
                  label={labels[name] || label}
                  value={value as string}
                  onChange={(newValue) => onChange(newValue)}
                  placeholder={placeholders[name] || placeholder}
                  disabled={disabled}
                />
              );

            case 'select':
              return (
                <Select
                  label={labels[name] || label}
                  value={value as string}
                  onChange={(newValue) => onChange(newValue)}
                  placeholder={placeholders[name] || placeholder}
                  options={options || []}
                  disabled={disabled}
                />
              );

            case 'address':
              return (
                <AddressInput
                  value={value as Address || null}
                  onChange={(address) => onChange(address)}
                  required={requiredFields[name] ? { 
                    address: true, city: true, state: true, postalCode: true, country: true 
                  } : undefined}
                  errors={errors[name] ? { address: errors[name] } : undefined}
                  variant={errors[name] ? 'error' : variant}
                  validationLevel={validationLevel}
                  enableAutocomplete={true}
                  disabled={disabled}
                  size={gridSize}
                  showCountry={true}
                />
              );

            default:
              return (
                <Input
                  label={labels[name] || label}
                  value={value as string}
                  onChange={(newValue) => onChange(newValue)}
                  placeholder={placeholders[name] || placeholder}
                  required={requiredFields[name] || required}
                  disabled={disabled}
                />
              );
          }
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
    layout === 'grid' ? gridClasses : 'space-y-4',
    className
  );

  return (
    <Form
      initialData={initialValues}
      onSubmit={handleSubmit}
      className={containerClasses}
    >
      {fields.map((fieldConfig) => (
        <FormItem key={fieldConfig.name}>
          {renderField(fieldConfig)}
        </FormItem>
      ))}

      <div className={cn(
        'flex gap-3 pt-4',
        layout === 'grid' && 'col-span-full'
      )}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </Form>
  );
};

// Pre-configured form types for common use cases
export const ClientAddressForm = ({
  initialValues,
  onSubmit,
  disabled = false,
  onCancel,
  labels = {},
  placeholders = {},
  requiredFields = {},
  errors = {},
  variant = 'default',
}: {
  initialValues: Partial<AddressFormFields>;
  onSubmit: (values: AddressFormFields) => void | Promise<void>;
  disabled?: boolean;
  onCancel?: () => void;
  labels?: Record<string, string>;
  placeholders?: Record<string, string>;
  requiredFields?: Record<string, boolean>;
  errors?: Record<string, string>;
  variant?: 'default' | 'error';
}) => (
  <AddressForm
    initialValues={initialValues}
    onSubmit={onSubmit}
    onCancel={onCancel}
    disabled={disabled}
    labels={labels}
    placeholders={placeholders}
    requiredFields={requiredFields}
    errors={errors}
    variant={variant}
    submitText="Save Client"
    fields={[
      { name: 'name', label: 'Name', required: true, placeholder: 'Enter client name' },
      { name: 'email', label: 'Email', required: true, type: 'email', placeholder: 'client@example.com' },
      { name: 'phone', label: 'Phone', type: 'phone', placeholder: '+1 (555) 123-4567' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { name: 'currency', label: 'Currency', type: 'select', options: CURRENCY_OPTIONS },
      { name: 'address', label: 'Address', type: 'address' },
    ]}
    gridSize="md"
  />
);

export const PracticeAddressForm = ({
  initialValues,
  onSubmit,
  disabled = false,
  onCancel,
  labels = {},
  placeholders = {},
  requiredFields = {},
  errors = {},
  variant = 'default',
}: {
  initialValues: Partial<AddressFormFields>;
  onSubmit: (values: AddressFormFields) => void | Promise<void>;
  disabled?: boolean;
  onCancel?: () => void;
  labels?: Record<string, string>;
  placeholders?: Record<string, string>;
  requiredFields?: Record<string, boolean>;
  errors?: Record<string, string>;
  variant?: 'default' | 'error';
}) => (
  <AddressForm
    initialValues={initialValues}
    onSubmit={onSubmit}
    onCancel={onCancel}
    disabled={disabled}
    labels={labels}
    placeholders={placeholders}
    requiredFields={requiredFields}
    errors={errors}
    variant={variant}
    submitText="Save Contact Info"
    fields={[
      { name: 'email', label: 'Business Email', type: 'email', placeholder: 'business@example.com' },
      { name: 'phone', label: 'Contact Phone', type: 'phone', placeholder: '+1 (555) 123-4567' },
      { name: 'address', label: 'Address', type: 'address' },
    ]}
    gridSize="sm"
    layout="stacked"
  />
);

// Specialized form for intake form with dynamic fields
export const IntakeAddressForm = ({
  initialValues,
  onSubmit,
  validFields,
  validRequired,
  labels,
  placeholders,
  errors,
  variant = 'default',
}: {
  initialValues: Partial<AddressFormFields>;
  onSubmit: (values: AddressFormFields) => void | Promise<void>;
  validFields: string[];
  validRequired: string[];
  labels?: Record<string, string>;
  placeholders?: Record<string, string>;
  errors?: Record<string, string>;
  variant?: 'default' | 'error';
}) => {
  // Build fields array dynamically based on validFields
  const fields: AddressFormProps['fields'] = [];
  
  if (validFields.includes('name')) {
    fields.push({ name: 'name', label: labels?.['name'] || 'Name', required: validRequired.includes('name'), placeholder: placeholders?.['name'] || 'Enter your name' });
  }
  
  if (validFields.includes('email')) {
    fields.push({ name: 'email', label: labels?.['email'] || 'Email', required: validRequired.includes('email'), type: 'email', placeholder: placeholders?.['email'] || 'your.email@example.com' });
  }
  
  if (validFields.includes('phone')) {
    fields.push({ 
      name: 'phone', 
      label: labels?.['phone'] || 'Phone', 
      type: 'phone',
      required: validRequired.includes('phone'),
      placeholder: placeholders?.['phone'] || '+1 (555) 123-4567' 
    });
  }
  
  if (validFields.includes('address')) {
    fields.push({ 
      name: 'address', 
      label: labels?.['address'] || 'Address', 
      type: 'address',
      required: validRequired.includes('address')
    });
  }
  
  if (validFields.includes('opposingParty')) {
    fields.push({ name: 'opposingParty', label: labels?.['opposingParty'] || 'Opposing Party', placeholder: placeholders?.['opposingParty'] || 'Enter opposing party name' });
  }
  
  if (validFields.includes('description')) {
    fields.push({ name: 'description', label: labels?.['description'] || 'Description', placeholder: placeholders?.['description'] || 'Describe your case' });
  }

  return (
    <AddressForm
      initialValues={initialValues}
      onSubmit={onSubmit}
      disabled={false}
      labels={labels}
      placeholders={placeholders}
      requiredFields={Object.fromEntries(
        validRequired.map(field => [field, true])
      )}
      errors={errors}
      variant={variant}
      fields={fields}
      gridSize="md"
      layout="stacked"
    />
  );
};
