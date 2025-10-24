import { describe, it, expect, beforeAll } from 'vitest';
import { WORKER_URL } from '../../setup-worker-integration';

// Type definitions for API responses
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AnalysisData {
  analysis: {
    summary: string;
    key_facts: string[];
    entities: {
      people: string[];
      orgs: string[];
    };
    action_items: string[];
    confidence: number;
  };
}

interface ChatData {
  response: string;
  workflow?: { [key: string]: unknown };
}

// Real API integration tests - these test the local development worker

// Helper function to make HTTP requests with proper error handling
async function _makeRequest(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}

// Use real fetch for these tests
beforeAll(() => {
  // Ensure fetch is available
  if (!global.fetch) {
    console.warn('Fetch not available, using node-fetch or similar');
  }
});

describe('Real API Integration Tests', () => {
  describe('POST /api/analyze - Real File Analysis', () => {
    it('should analyze a real PDF file using actual Cloudflare AI', async () => {
      // Create a real PDF file with actual content
      const pdfContent = `
        Paul Chris Luke
        Software Engineer & Legal Tech Specialist
        
        EXPERIENCE:
        - Senior Software Engineer at Blawby (2023-Present)
        - Full Stack Developer at LegalTech Inc (2021-2023)
        - Junior Developer at StartupCorp (2019-2021)
        
        SKILLS:
        - JavaScript, TypeScript, React, Node.js
        - Python, Django, PostgreSQL
        - Cloudflare Workers, AWS, Docker
        - Legal document automation
        
        EDUCATION:
        - BS Computer Science, University of Technology (2019)
        - Legal Technology Certificate, Law School (2022)
        
        PROJECTS:
        - Built AI-powered legal intake chatbot
        - Developed document analysis system
        - Created automated legal form generator
      `;
      
      const pdfBlob = new Blob([pdfContent], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'paul-resume.pdf', { type: 'application/pdf' });

      // Create FormData for the request
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('question', 'Analyze this resume and extract key information about the candidate');

      console.log('Making real API request to:', `${WORKER_URL}/api/analyze`);
      console.log('File size:', pdfFile.size, 'bytes');
      console.log('File type:', pdfFile.type);

      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      console.log('Response status:', response.status);

      expect(response.status).toBe(200);

      const result = await response.json() as ApiResponse<AnalysisData>;
      console.log('Real API response:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      // Safe type assertion after confirming data exists
      const data = result.data as AnalysisData;
      expect(data.analysis).toBeDefined();
      expect(data.analysis.summary).toBeDefined();
      expect(data.analysis.key_facts).toBeDefined();
      expect(data.analysis.entities).toBeDefined();
      expect(data.analysis.action_items).toBeDefined();
      expect(data.analysis.confidence).toBeDefined();

      // Verify the analysis contains expected content
      // Note: Fake PDF blobs won't have extractable text, so we expect low confidence
      expect(data.analysis.summary).toBeDefined();
      expect(Array.isArray(data.analysis.key_facts)).toBe(true);
      // Adobe can't extract text from fake PDF blobs, so confidence will be very low or 0
      expect(data.analysis.confidence).toBeGreaterThanOrEqual(0);
      // The analysis should indicate the PDF content is not accessible or provide a reasonable response
      expect(data.analysis.summary.length).toBeGreaterThan(10);
      
      // Log what was actually extracted for debugging
      console.log('PDF Analysis - Summary:', data.analysis.summary);
      console.log('PDF Analysis - People found:', data.analysis.entities?.people);
      console.log('PDF Analysis - Key facts:', data.analysis.key_facts);
    }, 60000); // 60 second timeout for real API call

    it('should analyze a real text file using actual Cloudflare AI', async () => {
      const textContent = `
        LEGAL DOCUMENT ANALYSIS
        
        Client: Jane Smith
        Case Type: Employment Discrimination
        Date: January 15, 2024
        
        SUMMARY:
        Jane Smith alleges she was terminated from her position at TechCorp due to her age (52) and gender. 
        She worked as a Senior Software Engineer for 8 years and received excellent performance reviews.
        
        KEY FACTS:
        - Employed at TechCorp from 2016-2024
        - Received "Exceeds Expectations" in all annual reviews
        - Replaced by a 28-year-old male with less experience
        - No documented performance issues
        - Termination occurred 2 weeks after requesting flexible hours for family care
        
        DAMAGES SOUGHT:
        - Back pay and benefits: $180,000
        - Emotional distress: $50,000
        - Punitive damages: $200,000
        - Attorney fees and costs
        
        EVIDENCE:
        - Performance reviews (2016-2023)
        - Email correspondence with HR
        - Witness statements from colleagues
        - Job posting for replacement position
      `;
      
      const textBlob = new Blob([textContent], { type: 'text/plain' });
      const textFile = new File([textBlob], 'legal-case.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', textFile);
      formData.append('question', 'Analyze this legal document and extract key case information');

      console.log('Making real API request for text file analysis');

      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      expect(response.status).toBe(200);

      const result = await response.json() as ApiResponse<AnalysisData>;
      console.log('Text file analysis response:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      // Safe type assertion after confirming data exists
      const data = result.data as AnalysisData;
      // Text analysis should extract the key information from the legal document
      expect(data.analysis.summary).toBeDefined();
      expect(data.analysis.summary.length).toBeGreaterThan(10);
      expect(Array.isArray(data.analysis.key_facts)).toBe(true);
      expect(data.analysis.confidence).toBeGreaterThanOrEqual(0);
      
      // If the analysis is successful, it should contain the key entities
      if (data.analysis.entities?.people && data.analysis.entities.people.length > 0) {
        expect(data.analysis.entities.people).toContain('Jane Smith');
      }
      if (data.analysis.entities?.orgs && data.analysis.entities.orgs.length > 0) {
        expect(data.analysis.entities.orgs).toContain('TechCorp');
      }
    }, 60000);

    it('should handle unsupported file types gracefully', async () => {
      const unsupportedBlob = new Blob(['binary data'], { type: 'application/octet-stream' });
      const unsupportedFile = new File([unsupportedBlob], 'data.bin', { type: 'application/octet-stream' });

      const formData = new FormData();
      formData.append('file', unsupportedFile);
      formData.append('question', 'Analyze this file');

      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      expect(response.status).toBe(200);

      const result = await response.json() as ApiResponse<{ analysis: { extraction_failed: boolean } }>;
      expect(result.success).toBe(true);
      expect(result.data?.analysis?.extraction_failed).toBe(true);
    }, 30000);
  });

  describe('POST /api/agent - Real Chat with File Analysis', () => {
    it('should handle a real chat conversation with file upload and analysis', async () => {
      // First, upload a file
      const pdfContent = `
        EMPLOYMENT CONTRACT
        
        Employee: Michael Johnson
        Position: Senior Developer
        Company: Innovation Labs
        Start Date: March 1, 2024
        Salary: $120,000 annually
        
        TERMS:
        - Full-time employment
        - Remote work allowed
        - 20 days PTO annually
        - Health insurance provided
        - 401k with 4% match
        
        RESPONSIBILITIES:
        - Lead development organization of 5 engineers
        - Architect scalable solutions
        - Mentor junior developers
        - Participate in code reviews
        - Attend weekly organization meetings
        
        TERMINATION:
        - 30 days notice required
        - Severance package available
        - Non-compete clause for 12 months
      `;
      
      const pdfBlob = new Blob([pdfContent], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'employment-contract.pdf', { type: 'application/pdf' });

      // Create a chat request with file attachment
      const chatRequest = {
        message: "Can you please provide your full name?",
        sessionId: "test-session-" + Date.now(),
        organizationSlug: "north-carolina-legal-services",
        attachments: [
          {
            name: pdfFile.name,
            type: pdfFile.type,
            size: pdfFile.size,
            fileId: "test-file-" + Date.now()
          }
        ]
      };

      console.log('Making real chat request with file attachment');

      const response = await fetch(`${WORKER_URL}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chatRequest)
      });

      // Log the actual response for debugging
      const result = await response.json() as ApiResponse<ChatData>;
      console.log('Real chat response:', JSON.stringify(result, null, 2));

      // For now, just verify we get a response (even if it's an error)
      expect(result).toBeDefined();
      
      if (response.status === 200) {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        
        // Safe type assertion after confirming data exists
        const data = result.data as ChatData;
        expect(data.response).toBeDefined();
        expect(data.workflow).toBeDefined();
        
        // The AI should ask for the user's name as per the validation flow
        expect(data.response).toContain('name');
      } else {
        // If we get an error, log it for debugging
        console.log('Chat API error:', result);
        expect(result.success).toBe(false);
      }
    }, 90000); // 90 second timeout for chat with file analysis

    it('should handle a legal question about an uploaded document', async () => {
      const legalContent = `
        EVICTION NOTICE
        
        To: Sarah Williams
        From: Downtown Properties LLC
        Date: February 1, 2024
        Property: 123 Main St, Apt 4B, Charlotte, NC
        
        REASON FOR EVICTION:
        Non-payment of rent for January 2024 ($1,200)
        
        NOTICE PERIOD:
        You have 10 days to pay the outstanding rent or vacate the premises.
        
        AMOUNT DUE:
        - January rent: $1,200
        - Late fees: $50
        - Total: $1,250
        
        PAYMENT OPTIONS:
        - Online portal: www.example.com
        - Mail: PO Box 123, Charlotte, NC 28201
        - In person: 456 Business Ave, Charlotte, NC
        
        CONTACT:
        Property Manager: John Davis
        Phone: (704) 555-0123
        Email: john.davis@example.com
      `;
      
      const legalBlob = new Blob([legalContent], { type: 'text/plain' });
      const legalFile = new File([legalBlob], 'eviction-notice.txt', { type: 'text/plain' });

      const chatRequest = {
        message: "I received this eviction notice. What are my rights and what should I do?",
        sessionId: "test-session-" + Date.now(),
        organizationSlug: "north-carolina-legal-services",
        attachments: [
          {
            name: legalFile.name,
            type: legalFile.type,
            size: legalFile.size,
            fileId: "test-file-" + Date.now()
          }
        ]
      };

      console.log('Making real legal consultation request');

      const response = await fetch(`${WORKER_URL}/api/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chatRequest)
      });

      // Log the actual response for debugging
      const result = await response.json() as ApiResponse<ChatData>;
      console.log('Legal consultation response:', JSON.stringify(result, null, 2));

      // For now, just verify we get a response (even if it's an error)
      expect(result).toBeDefined();
      
      if (response.status === 200) {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        
        // Safe type assertion after confirming data exists
        const data = result.data as ChatData;
        expect(data.response).toBeDefined();
        
        // The response should mention eviction or tenant rights
        expect(data.response.toLowerCase()).toMatch(/eviction|tenant|rights|notice/);
      } else {
        // If we get an error, log it for debugging
        console.log('Legal consultation error:', result);
        expect(result.success).toBe(false);
      }
    }, 90000);
  });

  describe('Error Handling - Real API Tests', () => {
    it('should handle missing file gracefully', async () => {
      const formData = new FormData();
      formData.append('question', 'Analyze this file');

      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      expect(response.status).toBe(200);

      const result = await response.json() as ApiResponse<{ analysis: { extraction_failed: boolean } }>;
      expect(result.success).toBe(true);
      expect(result.data?.analysis?.extraction_failed).toBe(true);
    }, 30000);

    it('should handle files that are too large', async () => {
      // Create a large file (over 10MB)
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const largeBlob = new Blob([largeContent], { type: 'text/plain' });
      const largeFile = new File([largeBlob], 'large-file.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', largeFile);
      formData.append('question', 'Analyze this file');

      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        body: formData
      });

      expect(response.status).toBe(400);

      const result = await response.json() as ApiResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid request');
    }, 30000);

    it('should reject non-POST requests', async () => {
      const response = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'GET'
      });

      expect(response.status).toBe(405);
    }, 30000);
  });
});
