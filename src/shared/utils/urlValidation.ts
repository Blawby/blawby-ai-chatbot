/**
 * Validates and sanitizes image URLs to prevent XSS attacks
 * Only allows http and https protocols, rejects javascript:, data:, and other dangerous schemes
 */

/**
 * Checks if a URL is safe for use as an image source
 * @param url - The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    // Guard against SSR by checking if window is available
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    // Only allow http and https protocols
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a user image URL by validating it and returning a safe version
 * @param url - The URL to sanitize
 * @returns The sanitized URL if valid, null if invalid
 */
export function sanitizeUserImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  return isValidImageUrl(url) ? url : null;
}
