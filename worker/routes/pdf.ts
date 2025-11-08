import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { parseJsonBody } from '../utils.js';
import { PDFGenerationService } from '../services/PDFGenerationService';
import { ConversationContextManager } from '../middleware/conversationContextManager';

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

      // Get session and organization context if provided
      let context = null;
      if (body.sessionId && body.organizationId) {
        context = await ConversationContextManager.load(body.sessionId, body.organizationId, env);
      }

      // If we have context and case draft, generate fresh PDF
      if (context?.caseDraft) {
        const pdfResult = await PDFGenerationService.generateCaseSummaryPDF({
          caseDraft: {
            ...context.caseDraft,
            jurisdiction: context.caseDraft.jurisdiction || 'Unknown',
            urgency: context.caseDraft.urgency || 'normal'
          },
          clientName: context.contactInfo?.name,
          organizationName: context.organizationConfig?.description || 'Legal Services',
          organizationBrandColor: context.organizationConfig?.brandColor || '#2563eb'
        }, env);

        if (pdfResult.success && pdfResult.pdfBuffer) {
          // Sanitize filename to prevent header injection
          const sanitizedFilename = sanitizeFilename(body.filename);
          
          return new Response(pdfResult.pdfBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
              'Content-Length': pdfResult.pdfBuffer.byteLength.toString(),
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        } else {
          throw HttpErrors.internalServerError(pdfResult.error || 'Failed to generate PDF');
        }
      } else {
        // No context available - return error
        throw HttpErrors.notFound('PDF not found. Please regenerate your case summary.');
      }

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

      // Load conversation context
      const context = await ConversationContextManager.load(sessionId, organizationId, env);
      
      if (!context?.caseDraft) {
        throw HttpErrors.badRequest('No case draft found. Please create a case draft first.');
      }

      // Load organization config for PDF generation
      const { OrganizationService } = await import('../services/OrganizationService');
      const organizationService = new OrganizationService(env);
      const organization = await organizationService.getOrganization(organizationId);
      const organizationConfig = organization?.config;

      // Generate PDF
      const pdfResult = await PDFGenerationService.generateCaseSummaryPDF({
        caseDraft: {
          ...context.caseDraft,
          jurisdiction: context.caseDraft.jurisdiction || 'Unknown',
          urgency: context.caseDraft.urgency || 'normal'
        },
        clientName: context.contactInfo?.name,
        organizationName: organizationConfig?.name || organization?.name || organizationConfig?.description || 'Legal Services',
        organizationBrandColor: organizationConfig?.brandColor || '#2563eb'
      }, env);

      if (pdfResult.success && pdfResult.pdfBuffer) {
        const filename = PDFGenerationService.generateFilename({
          ...context.caseDraft,
          jurisdiction: context.caseDraft.jurisdiction || 'Unknown',
          urgency: context.caseDraft.urgency || 'normal'
        }, context.contactInfo?.name);
        
        // Update context with new PDF information
        const updatedContext = {
          ...context,
          generatedPDF: {
            filename,
            size: pdfResult.pdfBuffer.byteLength,
            generatedAt: new Date().toISOString(),
            matterType: context.caseDraft.matter_type
          }
        };

        // Save updated context
        await ConversationContextManager.save(updatedContext, env);

        return createSuccessResponse({
          success: true,
          pdf: {
            filename,
            size: pdfResult.pdfBuffer.byteLength,
            generatedAt: new Date().toISOString(),
            matterType: context.caseDraft.matter_type
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
