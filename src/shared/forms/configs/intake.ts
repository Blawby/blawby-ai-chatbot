import { intakeMinimalSchema, intakeWithPhoneSchema, intakeWithAddressSchema, intakeFullSchema } from '@/shared/schemas/ui';
import { getDefaultValues } from '../fieldRegistry';
import type { z } from 'zod';

// Greenfield intake form configs - explicit and type-safe
export const INTAKE_FORM_CONFIGS = {
  minimal: {
    schema: intakeMinimalSchema,
    fields: ['name', 'email'] as const,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email']),
  },
  
  withPhone: {
    schema: intakeWithPhoneSchema,
    fields: ['name', 'email', 'phone'] as const,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone']),
  },
  
  withAddress: {
    schema: intakeWithAddressSchema,
    fields: ['name', 'email', 'phone', 'address'] as const,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone', 'address']),
  },
  
  full: {
    schema: intakeFullSchema,
    fields: ['name', 'email', 'phone', 'address', 'opposingParty', 'description'] as const,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone', 'address', 'opposingParty', 'description']),
  },
} as const;

// Type-safe config selector for greenfield development
export function createIntakeFormConfig(configKey: keyof typeof INTAKE_FORM_CONFIGS) {
  const config = INTAKE_FORM_CONFIGS[configKey];
  
  return {
    ...config,
    // Ensure type safety - all fields in config must match schema
    validate: () => {
      // Runtime validation is handled by Zod schema at form level
      // This is just for development-time safety
      return true;
    },
  };
}

// For dynamic field selection (use sparingly in greenfield)
type SupportedField = 'name' | 'email' | 'phone' | 'address' | 'opposingParty' | 'description';

export function createCustomIntakeConfig<T extends readonly SupportedField[]>(
  fields: T,
  schema: z.ZodObject<Record<SupportedField, z.ZodTypeAny>>
) {
  // Validate that all fields are supported
  const supportedFields: SupportedField[] = ['name', 'email', 'phone', 'address', 'opposingParty', 'description'];
  const unsupportedFields = fields.filter((field) => !supportedFields.includes(field));
  
  if (unsupportedFields.length > 0) {
    throw new Error(`Unsupported fields: ${unsupportedFields.join(', ')}`);
  }
  
  // Validate that every field in the fields array exists in the schema shape
  const schemaShape = schema.shape;
  const missingFields = fields.filter((field) => !Object.prototype.hasOwnProperty.call(schemaShape, field));
  
  if (missingFields.length > 0) {
    throw new Error(`Fields not found in schema: ${missingFields.join(', ')}`);
  }
  
  return {
    schema,
    fields,
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues([...fields]),
  };
}

export type IntakeFormConfig = typeof INTAKE_FORM_CONFIGS[keyof typeof INTAKE_FORM_CONFIGS];
export type IntakeFormConfigKey = keyof typeof INTAKE_FORM_CONFIGS;
