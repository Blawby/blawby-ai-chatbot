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
  organizationId?: string;
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

      const { sessionId, organizationId, matterType: _matterType } = body as {
        sessionId: string;
        organizationId: string;
        matterType?: string;
      };

      if (!sessionId || !organizationId) {
        throw HttpErrors.badRequest('Missing session ID or organization ID');
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

      // Load organization config for PDF generation
      const organization = await RemoteApiService.getOrganization(env, organizationId, request);
      const organizationConfig = organization?.config;

      // Generate PDF
      const pdfResult = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: {
          ...caseDraft,
          jurisdiction: caseDraft.jurisdiction || 'Unknown',
          urgency: caseDraft.urgency || 'normal'
        },
        clientName: clientName,
        organizationName: organization?.name || organizationConfig?.description || 'Legal Services',
        organizationBrandColor: organizationConfig?.brandColor || '#2563eb'
      }, env);

      if (pdfResult.success && pdfResult.pdfBuffer) {
        const filename = PDFGenerationService.generateFilename({
          ...caseDraft,
          jurisdiction: caseDraft.jurisdiction || 'Unknown',
          urgency: caseDraft.urgency || 'normal'
        }, clientName);
        
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
