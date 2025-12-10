/**
 * Domain utility functions for normalizing and validating domain names
 */

/**
 * Normalizes a domain by removing protocol, port, and path components
 * @param domain - The domain to normalize (can include protocol, port, path)
 * @returns The normalized domain name
 * @example
 * normalizeDomain('https://example.com:8080/path') // 'example.com'
 * normalizeDomain('http://localhost:3000') // 'localhost'
 * normalizeDomain('ai.blawby.com') // 'ai.blawby.com'
 */
export function normalizeDomain(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    return 'localhost';
  }

  try {
    // Remove protocol if present
    let normalized = domain.replace(/^https?:\/\//, '');
    
    // Remove path and query parameters
    normalized = normalized.split('/')[0];
    normalized = normalized.split('?')[0];
    normalized = normalized.split('#')[0];
    
    // Remove port if present
    normalized = normalized.split(':')[0];
    
    // Trim whitespace
    normalized = normalized.trim();
    
    // Return localhost if empty or invalid
    if (!normalized || normalized === '') {
      return 'localhost';
    }
    
    return normalized;
  } catch (error) {
    console.warn(`Failed to normalize domain "${domain}":`, error);
    return 'localhost';
  }
}


/**
 * Validates that a domain is safe for cookie usage
 * @param domain - The domain to validate
 * @returns true if the domain is safe for cookies
 */
export function isValidCookieDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }
  
  // Basic validation - must be a valid domain format
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Allow localhost for development
  if (domain === 'localhost') {
    return true;
  }

  return domainRegex.test(domain);
}

/**
 * Resolves the best configured domain from environment variables
 * Priority: DOMAIN > CLOUDFLARE_PUBLIC_URL > BETTER_AUTH_URL > localhost
 */
export function getConfiguredDomain(env: { DOMAIN?: string; CLOUDFLARE_PUBLIC_URL?: string; BETTER_AUTH_URL?: string }): string {
  if (env.DOMAIN) {
    return normalizeDomain(env.DOMAIN);
  }

  if (env.CLOUDFLARE_PUBLIC_URL) {
    return normalizeDomain(env.CLOUDFLARE_PUBLIC_URL);
  }

  if (env.BETTER_AUTH_URL) {
    return normalizeDomain(env.BETTER_AUTH_URL);
  }

  return 'localhost';
}
