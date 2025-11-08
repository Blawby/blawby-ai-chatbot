import { describe, it, expect } from 'vitest';
import { 
  sanitizePII, 
  containsPII, 
  createContentHash, 
  sanitizeForLogging
} from '../../../worker/utils/piiSanitizer';

describe('PII Sanitizer', () => {
  describe('sanitizePII', () => {
    describe('SSN sanitization', () => {
      it('should detect and sanitize formatted SSNs', () => {
        const testCases = [
          'My SSN is 123-45-6789',
          'SSN: 123 45 6789',
          'Social Security Number: 123-45-6789'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasSSN).toBe(true);
          expect(result.content).not.toContain('123-45-6789');
          expect(result.content).not.toContain('123 45 6789');
          expect(result.content).toContain('[REDACTED]');
        });
      });

      it('should detect contextual unformatted SSNs', () => {
        const testCases = [
          'My SSN is 123456789',
          'SSN: 123456789',
          'Social Security Number: 123456789',
          'SS# 123456789',
          'SS # 123456789',
          'Social Security: 123456789'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasSSN).toBe(true);
          expect(result.content).not.toContain('123456789');
          expect(result.content).toContain('[REDACTED]');
        });
      });

      it('should NOT detect bare 9-digit sequences without context', () => {
        // Group 1: Strings that should retain the literal "123456789"
        const literalCases = [
          'My account number is 123456789',
          'The product code is 123456789',
          'Reference ID: 123456789',
          'Order number 123456789 was processed',
          'Tracking number: 123456789',
          'Serial number 123456789'
        ];

        literalCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasSSN).toBe(false);
          expect(result.content).toContain('123456789');
        });

        // Group 2: Phone-formatted and other non-matching strings
        const phoneCase = 'Phone: 123-456-7890';
        const phoneResult = sanitizePII(phoneCase);
        expect(phoneResult.metadata.hasSSN).toBe(false);
        expect(phoneResult.metadata.hasPhone).toBe(true);
        expect(phoneResult.content).toContain('[REDACTED]');

        const dateCase = 'Date: 12/34/5678';
        const dateResult = sanitizePII(dateCase);
        expect(dateResult.metadata.hasSSN).toBe(false);
        expect(dateResult.content).toBe(dateCase); // Should remain unchanged

        const zipCase = 'The zip code is 12345 and the extension is 6789';
        const zipResult = sanitizePII(zipCase);
        expect(zipResult.metadata.hasSSN).toBe(false);
        expect(zipResult.content).toBe(zipCase); // Should remain unchanged
      });

      it('should handle SSN removal vs masking', () => {
        const content = 'My SSN is 123-45-6789 and SSN: 123456789';
        
        // Test masking (default)
        const masked = sanitizePII(content);
        expect(masked.content).toContain('[REDACTED]');
        expect(masked.content).not.toContain('123-45-6789');
        expect(masked.content).not.toContain('123456789');
        
        // Test removal
        const removed = sanitizePII(content, { remove: true });
        expect(removed.content).not.toContain('[REDACTED]');
        expect(removed.content).not.toContain('123-45-6789');
        expect(removed.content).not.toContain('123456789');
      });

      it('should handle custom mask text', () => {
        const content = 'My SSN is 123-45-6789';
        const result = sanitizePII(content, { maskText: '[SSN REDACTED]' });
        
        expect(result.content).toContain('[SSN REDACTED]');
        expect(result.content).not.toContain('123-45-6789');
      });
    });

    describe('Email sanitization', () => {
      it('should detect and sanitize email addresses', () => {
        const testCases = [
          'Contact me at john.doe@example.com',
          'Email: jane@company.org',
          'Send to test+tag@domain.co.uk'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasEmail).toBe(true);
          expect(result.content).toContain('[REDACTED]');
        });
      });
    });

    describe('Phone number sanitization', () => {
      it('should detect and sanitize various phone formats', () => {
        const testCases = [
          'Call me at 123-456-7890',
          'Phone: (123) 456-7890',
          'Mobile: +1-123-456-7890',
          'Contact: 1-123-456-7890'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasPhone).toBe(true);
          expect(result.content).toContain('[REDACTED]');
        });
      });
    });

    describe('Address sanitization', () => {
      it('should detect and sanitize addresses', () => {
        const testCases = [
          'I live at 123 Main Street',
          'Address: 456 Oak Avenue, Apt 2',
          'PO Box 789'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasAddress).toBe(true);
          expect(result.content).toContain('[REDACTED]');
        });
      });
    });

    describe('False positive prevention', () => {
      it('should NOT detect common alphanumeric identifiers as PII', () => {
        const testCases = [
          // Product codes that could match old driver license pattern
          'Product code: A1234567',
          'SKU: B8765432',
          'Model: C1111111',
          
          // Reference numbers that could match old passport pattern
          'Reference: AB123456',
          'Order ID: XY987654',
          'Ticket: ZA555555',
          
          // Other common identifiers
          'Tracking: 1A2345678',
          'Serial: 2B8765432',
          'Batch: 3C1111111'
        ];

        testCases.forEach(content => {
          const result = sanitizePII(content);
          expect(result.metadata.hasPII).toBe(false);
          // Content should remain unchanged (no redaction)
          expect(result.content).toBe(content);
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle null and undefined input', () => {
        const nullResult = sanitizePII(null);
        const undefinedResult = sanitizePII(undefined);
        
        expect(nullResult.content).toBe('');
        expect(undefinedResult.content).toBe('');
        expect(nullResult.metadata.hasPII).toBe(false);
        expect(undefinedResult.metadata.hasPII).toBe(false);
      });

      it('should handle empty string', () => {
        const result = sanitizePII('');
        expect(result.content).toBe('');
        expect(result.metadata.hasPII).toBe(false);
      });

      it('should respect maxLength option', () => {
        const longContent = 'A'.repeat(15000) + ' My SSN is 123-45-6789';
        const result = sanitizePII(longContent, { maxLength: 10000 });
        
        expect(result.content.length).toBeLessThanOrEqual(10000 + 3); // +3 for '...'
        expect(result.content).toContain('...');
      });

      it('should clean up extra whitespace when removing content', () => {
        const content = 'My SSN is 123-45-6789 and email is test@example.com';
        const result = sanitizePII(content, { remove: true });
        
        expect(result.content).not.toContain('  '); // No double spaces
        expect(result.content.trim()).toBe(result.content);
      });
    });

    describe('Metadata accuracy', () => {
      it('should correctly set hasPII when any PII is detected', () => {
        const testCases = [
          { content: 'My SSN is 123-45-6789', expected: true },
          { content: 'Email: test@example.com', expected: true },
          { content: 'Phone: 123-456-7890', expected: true },
          { content: 'Address: 123 Main St', expected: true },
          { content: 'No PII here', expected: false }
        ];

        testCases.forEach(({ content, expected }) => {
          const result = sanitizePII(content);
          expect(result.metadata.hasPII).toBe(expected);
        });
      });

      it('should track original and sanitized lengths', () => {
        const content = 'My SSN is 123-45-6789';
        const result = sanitizePII(content);
        
        expect(result.metadata.originalLength).toBe(content.length);
        expect(result.metadata.sanitizedLength).toBeGreaterThan(0);
        expect(result.metadata.sanitizedLength).toBeLessThan(content.length);
      });
    });
  });

  describe('containsPII', () => {
    it('should return true for content with PII', () => {
      const testCases = [
        'My SSN is 123-45-6789',
        'Email: test@example.com',
        'Phone: 123-456-7890',
        'Address: 123 Main St',
        'SSN: 123456789' // contextual unformatted
      ];

      testCases.forEach(content => {
        expect(containsPII(content)).toBe(true);
      });
    });

    it('should return false for content without PII', () => {
      const testCases = [
        'No sensitive information here',
        'My account number is 123456789', // bare 9 digits without context
        'The product code is 123456789',
        'Reference ID: 123456789'
      ];

      testCases.forEach(content => {
        expect(containsPII(content)).toBe(false);
      });
    });

    it('should handle null and undefined input', () => {
      expect(containsPII(null)).toBe(false);
      expect(containsPII(undefined)).toBe(false);
    });
  });

  describe('createContentHash', () => {
    it('should create consistent hashes for same content', async () => {
      const content = 'Test content';
      const hash1 = await createContentHash(content);
      const hash2 = await createContentHash(content);
      
      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different content', async () => {
      const hash1 = await createContentHash('Content 1');
      const hash2 = await createContentHash('Content 2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should hash null and undefined input as empty content', async () => {
      const emptyHash = await createContentHash('');
      await expect(createContentHash(null)).resolves.toBe(emptyHash);
      await expect(createContentHash(undefined)).resolves.toBe(emptyHash);
    });

    it('should create valid SHA-256 hex hashes', async () => {
      const content = 'Test content';
      const hash = await createContentHash(content);
      
      // SHA-256 produces 64-character hex strings
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should return sanitized content, hash, and metadata', async () => {
      const content = 'My SSN is 123-45-6789';
      const result = await sanitizeForLogging(content);
      
      expect(result.sanitizedContent).not.toContain('123-45-6789');
      expect(result.sanitizedContent).toContain('[REDACTED]');
      expect(typeof result.hash).toBe('string');
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
      expect(result.metadata.hasSSN).toBe(true);
      expect(result.metadata.hasPII).toBe(true);
    });

    it('should respect sanitization options', async () => {
      const content = 'My SSN is 123-45-6789';
      const result = await sanitizeForLogging(content, { remove: true });
      
      expect(result.sanitizedContent).not.toContain('[REDACTED]');
      expect(result.sanitizedContent).not.toContain('123-45-6789');
    });
  });
});
