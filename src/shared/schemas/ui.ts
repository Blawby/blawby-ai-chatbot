import { z } from 'zod';

// Address schema (canonical UI type)
export const addressSchema = z.object({
  address: z.string().min(1, 'Street address is required'),
  apartment: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().min(2, 'Country must be 2 characters').regex(/^[A-Z]{2}$/, 'Country must be a valid 2-letter country code'),
});

// Intake form schemas
export const intakeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  address: addressSchema.optional(),
  opposingParty: z.string().optional(),
  description: z.string().optional(),
});

// Form variants using pick/partial
export const intakeMinimalSchema = intakeSchema.pick({
  name: true,
  email: true,
});

export const intakeWithPhoneSchema = intakeSchema.pick({
  name: true,
  email: true,
  phone: true,
});

export const intakeWithAddressSchema = intakeSchema.pick({
  name: true,
  email: true,
  phone: true,
  address: true,
});

export const intakeFullSchema = intakeSchema;

// Client form schemas
export const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']),
  currency: z.enum(['usd', 'cad', 'eur', 'gbp']),
  address: addressSchema.optional(),
});

// Practice form schemas
export const practiceSchema = z.object({
  businessEmail: z.string().email('Valid business email is required'),
  contactPhone: z.string().optional(),
  address: addressSchema.optional(),
});

// Type inference
export type AddressFormData = z.infer<typeof addressSchema>;
export type IntakeFormData = z.infer<typeof intakeSchema>;
export type ClientFormData = z.infer<typeof clientSchema>;
export type PracticeFormData = z.infer<typeof practiceSchema>;
