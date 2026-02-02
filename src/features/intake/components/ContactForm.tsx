import { useMemo } from 'preact/hooks';
import { Form, FormField, FormItem, type FormData as FormDataType } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input/Input';
import { EmailInput } from '@/shared/ui/input/EmailInput';
import { PhoneInput } from '@/shared/ui/input/PhoneInput';
import { AddressInput } from '@/shared/ui/address/AddressInput';
import { Textarea } from '@/shared/ui/input/Textarea';
import { Button } from '@/shared/ui/Button';
import { useTranslation } from '@/shared/i18n/hooks';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { schemas } from '@/shared/ui/validation/schemas';
import { toApiAddress } from '@/shared/mapping/addressMapping';
import { validateAddressLoose } from '@/shared/utils/addressValidation';
import type { JSX } from 'preact';
import type { Address } from '@/shared/types/address';

// Constants for allowed field names
export const ALLOWED_FIELDS = ['name', 'email', 'phone', 'address', 'opposingParty', 'description'] as const;
export type AllowedField = typeof ALLOWED_FIELDS[number];

export interface ContactFormProps {
  onSubmit: (data: ContactData) => void | Promise<void>;
  fields?: string[];
  required?: string[];
  message?: string;
  initialValues?: Partial<ContactData>;
  variant?: 'card' | 'plain';
  formId?: string;
  showSubmitButton?: boolean;
}

export interface ContactData {
  name: string;
  email: string;
  phone: string;
  address?: Address;
  opposingParty?: string;
  description?: string;
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
      .filter((f): f is AllowedField => {
        if (typeof f !== 'string') return false;
        // Use a more explicit check that works with readonly arrays
        return (ALLOWED_FIELDS as readonly string[]).includes(f);
      });
    
    if (valid.length === 0) {
      console.error('[ContactForm] No valid fields. Using defaults.');
      return ALLOWED_FIELDS;
    }
    
    if (valid.length !== fields.length) {
      const invalidFields = fields.filter(field => 
        typeof field === 'string' && !(ALLOWED_FIELDS as readonly string[]).includes(field)
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
    address: values?.address,
    opposingParty: typeof values?.opposingParty === 'string' && values.opposingParty.trim() ? values.opposingParty.trim() : undefined,
    description: typeof values?.description === 'string' && values.description.trim() ? values.description.trim() : undefined
  };
}

export function ContactForm({
  onSubmit,
  fields = [...ALLOWED_FIELDS], // Copy readonly array to mutable
  required = ['name', 'email'],
  message,
  initialValues,
  variant = 'card',
  formId,
  showSubmitButton = true
}: ContactFormProps): JSX.Element {
  // Validate props without mutation
  const validatedProps = validateContactFormProps(fields, required, message);
  const { fields: validFields, required: validRequired, message: validMessage } = validatedProps;
  
  // Get practice details for default country
  const { currentPractice } = usePracticeManagement();
  
  // Always call hooks at the top level
  const normalizedInitialValues = useMemo(() => {
    const baseValues = normalizeInitialValues(initialValues);
    
    // Set default country from practice if not already provided
    if (currentPractice?.country && (!baseValues.address || !baseValues.address.country)) {
      return {
        ...baseValues,
        address: {
          ...baseValues.address,
          country: currentPractice.country
        }
      };
    }
    
    return baseValues;
  }, [initialValues, currentPractice?.country]);

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
    address: normalizedInitialValues.address || null,
    opposingParty: normalizedInitialValues.opposingParty ?? '',
    description: normalizedInitialValues.description ?? ''
  };

  const containerClasses = variant === 'plain'
    ? 'w-full'
    : 'bg-white dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg p-6 shadow-sm';

  return (
    <div className={containerClasses} data-testid="contact-form">
      {validMessage && (
        <div className="mb-4 text-gray-700 dark:text-gray-300">
          {validMessage}
        </div>
      )}
      
      <Form
        id={formId}
        initialData={initialData}
        onSubmit={async (formData: FormDataType) => {
          if (import.meta.env.DEV) {
            console.log('[ContactForm] Form submitted with data:', {
              name: !!formData.name,
              email: !!formData.email,
              phone: !!formData.phone,
              address: !!formData.address,
              opposingParty: !!formData.opposingParty,
              description: !!formData.description
            });
          }
          // Convert FormData to ContactData
          const contactData: ContactData = {
            name: (formData.name as string) || '',
            email: (formData.email as string) || '',
            phone: (formData.phone as string) || '',
            address: (formData.address as Address) || undefined,
            opposingParty: formData.opposingParty as string | undefined,
            description: formData.description as string | undefined
          };
          try {
            await onSubmit(contactData);
            if (import.meta.env.DEV) {
              console.log('[ContactForm] onSubmit completed successfully');
            }
          } catch (error) {
            console.error('[ContactForm] onSubmit error:', error);
            throw error;
          }
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

        {validFields.includes('address') && (
          <FormItem>
            <FormField name="address">
              {({ value, error, onChange }) => (
                <AddressInput
                  value={value as Address || null}
                  onChange={(address) => onChange(address)}
                  label={t('forms.contactForm.location')}
                  placeholder={t('forms.contactForm.placeholders.location')}
                  required={validRequired.includes('address') ? { address: true, city: true, state: true, postalCode: true, country: true } : undefined}
                  errors={error?.message ? { address: error.message } : undefined}
                  country={currentPractice?.country || undefined}
                  showCountry={!currentPractice?.country} // Only show country select if practice country is unknown
                  variant={error ? 'error' : 'default'}
                  validationLevel="loose"
                  enableAutocomplete={true}
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

        {validFields.includes('description') && (
          <FormItem>
            <FormField name="description">
              {({ value, error, onChange }) => (
                <Textarea
                  value={value as string || ''}
                  onChange={onChange}
                  label={t('forms.contactForm.description')}
                  placeholder={t('forms.contactForm.placeholders.description')}
                  required={false}
                  error={error?.message}
                  variant={error ? 'error' : 'default'}
                  rows={4}
                  resize="vertical"
                />
              )}
            </FormField>
          </FormItem>
        )}

        {showSubmitButton && (
          <div className="pt-4">
            <Button
              type="submit"
              data-testid="contact-form-submit"
              className="w-full"
            >
              {t('forms.contactForm.submit')}
            </Button>
          </div>
        )}
      </Form>
    </div>
  );
}
