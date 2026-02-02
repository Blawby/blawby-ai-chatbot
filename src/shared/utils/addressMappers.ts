/**
 * Address data transformation utilities
 * 
 * Provides deterministic mapping between frontend and backend address formats,
 * plus Geoapify response parsing.
 */

import type { Address, AddressApi, AddressSuggestion } from '@/shared/types/address';

// Frontend to Backend mapper
export function toApiAddress(address: Address): AddressApi {
  return {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country.toUpperCase(),
  };
}

// Backend to Frontend mapper
export function fromApiAddress(apiAddress: AddressApi): Address {
  return {
    line1: apiAddress.line1,
    line2: apiAddress.line2,
    city: apiAddress.city,
    state: apiAddress.state,
    postalCode: apiAddress.postal_code,
    country: apiAddress.country.toUpperCase(),
  };
}

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

// Check if address is complete (all required fields present)
export function isAddressComplete(address: Partial<Address>): address is Address {
  return !!(
    address.line1?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.postalCode?.trim() &&
    address.country?.trim()
  );
}

// Check if address has any data
export function hasAddressData(address: Partial<Address>): boolean {
  return !!(
    address.line1?.trim() ||
    address.line2?.trim() ||
    address.city?.trim() ||
    address.state?.trim() ||
    address.postalCode?.trim() ||
    address.country?.trim()
  );
}

// Normalize address (trim and uppercase country)
export function normalizeAddress(address: Partial<Address>): Partial<Address> {
  const normalized: Partial<Address> = {};
  
  if (address.line1 !== undefined) normalized.line1 = address.line1.trim();
  if (address.line2 !== undefined) normalized.line2 = address.line2?.trim() || undefined;
  if (address.city !== undefined) normalized.city = address.city.trim();
  if (address.state !== undefined) normalized.state = address.state.trim();
  if (address.postalCode !== undefined) normalized.postalCode = address.postalCode.trim();
  if (address.country !== undefined) normalized.country = address.country.trim().toUpperCase();
  
  return normalized;
}

// Create empty address with defaults
export function createEmptyAddress(): Address {
  return {
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  };
}

// Merge addresses (partial update)
export function mergeAddress(base: Address, update: Partial<Address>): Address {
  return {
    ...base,
    ...update,
  };
}
