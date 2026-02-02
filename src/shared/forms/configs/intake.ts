import { intakeSchema, intakeMinimalSchema, intakeWithPhoneSchema, intakeWithAddressSchema, intakeFullSchema } from '@/shared/schemas/ui';
import { getDefaultValues } from '../fieldRegistry';
import type { IntakeFormState } from '@/shared/types/ui';

// Form configurations for intake forms
export const INTAKE_FORM_CONFIGS = {
  // Minimal intake form (name + email only)
  minimal: {
    schema: intakeMinimalSchema,
    fields: ['name', 'email'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email']),
  },
  
  // With phone
  withPhone: {
    schema: intakeWithPhoneSchema,
    fields: ['name', 'email', 'phone'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone']),
  },
  
  // With address
  withAddress: {
    schema: intakeWithAddressSchema,
    fields: ['name', 'email', 'phone', 'address'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone', 'address']),
  },
  
  // Full intake form
  full: {
    schema: intakeFullSchema,
    fields: ['name', 'email', 'phone', 'address', 'opposingParty', 'description'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone', 'address', 'opposingParty', 'description']),
  },
} as const;

// Dynamic form config for intake (based on field list)
export function createIntakeFormConfig(fieldIds: string[]) {
  // Determine which schema to use based on fields
  let schema = intakeMinimalSchema;
  
  if (fieldIds.includes('phone') && fieldIds.includes('address')) {
    schema = intakeWithAddressSchema;
  } else if (fieldIds.includes('phone')) {
    schema = intakeWithPhoneSchema;
  } else if (fieldIds.includes('address')) {
    schema = intakeWithAddressSchema;
  }
  
  // Add optional fields if present
  if (fieldIds.includes('opposingParty') || fieldIds.includes('description')) {
    schema = intakeFullSchema;
  }
  
  return {
    schema,
    fields: fieldIds,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(fieldIds),
  };
}

export type IntakeFormConfig = typeof INTAKE_FORM_CONFIGS[keyof typeof INTAKE_FORM_CONFIGS];
export type IntakeFormConfigKey = keyof typeof INTAKE_FORM_CONFIGS;
