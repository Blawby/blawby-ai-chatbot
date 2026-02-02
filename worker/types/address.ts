/**
 * Address types for Worker (mirrors frontend types)
 * 
 * These types are used in the Cloudflare Worker environment and must
 * match the frontend types exactly to ensure type safety across the
 * frontend/backend boundary.
 */

// Frontend type - camelCase, used in UI and local state
export interface Address {
  address: string;
  apartment?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// Backend wire type - snake_case, used in API requests/responses
export interface AddressApi {
  address: string;
  apartment?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

// Address suggestion from autocomplete API (matches shared type)
export interface AddressSuggestion {
  id: string;
  label: string;
  address: Address;
  formatted: string;
  lat?: number;
  lon?: number;
  place_id?: string;
  dedupeKey?: string;
  properties?: {
    result_type?: string;
    match_type?: string;
    confidence?: number;
    rank?: {
      importance?: number;
      confidence?: number;
      confidence_street_level?: number;
      confidence_building_level?: number;
      match_type?: string;
    };
    datasource?: {
      sourcename?: string;
      attribution?: string;
      license?: string;
      url?: string;
    };
    country?: string;
    state?: string;
    city?: string;
    postcode?: string;
    [key: string]: any;
  };
}

// Autocomplete API response
export interface AutocompleteResponse {
  suggestions: AddressSuggestion[];
}

// Autocomplete API error responses
export interface AutocompleteError {
  code: 'INVALID_REQUEST' | 'AUTOCOMPLETE_DISABLED' | 'UPSTREAM_ERROR';
}
