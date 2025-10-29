import type { ConversationContext } from './conversationContextManager.js';
import type { OrganizationConfig } from '../services/OrganizationService.js';
import type { PipelineMiddleware } from './pipeline.js';
import type { Env, AgentMessage } from '../types.js';
import { analyzeFile, getAnalysisQuestion } from '../utils/fileAnalysisUtils.js';
import { Logger } from '../utils/logger.js';

/**
 * Type adapter for file analysis - contains only the properties needed by analyzeFile
 */
type FileAnalysisEnv = {
  FILES_BUCKET: Env['FILES_BUCKET'];
  DB: Env['DB'];
  AI: Env['AI'];
  ENABLE_ADOBE_EXTRACT: Env['ENABLE_ADOBE_EXTRACT'];
  ADOBE_CLIENT_ID: Env['ADOBE_CLIENT_ID'];
  ADOBE_CLIENT_SECRET: Env['ADOBE_CLIENT_SECRET'];
  ADOBE_TECHNICAL_ACCOUNT_ID: Env['ADOBE_TECHNICAL_ACCOUNT_ID'];
  ADOBE_TECHNICAL_ACCOUNT_EMAIL: Env['ADOBE_TECHNICAL_ACCOUNT_EMAIL'];
  ADOBE_ORGANIZATION_ID: Env['ADOBE_ORGANIZATION_ID'];
  ADOBE_IMS_BASE_URL: Env['ADOBE_IMS_BASE_URL'];
  ADOBE_PDF_SERVICES_BASE_URL: Env['ADOBE_PDF_SERVICES_BASE_URL'];
  ADOBE_SCOPE: Env['ADOBE_SCOPE'];
  CLOUDFLARE_ACCOUNT_ID: Env['CLOUDFLARE_ACCOUNT_ID'];
  CLOUDFLARE_API_TOKEN: Env['CLOUDFLARE_API_TOKEN'];
  CLOUDFLARE_PUBLIC_URL: Env['CLOUDFLARE_PUBLIC_URL'];
  AI_MODEL_DEFAULT: Env['AI_MODEL_DEFAULT'];
  AI_MAX_TEXT_LENGTH: Env['AI_MAX_TEXT_LENGTH'];
  AI_MAX_TABLES: Env['AI_MAX_TABLES'];
  AI_MAX_ELEMENTS: Env['AI_MAX_ELEMENTS'];
  AI_MAX_STRUCTURED_PAYLOAD_LENGTH: Env['AI_MAX_STRUCTURED_PAYLOAD_LENGTH'];
  DEBUG: Env['DEBUG'];
};

/**
 * Timeout helper to prevent operations from hanging indefinitely
 */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    )
  ]);
};

type AttachmentData = {
  name: string;
  size: number;
  type: string;
  url: string;
};

type AnalysisResult = {
  fileId: string;
  fileName: string;
  fileType: string;
  analysisType: string;
  confidence: number;
  summary?: string;
  entities?: {
    people?: string[];
    orgs?: string[];
    dates?: string[];
  };
  key_facts?: string[];
  action_items?: string[];
};

/**
 * File Analysis Middleware - handles automatic file analysis for uploaded documents
 * Detects file attachments and automatically analyzes them to extract legal information
 * Updates conversation context with analysis results for downstream middleware
 */
export const fileAnalysisMiddleware: PipelineMiddleware = {
  kind: 'standard',
  name: 'fileAnalysisMiddleware',
  
  execute: async (messages: AgentMessage[], context: ConversationContext, organizationConfig: OrganizationConfig, env: Env) => {
    try {
      // Check if we have file attachments in the current request
      if (!context.currentAttachments || context.currentAttachments.length === 0) {
        return { context };
      }

      // Only process attachments if the latest message indicates file analysis is needed
      // This prevents processing stale attachments when user just says "hello"
      const latestMessage = messages[messages.length - 1];
      if (!latestMessage || latestMessage.role !== 'user') {
        Logger.info('Skipping file analysis - no user message in current request', {
          sessionId: context.sessionId,
          organizationId: context.organizationId
        });
        return { context };
      }

      // Initialize processed files tracking if not exists
      if (!context.processedFiles) {
        context.processedFiles = [];
      }

      // Filter out already processed files to prevent duplicates
      const attachments = context.currentAttachments.filter(attachment => {
        const fileId = extractFileIdFromUrl(attachment.url);
        if (!fileId) {
          Logger.warn('Could not extract file ID from attachment URL', { url: attachment.url });
          return false;
        }
        
        if (context.processedFiles!.includes(fileId)) {
          Logger.info('Skipping already processed file', {
            sessionId: context.sessionId,
            organizationId: context.organizationId,
            fileId,
            fileName: attachment.name
          });
          return false;
        }
        
        return true;
      });

      if (attachments.length === 0) {
        Logger.info('No new attachments to process after deduplication', {
          sessionId: context.sessionId,
          organizationId: context.organizationId
        });
        return { context };
      }

      // Process attachments when they exist in context.currentAttachments
      // This ensures users see analysis results for newly uploaded files
      Logger.info('Processing current attachments for file analysis', {
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        attachmentCount: attachments.length,
        totalAttachments: context.currentAttachments.length
      });
      
      const analysisResults = [];

      // Process each attachment synchronously for chat requests
      // This ensures the AI agent waits for analysis to complete before responding
      for (const attachment of attachments) {
        // Extract file ID from attachment URL
        const fileId = extractFileIdFromUrl(attachment.url);
        if (!fileId) {
          Logger.warn('Could not extract file ID from attachment URL', { url: attachment.url });
          continue;
        }

        // Check for duplicates before starting analysis (allow retries on transient failures)
        if (context.processedFiles!.includes(fileId)) {
          Logger.info('Skipping already processed file', {
            sessionId: context.sessionId,
            organizationId: context.organizationId,
            fileId,
            fileName: attachment.name
          });
          continue;
        }

        // Determine analysis type based on file
        const analysisType = determineAnalysisType(attachment);
        
        Logger.info('Processing file attachment synchronously', {
          sessionId: context.sessionId,
          organizationId: context.organizationId,
          fileId,
          fileName: attachment.name,
          analysisType
        });

        try {
          // Get appropriate analysis question
          const analysisQuestion = getAnalysisQuestion(analysisType);
          
          // Create typed adapter with only the properties needed by analyzeFile
          const fileAnalysisEnv: FileAnalysisEnv = {
            FILES_BUCKET: env.FILES_BUCKET,
            DB: env.DB,
            AI: env.AI,
            ENABLE_ADOBE_EXTRACT: env.ENABLE_ADOBE_EXTRACT,
            ADOBE_CLIENT_ID: env.ADOBE_CLIENT_ID,
            ADOBE_CLIENT_SECRET: env.ADOBE_CLIENT_SECRET,
            ADOBE_TECHNICAL_ACCOUNT_ID: env.ADOBE_TECHNICAL_ACCOUNT_ID,
            ADOBE_TECHNICAL_ACCOUNT_EMAIL: env.ADOBE_TECHNICAL_ACCOUNT_EMAIL,
            ADOBE_ORGANIZATION_ID: env.ADOBE_ORGANIZATION_ID,
            ADOBE_IMS_BASE_URL: env.ADOBE_IMS_BASE_URL,
            ADOBE_PDF_SERVICES_BASE_URL: env.ADOBE_PDF_SERVICES_BASE_URL,
            ADOBE_SCOPE: env.ADOBE_SCOPE,
            CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
            CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
            CLOUDFLARE_PUBLIC_URL: env.CLOUDFLARE_PUBLIC_URL,
            AI_MODEL_DEFAULT: env.AI_MODEL_DEFAULT,
            AI_MAX_TEXT_LENGTH: env.AI_MAX_TEXT_LENGTH,
            AI_MAX_TABLES: env.AI_MAX_TABLES,
            AI_MAX_ELEMENTS: env.AI_MAX_ELEMENTS,
            AI_MAX_STRUCTURED_PAYLOAD_LENGTH: env.AI_MAX_STRUCTURED_PAYLOAD_LENGTH,
            DEBUG: env.DEBUG
          };
          
          // CRITICAL FIX: Perform file analysis synchronously with proper awaiting
          // This ensures the middleware blocks until analysis completes
          const analysis = await withTimeout(
            analyzeFile(fileAnalysisEnv as unknown as Env, fileId, analysisQuestion),
            30000
          );
          
          // Only add results with meaningful confidence (> 0)
          if (analysis && (analysis.confidence as number) > 0) {
            analysisResults.push({
              fileId,
              fileName: attachment.name,
              fileType: attachment.type,
              analysisType,
              ...analysis
            });

            Logger.info('File analysis completed successfully', {
              sessionId: context.sessionId,
              organizationId: context.organizationId,
              fileId,
              fileName: attachment.name,
              confidence: analysis.confidence as number,
              summaryLength: (analysis.summary as string)?.length || 0
            });
          } else {
            Logger.warn('File analysis failed or returned low confidence', {
              sessionId: context.sessionId,
              organizationId: context.organizationId,
              fileId,
              fileName: attachment.name,
              confidence: (analysis?.confidence as number) || 0,
              analysisResult: analysis
            });
          }

          // Mark file as successfully processed only after analysis completes
          context.processedFiles!.push(fileId);
        } catch (error) {
          Logger.error('File analysis error in middleware', {
            sessionId: context.sessionId,
            organizationId: context.organizationId,
            fileName: attachment.name,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Add partial result with error message instead of silently failing
          const fileId = extractFileIdFromUrl(attachment.url);
          if (fileId) {
            analysisResults.push({
              fileId,
              fileName: attachment.name,
              fileType: attachment.type,
              analysisType: determineAnalysisType(attachment),
              confidence: 0,
              summary: `I encountered an issue analyzing "${attachment.name}". This could be due to file format or content issues. Would you like to describe the document to me instead?`,
              key_facts: [],
              action_items: ['Describe the document content manually', 'Try uploading in a different format']
            });
          }
        }
      }

    // Only return a response if we have successful analysis results (confidence > 0)
    if (analysisResults.length > 0) {
      Logger.info('File analysis completed successfully, providing response', {
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        analysisCount: analysisResults.length
      });

      // Update context with file analysis results and clear currentAttachments
      const updatedContext = {
        ...context,
        currentAttachments: undefined, // Clear attachments after processing
        fileAnalysis: {
          status: 'completed' as const,
          files: attachments.map(attachment => ({
            fileId: extractFileIdFromUrl(attachment.url) || '',
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            url: attachment.url
          })),
          results: analysisResults,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          totalFiles: analysisResults.length
        }
      };

      // Generate response based on analysis results
      const response = generateAnalysisResponse(analysisResults);

      Logger.info('Returning file analysis response from middleware', {
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        responseLength: response.length
      });

      return {
        context: updatedContext,
        response,
        shouldStop: true // Stop pipeline and return analysis response
      };
    } else {
      Logger.info('No successful analysis results, continuing pipeline', {
        sessionId: context.sessionId,
        organizationId: context.organizationId
      });
    }

      // No successful analysis results - clear attachments and continue pipeline
      const updatedContext = {
        ...context,
        currentAttachments: undefined // Clear attachments even if no analysis results
      };
      return { context: updatedContext };
    } catch (error) {
      Logger.error('File analysis middleware error', {
        sessionId: context.sessionId,
        organizationId: context.organizationId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Clear attachments and continue pipeline on error
      const updatedContext = {
        ...context,
        currentAttachments: undefined
      };
      return { context: updatedContext };
    }
  }
};

/**
 * Extract file ID from attachment URL
 */
function extractFileIdFromUrl(url: string): string | null {
  // Handle URLs like "/api/files/organization-session-timestamp-random"
  const urlParts = url.split('/api/files/');
  return urlParts.length > 1 ? urlParts[1] : null;
}

/**
 * Determine analysis type based on file attachment
 */
function determineAnalysisType(attachment: AttachmentData): string {
  const fileName = attachment.name?.toLowerCase() || '';
  const fileType = attachment.type?.toLowerCase() || '';
  
  // Check file extension
  if (fileName.includes('contract') || fileName.includes('agreement')) {
    return 'contract';
  } else if (fileName.includes('medical') || fileName.includes('bill') || fileName.includes('diagnosis')) {
    return 'medical_document';
  } else if (fileName.includes('form') || fileName.includes('application')) {
    return 'government_form';
  } else if (fileName.includes('resume') || fileName.includes('cv')) {
    return 'resume';
  }
  
  // Check MIME type
  if (fileType.startsWith('image/')) {
    return 'image';
  } else if (fileType === 'application/pdf') {
    return 'legal_document';
  } else if (fileType.startsWith('text/')) {
    return 'legal_document';
  }
  
  // Default to general analysis
  return 'general';
}

/**
 * Generate response based on analysis results
 */
function generateAnalysisResponse(analysisResults: AnalysisResult[]): string {
  let response = "I've analyzed your uploaded document(s) and here's what I found:\n\n";

  for (const result of analysisResults) {
    response += `**${result.fileName}**\n`;
    
    if (result.summary) {
      response += `**Document Analysis:** ${result.summary}\n\n`;
    }

    if (result.entities?.people?.length > 0) {
      response += `**Parties Involved:** ${result.entities.people.join(', ')}\n`;
    }

    if (result.entities?.orgs?.length > 0) {
      response += `**Organizations:** ${result.entities.orgs.join(', ')}\n`;
    }

    if (result.entities?.dates?.length > 0) {
      response += `**Important Dates:** ${result.entities.dates.join(', ')}\n`;
    }

    if (result.key_facts?.length > 0) {
      response += `**Key Facts:**\n`;
      result.key_facts.slice(0, 3).forEach((fact: string) => {
        response += `• ${fact}\n`;
      });
    }

    if (result.action_items?.length > 0) {
      response += `**Recommended Actions:**\n`;
      result.action_items.slice(0, 3).forEach((action: string) => {
        response += `• ${action}\n`;
      });
    }

    // Confidence level removed from user display
  }

  response += "Based on this analysis, I can help you:\n";
  response += "• Create a legal matter for attorney review\n";
  response += "• Identify potential legal issues or concerns\n";
  response += "• Determine appropriate legal services needed\n";
  response += "• Prepare for consultation with an attorney\n\n";
  response += "Would you like me to help you with any of these next steps?";

  return response;
}
