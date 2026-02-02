import { useMemo } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import {
  AddressExperienceForm,
  type AddressExperienceData,
  type AddressExperienceField,
} from '@/shared/ui/address/AddressExperienceForm';
import type { Address } from '@/shared/types/address';

export const ALLOWED_FIELDS = [
  'name',
  'email',
  'phone',
  'address',
  'opposingParty',
  'description',
] as const;

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
  name?: string;
  email?: string;
  phone?: string;
  address?: Address;
  opposingParty?: string;
  description?: string;
}

const normalizeFields = (fields?: string[]): AddressExperienceField[] => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return [...ALLOWED_FIELDS];
  }
  const uniqueFields = [...new Set(fields)];
  return uniqueFields.filter((field): field is AddressExperienceField =>
    ALLOWED_FIELDS.includes(field as AllowedField)
  );
};

const normalizeRequired = (fields: AddressExperienceField[], required?: string[]) => {
  if (!Array.isArray(required) || required.length === 0) {
    return ['name', 'email'] as AddressExperienceField[];
  }
  const uniqueRequired = [...new Set(required)];
  const filtered = uniqueRequired.filter((field): field is AddressExperienceField =>
    fields.includes(field as AddressExperienceField)
  );
  return filtered.length > 0 ? filtered : (['name', 'email'] as AddressExperienceField[]);
};

export function ContactForm({
  onSubmit,
  fields,
  required,
  message,
  initialValues,
  variant = 'card',
  formId,
  showSubmitButton = true
}: ContactFormProps) {
  const { t } = useTranslation('common');
  const { currentPractice } = usePracticeManagement();

  const normalizedFields = useMemo(() => normalizeFields(fields), [fields]);
  const normalizedRequired = useMemo(
    () => normalizeRequired(normalizedFields, required),
    [normalizedFields, required]
  );

  const labels = {
    name: t('forms.labels.name'),
    email: t('forms.labels.email'),
    phone: t('forms.labels.phone'),
    address: t('forms.contactForm.location'),
    opposingParty: t('forms.contactForm.opposingParty'),
    description: t('forms.contactForm.description'),
  };

  const placeholders = {
    name: t('forms.placeholders.name'),
    email: t('forms.placeholders.email'),
    phone: t('forms.placeholders.phone'),
    address: t('forms.contactForm.placeholders.location'),
    opposingParty: t('forms.contactForm.placeholders.opposingParty'),
    description: t('forms.contactForm.placeholders.description'),
  };

  return (
    <AddressExperienceForm
      onSubmit={onSubmit as (data: AddressExperienceData) => void | Promise<void>}
      fields={normalizedFields}
      required={normalizedRequired}
      message={message}
      initialValues={initialValues}
      variant={variant}
      formId={formId}
      showSubmitButton={showSubmitButton}
      submitLabel={t('forms.contactForm.submit')}
      labels={labels}
      placeholders={placeholders}
      addressOptions={{
        country: currentPractice?.country || undefined,
        showCountry: !currentPractice?.country,
        validationLevel: 'loose',
        enableAutocomplete: true,
      }}
    />
  );
}
