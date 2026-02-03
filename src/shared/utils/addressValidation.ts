/**
 * Address validation utilities
 * 
 * Provides two levels of validation:
 * - Loose: For intake forms (accepts partial addresses, validates formats/lengths)
 * - Strict: For practice/client records (requires complete addresses)
 */

import type { Address, AddressValidationResult, AddressValidationLevel } from '@/shared/types/address';

// Validation constants
const MAX_FIELD_LENGTHS = {
  address: 100,
  apartment: 100,
  city: 50,
  state: 50,
  postalCode: 20,
  country: 2,
} as const;

const ISO2_COUNTRY_REGEX = /^[A-Z]{2}$/;
const US_POSTAL_CODE_REGEX = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_CODE_REGEX = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
const GENERAL_POSTAL_CODE_REGEX = /^[\w\s-]{3,20}$/;

// Error codes
const ERROR_CODES = {
  REQUIRED: 'REQUIRED',
  TOO_LONG: 'TOO_LONG',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_COUNTRY: 'INVALID_COUNTRY',
  INVALID_POSTAL_CODE: 'INVALID_POSTAL_CODE',
} as const;

// Error messages
const ERROR_MESSAGES = {
  [ERROR_CODES.REQUIRED]: 'This field is required',
  [ERROR_CODES.TOO_LONG]: `Must be ${MAX_FIELD_LENGTHS.address} characters or less`,
  [ERROR_CODES.INVALID_FORMAT]: 'Invalid format',
  [ERROR_CODES.INVALID_COUNTRY]: 'Must be a valid 2-letter country code',
  [ERROR_CODES.INVALID_POSTAL_CODE]: 'Invalid postal code format',
} as const;

/**
 * Validate a single address field
 */
function validateField(
  field: keyof Address,
  value: string,
  isRequired: boolean,
  level: AddressValidationLevel,
  address?: Partial<Address>
): { isValid: boolean; error?: { code: string; message: string } } {
  const trimmedValue = value.trim();
  
  // Check if required and empty
  if (isRequired && !trimmedValue) {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.REQUIRED,
        message: ERROR_MESSAGES[ERROR_CODES.REQUIRED],
      },
    };
  }
  
  // Skip further validation if field is empty and not required
  if (!trimmedValue) {
    return { isValid: true };
  }
  
  // Check max length
  const maxLength = MAX_FIELD_LENGTHS[field];
  if (trimmedValue.length > maxLength) {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.TOO_LONG,
        message: `Must be ${maxLength} characters or less`,
      },
    };
  }
  
  // Field-specific validation
  switch (field) {
    case 'country': {
      // Strict validation requires exact 2-letter country codes
      const normalizedCountry = trimmedValue.toUpperCase();
      if (level === 'strict' && !ISO2_COUNTRY_REGEX.test(normalizedCountry)) {
        return {
          isValid: false,
          error: {
            code: ERROR_CODES.INVALID_COUNTRY,
            message: ERROR_MESSAGES[ERROR_CODES.INVALID_COUNTRY],
          },
        };
      }
      // Loose validation allows more flexible country formats
      if (level === 'loose' && trimmedValue.length < 2) {
        return {
          isValid: false,
          error: {
            code: ERROR_CODES.INVALID_COUNTRY,
            message: ERROR_MESSAGES[ERROR_CODES.INVALID_COUNTRY],
          },
        };
      }
      break;
    }
      
    case 'postalCode':
      // Pass country from address for proper postal code validation
      if (!validatePostalCode(trimmedValue, address?.country || '')) {
        return {
          isValid: false,
          error: {
            code: ERROR_CODES.INVALID_POSTAL_CODE,
            message: ERROR_MESSAGES[ERROR_CODES.INVALID_POSTAL_CODE],
          },
        };
      }
      break;
  }
  
  return { isValid: true };
}

/**
 * Validate postal code based on country
 */
function validatePostalCode(postalCode: string, originalCountry: string): boolean {
  const trimmedPostal = postalCode.trim().toUpperCase();
  
  // Derive country properly, defaulting to lenient validation if empty
  const country = originalCountry?.trim().toUpperCase();
  if (!country) {
    return GENERAL_POSTAL_CODE_REGEX.test(trimmedPostal);
  }
  
  switch (country) {
    case 'US':
      return US_POSTAL_CODE_REGEX.test(trimmedPostal);
    case 'CA':
      return CA_POSTAL_CODE_REGEX.test(trimmedPostal);
    default:
      // For other countries, use a more lenient regex
      return GENERAL_POSTAL_CODE_REGEX.test(trimmedPostal);
  }
}

/**
 * Loose address validation for intake forms
 * - All fields are optional
 * - Validates format and length when present
 */
export function validateAddressLoose(address: Partial<Address>): AddressValidationResult {
  const errors: AddressValidationResult['errors'] = [];
  
  // Validate all fields (none required for loose validation)
  const fields: (keyof Address)[] = ['address', 'apartment', 'city', 'state', 'postalCode', 'country'];
  
  for (const field of fields) {
    const value = address[field] || '';
    const result = validateField(field, value, false, 'loose', address);
    
    if (!result.isValid && result.error) {
      errors.push({
        field,
        message: result.error.message,
        code: result.error.code,
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    level: 'loose',
  };
}

/**
 * Strict address validation for practice/client records
 * - All fields except apartment are required
 * - Validates format and length
 */
export function validateAddressStrict(address: Partial<Address>): AddressValidationResult {
  const errors: AddressValidationResult['errors'] = [];
  
  // Required fields for strict validation
  const requiredFields: (keyof Address)[] = ['address', 'city', 'state', 'postalCode', 'country'];
  const optionalFields: (keyof Address)[] = ['apartment'];
  
  // Validate required fields
  for (const field of requiredFields) {
    const value = address[field] || '';
    const result = validateField(field, value, true, 'strict', address);
    
    if (!result.isValid && result.error) {
      errors.push({
        field,
        message: result.error.message,
        code: result.error.code,
      });
    }
  }
  
  // Validate optional fields
  for (const field of optionalFields) {
    const value = address[field] || '';
    const result = validateField(field, value, false, 'strict', address);
    
    if (!result.isValid && result.error) {
      errors.push({
        field,
        message: result.error.message,
        code: result.error.code,
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    level: 'strict',
  };
}

/**
 * Get validation error message for a specific field
 */
export function getFieldErrorMessage(
  address: Partial<Address>,
  field: keyof Address,
  level: AddressValidationLevel
): string | undefined {
  const result = level === 'strict' ? validateAddressStrict(address) : validateAddressLoose(address);
  const error = result.errors.find(err => err.field === field);
  return error?.message;
}

/**
 * Check if address field has an error
 */
export function hasFieldError(
  address: Partial<Address>,
  field: keyof Address,
  level: AddressValidationLevel
): boolean {
  const result = level === 'strict' ? validateAddressStrict(address) : validateAddressLoose(address);
  return result.errors.some(err => err.field === field);
}

/**
 * Validate and normalize address in one step
 */
export function validateAndNormalizeAddress(
  address: Partial<Address>,
  level: AddressValidationLevel
): { address: Partial<Address>; validation: AddressValidationResult } {
  // First normalize the address
  const normalized = {
    address: address.address?.trim() || '',
    apartment: address.apartment?.trim() || undefined,
    city: address.city?.trim() || '',
    state: address.state?.trim() || '',
    postalCode: address.postalCode?.trim() || '',
    country: address.country?.trim().toUpperCase() || '',
  };
  
  // Then validate
  const validation = level === 'strict' 
    ? validateAddressStrict(normalized)
    : validateAddressLoose(normalized);
  
  return {
    address: normalized,
    validation,
  };
}
