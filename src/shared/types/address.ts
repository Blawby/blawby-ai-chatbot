/**
 * Canonical address types for the Blawby platform
 * 
 * This file defines the single source of truth for address data structures
 * across frontend, backend, and API boundaries.
 */

// Frontend type - camelCase, used in UI and local state
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO-2 uppercase
}

// Backend wire type - snake_case, used in API requests/responses
export interface AddressApi {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string; // ISO-2 uppercase
}

// Address suggestion from autocomplete API
export interface AddressSuggestion {
  id: string;
  label: string;
  address: Address;
  formatted: string;
  lat?: number;
  lon?: number;
}

// Autocomplete API response
export interface AutocompleteResponse {
  suggestions: AddressSuggestion[];
}

// Autocomplete API error responses
export interface AutocompleteError {
  code: 'INVALID_REQUEST' | 'AUTOCOMPLETE_DISABLED' | 'UPSTREAM_ERROR';
}

// Jurisdiction configuration for practices
export interface SupportedJurisdiction {
  country: string; // ISO-2 uppercase
  state?: string;  // State code if country requires state-level jurisdiction
}

// Jurisdiction status for intakes
export type JurisdictionStatus = 
  | 'jurisdiction_unknown'
  | 'jurisdiction_out_of_scope'
  | 'jurisdiction_supported';

// Address validation levels
export type AddressValidationLevel = 'loose' | 'strict';

// Address validation result
export interface AddressValidationResult {
  isValid: boolean;
  errors: Array<{
    field: keyof Address;
    message: string;
    code: string;
  }>;
  level: AddressValidationLevel;
}

// Address source tracking
export type AddressSource = 'manual' | 'autocomplete';

// Address with metadata
export interface AddressWithMetadata extends Address {
  source?: AddressSource;
  validatedAt?: string;
  jurisdictionStatus?: JurisdictionStatus;
}
