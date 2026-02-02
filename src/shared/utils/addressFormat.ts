/**
 * Address formatting utilities
 * 
 * Provides various formatting functions for displaying addresses in different
 * contexts (single line, multi-line, summary, etc.).
 */
import { Address } from '@/shared/types/address';

/**
 * Format address as a single line string
 */
export function formatAddressSingleLine(address: Partial<Address>): string {
  const parts: string[] = [];
  
  if (address.address?.trim()) parts.push(address.address.trim());
  if (address.apartment?.trim()) parts.push(address.apartment.trim());
  
  const cityStateZip = formatCityStateZip(address);
  if (cityStateZip) parts.push(cityStateZip);
  
  if (address.country?.trim() && address.country !== 'US') {
    parts.push(address.country.trim());
  }
  
  return parts.join(', ');
}

/**
 * Format address as multi-line string
 */
export function formatAddressMultiLine(address: Partial<Address>): string {
  const lines: string[] = [];
  
  if (address.address?.trim()) lines.push(address.address.trim());
  if (address.apartment?.trim()) lines.push(address.apartment.trim());
  
  const cityStateZip = formatCityStateZip(address);
  if (cityStateZip) lines.push(cityStateZip);
  
  if (address.country?.trim() && address.country !== 'US') {
    lines.push(address.country.trim());
  }
  
  return lines.join('\n');
}

/**
 * Format city, state, and postal code
 */
export function formatCityStateZip(address: Partial<Address>): string {
  const parts: string[] = [];
  
  if (address.city?.trim()) parts.push(address.city.trim());
  if (address.state?.trim()) parts.push(address.state.trim());
  if (address.postalCode?.trim()) parts.push(address.postalCode.trim());
  
  if (parts.length === 0) return '';
  
  // Format: City, State PostalCode
  if (parts.length === 3) {
    return `${parts[0]}, ${parts[1]} ${parts[2]}`;
  }
  
  // Format: City State or City PostalCode or State PostalCode
  if (parts.length === 2) {
    const hasCity = !!address.city?.trim();
    const hasState = !!address.state?.trim();
    const hasPostalCode = !!address.postalCode?.trim();
    
    if (hasCity && hasState) {
      // City, State
      return `${parts[0]}, ${parts[1]}`;
    } else if (hasCity && hasPostalCode) {
      // City PostalCode
      return `${parts[0]} ${parts[1]}`;
    } else if (hasState && hasPostalCode) {
      // State PostalCode
      return `${parts[0]} ${parts[1]}`;
    } else {
      // Fallback: if second part looks like a postal code (contains numbers), add space
      if (/\d/.test(parts[1])) {
        return `${parts[0]} ${parts[1]}`;
      }
      // Otherwise treat as state
      return `${parts[0]}, ${parts[1]}`;
    }
  }
  
  return parts[0];
}

/**
 * Format address for display with appropriate line breaks
 */
export function formatAddressForDisplay(address: Partial<Address>): string {
  // Use multi-line format for display
  return formatAddressMultiLine(address);
}

/**
 * Format address for form input (single line)
 */
export function formatAddressForInput(address: Partial<Address>): string {
  return formatAddressSingleLine(address);
}

/**
 * Get a short address summary (address line, city, state)
 */
export function formatAddressSummary(address: Partial<Address>): string {
  const parts: string[] = [];
  
  if (address.address?.trim()) parts.push(address.address.trim());
  
  const cityState = [address.city?.trim(), address.state?.trim()]
    .filter(Boolean)
    .join(', ');
  
  if (cityState) parts.push(cityState);
  
  return parts.join(', ');
}

/**
 * Format address with country (for international addresses)
 */
export function formatAddressWithCountry(address: Partial<Address>): string {
  const parts: string[] = [];
  
  if (address.address?.trim()) parts.push(address.address.trim());
  if (address.apartment?.trim()) parts.push(address.apartment.trim());
  
  const cityStateZip = formatCityStateZip(address);
  if (cityStateZip) parts.push(cityStateZip);
  
  if (address.country?.trim()) {
    parts.push(address.country.trim());
  }
  
  return parts.join(', ');
}

/**
 * Check if address is empty (no meaningful data)
 */
export function isAddressEmpty(address: Partial<Address>): boolean {
  return !(
    address.address?.trim() ||
    address.apartment?.trim() ||
    address.city?.trim() ||
    address.state?.trim() ||
    address.postalCode?.trim() ||
    address.country?.trim()
  );
}

/**
 * Get country name from ISO-2 code
 */
export function getCountryName(iso2Code: string): string {
  const countries: Record<string, string> = {
    US: 'United States',
    CA: 'Canada',
    GB: 'United Kingdom',
    AU: 'Australia',
    DE: 'Germany',
    FR: 'France',
    IT: 'Italy',
    ES: 'Spain',
    JP: 'Japan',
    KR: 'South Korea',
    CN: 'China',
    IN: 'India',
    BR: 'Brazil',
    MX: 'Mexico',
    // Add more as needed
  };
  
  return countries[iso2Code.toUpperCase()] || iso2Code;
}

/**
 * Format country for display (show full name for common countries, code for others)
 */
export function formatCountryForDisplay(iso2Code: string): string {
  const fullName = getCountryName(iso2Code);
  return fullName !== iso2Code ? fullName : iso2Code;
}
