import { z } from 'zod';
import { addressLooseSchema } from '@/shared/ui/validation/schemas/address';

// Base intake schema
export const IntakeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  address: addressLooseSchema.optional(),
  opposingParty: z.string().optional(),
  description: z.string().optional(),
});

// Form variants using pick/partial
export const IntakeMinimalSchema = IntakeSchema.pick({
  name: true,
  email: true,
});

export const IntakeWithPhoneSchema = IntakeSchema.pick({
  name: true,
  email: true,
  phone: true,
});

export const IntakeWithAddressSchema = IntakeSchema.pick({
  name: true,
  email: true,
  phone: true,
  address: true,
});

export const IntakeFullSchema = IntakeSchema;

// Type inference
export type IntakeFormData = z.infer<typeof IntakeSchema>;
export type IntakeMinimalFormData = z.infer<typeof IntakeMinimalSchema>;
export type IntakeWithPhoneFormData = z.infer<typeof IntakeWithPhoneSchema>;
export type IntakeWithAddressFormData = z.infer<typeof IntakeWithAddressSchema>;
export type IntakeFullFormData = z.infer<typeof IntakeFullSchema>;
