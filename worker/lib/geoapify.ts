/**
 * Geoapify API integration utilities
 */

import { fromGeoapifyResponse } from '../utils/addressMappers';
import type { AddressSuggestion, AutocompleteError } from '../types/address';

export interface GeoapifyAutocompleteOptions {
  text: string;
  limit?: number;
  lang?: string;
  country?: string;
  apiKey: string;
}

export interface GeoapifyResponse {
  features: Array<{
    type: string;
    properties: {
      place_id?: string;
      name?: string;
      housenumber?: string;
      street?: string;
      city?: string;
      town?: string;
      village?: string;
      county?: string;
      state?: string;
      region?: string;
      postcode?: string;
      country_code?: string;
      formatted?: string;
    };
    geometry: {
      type: string;
      coordinates: [number, number]; // [lon, lat]
    };
  }>;
}

/**
 * Call Geoapify autocomplete API
 */
export async function callGeoapifyAutocomplete(
  options: GeoapifyAutocompleteOptions
): Promise<{ suggestions: AddressSuggestion[] } | AutocompleteError> {
  const { text, limit = 5, lang = 'en', country, apiKey } = options;
  
  // Build request URL
  const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text', text);
  url.searchParams.set('limit', Math.min(limit, 10).toString());
  url.searchParams.set('lang', lang);
  url.searchParams.set('apiKey', apiKey);
  
  if (country) {
    url.searchParams.set('filter', `countrycode:${country.toLowerCase()}`);
  }
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('[Geoapify] API error:', response.status, response.statusText);
      return { code: 'UPSTREAM_ERROR' };
    }
    
    const data: GeoapifyResponse = await response.json();
    
    if (!data.features || !Array.isArray(data.features)) {
      console.error('[Geoapify] Invalid response format:', data);
      return { code: 'UPSTREAM_ERROR' };
    }
    
    // Convert Geoapify features to our address suggestions
    const suggestions = data.features
      .slice(0, limit)
      .map(feature => fromGeoapifyResponse(feature))
      .filter(suggestion => suggestion.address.line1); // Filter out results without addresses
    
    return { suggestions };
    
  } catch (error) {
    console.error('[Geoapify] Request failed:', error);
    return { code: 'UPSTREAM_ERROR' };
  }
}

/**
 * Validate autocomplete request parameters
 */
export function validateAutocompleteRequest(
  text: string | null,
  limit: string | null,
  lang: string | null,
  country: string | null,
  minChars: number = 3
): { valid: boolean; error?: AutocompleteError } {
  // Validate text parameter
  if (!text || typeof text !== 'string') {
    return { valid: false, error: { code: 'INVALID_REQUEST' } };
  }
  
  if (text.length < minChars) {
    return { valid: false, error: { code: 'INVALID_REQUEST' } };
  }
  
  // Validate limit parameter
  if (limit !== null) {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) {
      return { valid: false, error: { code: 'INVALID_REQUEST' } };
    }
  }
  
  // Validate country parameter (if provided)
  if (country !== null) {
    if (typeof country !== 'string' || !/^[A-Z]{2}$/i.test(country)) {
      return { valid: false, error: { code: 'INVALID_REQUEST' } };
    }
  }
  
  return { valid: true };
}
