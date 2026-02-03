// Re-export shared UI types for worker usage
export type { Address, AddressSuggestion } from '../../src/shared/types/address';

// Autocomplete API response types
export interface AutocompleteResponse {
  suggestions: import('../../src/shared/types/address').AddressSuggestion[];
}

export interface AutocompleteError {
  code: 'AUTOCOMPLETE_DISABLED' | 'UPSTREAM_ERROR' | 'INVALID_REQUEST' | 'RATE_LIMITED' | 'SERVICE_UNAVAILABLE' | 'MISSING_CLIENT_IP';
}
