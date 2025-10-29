import type { Env } from '../types.js';
import { StatusService } from './StatusService.js';
import { Logger } from '../utils/logger.js';
import { analyzeFile } from '../utils/fileAnalysisUtils.js';

type AttachmentData = {
  fileId: string;
  fileName: string;
  fileType: string;
  analysisType: string;
  analysisQuestion: string;
};


/**
 * Async Adobe Analysis Service
 * Handles Adobe PDF analysis in the background with real-time status updates
 * Uses existing StatusService for SSE progress updates
 */
export class AsyncAdobeAnalysis {
  /**
   * Start Adobe analysis asynchronously for multiple attachments
   * This runs fire-and-forget and provides real-time status updates
   */
  static async startAnalysis(
    env: Env,
    sessionId: string,
    organizationId: string,
    attachments: AttachmentData[]
  ): Promise<void> {
    // Fire-and-forget - don't await this
    AsyncAdobeAnalysis.processAttachments(env, sessionId, organizationId, attachments)
      .catch(error => {
        Logger.error('Async Adobe analysis failed', {
          sessionId,
          organizationId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
  }

  /**
   * Process all attachments with status updates
   */
  private static async processAttachments(
    env: Env,
    sessionId: string,
    organizationId: string,
    attachments: AttachmentData[]
  ): Promise<void> {
    for (const attachment of attachments) {
      await AsyncAdobeAnalysis.processSingleAttachment(env, sessionId, organizationId, attachment);
    }
  }

  /**
   * Process a single attachment with full status tracking
   */
  private static async processSingleAttachment(
    env: Env,
    sessionId: string,
    organizationId: string,
    attachment: AttachmentData
  ): Promise<void> {
    const statusId = await StatusService.createDocumentAnalysisStatus(
      env,
      sessionId,
      organizationId,
      attachment.fileName,
      'processing'
    );

    // Get the createdAt timestamp for this statusId to preserve it across updates
    const statusCreatedAt = await StatusService.getStatusCreatedAt(env, statusId);

    try {
      // Update status: starting extraction
      await StatusService.setStatus(env, {
        id: statusId,
        sessionId,
        organizationId,
        type: 'document_analysis',
        status: 'processing',
        message: `🔍 Extracting content from ${attachment.fileName}...`,
        progress: 25,
        data: { fileName: attachment.fileName, analysisType: attachment.analysisType }
      }, statusCreatedAt ?? undefined);

      // Perform the actual Adobe analysis (this is the blocking part we moved to background)
      const result = await AsyncAdobeAnalysis.performAdobeAnalysis(env, attachment);

      // Update status: analysis complete
      await StatusService.setStatus(env, {
        id: statusId,
        sessionId,
        organizationId,
        type: 'document_analysis',
        status: 'completed',
        message: `✅ Analysis complete for ${attachment.fileName}`,
        progress: 100,
        data: { 
          fileName: attachment.fileName,
          result: {
            confidence: result.confidence as number,
            summary: result.summary as string,
            keyFactsCount: Array.isArray(result.key_facts) ? result.key_facts.length : 0,
            entitiesCount: {
              people: Array.isArray((result.entities as Record<string, unknown>)?.people) ? ((result.entities as Record<string, unknown>).people as unknown[]).length : 0,
              orgs: Array.isArray((result.entities as Record<string, unknown>)?.orgs) ? ((result.entities as Record<string, unknown>).orgs as unknown[]).length : 0,
              dates: Array.isArray((result.entities as Record<string, unknown>)?.dates) ? ((result.entities as Record<string, unknown>).dates as unknown[]).length : 0
            }
          }
        }
      }, statusCreatedAt ?? undefined);

      Logger.info('Async Adobe analysis completed successfully', {
        sessionId,
        organizationId,
        fileName: attachment.fileName,
        confidence: result.confidence as number
      });

    } catch (error) {
      // Update status: failed
      await StatusService.setStatus(env, {
        id: statusId,
        sessionId,
        organizationId,
        type: 'document_analysis',
        status: 'failed',
        message: `❌ Analysis failed for ${attachment.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { 
          fileName: attachment.fileName,
          error: error instanceof Error ? error.message : String(error)
        }
      }, statusCreatedAt ?? undefined);

      Logger.error('Async Adobe analysis failed for attachment', {
        sessionId,
        organizationId,
        fileName: attachment.fileName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Perform Adobe analysis using existing analysis infrastructure
   * This reuses the existing analyzeFile logic without modification
   */
  private static async performAdobeAnalysis(
    env: Env,
    attachment: AttachmentData
  ): Promise<Record<string, unknown>> {
    // This is the same call that was blocking in the middleware
    // Now it runs in the background with status updates
    return await analyzeFile(env, attachment.fileId, attachment.analysisQuestion);
  }
}
