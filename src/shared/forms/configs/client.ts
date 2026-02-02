import { ClientSchema, ClientMinimalSchema, ClientWithPhoneSchema, ClientFullSchema } from '@/shared/schemas/client';
import { getDefaultValues } from '../fieldRegistry';
import type { ClientFormState } from '@/shared/types/domains';

// Form configurations for client forms
export const CLIENT_FORM_CONFIGS = {
  // Minimal client form (name + email only)
  minimal: {
    schema: ClientMinimalSchema,
    fields: ['name', 'email'],
    layout: 'grid' as const,
    initialValues: () => getDefaultValues(['name', 'email']),
  },
  
  // With phone
  withPhone: {
    schema: ClientWithPhoneSchema,
    fields: ['name', 'email', 'phone'],
    layout: 'grid' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone']),
  },
  
  // Full client form
  full: {
    schema: ClientFullSchema,
    fields: ['name', 'email', 'phone', 'status', 'currency', 'address'],
    layout: 'grid' as const,
    initialValues: () => getDefaultValues(['name', 'email', 'phone', 'status', 'currency', 'address']),
  },
} as const;

export type ClientFormConfig = typeof CLIENT_FORM_CONFIGS[keyof typeof CLIENT_FORM_CONFIGS];
export type ClientFormConfigKey = keyof typeof CLIENT_FORM_CONFIGS;
