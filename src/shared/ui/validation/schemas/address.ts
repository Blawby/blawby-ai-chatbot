/**
 * Address validation schemas using Zod
 */

import { z } from 'zod';
import type { Address } from '@/shared/types/address';

// Base address field schemas
const line1Schema = z.string()
  .min(1, 'Street address is required')
  .max(100, 'Street address must be 100 characters or less')
  .trim();

const line2Schema = z.string()
  .max(100, 'Address line 2 must be 100 characters or less')
  .trim()
  .optional();

const citySchema = z.string()
  .min(1, 'City is required')
  .max(50, 'City must be 50 characters or less')
  .trim();

const stateSchema = z.string()
  .min(1, 'State is required')
  .max(50, 'State must be 50 characters or less')
  .trim();

const postalCodeSchema = z.string()
  .min(1, 'Postal code is required')
  .max(20, 'Postal code must be 20 characters or less')
  .trim()
  .regex(/^[A-Z0-9\s-]+$/i, 'Invalid postal code format');

const countrySchema = z.string()
  .min(1, 'Country is required')
  .max(2, 'Country must be 2 characters')
  .regex(/^[A-Z]{2}$/i, 'Country must be a valid 2-letter country code')
  .transform(val => val.toUpperCase());

// Loose validation schema - all fields optional, validates format when present
export const addressLooseSchema = z.object({
  line1: line1Schema.optional(),
  line2: line2Schema,
  city: citySchema.optional(),
  state: stateSchema.optional(),
  postalCode: postalCodeSchema.optional(),
  country: countrySchema.optional(),
}).refine(
  (data) => {
    // At least one field should be present for loose validation
    return Object.values(data).some(value => value && value.trim().length > 0);
  },
  {
    message: 'At least one address field must be provided',
  }
);

// Strict validation schema - all required fields except line2
export const addressStrictSchema = z.object({
  line1: line1Schema,
  line2: line2Schema,
  city: citySchema,
  state: stateSchema,
  postalCode: postalCodeSchema,
  country: countrySchema,
});

// Strict schema with country-specific postal code validation
export const addressStrictWithCountrySchema = z.object({
  line1: line1Schema,
  line2: line2Schema,
  city: citySchema,
  state: stateSchema,
  postalCode: postalCodeSchema,
  country: countrySchema,
}).refine(
  (data) => {
    // Enhanced postal code validation based on country
    const { postalCode, country } = data;
    const normalizedVal = postalCode.toUpperCase();
    
    switch (country) {
      case 'US':
        return /^\d{5}(-\d{4})?$/.test(normalizedVal);
      case 'CA':
        return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(normalizedVal);
      default:
        return /^[\w\s-]{3,20}$/.test(normalizedVal);
    }
  },
  {
    message: 'Invalid postal code format for the selected country',
    path: ['postalCode']
  }
);

// Type exports
export type AddressLooseInput = z.infer<typeof addressLooseSchema>;
export type AddressStrictInput = z.infer<typeof addressStrictSchema>;
export type AddressStrictWithCountryInput = z.infer<typeof addressStrictWithCountrySchema>;

// Helper functions to convert between types
export function toAddress(input: AddressStrictInput): Address {
  return {
    line1: input.line1,
    line2: input.line2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country,
  };
}

export function toPartialAddress(input: AddressLooseInput): Partial<Address> {
  return {
    line1: input.line1,
    line2: input.line2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country,
  };
}

// Validation error formatter
export function formatAddressErrors(error: z.ZodIssue[]): Record<string, string> {
  const formattedErrors: Record<string, string> = {};
  
  error.forEach((err) => {
    const path = err.path.join('.');
    if (path) {
      formattedErrors[path] = err.message;
    }
  });
  
  return formattedErrors;
}
