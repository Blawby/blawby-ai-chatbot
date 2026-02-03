import { z } from 'zod';
import { addressLooseSchema } from '@/shared/ui/validation/schemas/address';

// Base client schema
export const ClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']),
  currency: z.enum(['usd', 'cad', 'eur', 'gbp']),
  address: addressLooseSchema.optional(),
});

// Form variants
export const ClientMinimalSchema = ClientSchema.pick({
  name: true,
  email: true,
});

export const ClientWithPhoneSchema = ClientSchema.pick({
  name: true,
  email: true,
  phone: true,
});

export const ClientFullSchema = ClientSchema;

// Type inference
export type ClientFormData = z.infer<typeof ClientSchema>;
export type ClientMinimalFormData = z.infer<typeof ClientMinimalSchema>;
export type ClientWithPhoneFormData = z.infer<typeof ClientWithPhoneSchema>;
export type ClientFullFormData = z.infer<typeof ClientFullSchema>;
