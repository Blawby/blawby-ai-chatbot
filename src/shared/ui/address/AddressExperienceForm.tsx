import { useMemo } from 'preact/hooks';
import { z } from 'zod';
import { Form, FormField, FormItem, type FormData as FormDataType } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input/Input';
import { EmailInput } from '@/shared/ui/input/EmailInput';
import { PhoneInput } from '@/shared/ui/input/PhoneInput';
import { Textarea } from '@/shared/ui/input/Textarea';
import { Select, type SelectOption } from '@/shared/ui/input/Select';
import { AddressInput } from '@/shared/ui/address/AddressInput';
import { cn } from '@/shared/utils/cn';
import { isAddressEmpty } from '@/shared/utils/addressFormat';
import { commonSchemas } from '@/shared/ui/validation/schemas';
import { addressLooseSchema, addressStrictWithCountrySchema } from '@/shared/ui/validation/schemas/address';
import type { Address } from '@/shared/types/address';

export const ADDRESS_EXPERIENCE_FIELDS = [
  'name',
  'email',
  'phone',
  'status',
  'currency',
  'address',
  'opposingParty',
  'description',
] as const;

export type AddressExperienceField = typeof ADDRESS_EXPERIENCE_FIELDS[number];

export interface AddressExperienceData extends Record<string, unknown> {
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  currency?: string;
  address?: Partial<Address>;
  opposingParty?: string;
  description?: string;
}

export interface AddressExperienceFormProps {
  onSubmit?: (data: AddressExperienceData) => void | Promise<void>;
  onValuesChange?: (values: Partial<AddressExperienceData>) => void;
  fields?: AddressExperienceField[];
  required?: AddressExperienceField[];
  message?: string;
  initialValues?: Partial<AddressExperienceData>;
  variant?: 'card' | 'plain';
  formId?: string;
  showSubmitButton?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
  labels?: Partial<Record<AddressExperienceField, string>>;
  placeholders?: Partial<Record<AddressExperienceField, string>>;
  addressOptions?: {
    country?: string;
    showCountry?: boolean;
    enableAutocomplete?: boolean;
    autocompleteUrl?: string;
    minChars?: number;
    debounceMs?: number;
    limit?: number;
    size?: 'sm' | 'md' | 'lg';
  };
  className?: string;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'usd', label: 'USD' },
  { value: 'cad', label: 'CAD' },
  { value: 'eur', label: 'EUR' },
  { value: 'gbp', label: 'GBP' },
];

const DEFAULT_LABELS: Record<AddressExperienceField, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  status: 'Status',
  currency: 'Currency',
  address: 'Address',
  opposingParty: 'Opposing Party',
  description: 'Description',
};

const DEFAULT_PLACEHOLDERS: Partial<Record<AddressExperienceField, string>> = {
  name: 'Enter your name',
  email: 'your.email@example.com',
  phone: '+1 (555) 123-4567',
  address: '',
  opposingParty: 'Enter opposing party name',
  description: 'Describe your case',
};

const normalizeFieldList = (fields?: AddressExperienceField[]) => {
  if (!fields || fields.length === 0) {
    return [...ADDRESS_EXPERIENCE_FIELDS];
  }
  const uniqueFields = [...new Set(fields)];
  return uniqueFields.filter((field) => ADDRESS_EXPERIENCE_FIELDS.includes(field));
};

const normalizeRequiredList = (
  fields: AddressExperienceField[],
  required?: AddressExperienceField[]
) => {
  if (!required || required.length === 0) {
    return [] as AddressExperienceField[];
  }
  const uniqueRequired = [...new Set(required)];
  return uniqueRequired.filter((field) => fields.includes(field));
};

const trimOrUndefined = (value?: string) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAddressInitialValue = (value: unknown): Partial<Address> | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    return { address: value } as Partial<Address>;
  }
  
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Lightweight shape check: verify it has at least one common address property
    const hasKnownKey = 
      'address' in obj || 
      'street' in obj || 
      'streetAddress' in obj || 
      'line1' in obj || 
      'city' in obj || 
      'state' in obj || 
      'postalCode' in obj || 
      'postal_code' in obj || 
      'country' in obj;

    if (hasKnownKey) {
      // Map variants to canonical Address interface
      return {
        address: (obj.line1 || obj.streetAddress || obj.street || obj.address || '') as string,
        apartment: (obj.line2 || obj.apartment) as string | undefined,
        city: (obj.city || '') as string,
        state: (obj.state || '') as string,
        postalCode: (obj.postalCode || obj.postal_code || '') as string,
        country: (obj.country || '') as string,
      };
    }
  }
  
  return undefined;
};

const normalizeAddressInput = (value: unknown) => {
  if (!value || typeof value !== 'object') return undefined;
  const address = value as Partial<Address>;
  return isAddressEmpty(address) ? undefined : address;
};

const optionalString = z.string().optional().or(z.literal(''));
const optionalEmail = z.string().email('Please enter a valid email address').optional().or(z.literal(''));
const optionalPhone = z.string().optional().or(z.literal('')).refine(
  (val) => {
    if (!val || val === '') return true;
    return /^\+?[\d\s\-()]+$/.test(val) && val.replace(/\D/g, '').length >= 10;
  },
  'Please enter a valid phone number (at least 10 digits)'
);

const buildSchema = (fields: AddressExperienceField[], required: AddressExperienceField[]) => {
  const shape: Record<string, z.ZodTypeAny> = {};
  const isRequired = (field: AddressExperienceField) => required.includes(field);

  fields.forEach((field) => {
    switch (field) {
      case 'name':
        shape.name = isRequired('name')
          ? z.string().trim().min(2, 'Name must be at least 2 characters')
          : optionalString;
        break;
      case 'email':
        shape.email = isRequired('email') ? commonSchemas.email : optionalEmail;
        break;
      case 'phone':
        shape.phone = isRequired('phone') ? commonSchemas.phone : optionalPhone;
        break;
      case 'status':
        shape.status = isRequired('status')
          ? z.string().min(1, 'Status is required')
          : optionalString;
        break;
      case 'currency':
        shape.currency = isRequired('currency')
          ? z.string().min(1, 'Currency is required')
          : optionalString;
        break;
      case 'address': {
        const addressSchema = isRequired('address')
          ? addressStrictWithCountrySchema
          : addressLooseSchema.optional();
        shape.address = z.preprocess(normalizeAddressInput, addressSchema);
        break;
      }
      case 'opposingParty':
        shape.opposingParty = isRequired('opposingParty')
          ? z.string().trim().min(1, 'Opposing party is required')
          : optionalString;
        break;
      case 'description':
        shape.description = isRequired('description')
          ? z.string().trim().min(1, 'Description is required')
          : optionalString;
        break;
      default:
        break;
    }
  });

  return z.object(shape);
};

export const AddressExperienceForm = ({
  onSubmit,
  onValuesChange,
  fields,
  required,
  message,
  initialValues,
  variant = 'card',
  formId,
  showSubmitButton = true,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onCancel,
  disabled = false,
  labels = {},
  placeholders = {},
  addressOptions = {},
  className = '',
}: AddressExperienceFormProps) => {
  const normalizedFields = useMemo(() => normalizeFieldList(fields), [fields]);
  const normalizedRequired = useMemo(
    () => normalizeRequiredList(normalizedFields, required),
    [normalizedFields, required]
  );

  const schema = useMemo(
    () => buildSchema(normalizedFields, normalizedRequired),
    [normalizedFields, normalizedRequired]
  );

  const normalizedInitialValues = useMemo<Partial<AddressExperienceData>>(() => ({
    name: trimOrUndefined(initialValues?.name),
    email: trimOrUndefined(initialValues?.email),
    phone: trimOrUndefined(initialValues?.phone),
    status: trimOrUndefined(initialValues?.status),
    currency: trimOrUndefined(initialValues?.currency),
    address: normalizeAddressInitialValue(initialValues?.address),
    opposingParty: trimOrUndefined(initialValues?.opposingParty),
    description: trimOrUndefined(initialValues?.description),
  }), [initialValues]);

  const initialData: AddressExperienceData = {
    name: normalizedInitialValues.name ?? '',
    email: normalizedInitialValues.email ?? '',
    phone: normalizedInitialValues.phone ?? '',
    status: normalizedInitialValues.status ?? '',
    currency: normalizedInitialValues.currency ?? '',
    address: normalizedInitialValues.address,
    opposingParty: normalizedInitialValues.opposingParty ?? '',
    description: normalizedInitialValues.description ?? '',
  };

  const containerClasses = cn(
    variant === 'plain'
      ? 'w-full'
      : 'bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-6 shadow-sm',
    className
  );

  const getLabel = (field: AddressExperienceField) => labels[field] || DEFAULT_LABELS[field];
  const getPlaceholder = (field: AddressExperienceField) => placeholders[field] || DEFAULT_PLACEHOLDERS[field];
  const isFieldRequired = (field: AddressExperienceField) => normalizedRequired.includes(field);

  return (
    <div className={containerClasses} data-testid="address-experience-form">
      {message && (
        <div className="mb-4 text-gray-700 dark:text-gray-300">
          {message}
        </div>
      )}

      <Form
        id={formId}
        initialData={initialData}
        onSubmit={async (formData: FormDataType) => {
          if (!onSubmit) return;
          const normalized: AddressExperienceData = {
            name: trimOrUndefined(formData.name as string),
            email: trimOrUndefined(formData.email as string),
            phone: trimOrUndefined(formData.phone as string),
            status: trimOrUndefined(formData.status as string),
            currency: trimOrUndefined(formData.currency as string),
            address: normalizeAddressInput(formData.address) as Address | undefined,
            opposingParty: trimOrUndefined(formData.opposingParty as string),
            description: trimOrUndefined(formData.description as string),
          };
          await onSubmit(normalized);
        }}
        schema={schema}
        className="space-y-4"
        validateOnBlur={true}
      >
        {normalizedFields.map((field) => (
          <FormItem key={field}>
            <FormField name={field}>
              {({ value, error, onChange }) => {
                const handleChange = (newValue: unknown) => {
                  onChange(newValue);
                  if (onValuesChange) {
                    onValuesChange({ [field]: newValue } as Partial<AddressExperienceData>);
                  }
                };

                switch (field) {
                  case 'email':
                    return (
                      <EmailInput
                        value={(value as string) || ''}
                        onChange={handleChange}
                        label={getLabel('email')}
                        placeholder={getPlaceholder('email')}
                        required={isFieldRequired('email')}
                        error={error?.message}
                        variant={error ? 'error' : 'default'}
                        disabled={disabled}
                        showValidation={true}
                      />
                    );
                  case 'phone':
                    return (
                      <PhoneInput
                        value={(value as string) || ''}
                        onChange={handleChange}
                        label={getLabel('phone')}
                        placeholder={getPlaceholder('phone')}
                        required={isFieldRequired('phone')}
                        error={error?.message}
                        variant={error ? 'error' : 'default'}
                        disabled={disabled}
                        format={true}
                        showCountryCode={true}
                        countryCode="+1"
                      />
                    );
                  case 'status':
                    return (
                      <Select
                        label={getLabel('status')}
                        value={(value as string) || ''}
                        onChange={handleChange}
                        options={STATUS_OPTIONS}
                        placeholder={getPlaceholder('status')}
                        disabled={disabled}
                      />
                    );
                  case 'currency':
                    return (
                      <Select
                        label={getLabel('currency')}
                        value={(value as string) || ''}
                        onChange={handleChange}
                        options={CURRENCY_OPTIONS}
                        placeholder={getPlaceholder('currency')}
                        disabled={disabled}
                      />
                    );
                  case 'address': {
                    const currentAddress: Partial<Address> = (value as Address) || {};
                    return (
                      <AddressInput
                        value={value as Address || null}
                        onChange={(incoming) => {
                          const merged = incoming ? {
                            ...currentAddress,
                            ...incoming,
                            apartment: incoming.apartment ?? currentAddress.apartment,
                          } : incoming;
                          handleChange(merged);
                        }}
                        label={getLabel('address')}
                        placeholder={getPlaceholder('address')}
                        required={isFieldRequired('address')
                          ? { address: true, city: true, state: true, postalCode: true, country: true }
                          : undefined}
                        errors={error?.message ? { address: error.message } : undefined}
                        variant={error ? 'error' : 'default'}
                        enableAutocomplete={addressOptions.enableAutocomplete ?? true}
                        autocompleteUrl={addressOptions.autocompleteUrl}
                        minChars={addressOptions.minChars}
                        debounceMs={addressOptions.debounceMs}
                        limit={addressOptions.limit}
                        country={addressOptions.country}
                        showCountry={addressOptions.showCountry ?? true}
                        size={addressOptions.size || 'md'}
                        disabled={disabled}
                      />
                    );
                  }
                  case 'opposingParty':
                    return (
                      <Input
                        value={(value as string) || ''}
                        onChange={handleChange}
                        label={getLabel('opposingParty')}
                        placeholder={getPlaceholder('opposingParty')}
                        required={isFieldRequired('opposingParty')}
                        error={error?.message}
                        variant={error ? 'error' : 'default'}
                        disabled={disabled}
                      />
                    );
                  case 'description':
                    return (
                      <Textarea
                        value={(value as string) || ''}
                        onChange={handleChange}
                        label={getLabel('description')}
                        placeholder={getPlaceholder('description')}
                        required={isFieldRequired('description')}
                        error={error?.message}
                        variant={error ? 'error' : 'default'}
                        rows={4}
                        resize="vertical"
                        disabled={disabled}
                      />
                    );
                  case 'name':
                  default:
                    return (
                      <Input
                        value={(value as string) || ''}
                        onChange={handleChange}
                        label={getLabel('name')}
                        placeholder={getPlaceholder('name')}
                        required={isFieldRequired('name')}
                        error={error?.message}
                        variant={error ? 'error' : 'default'}
                        disabled={disabled}
                      />
                    );
                }
              }}
            </FormField>
          </FormItem>
        ))}

        {showSubmitButton && (
          <div className="flex justify-end gap-3 pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={disabled}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="submit"
              disabled={disabled}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </Form>
    </div>
  );
};
