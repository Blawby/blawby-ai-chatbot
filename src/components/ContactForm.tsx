import { useMemo } from 'preact/hooks';
import { Form, FormField, FormItem, type FormData as FormDataType } from './ui/form';
import { Input } from './ui/input/Input';
import { EmailInput } from './ui/input/EmailInput';
import { PhoneInput } from './ui/input/PhoneInput';
import { LocationInput } from './ui/input/LocationInput';
import { Button } from './ui/Button';
import { useTranslation } from '@/i18n/hooks';
import { schemas } from './ui/validation/schemas';
import type { JSX } from 'preact';

// Constants for allowed field names
export const ALLOWED_FIELDS = ['name', 'email', 'phone', 'location', 'opposingParty'] as const;
export type AllowedField = typeof ALLOWED_FIELDS[number];

export interface ContactFormProps {
  onSubmit: (data: ContactData) => void | Promise<void>;
  fields?: string[];
  required?: string[];
  message?: string;
  initialValues?: Partial<ContactData>;
}

export interface ContactData {
  name: string;
  email: string;
  phone: string;
  location: string;
  opposingParty?: string;
}

interface ValidatedProps {
  fields: readonly AllowedField[];
  required: readonly AllowedField[];
  message?: string;
}

/**
 * Validates and normalizes ContactForm props with proper type guards
 */
function validateContactFormProps(
  fields: unknown,
  required: unknown, 
  message: unknown
): ValidatedProps {
  // Validate fields with type guard
  const validatedFields = (() => {
    if (!Array.isArray(fields) || fields.length === 0) {
      console.error('[ContactForm] Invalid fields prop. Using defaults.');
      return ALLOWED_FIELDS;
    }
    
    const valid = [...new Set(fields)]
      .filter((f): f is AllowedField => 
        typeof f === 'string' && ALLOWED_FIELDS.includes(f as AllowedField)
      );
    
    if (valid.length === 0) {
      console.error('[ContactForm] No valid fields. Using defaults.');
      return ALLOWED_FIELDS;
    }
    
    if (valid.length !== fields.length) {
      const invalidFields = fields.filter(field => 
        !ALLOWED_FIELDS.includes(field as AllowedField)
      );
      console.warn('[ContactForm] Some invalid field names were filtered out:', invalidFields);
    }
    
    return valid;
  })();
  
  // Validate required with type guard  
  const validatedRequired = (() => {
    if (!Array.isArray(required)) {
      console.error('[ContactForm] Invalid required prop. Using defaults.');
      return ['name', 'email', 'phone'] as const;
    }
    
    const valid = [...new Set(required)]
      .filter((f): f is AllowedField =>
        typeof f === 'string' && 
        ALLOWED_FIELDS.includes(f as AllowedField) &&
        (validatedFields as readonly string[]).includes(f)
      );
    
    if (valid.length !== required.length) {
      const invalidRequired = required.filter(field => 
        !ALLOWED_FIELDS.includes(field as AllowedField) || 
        !(validatedFields as readonly string[]).includes(field as AllowedField)
      );
      console.warn('[ContactForm] Some invalid required fields were filtered out:', invalidRequired);
    }
    
    return valid.length > 0 ? valid : ['name', 'email', 'phone'] as const;
  })();
  
  // Validate message
  const validatedMessage = typeof message === 'string' ? message : undefined;
  
  return {
    fields: validatedFields,
    required: validatedRequired,
    message: validatedMessage
  };
}

function normalizeInitialValues(values?: Partial<ContactData>): Partial<ContactData> {
  return {
    name: typeof values?.name === 'string' && values.name.trim() ? values.name.trim() : undefined,
    email: typeof values?.email === 'string' && values.email.trim() ? values.email.trim() : undefined,
    phone: typeof values?.phone === 'string' && values.phone.trim() ? values.phone.trim() : undefined,
    location: typeof values?.location === 'string' && values.location.trim() ? values.location.trim() : undefined,
    opposingParty: typeof values?.opposingParty === 'string' && values.opposingParty.trim() ? values.opposingParty.trim() : undefined
  };
}

export function ContactForm({
  onSubmit,
  fields = [...ALLOWED_FIELDS], // Copy readonly array to mutable
  required = ['name', 'email', 'phone'],
  message,
  initialValues
}: ContactFormProps): JSX.Element {
  // Validate props without mutation
  const validatedProps = validateContactFormProps(fields, required, message);
  const { fields: validFields, required: validRequired, message: validMessage } = validatedProps;
  
  // Always call hooks at the top level
  const normalizedInitialValues = useMemo(() => normalizeInitialValues(initialValues), [
    initialValues?.name,
    initialValues?.email,
    initialValues?.phone,
    initialValues?.location,
    initialValues?.opposingParty
  ]);

  const { t } = useTranslation('common');

  // Validate onSubmit function
  if (typeof onSubmit !== 'function') {
    console.error('[ContactForm] Invalid onSubmit prop: must be a function. Returning fallback UI.');
    return (
      <div className="bg-white dark:bg-dark-bg border border-red-300 dark:border-red-600 rounded-lg p-6 shadow-sm" data-testid="contact-form-error">
        <div className="text-red-600 dark:text-red-400 text-center">
          <p className="font-medium">Contact Form Error</p>
          <p className="text-sm mt-1">Invalid configuration. Please check the form setup.</p>
        </div>
      </div>
    );
  }

  // Create initial data for form
  const initialData = {
    name: normalizedInitialValues.name ?? '',
    email: normalizedInitialValues.email ?? '',
    phone: normalizedInitialValues.phone ?? '',
    location: normalizedInitialValues.location ?? '',
    opposingParty: normalizedInitialValues.opposingParty ?? ''
  };

  return (
    <div className="bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-6 shadow-sm" data-testid="contact-form">
      {validMessage && (
        <div className="mb-4 text-gray-700 dark:text-gray-300">
          {validMessage}
        </div>
      )}
      
      <Form
        initialData={initialData}
        onSubmit={(formData: FormDataType) => {
          // Convert FormData to ContactData
          const contactData: ContactData = {
            name: (formData.name as string) || '',
            email: (formData.email as string) || '',
            phone: (formData.phone as string) || '',
            location: (formData.location as string) || '',
            opposingParty: formData.opposingParty as string | undefined
          };
          return onSubmit(contactData);
        }}
        schema={schemas.contact.contactForm}
        className="space-y-4"
        validateOnBlur={true}
        requiredFields={validRequired as string[]}
      >
        {validFields.includes('name') && (
          <FormItem>
            <FormField name="name">
              {({ value, error, onChange }) => (
                <Input
                  type="text"
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.labels.name')}
                  placeholder={t('forms.placeholders.name')}
                  required={validRequired.includes('name')}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                />
              )}
            </FormField>
          </FormItem>
        )}

        {validFields.includes('email') && (
          <FormItem>
            <FormField name="email">
              {({ value, error, onChange }) => (
                <EmailInput
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.labels.email')}
                  placeholder={t('forms.placeholders.email')}
                  required={validRequired.includes('email')}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                  showValidation={true}
                />
              )}
            </FormField>
          </FormItem>
        )}

        {validFields.includes('phone') && (
          <FormItem>
            <FormField name="phone">
              {({ value, error, onChange }) => (
                <PhoneInput
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.labels.phone')}
                  placeholder={t('forms.placeholders.phone')}
                  required={validRequired.includes('phone')}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                  format={true}
                  showCountryCode={true}
                  countryCode="+1"
                />
              )}
            </FormField>
          </FormItem>
        )}

        {validFields.includes('location') && (
          <FormItem>
            <FormField name="location">
              {({ value, error, onChange }) => (
                <LocationInput
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.contactForm.location')}
                  placeholder={t('forms.contactForm.placeholders.location')}
                  required={validRequired.includes('location')}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                />
              )}
            </FormField>
          </FormItem>
        )}

        {validFields.includes('opposingParty') && (
          <FormItem>
            <FormField name="opposingParty">
              {({ value, error, onChange }) => (
                <Input
                  type="text"
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.contactForm.opposingParty')}
                  placeholder={t('forms.contactForm.placeholders.opposingParty')}
                  required={false}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                />
              )}
            </FormField>
          </FormItem>
        )}

        <div className="pt-4">
          <Button
            type="submit"
            data-testid="contact-form-submit"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('forms.contactForm.submit')}
          </Button>
        </div>
      </Form>
    </div>
  );
}