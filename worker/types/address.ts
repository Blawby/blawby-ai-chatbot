/**
 * Address types for Worker (copied from frontend to avoid import issues)
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
