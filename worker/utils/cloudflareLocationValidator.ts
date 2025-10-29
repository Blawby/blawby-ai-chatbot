// Cloudflare Location Validator
// Uses Cloudflare's built-in location headers for accurate geolocation

export interface CloudflareLocationInfo {
  country?: string;
  state?: string;
  city?: string;
  continent?: string;
  latitude?: number;
  longitude?: number;
  isValid: boolean;
  error?: string;
}

/**
 * Extracts location information from Cloudflare headers
 * @param request - The incoming request object
 * @returns CloudflareLocationInfo with location data
 */
export function getCloudflareLocation(request: Request): CloudflareLocationInfo {
  try {
    const headers = request.headers;
    
    const country = headers.get('CF-IPCountry');
    const state = headers.get('CF-IPState');
    const city = headers.get('CF-IPCity');
    const continent = headers.get('CF-IPContinent');
    const latitude = headers.get('CF-IPLatitude');
    const longitude = headers.get('CF-IPLongitude');
    
    // Convert headers to object manually (Cloudflare Workers Headers is not iterable)
    const headersObj: Record<string, string> = {};
    // Headers doesn't support iteration, so we need to manually get known headers
    const knownHeaders = ['CF-IPCountry', 'CF-IPState', 'CF-IPCity', 'CF-IPContinent', 'CF-IPLatitude', 'CF-IPLongitude'];
    for (const key of knownHeaders) {
      const value = headers.get(key);
      if (value) {
        headersObj[key] = value;
      }
    }
    
    console.log('Cloudflare Headers Debug:', {
      country,
      state,
      city,
      continent,
      latitude,
      longitude,
      allHeaders: headersObj
    });
    
    // If we have at least a country, consider it valid
    if (country && country !== 'XX') {
      return {
        country,
        state: state || undefined,
        city: city || undefined,
        continent: continent || undefined,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        isValid: true
      };
    }
    
    return {
      isValid: false,
      error: 'No valid location data available from Cloudflare headers'
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to parse Cloudflare location headers: ${error}`
    };
  }
}

/**
 * Checks if a location is within supported jurisdictions using Cloudflare data
 * @param locationInfo - Location info from Cloudflare headers
 * @param supportedStates - Array of supported state codes
 * @param supportedCountries - Array of supported country codes
 * @returns boolean indicating if location is supported
 */
export function isCloudflareLocationSupported(
  locationInfo: CloudflareLocationInfo,
  supportedStates: string[] = [],
  supportedCountries: string[] = []
): boolean {
  if (!locationInfo.isValid) {
    return false;
  }

  // If 'all' is in supported states or countries, accept everything
  if (supportedStates.includes('all') || supportedCountries.includes('all')) {
    return true;
  }

  // Check if the location's country is supported
  if (locationInfo.country && supportedCountries.includes(locationInfo.country)) {
    return true;
  }

  // Check if the location's state is supported
  if (locationInfo.state && supportedStates.includes(locationInfo.state)) {
    return true;
  }

  return false;
}

/**
 * Gets a user-friendly location description from Cloudflare data
 * @param locationInfo - Location info from Cloudflare headers
 * @returns Human-readable location string
 */
export function getLocationDescription(locationInfo: CloudflareLocationInfo): string {
  if (!locationInfo.isValid) {
    return 'Unknown location';
  }

  const parts = [];
  
  if (locationInfo.city) {
    parts.push(locationInfo.city);
  }
  
  if (locationInfo.state) {
    parts.push(locationInfo.state);
  }
  
  // Only add country if we don't have city/state, or if it's not just a country code
  if (locationInfo.country) {
    // If we only have country, show the full country name
    if (!locationInfo.city && !locationInfo.state) {
      const countryNames: Record<string, string> = {
        'US': 'United States',
        'CA': 'Canada',
        'MX': 'Mexico',
        'GB': 'United Kingdom',
        'TH': 'Thailand',
        'CN': 'China',
        'JP': 'Japan',
        'KR': 'South Korea',
        'AU': 'Australia',
        'NZ': 'New Zealand',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'NL': 'Netherlands',
        'BE': 'Belgium',
        'CH': 'Switzerland',
        'AT': 'Austria',
        'SE': 'Sweden',
        'NO': 'Norway',
        'DK': 'Denmark',
        'FI': 'Finland',
        'PL': 'Poland',
        'CZ': 'Czech Republic',
        'HU': 'Hungary',
        'RO': 'Romania',
        'BG': 'Bulgaria',
        'HR': 'Croatia',
        'SI': 'Slovenia',
        'SK': 'Slovakia',
        'LT': 'Lithuania',
        'LV': 'Latvia',
        'EE': 'Estonia',
        'IE': 'Ireland',
        'PT': 'Portugal',
        'GR': 'Greece',
        'CY': 'Cyprus',
        'MT': 'Malta',
        'LU': 'Luxembourg',
        'IS': 'Iceland',
        'LI': 'Liechtenstein',
        'MC': 'Monaco',
        'SM': 'San Marino',
        'VA': 'Vatican City',
        'AD': 'Andorra',
        'IN': 'India',
        'BR': 'Brazil',
        'AR': 'Argentina',
        'CL': 'Chile',
        'CO': 'Colombia',
        'PE': 'Peru',
        'VE': 'Venezuela',
        'EC': 'Ecuador',
        'BO': 'Bolivia',
        'PY': 'Paraguay',
        'UY': 'Uruguay',
        'GY': 'Guyana',
        'SR': 'Suriname',
        'GF': 'French Guiana',
        'FK': 'Falkland Islands',
        'ZA': 'South Africa',
        'EG': 'Egypt',
        'NG': 'Nigeria',
        'KE': 'Kenya',
        'GH': 'Ghana',
        'ET': 'Ethiopia',
        'TZ': 'Tanzania',
        'UG': 'Uganda',
        'RW': 'Rwanda',
        'BI': 'Burundi',
        'MW': 'Malawi',
        'ZM': 'Zambia',
        'ZW': 'Zimbabwe',
        'BW': 'Botswana',
        'NA': 'Namibia',
        'SZ': 'Eswatini',
        'LS': 'Lesotho',
        'MG': 'Madagascar',
        'MU': 'Mauritius',
        'SC': 'Seychelles',
        'KM': 'Comoros',
        'DJ': 'Djibouti',
        'SO': 'Somalia',
        'ER': 'Eritrea',
        'SD': 'Sudan',
        'SS': 'South Sudan',
        'CF': 'Central African Republic',
        'CM': 'Cameroon',
        'GQ': 'Equatorial Guinea',
        'GA': 'Gabon',
        'CG': 'Republic of the Congo',
        'CD': 'Democratic Republic of the Congo',
        'AO': 'Angola',
        'ST': 'São Tomé and Príncipe',
        'CV': 'Cape Verde',
        'GM': 'Gambia',
        'GN': 'Guinea',
        'GW': 'Guinea-Bissau',
        'SL': 'Sierra Leone',
        'LR': 'Liberia',
        'CI': 'Ivory Coast',
        'BF': 'Burkina Faso',
        'ML': 'Mali',
        'NE': 'Niger',
        'TD': 'Chad',
        'SN': 'Senegal',
        'MR': 'Mauritania',
        'TN': 'Tunisia',
        'DZ': 'Algeria',
        'MA': 'Morocco',
        'LY': 'Libya',
        'SA': 'Saudi Arabia',
        'YE': 'Yemen',
        'OM': 'Oman',
        'AE': 'United Arab Emirates',
        'QA': 'Qatar',
        'BH': 'Bahrain',
        'KW': 'Kuwait',
        'IQ': 'Iraq',
        'IR': 'Iran',
        'AF': 'Afghanistan',
        'PK': 'Pakistan',
        'BD': 'Bangladesh',
        'LK': 'Sri Lanka',
        'MV': 'Maldives',
        'NP': 'Nepal',
        'BT': 'Bhutan',
        'MM': 'Myanmar',
        'LA': 'Laos',
        'KH': 'Cambodia',
        'VN': 'Vietnam',
        'MY': 'Malaysia',
        'SG': 'Singapore',
        'BN': 'Brunei',
        'ID': 'Indonesia',
        'PH': 'Philippines',
        'TL': 'Timor-Leste',
        'PG': 'Papua New Guinea',
        'FJ': 'Fiji',
        'VU': 'Vanuatu',
        'NC': 'New Caledonia',
        'PF': 'French Polynesia',
        'WS': 'Samoa',
        'TO': 'Tonga',
        'KI': 'Kiribati',
        'TV': 'Tuvalu',
        'NR': 'Nauru',
        'PW': 'Palau',
        'MH': 'Marshall Islands',
        'FM': 'Micronesia',
        'CK': 'Cook Islands',
        'NU': 'Niue',
        'TK': 'Tokelau',
        'AS': 'American Samoa',
        'GU': 'Guam',
        'MP': 'Northern Mariana Islands',
        'PR': 'Puerto Rico',
        'VI': 'U.S. Virgin Islands',
        'AI': 'Anguilla',
        'AG': 'Antigua and Barbuda',
        'AW': 'Aruba',
        'BS': 'Bahamas',
        'BB': 'Barbados',
        'BZ': 'Belize',
        'BM': 'Bermuda',
        'VG': 'British Virgin Islands',
        'KY': 'Cayman Islands',
        'CR': 'Costa Rica',
        'CU': 'Cuba',
        'DM': 'Dominica',
        'DO': 'Dominican Republic',
        'SV': 'El Salvador',
        'GD': 'Grenada',
        'GT': 'Guatemala',
        'HT': 'Haiti',
        'HN': 'Honduras',
        'JM': 'Jamaica',
        'NI': 'Nicaragua',
        'PA': 'Panama',
        'KN': 'Saint Kitts and Nevis',
        'LC': 'Saint Lucia',
        'VC': 'Saint Vincent and the Grenadines',
        'TT': 'Trinidad and Tobago',
        'TC': 'Turks and Caicos Islands'
      };
      
      const countryName = countryNames[locationInfo.country] || locationInfo.country;
      return `${countryName} (detected from your IP address)`;
    }
    
    // If we have city/state, add country code for context
    parts.push(locationInfo.country);
  }
  
  const result = parts.length > 0 ? parts.join(', ') : 'Unknown location';
  return result + ' (detected from your IP address)';
} 