import { describe, it, expect } from 'vitest';
import { normalizeDomain, getConfiguredDomain, isValidCookieDomain } from '../domain.js';

describe('domain utilities', () => {
  describe('normalizeDomain', () => {
    it('should remove protocol from domain', () => {
      expect(normalizeDomain('https://example.com')).toBe('example.com');
      expect(normalizeDomain('http://example.com')).toBe('example.com');
    });

    it('should remove port from domain', () => {
      expect(normalizeDomain('example.com:8080')).toBe('example.com');
      expect(normalizeDomain('localhost:3000')).toBe('localhost');
    });

    it('should remove path and query parameters', () => {
      expect(normalizeDomain('https://example.com:8080/path?query=1#hash')).toBe('example.com');
      expect(normalizeDomain('example.com/path/to/resource')).toBe('example.com');
    });

    it('should handle localhost correctly', () => {
      expect(normalizeDomain('localhost')).toBe('localhost');
      expect(normalizeDomain('http://localhost:3000')).toBe('localhost');
    });

    it('should return localhost for invalid input', () => {
      expect(normalizeDomain('')).toBe('localhost');
      expect(normalizeDomain('   ')).toBe('localhost');
      expect(normalizeDomain(null as unknown as string)).toBe('localhost');
      expect(normalizeDomain(undefined as unknown as string)).toBe('localhost');
    });

    it('should handle complex URLs', () => {
      expect(normalizeDomain('https://ai.blawby.com:443/api/auth')).toBe('ai.blawby.com');
      expect(normalizeDomain('http://staging.blawby.com:8080/dashboard?tab=settings')).toBe('staging.blawby.com');
    });
  });

  describe('getConfiguredDomain', () => {
    it('should use DOMAIN when available', () => {
      const env = { DOMAIN: 'example.com' };
      expect(getConfiguredDomain(env)).toBe('example.com');
    });

    it('should fallback to CLOUDFLARE_PUBLIC_URL when DOMAIN not set', () => {
      const env = { CLOUDFLARE_PUBLIC_URL: 'https://ai.blawby.com' };
      expect(getConfiguredDomain(env)).toBe('ai.blawby.com');
    });

    it('should fallback to BLAWBY_API_URL when others not set', () => {
      const env = { BLAWBY_API_URL: 'http://localhost:8787/api' };
      expect(getConfiguredDomain(env)).toBe('localhost');
    });

    it('should return localhost as final fallback', () => {
      const env = {};
      expect(getConfiguredDomain(env)).toBe('localhost');
    });

    it('should prioritize DOMAIN over other sources', () => {
      const env = {
        DOMAIN: 'custom.com',
        CLOUDFLARE_PUBLIC_URL: 'https://ai.blawby.com',
        BLAWBY_API_URL: 'http://localhost:8787/api'
      };
      expect(getConfiguredDomain(env)).toBe('custom.com');
    });
  });

  describe('isValidCookieDomain', () => {
    it('should accept valid domains', () => {
      expect(isValidCookieDomain('example.com')).toBe(true);
      expect(isValidCookieDomain('ai.blawby.com')).toBe(true);
      expect(isValidCookieDomain('sub.domain.example.com')).toBe(true);
    });

    it('should accept localhost for development', () => {
      expect(isValidCookieDomain('localhost')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(isValidCookieDomain('')).toBe(false);
      expect(isValidCookieDomain('invalid..domain')).toBe(false);
      expect(isValidCookieDomain('.startsWithDot')).toBe(false);
      expect(isValidCookieDomain('endsWithDot.')).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(isValidCookieDomain(null as unknown as string)).toBe(false);
      expect(isValidCookieDomain(undefined as unknown as string)).toBe(false);
      expect(isValidCookieDomain(123 as unknown as string)).toBe(false);
    });
  });
});
