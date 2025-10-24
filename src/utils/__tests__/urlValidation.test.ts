import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isValidUrl, isValidImageUrl, sanitizeImageUrl, sanitizeUserImageUrl } from '../urlValidation';

describe('urlValidation', () => {
  let originalWindow: any;

  beforeEach(() => {
    // Store original window
    originalWindow = global.window;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
  });

  describe('isValidUrl', () => {
    it('should return false for invalid inputs', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(null as any)).toBe(false);
      expect(isValidUrl(undefined as any)).toBe(false);
      expect(isValidUrl(123 as any)).toBe(false);
      expect(isValidUrl({} as any)).toBe(false);
    });

    it('should return false for URLs without hostnames', () => {
      expect(isValidUrl('http://')).toBe(false);
      expect(isValidUrl('https://')).toBe(false);
    });

    it('should return true for valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path')).toBe(true);
      expect(isValidUrl('http://example.com:8080')).toBe(true);
      expect(isValidUrl('http://subdomain.example.com')).toBe(true);
    });

    it('should return true for valid HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path')).toBe(true);
      expect(isValidUrl('https://example.com:8443')).toBe(true);
      expect(isValidUrl('https://subdomain.example.com')).toBe(true);
    });

    it('should return false for dangerous protocols', () => {
      expect(isValidUrl('javascript:alert("xss")')).toBe(false);
      expect(isValidUrl('data:text/html,<script>alert("xss")</script>')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('mailto:test@example.com')).toBe(false);
      expect(isValidUrl('tel:+1234567890')).toBe(false);
      expect(isValidUrl('sms:+1234567890')).toBe(false);
    });

    it('should handle relative URLs with base URL', () => {
      // Mock window.location for SSR safety
      global.window = {
        location: { origin: 'https://example.com' }
      } as any;

      expect(isValidUrl('/path')).toBe(true);
      expect(isValidUrl('path')).toBe(true);
      expect(isValidUrl('./path')).toBe(true);
      expect(isValidUrl('../path')).toBe(true);
    });

    it('should handle SSR environment (no window)', () => {
      // Remove window to simulate SSR
      delete (global as any).window;

      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('javascript:alert("xss")')).toBe(false);
    });
  });

  describe('isValidImageUrl', () => {
    it('should return false for invalid inputs', () => {
      expect(isValidImageUrl('')).toBe(false);
      expect(isValidImageUrl(null as any)).toBe(false);
      expect(isValidImageUrl(undefined as any)).toBe(false);
      expect(isValidImageUrl(123 as any)).toBe(false);
    });

    it('should return false for URLs without hostnames', () => {
      expect(isValidImageUrl('http://')).toBe(false);
      expect(isValidImageUrl('https://')).toBe(false);
    });

    it('should return true for valid HTTP image URLs', () => {
      expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('http://example.com/image.png')).toBe(true);
      expect(isValidImageUrl('http://example.com/image.gif')).toBe(true);
      expect(isValidImageUrl('http://example.com/image.webp')).toBe(true);
    });

    it('should return true for valid HTTPS image URLs', () => {
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.gif')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.webp')).toBe(true);
    });

    it('should return false for dangerous protocols', () => {
      expect(isValidImageUrl('javascript:alert("xss")')).toBe(false);
      expect(isValidImageUrl('data:text/html,<script>alert("xss")</script>')).toBe(false);
      expect(isValidImageUrl('file:///etc/passwd')).toBe(false);
      expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
    });

    it('should handle relative URLs with base URL', () => {
      global.window = {
        location: { origin: 'https://example.com' }
      } as any;

      expect(isValidImageUrl('/image.jpg')).toBe(true);
      expect(isValidImageUrl('image.jpg')).toBe(true);
      expect(isValidImageUrl('./image.jpg')).toBe(true);
    });

    it('should handle SSR environment (no window)', () => {
      delete (global as any).window;

      expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('javascript:alert("xss")')).toBe(false);
    });
  });

  describe('sanitizeImageUrl', () => {
    it('should return null for invalid URLs', () => {
      expect(sanitizeImageUrl('')).toBe(null);
      expect(sanitizeImageUrl('javascript:alert("xss")')).toBe(null);
      expect(sanitizeImageUrl('data:text/html,<script>alert("xss")</script>')).toBe(null);
      expect(sanitizeImageUrl('file:///etc/passwd')).toBe(null);
    });

    it('should return the URL for valid image URLs', () => {
      expect(sanitizeImageUrl('http://example.com/image.jpg')).toBe('http://example.com/image.jpg');
      expect(sanitizeImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
    });

    it('should handle relative URLs', () => {
      global.window = {
        location: { origin: 'https://example.com' }
      } as any;

      expect(sanitizeImageUrl('/image.jpg')).toBe('/image.jpg');
      expect(sanitizeImageUrl('image.jpg')).toBe('image.jpg');
    });
  });

  describe('sanitizeUserImageUrl', () => {
    it('should return null for invalid inputs', () => {
      expect(sanitizeUserImageUrl(null)).toBe(null);
      expect(sanitizeUserImageUrl(undefined)).toBe(null);
      expect(sanitizeUserImageUrl('')).toBe(null);
      expect(sanitizeUserImageUrl('javascript:alert("xss")')).toBe(null);
    });

    it('should return the URL for valid image URLs', () => {
      expect(sanitizeUserImageUrl('http://example.com/avatar.jpg')).toBe('http://example.com/avatar.jpg');
      expect(sanitizeUserImageUrl('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
    });

    it('should handle relative URLs', () => {
      global.window = {
        location: { origin: 'https://example.com' }
      } as any;

      expect(sanitizeUserImageUrl('/avatar.jpg')).toBe('/avatar.jpg');
      expect(sanitizeUserImageUrl('avatar.jpg')).toBe('avatar.jpg');
    });
  });
});
