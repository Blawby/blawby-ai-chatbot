import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { parseJsonBody } from '../utils.js';
import { PDFGenerationService } from '../services/PDFGenerationService';
import { RemoteApiService } from '../services/RemoteApiService.js';

import type { Env } from '../types';

interface PDFDownloadRequest {
  filename: string;
  matterType: string;
  generatedAt: string;
  sessionId?: string;
  practiceId?: string;
}

/**
 * Sanitize filename to prevent header injection attacks
 * Removes or replaces potentially dangerous characters
 */
function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'document.pdf';
  }
  
  // Remove or replace potentially dangerous characters
  // Keep only alphanumeric, dots, hyphens, underscores, and spaces
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._\s-]/g, '_')  // Replace dangerous chars with underscore
    .replace(/\s+/g, '_')                 // Replace spaces with underscores
    .replace(/_{2,}/g, '_')               // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '')              // Remove leading/trailing underscores
    .substring(0, 255);                   // Limit length to prevent buffer overflow
  
  // Ensure it has a valid extension
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    return `${sanitized}.pdf`;
  }
  
  return sanitized || 'document.pdf';
}

export async function handlePDF(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /api/pdf/download - Download generated PDF
  if (path === '/api/pdf/download' && request.method === 'POST') {
    try {
      let body: PDFDownloadRequest;
      try {
        body = await parseJsonBody(request) as PDFDownloadRequest;
      } catch {
        throw HttpErrors.badRequest('Invalid JSON');
      }

      // Validate required fields
      if (!body.filename || !body.matterType || !body.generatedAt) {
        throw HttpErrors.badRequest('Missing required PDF information');
      }

      // REMOVED: ConversationContextManager - PDF download requires case draft data in request body
      // For now, return error indicating PDF must be regenerated with case draft data
      throw HttpErrors.notFound('PDF not found. Please regenerate your case summary with case draft data.');

    } catch (error) {
      return handleError(error);
    }
  }

  // POST /api/pdf/generate - Generate new PDF
  if (path === '/api/pdf/generate' && request.method === 'POST') {
    try {
      let body: Record<string, unknown>;
      try {
        body = await parseJsonBody(request) as Record<string, unknown>;
        if (!body || typeof body !== 'object') {
          throw new Error('Invalid JSON body');
        }
      } catch (_parseError) {
        throw HttpErrors.badRequest('Invalid JSON body');
      }

      const { sessionId, practiceId, matterType: _matterType } = body as {
        sessionId: string;
        practiceId: string;
        matterType?: string;
      };

      if (!sessionId || !practiceId) {
        throw HttpErrors.badRequest('Missing session ID or practice ID');
      }

      // REMOVED: ConversationContextManager - case draft must be provided in request body
      const { caseDraft, clientName } = body as {
        caseDraft?: {
          matter_type?: string;
          key_facts?: string[];
          timeline?: string;
          parties?: string[];
          documents?: string[];
          evidence?: string[];
          jurisdiction?: string;
          urgency?: string;
          [key: string]: unknown;
        };
        clientName?: string;
      };

      if (!caseDraft) {
        throw HttpErrors.badRequest('Case draft data is required in request body.');
      }

      // clientName is optional - PDF generation service handles empty/missing values gracefully
      // If clientName is provided, it will be used in the PDF; otherwise, it will be omitted

      // Load practice config for PDF generation
      const practice = await RemoteApiService.getPractice(env, practiceId, request);
      const conversationConfig = practice?.conversationConfig;

      // Generate PDF - ensure all required CaseDraft fields are provided
      const now = new Date().toISOString();
      
      // Normalize parties array - must be array of objects with role property
      const normalizedParties = Array.isArray(caseDraft.parties) 
        ? caseDraft.parties.map((p: unknown) => {
            if (typeof p === 'object' && p !== null && 'role' in p) {
              return p as { role: string; name?: string; relationship?: string };
            }
            // If it's a string or invalid format, convert to object
            return { role: typeof p === 'string' ? p : 'Unknown' };
          })
        : [];

      const pdfCaseDraft = {
        matter_type: caseDraft.matter_type || 'General Consultation',
        key_facts: Array.isArray(caseDraft.key_facts) ? caseDraft.key_facts : [],
        timeline: typeof caseDraft.timeline === 'string' ? caseDraft.timeline : undefined,
        parties: normalizedParties,
        documents: Array.isArray(caseDraft.documents) 
          ? caseDraft.documents.filter((d): d is string => typeof d === 'string')
          : [],
        evidence: Array.isArray(caseDraft.evidence)
          ? caseDraft.evidence.filter((e): e is string => typeof e === 'string')
          : [],
        jurisdiction: caseDraft.jurisdiction || 'Unknown',
        urgency: caseDraft.urgency || 'normal',
        created_at: typeof caseDraft.created_at === 'string' ? caseDraft.created_at : now,
        updated_at: now,
        status: ((caseDraft.status === 'draft' || caseDraft.status === 'ready') ? caseDraft.status : 'ready') as 'draft' | 'ready'
      };

      const pdfResult = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: pdfCaseDraft,
        clientName: clientName,
        practiceName: practice?.name || conversationConfig?.description || 'Legal Services',
        practiceBrandColor: conversationConfig?.brandColor || '#2563eb'
      }, env);

      if (pdfResult.success && pdfResult.pdfBuffer) {
        const filename = PDFGenerationService.generateFilename(pdfCaseDraft, clientName);
        
        return createSuccessResponse({
          success: true,
          pdf: {
            filename,
            size: pdfResult.pdfBuffer.byteLength,
            generatedAt: new Date().toISOString(),
            matterType: caseDraft.matter_type || 'General'
          }
        });
      } else {
        throw HttpErrors.internalServerError(pdfResult.error || 'Failed to generate PDF');
      }

    } catch (error) {
      return handleError(error);
    }
  }

  throw HttpErrors.notFound('PDF endpoint not found');
}
