import type { Address } from '../types/ui';
import type { AddressSuggestion } from '../types/address';
import type { AddressApi } from '../types/api';

// US state name to code mapping for normalization
const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

// Convert US state name to 2-letter code
export function toUSStateCode(s: string): string {
  const trimmed = s.trim();
  // If input is already 2 letters, normalize to uppercase
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }
  // Otherwise try to map state name to code
  return US_STATE_NAME_TO_CODE[trimmed.toLowerCase()] || trimmed;
}

// Convert ISO-2 country code to display format (US -> USA, GB -> UK, etc.)
function countryDisplay(code: string): string {
  const c = code.toUpperCase();
  
  // Common country abbreviations
  const countryAbbreviations: Record<string, string> = {
    'US': 'USA',
    'GB': 'UK', 
    'AE': 'UAE',
    'SA': 'KSA', // Kingdom of Saudi Arabia
  };
  
  return countryAbbreviations[c] || c; // Use abbreviation if available, otherwise use ISO-2 code
}

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
type GeoapifyRank = {
  importance?: number;
  confidence?: number;
  confidence_street_level?: number;
  confidence_building_level?: number;
  match_type?: string;
};

type GeoapifyDatasource = {
  sourcename?: string;
  attribution?: string;
  license?: string;
  url?: string;
};

type GeoapifyProperties = {
  address_line1?: string;
  housenumber?: string;
  street?: string;
  name?: string;
  formatted?: string;
  unit?: string;
  subpremise?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  state_code?: string;
  state?: string;
  region?: string;
  country_code?: string;
  postcode?: string;
  place_id?: string;
  result_type?: string;
  match_type?: string;
  confidence?: number;
  rank?: GeoapifyRank;
  datasource?: GeoapifyDatasource;
  country?: string;
};

type GeoapifyFeature = {
  properties?: GeoapifyProperties;
  geometry?: {
    coordinates?: [number, number] | number[];
  };
};

export function fromGeoapifyFeature(feature: GeoapifyFeature): Address {
  // Defensive guard against malformed API responses
  if (!feature || !feature.properties) {
    throw new Error('Invalid Geoapify feature: feature or properties is missing');
  }
  
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

  // Fix: Only use explicit unit fields for apartment, never address_line2
  const apartment = (properties.unit ?? properties.subpremise ?? '').trim() || undefined;

  const city = properties.city || properties.town || properties.village || properties.locality || '';

  // Fix: Read state_code first, then normalize to 2-letter code for all countries
  const rawState = (properties.state_code ?? properties.state ?? properties.region ?? '').trim();
  const country = (properties.country_code ?? '').toUpperCase();
  
  // Always use 2-letter state codes when available, otherwise use trimmed raw state
  const state = rawState.length === 2 ? rawState.toUpperCase() : rawState;

  const postalCode = properties.postcode || '';

  return {
    address: address.trim(),
    apartment,
    city: city.trim(),
    state: state.trim(),
    postalCode: postalCode.trim(),
    country, // Store ISO-2 code for validation (US, GB, etc.)
  };
}

// Geoapify response to AddressSuggestion conversion
export function fromGeoapifyResponse(feature: GeoapifyFeature): AddressSuggestion {
  const address = fromGeoapifyFeature(feature);
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  
  const formatted = properties.formatted || '';
  const apiPlaceId = properties.place_id; // API uses snake_case
  const id = apiPlaceId || generateHashId(formatted, coordinates);
  
  const label = `${address.address}, ${address.city}, ${address.state} ${address.postalCode}${address.country ? `, ${countryDisplay(address.country)}` : ''}`;
  
  const dedupeKey = apiPlaceId || (formatted.toLowerCase().replace(/\s+/g, ' ').trim() || '');
  
  return {
    id,
    label,
    address,
    formatted: label,
    lat: typeof coordinates?.[1] === 'number' ? coordinates[1] : undefined,
    lon: typeof coordinates?.[0] === 'number' ? coordinates[0] : undefined,
    placeId: apiPlaceId, // Internal type uses camelCase
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

// Export utility functions for use in other components
export { countryDisplay };
