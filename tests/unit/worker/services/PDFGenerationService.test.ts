import { describe, it, expect, vi } from 'vitest';
import { PDFGenerationService } from '../../../../worker/services/PDFGenerationService.js';

// Mock the logger to avoid console output during tests
vi.mock('../../../../worker/utils/logger.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PDFGenerationService', () => {
  describe('validateBrandColor', () => {
    // Access the private method for testing
    const validateBrandColor = (PDFGenerationService as unknown as { validateBrandColor?: (color: string | null | undefined) => string }).validateBrandColor;

    describe('valid colors', () => {
      it('should accept valid 6-digit hex colors', () => {
        expect(validateBrandColor('#FF0000')).toBe('#ff0000');
        expect(validateBrandColor('#00FF00')).toBe('#00ff00');
        expect(validateBrandColor('#0000FF')).toBe('#0000ff');
        expect(validateBrandColor('#123456')).toBe('#123456');
        expect(validateBrandColor('#ABCDEF')).toBe('#abcdef');
      });

      it('should accept valid 3-digit hex colors', () => {
        expect(validateBrandColor('#F00')).toBe('#f00');
        expect(validateBrandColor('#0F0')).toBe('#0f0');
        expect(validateBrandColor('#00F')).toBe('#00f');
        expect(validateBrandColor('#123')).toBe('#123');
        expect(validateBrandColor('#ABC')).toBe('#abc');
      });

      it('should accept colors from the whitelist', () => {
        expect(validateBrandColor('#334e68')).toBe('#334e68');
        expect(validateBrandColor('#1e40af')).toBe('#1e40af');
        expect(validateBrandColor('#7c3aed')).toBe('#7c3aed');
        expect(validateBrandColor('#dc2626')).toBe('#dc2626');
        expect(validateBrandColor('#ea580c')).toBe('#ea580c');
        expect(validateBrandColor('#d97706')).toBe('#d97706');
        expect(validateBrandColor('#059669')).toBe('#059669');
        expect(validateBrandColor('#0891b2')).toBe('#0891b2');
        expect(validateBrandColor('#be185d')).toBe('#be185d');
        expect(validateBrandColor('#4338ca')).toBe('#4338ca');
        expect(validateBrandColor('#0f172a')).toBe('#0f172a');
        expect(validateBrandColor('#374151')).toBe('#374151');
        expect(validateBrandColor('#6b7280')).toBe('#6b7280');
        expect(validateBrandColor('#9ca3af')).toBe('#9ca3af');
        expect(validateBrandColor('#d1d5db')).toBe('#d1d5db');
      });

      it('should handle case insensitive whitelist colors', () => {
        expect(validateBrandColor('#334E68')).toBe('#334e68');
        expect(validateBrandColor('#1E40AF')).toBe('#1e40af');
        expect(validateBrandColor('#7C3AED')).toBe('#7c3aed');
      });
    });

    describe('invalid colors', () => {
      it('should reject colors with invalid characters', () => {
        expect(validateBrandColor('#GGGGGG')).toBe('#334e68');
        expect(validateBrandColor('#12345G')).toBe('#334e68');
        expect(validateBrandColor('#GGG')).toBe('#334e68');
        expect(validateBrandColor('#12G')).toBe('#334e68');
      });

      it('should reject colors with wrong length', () => {
        expect(validateBrandColor('#FF')).toBe('#334e68');
        expect(validateBrandColor('#FFFF')).toBe('#334e68');
        expect(validateBrandColor('#FFFFFFF')).toBe('#334e68');
        expect(validateBrandColor('#FF00')).toBe('#334e68');
      });

      it('should reject colors without hash', () => {
        expect(validateBrandColor('FF0000')).toBe('#334e68');
        expect(validateBrandColor('red')).toBe('#334e68');
        expect(validateBrandColor('rgb(255,0,0)')).toBe('#334e68');
        expect(validateBrandColor('hsl(0,100%,50%)')).toBe('#334e68');
      });

      it('should reject CSS injection attempts', () => {
        expect(validateBrandColor('#FF0000; background: red')).toBe('#334e68');
        expect(validateBrandColor('#FF0000/*')).toBe('#334e68');
        expect(validateBrandColor('#FF0000"')).toBe('#334e68');
        expect(validateBrandColor('#FF0000\'')).toBe('#334e68');
        expect(validateBrandColor('#FF0000</style>')).toBe('#334e68');
        expect(validateBrandColor('#FF0000<script>')).toBe('#334e68');
      });

      it('should reject empty or undefined colors', () => {
        expect(validateBrandColor('')).toBe('#334e68');
        expect(validateBrandColor(undefined)).toBe('#334e68');
        expect(validateBrandColor(null as unknown as string)).toBe('#334e68');
      });

      it('should reject colors with extra characters', () => {
        expect(validateBrandColor('#FF0000 ')).toBe('#334e68');
        expect(validateBrandColor(' #FF0000')).toBe('#334e68');
        expect(validateBrandColor('#FF0000\t')).toBe('#334e68');
        expect(validateBrandColor('#FF0000\n')).toBe('#334e68');
      });
    });

    describe('edge cases', () => {
      it('should handle mixed case hex colors', () => {
        expect(validateBrandColor('#Ff0000')).toBe('#ff0000');
        expect(validateBrandColor('#fF0000')).toBe('#ff0000');
        expect(validateBrandColor('#Ff0')).toBe('#ff0');
        expect(validateBrandColor('#fF0')).toBe('#ff0');
      });

      it('should handle colors with leading/trailing whitespace', () => {
        expect(validateBrandColor(' #FF0000 ')).toBe('#334e68');
        expect(validateBrandColor('\t#FF0000\t')).toBe('#334e68');
        expect(validateBrandColor('\n#FF0000\n')).toBe('#334e68');
      });
    });
  });

  describe('generateFilename', () => {
    const mockCaseDraft = {
      matter_type: 'Contract Dispute',
      key_facts: ['Fact 1', 'Fact 2'],
      parties: [],
      documents: [],
      evidence: [],
      jurisdiction: 'CA',
      urgency: 'high',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      status: 'draft' as const,
    };

    it('should generate filename with valid inputs', () => {
      const filename = PDFGenerationService.generateFilename(mockCaseDraft, 'John Doe');
      expect(filename).toMatch(/^case-summary-contract-dispute-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle missing client name', () => {
      const filename = PDFGenerationService.generateFilename(mockCaseDraft);
      expect(filename).toMatch(/^case-summary-contract-dispute-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle missing matter type', () => {
      const caseDraftWithoutMatter = { ...mockCaseDraft, matter_type: undefined as unknown as string };
      const filename = PDFGenerationService.generateFilename(caseDraftWithoutMatter, 'John Doe');
      expect(filename).toMatch(/^case-summary-unknown-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should sanitize special characters in matter type', () => {
      const caseDraftWithSpecialChars = { ...mockCaseDraft, matter_type: 'Contract/Dispute & Resolution!' };
      const filename = PDFGenerationService.generateFilename(caseDraftWithSpecialChars, 'John Doe');
      expect(filename).toMatch(/^case-summary-contractdispute-resolution-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should sanitize special characters in client name', () => {
      const filename = PDFGenerationService.generateFilename(mockCaseDraft, 'John/Doe & Associates!');
      expect(filename).toMatch(/^case-summary-contract-dispute-johndoe-associates-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle multiple spaces and collapse them', () => {
      const caseDraftWithSpaces = { ...mockCaseDraft, matter_type: 'Contract   Dispute   Resolution' };
      const filename = PDFGenerationService.generateFilename(caseDraftWithSpaces, 'John   Doe');
      expect(filename).toMatch(/^case-summary-contract-dispute-resolution-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle leading and trailing dashes', () => {
      const caseDraftWithDashes = { ...mockCaseDraft, matter_type: '-Contract Dispute-' };
      const filename = PDFGenerationService.generateFilename(caseDraftWithDashes, '-John Doe-');
      expect(filename).toMatch(/^case-summary-contract-dispute-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle empty client name', () => {
      const filename = PDFGenerationService.generateFilename(mockCaseDraft, '');
      expect(filename).toMatch(/^case-summary-contract-dispute-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should handle null case draft', () => {
      const filename = PDFGenerationService.generateFilename(null as unknown as typeof mockCaseDraft, 'John Doe');
      expect(filename).toMatch(/^case-summary-unknown-john-doe-\d{4}-\d{2}-\d{2}\.pdf$/);
    });
  });
});
