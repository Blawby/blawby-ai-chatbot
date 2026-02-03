/**
 * Geoapify API integration utilities
 */

import { fromGeoapifyResponse } from '../../src/shared/mapping/addressMapping';
import type { AddressSuggestion, AutocompleteError } from '../types/ui';
import type { Address } from '../types/ui';

export interface GeoapifyAutocompleteOptions {
  text: string;
  limit?: number;
  lang?: string;
  country?: string;
  type?: string;
  apiKey: string;
  bias?: {
    lat: number;
    lon: number;
    radius: number;
  };
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
 * Call Geoapify autocomplete API with multi-pass fallback
 */
export async function callGeoapifyAutocompleteMultiPass(
  options: GeoapifyAutocompleteOptions,
  env?: { DEBUG_GEO?: string }
): Promise<{ suggestions: AddressSuggestion[] } | AutocompleteError> {
  const { text, limit = 5, lang = 'en', country, type, apiKey, bias } = options;
  
  if (env?.DEBUG_GEO === '1') {
    console.log('[Geoapify MultiPass] Starting multi-pass search for length:', text.length);
  }
  
  const allSuggestions: AddressSuggestion[] = [];
  const seenKeys = new Set<string>();
  
  // Helper to dedupe and add suggestions
  const addSuggestions = (newSuggestions: AddressSuggestion[]) => {
    for (const suggestion of newSuggestions) {
      let dedupeKey = suggestion.dedupeKey || suggestion.placeId;
      
      // Create robust fallback key if both dedupeKey and placeId are missing
      if (!dedupeKey) {
        const addressStr = `${suggestion.address.address || ''},${suggestion.address.city || ''},${suggestion.address.state || ''},${suggestion.address.postalCode || ''},${suggestion.address.country || ''}`;
        const fallbackParts = [
          addressStr,
          suggestion.lat?.toString(),
          suggestion.lon?.toString(),
          suggestion.label
        ].filter(Boolean);
        
        dedupeKey = fallbackParts.length > 0 
          ? fallbackParts.join('|').toLowerCase()
          : Math.random().toString(36).substr(2, 9); // Last resort random key
      }
      
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        allSuggestions.push(suggestion);
      }
    }
  };
  
  // Helper to rank suggestions
  const rankSuggestions = (suggestions: AddressSuggestion[]) => {
    const typeOrder = {
      'building': 1,
      'amenity': 2, 
      'street': 3,
      'postcode': 4,
      'city': 5,
      'state': 6,
      'country': 7,
      'locality': 8,
      'other': 9
    };
    
    return suggestions.sort((a, b) => {
      // Primary: result type bucket order
      const aType = a.properties?.result_type || 'other';
      const bType = b.properties?.result_type || 'other';
      const typeDiff = (typeOrder[aType] || 9) - (typeOrder[bType] || 9);
      if (typeDiff !== 0) return typeDiff;
      
      // Secondary: match type order
      const matchOrder = {
        'full_match': 1,
        'match_by_building': 2,
        'match_by_street': 3,
        'match_by_postcode': 4,
        'match_by_city_or_district': 5,
        'match_by_country_or_state': 6
      };
      const aMatch = a.properties?.match_type || 'other';
      const bMatch = b.properties?.match_type || 'other';
      const matchDiff = (matchOrder[aMatch] || 7) - (matchOrder[bMatch] || 7);
      if (matchDiff !== 0) return matchDiff;
      
      // Tertiary: confidence descending
      const aConfidence = a.properties?.confidence || 0;
      const bConfidence = b.properties?.confidence || 0;
      return bConfidence - aConfidence;
    });
  };
  
  try {
    // Pass 1: Default (building matches)
    console.log('[Geoapify MultiPass] Pass 1: Default search');
    const pass1Result = await callGeoapifyAutocomplete({
      text,
      limit: 12, // Explicit upstream limit
      lang,
      country,
      type: undefined, // Default
      apiKey,
      bias
    }, env);
    
    if ('code' in pass1Result) {
      return pass1Result;
    }
    
    addSuggestions(pass1Result.suggestions);
    console.log('[Geoapify MultiPass] Pass 1 collected:', allSuggestions.length);
    
    // If we have enough results, rank them all and slice the best ones
    if (allSuggestions.length >= limit) {
      const rankedSuggestions = rankSuggestions(allSuggestions);
      const finalSuggestions = rankedSuggestions.slice(0, limit);
      console.log('[Geoapify MultiPass] Early return after Pass 1:', finalSuggestions.length);
      return { suggestions: finalSuggestions };
    }
    
    // Pass 2 & 4: Parallel street and locality suggestions
    console.log('[Geoapify MultiPass] Pass 2&4: Parallel street + locality');
    const textForLocality = /^\s*\d+\b/.test(text) ? 
      text.replace(/^\s*\d+\s+/, '') : text;
    
    const [pass2Result, pass4Result] = await Promise.all([
      callGeoapifyAutocomplete({
        text,
        limit: 10, // Explicit upstream limit
        lang,
        country,
        type: 'street',
        apiKey,
        bias
      }, env),
      callGeoapifyAutocomplete({
        text: textForLocality,
        limit: 8, // Explicit upstream limit
        lang,
        country,
        type: 'locality',
        apiKey,
        bias
      }, env)
    ]);
    
    if (!('code' in pass2Result)) {
      addSuggestions(pass2Result.suggestions);
      console.log('[Geoapify MultiPass] Pass 2 collected:', allSuggestions.length);
    }
    
    if (!('code' in pass4Result)) {
      addSuggestions(pass4Result.suggestions);
      console.log('[Geoapify MultiPass] Pass 4 collected:', allSuggestions.length);
    }
    
    // Pass 3: Remove housenumber, street suggestions (only if still short)
    if (allSuggestions.length < limit) {
      const hasHouseNumber = /^\s*\d+\b/.test(text);
      if (hasHouseNumber) {
        const textWithoutHouseNumber = text.replace(/^\s*\d+\s+/, '');
        console.log('[Geoapify MultiPass] Pass 3: Street suggestions without housenumber:', textWithoutHouseNumber);
        
        const pass3Result = await callGeoapifyAutocomplete({
          text: textWithoutHouseNumber,
          limit: 8, // Explicit upstream limit
          lang,
          country,
          type: 'street',
          apiKey,
          bias
        }, env);
        
        if (!('code' in pass3Result)) {
          addSuggestions(pass3Result.suggestions);
          console.log('[Geoapify MultiPass] Pass 3 collected:', allSuggestions.length);
        }
      }
    }
    
    // Rank and limit results
    const rankedSuggestions = rankSuggestions(allSuggestions);
    const finalSuggestions = rankedSuggestions.slice(0, limit);
    
    console.log('[Geoapify MultiPass] Final results:', finalSuggestions.length, 'from', allSuggestions.length, 'total');
    
    return { suggestions: finalSuggestions };
    
  } catch (error) {
    console.error('[Geoapify MultiPass] Error:', error);
    return { code: 'UPSTREAM_ERROR' };
  }
}

/**
 * Call Geoapify autocomplete API (single pass)
 */
// Helper to sanitize URLs by removing API keys for logging
function sanitizeUrlForLogging(url: URL): string {
  const sanitized = new URL(url);
  // Remove common API key parameters
  sanitized.searchParams.delete('apiKey');
  sanitized.searchParams.delete('key');
  sanitized.searchParams.delete('api_key');
  return sanitized.toString();
}

export async function callGeoapifyAutocomplete(
  options: GeoapifyAutocompleteOptions,
  env?: { DEBUG_GEO?: string }
): Promise<{ suggestions: AddressSuggestion[] } | AutocompleteError> {
  const { text, limit = 5, lang = 'en', country, type, apiKey, bias } = options;
  
  // Build request URL - use explicit upstream limit directly
  const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text', text);
  url.searchParams.set('limit', limit.toString()); // Use limit directly, no multiplication
  url.searchParams.set('lang', lang);
  url.searchParams.set('apiKey', apiKey);
  
  // Add type if specified
  if (type) {
    url.searchParams.set('type', type);
  }
  
  // Add bias to return more diverse results
  if (country) {
    url.searchParams.set('filter', `countrycode:${country.toLowerCase()}`);
  }
  
  // Add location bias if available
  if (bias) {
    // Geoapify supports circle bias with format: circle:lon,lat,radiusMeters
    url.searchParams.set('bias', `circle:${bias.lon},${bias.lat},${bias.radius}`);
    if (env?.DEBUG_GEO === '1') {
      console.log('[Geoapify] Added location bias:', bias);
    }
  }
  
  if (env?.DEBUG_GEO === '1') {
    console.log('[Geoapify] Request URL:', sanitizeUrlForLogging(url));
  }
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Geoapify] API error:', response.status, response.statusText);
      console.error('[Geoapify] Error response:', errorText);
      console.error('[Geoapify] Request URL:', sanitizeUrlForLogging(url));
      return { code: 'UPSTREAM_ERROR' };
    }
    
    const data: GeoapifyResponse = await response.json();
    
    if (env?.DEBUG_GEO === '1') {
      console.log('[Geoapify] Raw response:', JSON.stringify(data, null, 2));
    }
    
    if (!data.features || !Array.isArray(data.features)) {
      console.error('[Geoapify] Invalid response format:', data);
      return { code: 'UPSTREAM_ERROR' };
    }
    
    if (env?.DEBUG_GEO === '1') {
      console.log('[Geoapify] Features count:', data.features.length);
    }
    
    // Convert Geoapify features to our address suggestions
    const suggestions = data.features
      .map(feature => fromGeoapifyResponse(feature))
      .filter(suggestion => {
        // More lenient filtering - accept if it has any address-like content
        const hasAddress = suggestion.address.address || 
                          suggestion.address.city || 
                          suggestion.address.state ||
                          suggestion.address.postalCode;
        return hasAddress;
      });
    
    if (env?.DEBUG_GEO === '1') {
      console.log('[Geoapify] Final suggestions:', suggestions.length);
    }
    
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
  minChars: number = 3,
  env?: { DEBUG_GEO?: string }
): { valid: boolean; error?: AutocompleteError } {
  const isDebug = env?.DEBUG_GEO === '1';
  if (isDebug) {
    console.log('[Validation] Input:', { textLength: text?.length, textType: typeof text, minChars });
  }
  
  // Validate text parameter
  if (!text || typeof text !== 'string') {
    if (isDebug) console.log('[Validation] Failed: text validation');
    return { valid: false, error: { code: 'INVALID_REQUEST' } };
  }
  
  const trimmedText = text.trim();
  if (trimmedText.length < minChars) {
    if (isDebug) {
      console.log('[Validation] Failed: minChars validation', { 
        trimmedLength: trimmedText.length, 
        minChars 
      });
    }
    return { valid: false, error: { code: 'INVALID_REQUEST' } };
  }
  
  if (isDebug) console.log('[Validation] Passed: text validation');
  
  // Validate limit parameter
  if (limit !== null) {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) {
      return { valid: false, error: { code: 'INVALID_REQUEST' } };
    }
  }
  
  // Validate country parameter (if provided)
  if (country !== null && typeof country === 'string' && country.trim()) {
    if (country.length !== 2) {
      return { valid: false, error: { code: 'INVALID_REQUEST' } };
    }
  }
  
  return { valid: true };
}
