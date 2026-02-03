import { PracticeMinimalSchema, PracticeWithPhoneSchema, PracticeFullSchema } from '@/shared/schemas/practice';
import { getDefaultValues } from '../fieldRegistry';

// Form configurations for practice forms
export const PRACTICE_FORM_CONFIGS = {
  // Minimal practice form (business email only)
  minimal: {
    schema: PracticeMinimalSchema,
    fields: ['businessEmail'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['businessEmail']),
  },
  
  // With phone
  withPhone: {
    schema: PracticeWithPhoneSchema,
    fields: ['businessEmail', 'contactPhone'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['businessEmail', 'contactPhone']),
  },
  
  // Full practice form
  full: {
    schema: PracticeFullSchema,
    fields: ['businessEmail', 'contactPhone', 'address'],
    layout: 'stacked' as const,
    initialValues: () => getDefaultValues(['businessEmail', 'contactPhone', 'address']),
  },
} as const;

export type PracticeFormConfig = typeof PRACTICE_FORM_CONFIGS[keyof typeof PRACTICE_FORM_CONFIGS];
export type PracticeFormConfigKey = keyof typeof PRACTICE_FORM_CONFIGS;
