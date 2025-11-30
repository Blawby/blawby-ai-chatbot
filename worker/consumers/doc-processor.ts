// Removed unused imports
// Removed AI summarization - using Adobe extraction only
import { AdobeDocumentService, type AdobeExtractSuccess } from '../services/AdobeDocumentService.js';
import { SessionService } from '../services/SessionService.js';
import { type AnalysisResult } from '../types.js';
import { StatusService } from '../services/StatusService.js';
import type { Env } from '../types.js';
import type { DocumentEvent, AutoAnalysisEvent } from '../types/events.js';



export default {
  async queue(batch: MessageBatch<DocumentEvent | AutoAnalysisEvent>, env: Env) {
    const adobeService = new AdobeDocumentService(env);
    for (const msg of batch.messages) {
      try {
        // Handle auto-analysis events
        if ('type' in msg.body && msg.body.type === "analyze_uploaded_document") {
          const { sessionId, organizationId, file, statusId } = msg.body as AutoAnalysisEvent;
          
          console.log('🧩 Auto-analysis started for uploaded document', { 
            sessionId, 
            organizationId, 
            file: file.name,
            mime: file.mime,
            statusId
          });
          
          // Get the createdAt timestamp for this statusId to preserve it across updates
          let statusCreatedAt: number | null = null;
          if (statusId) {
            statusCreatedAt = await StatusService.getStatusCreatedAt(env, statusId);
          }
          
          // Step 1: File uploaded (10%)
          if (statusId) {
            await StatusService.setStatus(env, {
              id: statusId,
              sessionId,
              organizationId,
              type: 'file_processing',
              status: 'processing',
              message: "📁 File uploaded, starting analysis...",
              progress: 10,
              data: { fileName: file.name }
            }, statusCreatedAt ?? undefined);
          }
          
          // Send initial status message
          await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "📄 Analyzing document...");
          
          // Step 2: Check storage (25%)
          if (statusId) {
            await StatusService.setStatus(env, {
              id: statusId,
              sessionId,
              organizationId,
              type: 'file_processing',
              status: 'processing',
              message: "🗄️ Checking file storage...",
              progress: 25,
              data: { fileName: file.name }
            }, statusCreatedAt ?? undefined);
          }
          
          // Check if FILES_BUCKET is available
          if (!env.FILES_BUCKET) {
            if (statusId) {
              await StatusService.setStatus(env, {
                id: statusId,
                sessionId,
                organizationId,
                type: 'file_processing',
                status: 'failed',
                message: "❌ Document storage is not configured",
                progress: 0,
                data: { fileName: file.name }
              }, statusCreatedAt ?? undefined);
            }
            await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "❌ Document storage is not configured");
            const failureAnalysis: AnalysisResult = {
              summary: "Storage not configured",
              entities: null,
              key_facts: null,
              action_items: null,
              confidence: 0,
              extraction_only: true,
              extraction_state: 'extracted',
              error: "FILES_BUCKET is not available"
            };
            await SessionService.sendAnalysisComplete(env, sessionId, organizationId, failureAnalysis);
            await msg.ack();
            continue;
          }
          
          // Step 3: Retrieve file from R2 (40%)
          if (statusId) {
            await StatusService.setStatus(env, {
              id: statusId,
              sessionId,
              organizationId,
              type: 'file_processing',
              status: 'processing',
              message: "📥 Retrieving file from storage...",
              progress: 40,
              data: { fileName: file.name }
            }, statusCreatedAt ?? undefined);
          }
          
          // Get file from R2
          const obj = await env.FILES_BUCKET.get(file.key);
          if (!obj) {
            if (statusId) {
              await StatusService.setStatus(env, {
                id: statusId,
                sessionId,
                organizationId,
                type: 'file_processing',
                status: 'failed',
                message: "❌ Document not found for analysis",
                progress: 0,
                data: { fileName: file.name }
              }, statusCreatedAt ?? undefined);
            }
            await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "❌ Document not found for analysis");
            
            // Send analysis complete with failure payload
            const failureAnalysis: AnalysisResult = {
              summary: "Document not found for analysis",
              entities: null,
              key_facts: null,
              action_items: null,
              confidence: 0,
              extraction_only: true,
              extraction_state: 'extracted',
              error: "Document not found for analysis"
            };
            
            await SessionService.sendAnalysisComplete(env, sessionId, organizationId, failureAnalysis);
            await msg.ack();
            continue;
          }
          
          const buf = await obj.arrayBuffer();
          
          console.log('🔧 Document analysis starting', { key: file.key });
          
          // Step 4: Start document analysis (60%)
          if (statusId) {
            await StatusService.setStatus(env, {
              id: statusId,
              sessionId,
              organizationId,
              type: 'file_processing',
              status: 'processing',
              message: "🔍 Analyzing document content...",
              progress: 60,
              data: { fileName: file.name }
            }, statusCreatedAt ?? undefined);
          }
          
          const analysis = await performDocumentAnalysis(
            env,
            adobeService,
            file.key,
            file.mime,
            buf,
            sessionId,
            organizationId,
            statusId
          );

          // Store analysis preview in KV for quick access
          await env.CHAT_SESSIONS.put(
            `preview:${sessionId}:${file.key}`, 
            JSON.stringify({
              summary: analysis.summary,
              entities: analysis.entities,
              key_facts: analysis.key_facts,
              action_items: analysis.action_items,
              confidence: analysis.confidence,
              ts: Date.now()
            }), 
            { expirationTtl: 60 * 60 * 24 * 3 } // 3 days
          );
          
          // Store extraction data in files.metadata column
          if (analysis.adobeExtract) {
            try {
              // Find the file record by file_path (which should match file.key)
              const fileRecord = await env.DB.prepare(`
                SELECT id FROM files WHERE file_path = ? AND organization_id = ? AND is_deleted = FALSE
              `).bind(file.key, organizationId).first<{ id: string }>();
              
              if (fileRecord) {
                // Get existing metadata or create new object
                const existingMetadata = await env.DB.prepare(`
                  SELECT metadata FROM files WHERE id = ?
                `).bind(fileRecord.id).first<{ metadata: string | null }>();
                
                const existingData = existingMetadata?.metadata 
                  ? JSON.parse(existingMetadata.metadata) 
                  : {};
                
                // Update metadata with extraction data
                const updatedMetadata = {
                  ...existingData,
                  extraction: {
                    ...analysis.adobeExtract,
                    extractedAt: new Date().toISOString(),
                    extractionState: analysis.extraction_state || 'extracted',
                    extractionOnly: analysis.extraction_only || false,
                    confidence: analysis.confidence
                  }
                };
                
                // Update the file record with extraction metadata
                await env.DB.prepare(`
                  UPDATE files 
                  SET metadata = ?, updated_at = datetime('now')
                  WHERE id = ?
                `).bind(JSON.stringify(updatedMetadata), fileRecord.id).run();
                
                console.log('✅ Extraction data stored in files.metadata:', { fileId: fileRecord.id });
              } else {
                console.warn('⚠️ File record not found in database, cannot store extraction data:', { fileKey: file.key });
              }
            } catch (error) {
              // Log error but don't fail the analysis
              console.error('Failed to store extraction data in files.metadata:', error);
            }
          }
          
          // Send final analysis result
          await SessionService.sendAnalysisComplete(env, sessionId, organizationId, analysis);
          
          // Update file_processing status to completed
          if (statusId) {
            try {
              await StatusService.setStatus(env, {
                id: statusId,
                sessionId,
                organizationId,
                type: 'file_processing',
                status: 'completed',
                message: `Analysis of ${file.name} completed successfully`,
                progress: 100,
                data: { fileName: file.name, analysisComplete: true }
              }, statusCreatedAt ?? undefined);
            } catch (statusError) {
              console.error('Failed to update file_processing status to completed:', statusError);
              // Continue execution even if status update fails
            }
          }
          
          console.log('✅ Auto-analysis completed successfully:', { 
            key: file.key, 
            sessionId, 
            mime: file.mime,
            confidence: analysis.confidence 
          });
          
          continue;
        }

        // Handle legacy document processing
        const { key, organizationId: _organizationId, sessionId, mime } = msg.body as DocumentEvent;
        
        if (!env.FILES_BUCKET) {
          msg.retry();
          continue;
        }
        const obj = await env.FILES_BUCKET.get(key);
        
        if (!obj) { 
          msg.retry(); 
          continue; 
        }
        const buf = await obj.arrayBuffer();

        const analysis = await performDocumentAnalysis(
          env,
          adobeService,
          key,
          mime,
          buf
        );

        // Store analysis preview in KV for quick access
        await env.CHAT_SESSIONS.put(
          `preview:${sessionId}:${key}`, 
          JSON.stringify({
            summary: analysis.summary,
            entities: analysis.entities,
            key_facts: analysis.key_facts,
            action_items: analysis.action_items,
            confidence: analysis.confidence,
            ts: Date.now()
          }), 
          { expirationTtl: 60 * 60 * 24 * 3 } // 3 days
        );
        
        
        console.log('Document processed successfully:', { key, sessionId, mime });
        
      } catch (e) {
        // Lightweight structured log
        console.error("doc-processor", { 
          err: `${e}`.slice(0, 300),
          key: 'type' in msg.body ? (msg.body as AutoAnalysisEvent).file.key : (msg.body as DocumentEvent).key,
          sessionId: 'type' in msg.body ? (msg.body as AutoAnalysisEvent).sessionId : (msg.body as DocumentEvent).sessionId 
        });
        continue;
      }
    }
  }
}

const MAX_TEXT_CHARS = 10000; // Reduced from 20000 to avoid Adobe API limits
const MAX_STRUCTURED_CHARS = 3000; // Reduced from 6000 to avoid Adobe API limits

async function performDocumentAnalysis(
  env: Env,
  adobeService: AdobeDocumentService,
  key: string,
  mime: string,
  buf: ArrayBuffer,
  sessionId?: string,
  organizationId?: string,
  statusId?: string
): Promise<AnalysisResult> {
  let analysis: AnalysisResult | undefined;
  const adobeEligible = isAdobeEligibleMime(mime);

  // Get the createdAt timestamp for this statusId to preserve it across updates
  let statusCreatedAt: number | null = null;
  if (statusId) {
    statusCreatedAt = await StatusService.getStatusCreatedAt(env, statusId);
  }

  if (adobeEligible && adobeService.isEnabled()) {
    // Step 4a: Adobe extraction (70%)
    if (statusId && sessionId && organizationId) {
      await StatusService.setStatus(env, {
        id: statusId,
        sessionId,
        organizationId,
        type: 'file_processing',
        status: 'processing',
        message: "🔍 Extracting document content with Adobe...",
        progress: 70,
        data: { fileName: key.split('/').pop() ?? key }
      }, statusCreatedAt ?? undefined);
    }
    
    if (sessionId && organizationId) {
      await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "🔍 Extracting document content...");
    }
    
    const adobeResult = await adobeService.extractFromBuffer(
      key.split('/').pop() ?? key,
      mime,
      buf
    );
    
    if (adobeResult.success && adobeResult.details) {
      // Return raw Adobe extraction (no AI summarization)
      if (statusId && sessionId && organizationId) {
        await StatusService.setStatus(env, {
          id: statusId,
          sessionId,
          organizationId,
          type: 'file_processing',
          status: 'processing',
          message: "✅ Document extraction complete",
          progress: 100,
          data: { fileName: key.split('/').pop() ?? key }
        }, statusCreatedAt ?? undefined);
      }
      
      if (sessionId && organizationId) {
        await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "✅ Document extraction complete");
      }
      
      // Return raw Adobe extraction as AnalysisResult
      const rawExtract = adobeResult.details;
      analysis = {
        summary: 'Raw extraction — no analysis performed: ' + (rawExtract.text?.substring(0, 500) || 'Document extracted successfully'),
        entities: null,
        key_facts: null,
        action_items: null,
        confidence: 0.5,
        extraction_only: true,
        extraction_state: 'extracted',
        // Include raw Adobe extraction data
        adobeExtract: {
          text: rawExtract.text,
          tables: rawExtract.tables,
          elements: rawExtract.elements
        }
      };
    } else {
      if (statusId && sessionId && organizationId) {
        await StatusService.setStatus(env, {
          id: statusId,
          sessionId,
          organizationId,
          type: 'file_processing',
          status: 'processing',
          message: "🔄 Adobe extraction unavailable, using alternative analysis...",
          progress: 75,
          data: { fileName: key.split('/').pop() ?? key }
        }, statusCreatedAt ?? undefined);
      }
      console.warn('Adobe extract returned no data, falling back to legacy summarizer', {
        key,
        mime
      });
    }
  }

  if (!analysis) {
    // No Adobe extraction available - return error (no AI fallback)
    if (sessionId && organizationId) {
      await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "❌ Document extraction not available for this file type");
    }
    analysis = {
      summary: "Document extraction is not available for this file type. Adobe PDF Services extraction is only available for PDF, DOC, and DOCX files.",
      entities: null,
      key_facts: null,
      action_items: null,
      confidence: 0,
      extraction_only: true,
      extraction_state: 'extracted',
      error: "File type not supported for extraction"
    };
  }

  return analysis;
}

// REMOVED: summarizeLegal function - AI summarization removed
// REMOVED: analyzeImage function - AI image analysis removed

function isAdobeEligibleMime(mime: string): boolean {
  return mime === 'application/pdf'
    || mime === 'application/msword'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

// REMOVED: buildSafeStructuredPayload function - no longer needed without AI summarization
// REMOVED: safeJson function - no longer needed without AI summarization
