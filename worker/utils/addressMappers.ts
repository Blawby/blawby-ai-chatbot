/**
 * Address data transformation utilities for Worker
 * 
 * Provides deterministic mapping between frontend and backend address formats,
 * plus Geoapify response parsing.
 */

import type { Address, AddressSuggestion } from '../types/address';

// Geoapify feature properties to Address mapper
export function fromGeoapifyFeature(feature: any): Address {
  const properties = feature?.properties || {};
  const geometry = feature?.geometry || {};
  
  // Extract line1 with fallbacks
  let line1 = '';
  if (properties.housenumber && properties.street) {
    line1 = `${properties.housenumber} ${properties.street}`.trim();
  } else if (properties.name) {
    line1 = properties.name;
  } else if (properties.formatted) {
    line1 = properties.formatted.split(',')[0].trim();
  }

  // Extract city with fallbacks
  const city = properties.city || properties.town || properties.village || properties.county || '';

  // Extract state with fallbacks
  const state = properties.state || properties.region || '';

  // Extract postal code
  const postalCode = properties.postcode || '';

  // Extract country code
  const country = (properties.country_code || '').toUpperCase();

  return {
    line1: line1.trim(),
    city: city.trim(),
    state: state.trim(),
    postalCode: postalCode.trim(),
    country: country.trim() || 'US', // Default to US if not provided
  };
}

// Geoapify response to AddressSuggestion mapper
export function fromGeoapifyResponse(feature: any): AddressSuggestion {
  const address = fromGeoapifyFeature(feature);
  const properties = feature?.properties || {};
  const geometry = feature?.geometry || {};
  
  // Generate ID
  const id = properties.place_id || generateHashId(properties.formatted, geometry.coordinates);
  
  // Use formatted address as label
  const label = properties.formatted || `${address.line1}, ${address.city}, ${address.state} ${address.postalCode}`;
  
  return {
    id,
    label,
    address,
    formatted: properties.formatted || label,
    lat: geometry.coordinates?.[1],
    lon: geometry.coordinates?.[0],
  };
}

// Generate deterministic hash ID from coordinates and formatted address
function generateHashId(formatted?: string, coordinates?: number[]): string {
  const data = `${formatted || ''}|${coordinates?.[0] || ''}|${coordinates?.[1] || ''}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
