import { z } from 'zod';
import type { AddressApi } from '../types/api';

// Address API schema (backend wire format)
export const addressApiSchema = z.object({
  line1: z.string().min(1, 'Street address is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postal_code: z.string().min(1, 'Postal code is required'),
  country: z.string().min(2, 'Country must be 2 characters').regex(/^[A-Z]{2}$/, 'Country must be a valid 2-letter country code'),
});

// API request schemas (backend validation)
export const createIntakeRequestApiSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  address: addressApiSchema.optional(),
  opposing_party: z.string().optional(),
  description: z.string().optional(),
});

export const createClientRequestApiSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']),
  currency: z.enum(['usd', 'cad', 'eur', 'gbp']),
  address: addressApiSchema.optional(),
});

export const updateClientRequestApiSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Valid email is required').optional(),
  phone: z.string().optional(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']).optional(),
  currency: z.enum(['usd', 'cad', 'eur', 'gbp']).optional(),
  address: addressApiSchema.optional(),
});

export const createPracticeRequestApiSchema = z.object({
  business_email: z.string().email('Valid business email is required'),
  contact_phone: z.string().optional(),
  address: addressApiSchema.optional(),
});

export const updatePracticeRequestApiSchema = z.object({
  business_email: z.string().email('Valid business email is required').optional(),
  contact_phone: z.string().optional(),
  address: addressApiSchema.optional(),
});

// Type inference
export type AddressApiFormData = z.infer<typeof addressApiSchema>;
export type CreateIntakeRequestApiFormData = z.infer<typeof createIntakeRequestApiSchema>;
export type CreateClientRequestApiFormData = z.infer<typeof createClientRequestApiSchema>;
export type UpdateClientRequestApiFormData = z.infer<typeof updateClientRequestApiSchema>;
export type CreatePracticeRequestApiFormData = z.infer<typeof createPracticeRequestApiSchema>;
export type UpdatePracticeRequestApiFormData = z.infer<typeof updatePracticeRequestApiSchema>;
