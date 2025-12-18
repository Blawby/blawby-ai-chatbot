import { describe, it, expect } from 'vitest';

// Type definitions for API responses
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface FileUploadData {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  description?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

describe('File Upload API Integration - Real API', () => {
  const BASE_URL = 'http://localhost:8787';

  describe('File Upload Functionality', () => {
    it('should upload a text file', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Test content for file upload'], { type: 'text/plain' }), 'test.txt');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('conversationId', 'test-upload-conversation-text');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'test.txt');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'text/plain');
    });

    it('should upload a PDF file', async () => {
      // Create a simple PDF blob (this will be a fake PDF for testing)
      const pdfContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(Test PDF Content) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n297\n%%EOF';
      
      const formData = new FormData();
      formData.append('file', new Blob([pdfContent], { type: 'application/pdf' }), 'test.pdf');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-pdf');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'test.pdf');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'application/pdf');
    });

    it('should upload a document file', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Legal document content'], { type: 'application/msword' }), 'document.doc');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-doc');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'document.doc');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'application/msword');
    });

    it('should upload an image file', async () => {
      // Create a simple 1x1 pixel PNG
      const pngData = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x37, 0x6E, 0xF9, 0x24, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      
      const formData = new FormData();
      formData.append('file', new Blob([pngData], { type: 'image/png' }), 'test.png');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-image');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'test.png');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'image/png');
    });

    it('should handle file upload with metadata', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Contract content'], { type: 'text/plain' }), 'contract.txt');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-metadata');
      formData.append('description', 'Legal contract for review');
      formData.append('category', 'contract');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'contract.txt');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'text/plain');
      
      // Assert metadata fields are returned and match sent values
      expect(result.data).toHaveProperty('description', 'Legal contract for review');
      expect(result.data).toHaveProperty('category', 'contract');
      
      // Assert metadata field types
      expect(typeof result.data.description).toBe('string');
      expect(typeof result.data.category).toBe('string');
    });

    it('should handle large file upload', async () => {
      // Create a larger text file (1MB)
      const largeContent = 'A'.repeat(1024 * 1024); // 1MB of 'A' characters
      
      const formData = new FormData();
      formData.append('file', new Blob([largeContent], { type: 'text/plain' }), 'large-file.txt');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-large');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'large-file.txt');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data.fileSize).toBeGreaterThan(1000000); // Should be over 1MB
    });

    it('should handle file upload with special characters in filename', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Special chars content'], { type: 'text/plain' }), 'test-file (1).txt');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-special');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName');
      expect(result.data).toHaveProperty('fileSize');
    });

    it('should handle file upload with organization-specific settings', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Organization specific content'], { type: 'text/plain' }), 'org-specific.txt');
      formData.append('organizationId', '01K0TNGNKNJEP8EPKHXAQV4S0R');
      formData.append('sessionId', 'test-upload-session-org');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(true);
      const result = await response.json() as ApiResponse<FileUploadData>;
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('fileId');
      expect(result.data).toHaveProperty('fileName', 'org-specific.txt');
      expect(result.data).toHaveProperty('fileSize');
      expect(result.data).toHaveProperty('fileType', 'text/plain');
    });
  });

  describe('File Upload Error Handling', () => {
    it('should handle missing file', async () => {
      const formData = new FormData();
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      formData.append('sessionId', 'test-upload-session-no-file');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should handle missing practice ID', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Test content'], { type: 'text/plain' }), 'test.txt');
      formData.append('conversationId', 'test-upload-conversation-no-practice');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should handle missing session ID', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Test content'], { type: 'text/plain' }), 'test.txt');
      formData.append('practiceId', '01K0TNGNKTM4Q0AG0XF0A8ST0Q');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should handle invalid practice ID', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['Test content'], { type: 'text/plain' }), 'test.txt');
      formData.append('practiceId', 'invalid-practice');
      formData.append('conversationId', 'test-upload-conversation-invalid-practice');
      
      const response = await fetch(`${BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      // The API should reject uploads for non-existent practices to prevent orphaned files
      expect(response.ok).toBe(false);
      expect(response.status).toBe(500); // Internal server error due to practice not found
      
      const result = await response.json() as ApiResponse;
      expect(result).toHaveProperty('success', false);
      expect(result.error).toContain('Practice \'invalid-practice\' not found');
    });
  });
});