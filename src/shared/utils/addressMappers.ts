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
    address: address.address,
    apartment: address.apartment,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country.toUpperCase(),
  };
}

// Backend to Frontend mapper
export function fromApiAddress(apiAddress: AddressApi): Address {
  return {
    address: apiAddress.address,
    apartment: apiAddress.apartment,
    city: apiAddress.city,
    state: apiAddress.state,
    postalCode: apiAddress.postal_code,
    country: apiAddress.country.toUpperCase(),
  };
}

// Geoapify feature interface for strong typing
interface GeoapifyFeature {
  type: string;
  properties: {
    place_id?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    address_line1?: string;
    address_line2?: string;
    unit?: string;
    subpremise?: string;
    city?: string;
    town?: string;
    village?: string;
    locality?: string;
    county?: string;
    state?: string;
    region?: string;
    postcode?: string;
    country_code?: string;
    formatted?: string;
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
    [key: string]: any;
  };
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

export function fromGeoapifyFeature(feature: GeoapifyFeature): Address {
  const properties = feature.properties;
  
  let address = '';
  if (properties.address_line1) {
    address = properties.address_line1;
  } else if (properties.housenumber && properties.street) {
    address = `${properties.housenumber} ${properties.street}`.trim();
  } else if (properties.name) {
    address = properties.name;
  } else if (properties.formatted) {
    const firstComma = properties.formatted.indexOf(',');
    address = firstComma > 0 ? properties.formatted.substring(0, firstComma).trim() : properties.formatted;
  }

  const apartment = properties.unit || properties.subpremise || properties.address_line2 || '';

  const city = properties.city || properties.town || properties.village || properties.locality || '';

  const state = properties.state || properties.region || '';

  const postalCode = properties.postcode || '';

  const country = properties.country_code ? properties.country_code.toUpperCase() : '';

  return {
    address: address.trim(),
    apartment: apartment.trim(),
    city: city.trim(),
    state: state.trim(),
    postalCode: postalCode.trim(),
    country: country.trim(),
  };
}

// Geoapify response to AddressSuggestion mapper
export function fromGeoapifyResponse(feature: GeoapifyFeature): AddressSuggestion {
  const address = fromGeoapifyFeature(feature);
  const properties = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  
  const formatted = properties.formatted || '';
  const lon = coordinates?.[0] || '';
  const lat = coordinates?.[1] || '';
  const id = properties.place_id || generateHashId(formatted, coordinates);
  
  const label = properties.formatted || `${address.address}, ${address.city}, ${address.state} ${address.postalCode}`;
  
  const dedupeKey = properties.place_id || (formatted.toLowerCase().replace(/\s+/g, ' ').trim() || '');
  
  return {
    id,
    label,
    address,
    formatted: properties.formatted || label,
    lat: coordinates?.[1],
    lon: coordinates?.[0],
    place_id: properties.place_id,
    dedupeKey,
    properties: {
      result_type: properties.result_type,
      match_type: properties.match_type,
      confidence: properties.confidence,
      rank: properties.rank,
      datasource: properties.datasource,
      country: properties.country,
      state: properties.state,
      city: properties.city,
      postcode: properties.postcode,
    },
  };
}

// Generate deterministic hash ID from coordinates and formatted address
function generateHashId(formatted?: string, coordinates?: [number, number]): string {
  const data = `${formatted ?? ''}|${coordinates?.[0] ?? ''}|${coordinates?.[1] ?? ''}`;
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
    address.address?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.postalCode?.trim() &&
    address.country?.trim()
  );
}

// Check if address has any data
export function hasAddressData(address: Partial<Address>): boolean {
  if (!address) return false;
  return !!(
    address.address?.trim() ||
    address.apartment?.trim() ||
    address.city?.trim() ||
    address.state?.trim() ||
    address.postalCode?.trim() ||
    address.country?.trim()
  );
}

// Normalize address (trim and uppercase country)
export function normalizeAddress(address: Partial<Address>): Partial<Address> {
  const normalized: Partial<Address> = {};
  
  if (address.address !== undefined) normalized.address = address.address.trim();
  if (address.apartment !== undefined) normalized.apartment = address.apartment?.trim() || undefined;
  if (address.city !== undefined) normalized.city = address.city.trim();
  if (address.state !== undefined) normalized.state = address.state.trim();
  if (address.postalCode !== undefined) normalized.postalCode = address.postalCode.trim();
  if (address.country !== undefined) normalized.country = address.country.trim().toUpperCase();
  
  return normalized;
}

// Create empty address with defaults (no fake US country)
export function createEmptyAddress(): Address {
  return {
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  };
}

// Merge addresses (partial update)
export function mergeAddress(base: Address, update: Partial<Address>): Address {
  return {
    address: update.address ?? base.address,
    apartment: update.apartment ?? base.apartment,
    city: update.city ?? base.city,
    state: update.state ?? base.state,
    postalCode: update.postalCode ?? base.postalCode,
    country: update.country ?? base.country,
  };
}
