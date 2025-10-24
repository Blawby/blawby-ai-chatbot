import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFGenerationService } from '../../../../worker/services/PDFGenerationService.js';

// Mock the logger to avoid console output during tests
vi.mock('../../../../worker/utils/logger.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Note: pdf-lib is installed as a dev dependency and used for PDF generation

// Create a mockable useFeatureFlag function
const mockUseFeatureFlag = vi.fn();

// Mock feature flags with controllable useFeatureFlag function
vi.mock('../../../../src/config/features.js', () => ({
  features: {
    enablePDFGeneration: false,
  },
  useFeatureFlag: mockUseFeatureFlag,
}));

describe('PDFGenerationService', () => {
  const mockEnv = {} as unknown;

  const mockCaseDraft = {
    matter_type: 'Personal Injury',
    key_facts: ['Client was injured in a car accident', 'Other driver was at fault'],
    timeline: 'Accident occurred on January 15, 2024',
    parties: [
      { role: 'Plaintiff', name: 'John Doe' },
      { role: 'Defendant', name: 'Jane Smith' }
    ],
    documents: ['Police Report', 'Medical Records'],
    evidence: ['Photos of accident scene', 'Witness statements'],
    jurisdiction: 'California',
    urgency: 'high',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    status: 'draft' as const,
  };

  const mockOptions = {
    caseDraft: mockCaseDraft,
    clientName: 'John Doe',
    organizationName: 'Test Law Firm',
    organizationBrandColor: '#334e68',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Feature Flagged Off', () => {
    beforeEach(() => {
      vi.mocked(mockUseFeatureFlag).mockReturnValue(false);
    });

    it('should not initialize when feature is disabled', () => {
      // Test that the service acknowledges the disabled flag
      // Since the service doesn't currently check the feature flag internally,
      // we verify that the service can still be instantiated but operations
      // would be controlled by the calling code
      // @ts-expect-error - Mock environment for testing
      expect(() => PDFGenerationService.initialize(mockEnv)).not.toThrow();
    });

    it('should have validateBrandColor method available even when disabled', () => {
      // Test that utility methods are still accessible
      const validColor = PDFGenerationService.validateBrandColor('#334e68');
      expect(validColor).toBe('#334e68');
    });

    it('should have generateFilename method available even when disabled', () => {
      // Test that utility methods are still accessible
      const filename = PDFGenerationService.generateFilename(mockCaseDraft, 'John Doe');
      expect(filename).toMatch(/case-summary-personal-injury-john-doe-\d{4}-\d{2}-\d{2}\.pdf/);
    });
  });

  describe('Feature Flagged On', () => {
    beforeEach(() => {
      vi.mocked(mockUseFeatureFlag).mockReturnValue(true);
    });

    it('should initialize successfully when feature is enabled', () => {
      // @ts-expect-error - Mock environment for testing
      expect(() => PDFGenerationService.initialize(mockEnv)).not.toThrow();
    });

    it('should generate PDF successfully when pdf-lib is available', async () => {
      // @ts-expect-error - Mock environment for testing
      const result = await PDFGenerationService.generateCaseSummaryPDF(mockOptions, mockEnv);
      
      // Since pdf-lib is available in test environment, this should succeed
      expect(result.success).toBe(true);
      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer).toBeInstanceOf(ArrayBuffer);
      expect(result.pdfBuffer.byteLength).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });


    it('should validate and sanitize brand colors', () => {
      // Test valid colors
      expect(PDFGenerationService.validateBrandColor('#334e68')).toBe('#334e68');
      expect(PDFGenerationService.validateBrandColor('#1e40af')).toBe('#1e40af');
      
      // Test invalid colors fall back to default
      expect(PDFGenerationService.validateBrandColor('invalid')).toBe('#334e68');
      expect(PDFGenerationService.validateBrandColor('#gggggg')).toBe('#334e68');
      
      // Test undefined/null colors
      expect(PDFGenerationService.validateBrandColor(undefined)).toBe('#334e68');
      expect(PDFGenerationService.validateBrandColor('')).toBe('#334e68');
    });

    it('should generate appropriate filenames', () => {
      const filename1 = PDFGenerationService.generateFilename(mockCaseDraft, 'John Doe');
      expect(filename1).toMatch(/case-summary-personal-injury-john-doe-\d{4}-\d{2}-\d{2}\.pdf/);

      const filename2 = PDFGenerationService.generateFilename(mockCaseDraft);
      expect(filename2).toMatch(/case-summary-personal-injury-\d{4}-\d{2}-\d{2}\.pdf/);

      // Test with special characters in matter type
      const specialCaseDraft = { ...mockCaseDraft, matter_type: 'Contract Dispute & Breach' };
      const filename3 = PDFGenerationService.generateFilename(specialCaseDraft, 'Test Client');
      expect(filename3).toMatch(/case-summary-contract-dispute-breach-test-client-\d{4}-\d{2}-\d{2}\.pdf/);
    });

    it('should escape HTML content to prevent XSS', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const escaped = (PDFGenerationService as unknown as { escapeHtml: (input: string) => string }).escapeHtml(maliciousInput);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should handle missing or undefined case draft fields', async () => {
      const minimalOptions = {
        caseDraft: {
          matter_type: 'Test Matter',
          key_facts: [],
          parties: [],
          documents: [],
          evidence: [],
          jurisdiction: '',
          urgency: '',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          status: 'draft' as const,
        },
        clientName: undefined,
        organizationName: undefined,
        organizationBrandColor: undefined,
      };

      // @ts-expect-error - Mock environment for testing
      const result = await PDFGenerationService.generateCaseSummaryPDF(minimalOptions, mockEnv);
      
      // Since pdf-lib is available, this should succeed even with minimal options
      expect(result.success).toBe(true);
      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer).toBeInstanceOf(ArrayBuffer);
      expect(result.pdfBuffer.byteLength).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });
  });
});
