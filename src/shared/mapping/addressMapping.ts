import type { Address } from '../types/ui';
import type { AddressApi } from '../types/api';

// Simple hash ID generator for autocomplete suggestions
function generateHashId(formatted: string, coordinates: number[] | undefined): string {
  const str = `${formatted}|${coordinates?.[0] || ''}|${coordinates?.[1] || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// UI to API conversion (no optional behavior, no defaults)
export function toApiAddress(ui: Address): AddressApi {
  return {
    line1: ui.address,
    line2: ui.apartment ?? undefined,  // undefined if not provided
    city: ui.city,
    state: ui.state,
    postal_code: ui.postalCode,
    country: (ui.country ?? '').toUpperCase(), // ISO-2 uppercase with null safety
  };
}

// API to UI conversion (no optional behavior, no defaults)
export function fromApiAddress(api: AddressApi): Address {
  return {
    address: api.line1,
    apartment: api.line2 ?? undefined,  // undefined if not provided
    city: api.city,
    state: api.state,
    postalCode: api.postal_code,
    country: (api.country ?? '').toUpperCase(), // Ensure consistent uppercase with null safety
  };
}

// Geoapify feature to Address conversion (for autocomplete)
export function fromGeoapifyFeature(feature: any): Address {
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

  const country = (properties.country_code ?? '').toUpperCase();

  return {
    address: address.trim(),
    apartment: apartment.trim(),
    city: city.trim(),
    state: state.trim(),
    postalCode: postalCode.trim(),
    country: country.trim(),
  };
}

// Geoapify response to AddressSuggestion conversion
export function fromGeoapifyResponse(feature: any): any {
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
      country: properties.country_code,
      state: properties.state,
      city: properties.city,
      postcode: properties.postcode,
    },
  };
}
