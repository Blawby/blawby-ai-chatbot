import { z } from 'zod';
import { addressLooseSchema } from '@/shared/ui/validation/schemas/address';
import type { PracticePayload } from '../types/domains';

// Base practice schema
export const PracticeSchema = z.object({
  businessEmail: z.string().email('Valid business email is required'),
  contactPhone: z.string().optional(),
  address: addressLooseSchema.optional(),
});

// Form variants
export const PracticeMinimalSchema = PracticeSchema.pick({
  businessEmail: true,
});

export const PracticeWithPhoneSchema = PracticeSchema.pick({
  businessEmail: true,
  contactPhone: true,
});

export const PracticeFullSchema = PracticeSchema;

// Type inference
export type PracticeFormData = z.infer<typeof PracticeSchema>;
export type PracticeMinimalFormData = z.infer<typeof PracticeMinimalSchema>;
export type PracticeWithPhoneFormData = z.infer<typeof PracticeWithPhoneSchema>;
export type PracticeFullFormData = z.infer<typeof PracticeFullSchema>;
