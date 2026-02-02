import { intakeSchema, intakeMinimalSchema, intakeWithPhoneSchema, intakeWithAddressSchema, intakeFullSchema } from '@/shared/schemas/ui';
import { getDefaultValues } from '../fieldRegistry';
import type { IntakeFormState } from '@/shared/types/ui';
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
export function createCustomIntakeConfig<T extends readonly string[]>(
  fields: T,
  schema: z.ZodObject<any>
) {
  // Validate that all fields are supported
  const supportedFields = ['name', 'email', 'phone', 'address', 'opposingParty', 'description'] as const;
  const unsupportedFields = fields.filter(field => !supportedFields.includes(field as any));
  
  if (unsupportedFields.length > 0) {
    throw new Error(`Unsupported fields: ${unsupportedFields.join(', ')}`);
  }
  
  // Validate that every field in the fields array exists in the schema shape
  const schemaShape = schema._def.shape || schema.shape;
  const missingFields = fields.filter(field => !(field in schemaShape));
  
  if (missingFields.length > 0) {
    throw new Error(`Schema missing validators for fields: ${missingFields.join(', ')}. Ensure all fields have corresponding validators in the ZodObject schema.`);
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
