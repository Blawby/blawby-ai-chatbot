// Removed unused imports
// Removed custom PDF text extraction - using Cloudflare AI directly
import { withAIRetry } from '../utils/retry.js';
import { AdobeDocumentService, type AdobeExtractSuccess } from '../services/AdobeDocumentService.js';
import { SessionService, type AnalysisResult } from '../services/SessionService.js';
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
              entities: { people: [], orgs: [], dates: [] },
              key_facts: [],
              action_items: [],
              confidence: 0,
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
              entities: { people: [], orgs: [], dates: [] },
              key_facts: [],
              action_items: [],
              confidence: 0,
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

const MAX_TEXT_CHARS = 20000;
const MAX_STRUCTURED_CHARS = 6000;

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
      // Step 4b: AI summarization (80%)
      if (statusId && sessionId && organizationId) {
        await StatusService.setStatus(env, {
          id: statusId,
          sessionId,
          organizationId,
          type: 'file_processing',
          status: 'processing',
          message: "🤖 Summarizing with AI...",
          progress: 80,
          data: { fileName: key.split('/').pop() ?? key }
        }, statusCreatedAt ?? undefined);
      }
      
      if (sessionId && organizationId) {
        await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "🔍 Summarizing document...");
      }
      analysis = await summarizeAdobeResult(env, adobeResult.details, sessionId, organizationId, statusId);
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
    if (mime.startsWith('image/')) {
      if (sessionId && organizationId) {
        await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "🔍 Analyzing image content...");
      }
      analysis = await analyzeImage(env, new Uint8Array(buf));
    } else if (mime === 'application/pdf') {
      if (sessionId && organizationId) {
        await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "❌ Unable to analyze PDF document");
      }
      analysis = {
        summary: "PDF document could not be analyzed. Adobe extraction failed and text-based analysis is not available for binary PDF files.",
        entities: { people: [], orgs: [], dates: [] },
        key_facts: [],
        action_items: [],
        confidence: 0,
        error: "Adobe extraction failed for PDF"
      };
    } else {
      // Step 4c: Text processing fallback (80%)
      if (statusId && sessionId && organizationId) {
        await StatusService.setStatus(env, {
          id: statusId,
          sessionId,
          organizationId,
          type: 'file_processing',
          status: 'processing',
          message: "📝 Processing document text...",
          progress: 80,
          data: { fileName: key.split('/').pop() ?? key }
        }, statusCreatedAt ?? undefined);
      }
      
      if (sessionId && organizationId) {
        await SessionService.sendAnalysisStatus(env, sessionId, organizationId, "🔍 Processing document text...");
      }
      const text = new TextDecoder().decode(buf);
      analysis = await summarizeLegal(env, text, sessionId, organizationId, statusId, statusCreatedAt);
    }
  }

  return analysis;
}

async function summarizeLegal(env: Env, text: string, sessionId?: string, organizationId?: string, statusId?: string, statusCreatedAt?: number) {
  const prompt = [
    "You are a legal intake summarizer. Output JSON with fields:",
    "summary, key_facts[], entities{people[],orgs[],dates[]}, action_items[], confidence(0-1).",
    "Use only the given text; if unsure, say so."
  ].join("\n");
  
  const truncated = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}...` : text;
  
  // Step 4d: AI analysis (90%)
  if (statusId && sessionId && organizationId) {
    await StatusService.setStatus(env, {
      id: statusId,
      sessionId,
      organizationId,
      type: 'file_processing',
      status: 'processing',
      message: "🤖 Analyzing with AI...",
      progress: 90,
      data: { fileName: "document" }
    }, statusCreatedAt ?? undefined);
  }
  
  const res = await withAIRetry(() => (env.AI as { run: (model: string, params: Record<string, unknown>) => Promise<unknown> }).run("@cf/openai/gpt-oss-20b", {
    input: `${prompt}\n\n${truncated}`,
    max_tokens: 800,
    temperature: 0.1
  }));
  
  return safeJson(res as Record<string, unknown>);
}

async function analyzeImage(env: Env, bytes: Uint8Array) {
  const res = await withAIRetry(() => env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
    image: Array.from(bytes),
    prompt: "Extract any visible legal parties, dates, amounts, signatures, and document type. Output JSON with summary, key_facts, entities{people,orgs,dates}, action_items, confidence.",
    max_tokens: 512
  }));
  
  return safeJson(res as Record<string, unknown>);
}

function isAdobeEligibleMime(mime: string): boolean {
  return mime === 'application/pdf'
    || mime === 'application/msword'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function buildSafeStructuredPayload(tables: Record<string, unknown>[], elements: Record<string, unknown>[]): string {
  // If no data, return empty string
  if (tables.length === 0 && elements.length === 0) {
    return '';
  }

  // Try to include all data first
  const fullPayload = { tables, elements };
  const fullSerialized = JSON.stringify(fullPayload);
  
  // If it fits within the limit, return it
  if (fullSerialized.length <= MAX_STRUCTURED_CHARS) {
    return fullSerialized;
  }

  // Try including tables incrementally
  let includedTables: unknown[] = [];
  let includedElements: unknown[] = [];
  
  // First, try to include all tables
  for (const table of tables) {
    const testPayload = { tables: [...includedTables, table], elements: [] };
    const testSerialized = JSON.stringify(testPayload);
    if (testSerialized.length <= MAX_STRUCTURED_CHARS) {
      includedTables.push(table);
    } else {
      break;
    }
  }
  
  // Then try to include elements
  for (const element of elements) {
    const testPayload = { tables: includedTables, elements: [...includedElements, element] };
    const testSerialized = JSON.stringify(testPayload);
    if (testSerialized.length <= MAX_STRUCTURED_CHARS) {
      includedElements.push(element);
    } else {
      break;
    }
  }
  
  // If we have some data, return it
  if (includedTables.length > 0 || includedElements.length > 0) {
    return JSON.stringify({ tables: includedTables, elements: includedElements });
  }
  
  // If even a single item is too large, return a placeholder
  return '[structured data omitted - too large]';
}

async function summarizeAdobeResult(env: Env, extract: AdobeExtractSuccess, sessionId?: string, organizationId?: string, statusId?: string) {
  const text = extract.text ?? '';
  const structured = buildSafeStructuredPayload(
    (extract.tables ?? []) as Record<string, unknown>[], 
    (extract.elements ?? []) as Record<string, unknown>[]
  );

  const truncatedText = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}...` : text;

  const basePrompt = [
    "You are a legal intake summarizer. Output JSON with fields:",
    "summary, key_facts[], entities{people[],orgs[],dates[]}, action_items[], confidence(0-1).",
    "Prioritize parties, deadlines, dollar amounts, obligations, and recommended next steps.",
    "Use the structured cues provided by Adobe Extract when available."
  ].join("\n");

  const userContent = [
    truncatedText,
    structured ? `Structured data:\n${structured}` : ''
  ].filter(Boolean).join('\n\n');

  const res = await withAIRetry(() => (env.AI as { run: (model: string, params: Record<string, unknown>) => Promise<unknown> }).run("@cf/openai/gpt-oss-20b", {
    input: `${basePrompt}\n\n${userContent}`,
    max_tokens: 800,
    temperature: 0.1
  }));

  return safeJson(res as Record<string, unknown>);
}

function safeJson(x: unknown): AnalysisResult {
  if (typeof x === "string") {
    try { 
      return JSON.parse(x); 
    } catch {
      // Fallback to structured response if JSON parsing fails
      return {
        summary: x.substring(0, 200) + (x.length > 200 ? '...' : ''),
        key_facts: [x],
        entities: { people: [], orgs: [], dates: [] },
        action_items: [],
        confidence: 0.5
      };
    }
  }
  if (typeof x === "object" && x !== null && 'summary' in x) {
    return x as AnalysisResult;
  }
  // Final fallback
  return {
    summary: "Analysis completed but response format was unexpected",
    key_facts: ["Document processed successfully"],
    entities: { people: [], orgs: [], dates: [] },
    action_items: [],
    confidence: 0.3
  };
}
