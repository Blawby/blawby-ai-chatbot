import type { Env } from '../types';
import { HttpErrors, createSuccessResponse } from '../errorHandler';
import { rateLimit, getClientId } from '../middleware/rateLimit.js';
import { AdobeDocumentService, type AdobeExtractSuccess, type IAdobeExtractor } from '../services/AdobeDocumentService.js';
import { type AnalysisResult } from '../types.js';
import { 
  log, 
  logRequestStart, 
  logError, 
  logWarning 
} from '../utils/logging.js';
import { parseEnvBool } from '../utils/safeStringUtils.js';
import { createRateLimitResponse } from '../errorHandler';

// Legal keywords for relevance scoring
const LEGAL_KEYWORDS = [
  'contract', 'agreement', 'payment', 'amount', 'date', 'party', 'obligation', 
  'liability', 'damages', 'settlement', 'court', 'judge', 'plaintiff', 'defendant', 
  'signature', 'witness'
];

// Safe JSON serialization utility to prevent OOM and handle cyclic objects
function safeStringify(obj: unknown, maxLength: number = 10000): string {
  try {
    const seen = new WeakSet();
    const replacer = (key: string, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
    
    const result = JSON.stringify(obj, replacer);
    
    // Truncate if too long to prevent OOM
    if (result.length > maxLength) {
      return result.substring(0, maxLength) + '...[truncated]';
    }
    
    return result;
  } catch (_error) {
    return '<unserializable-table>';
  }
}

// Helper functions for prioritizing tables and elements by relevance
function calculateTableRelevance(table: { rows?: unknown[]; [key: string]: unknown }, _documentText: string): number {
  let score = 0;
  
  // Base score for table size (larger tables often more important)
  if (table.rows && Array.isArray(table.rows)) {
    score += Math.min(table.rows.length * 0.1, 2); // Cap at 2 points
  }
  
  // Check for legal keywords in table content - use safe serialization
  const tableText = safeStringify(table).toLowerCase();
  
  LEGAL_KEYWORDS.forEach(keyword => {
    if (tableText.includes(keyword)) {
      score += 1;
    }
  });
  
  // Bonus for tables with monetary values
  if (/\$[\d,]+\.?\d*/.test(tableText)) {
    score += 1.5;
  }
  
  // Bonus for tables with dates
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(tableText)) {
    score += 1;
  }
  
  return score;
}

function calculateElementRelevance(element: { text?: string; [key: string]: unknown }, _documentText: string): number {
  let score = 0;
  
  // Base score for element size
  if (element.text && element.text.length > 0) {
    score += Math.min(element.text.length / 100, 2); // Cap at 2 points
  }
  
  // Check for legal keywords in element content
  const elementText = (element.text || '').toLowerCase();
  
  LEGAL_KEYWORDS.forEach(keyword => {
    if (elementText.includes(keyword)) {
      score += 1;
    }
  });
  
  // Bonus for elements with monetary values
  if (/\$[\d,]+\.?\d*/.test(elementText)) {
    score += 1.5;
  }
  
  // Bonus for elements with dates
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(elementText)) {
    score += 1;
  }
  
  // Bonus for signature-related elements
  if (elementText.includes('signature') || elementText.includes('signed') || elementText.includes('witness')) {
    score += 2;
  }
  
  return score;
}

// Extended AnalysisResult for debugging purposes
interface ExtendedAnalysisResult extends AnalysisResult {
  adobeExtractTextLength?: number;
  adobeExtractTextPreview?: string;
  extraction_failed?: boolean;
  extraction_method?: string;
  truncationFailed?: boolean;
  truncationNote?: string;
  debug?: {
    adobeEnabled: boolean;
    adobeClientIdSet: boolean;
    adobeClientSecretSet: boolean;
    fileTypeEligible: boolean;
    analysisMethod: string;
    debugTimestamp: string;
    codeVersion: string;
    summaryContainsUnable: boolean;
    summaryContainsNotProvided: boolean;
    summaryLength: number;
    adobeExtractTextLength: number;
    adobeExtractTextPreview: string;
  };
}



// Helper function to create fallback response
function _createFallbackResponse(aiResponse: string): AnalysisResult {
  return {
    summary: aiResponse.substring(0, 200) + (aiResponse.length > 200 ? '...' : ''),
    key_facts: [aiResponse],
    entities: { people: [], orgs: [], dates: [] },
    action_items: [],
    confidence: 0.6
  };
}


async function attemptAdobeExtract(
  file: File,
  question: string,
  env: Env,
  requestId?: string
): Promise<ExtendedAnalysisResult | null> {
  log('debug', 'adobe_service_creation', { message: 'Creating Adobe service', requestId });
  
  // Use mock extractor if available (for testing), otherwise use real Adobe service
  const adobeService: IAdobeExtractor = env.ADOBE_EXTRACTOR_SERVICE || new AdobeDocumentService(env);
  log('debug', 'adobe_service_created', { 
    message: 'Adobe service created', 
    isMock: !!env.ADOBE_EXTRACTOR_SERVICE,
    requestId 
  });
  log('debug', 'adobe_service_enabled_check', { isEnabled: adobeService.isEnabled(), requestId });
  
  const eligibleTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);

  log('info', 'adobe_extract_attempt', {
    fileType: file.type,
    isEligibleType: eligibleTypes.has(file.type),
    isEnabled: adobeService.isEnabled(),
    enableFlag: env.ENABLE_ADOBE_EXTRACT,
    adobeClientId: env.ADOBE_CLIENT_ID ? 'SET' : 'NOT SET',
    adobeClientSecret: env.ADOBE_CLIENT_SECRET ? 'SET' : 'NOT SET',
    requestId
  });

  log('info', 'adobe_service_check', {
    isEnabled: adobeService.isEnabled(),
    enableFlag: env.ENABLE_ADOBE_EXTRACT,
    adobeClientId: env.ADOBE_CLIENT_ID ? 'SET' : 'NOT SET',
    requestId
  });

  if (!eligibleTypes.has(file.type)) {
    log('info', 'adobe_extract_skipped', { reason: 'not_eligible_type', fileType: file.type, requestId });
    return null;
  }
  
  if (!adobeService.isEnabled()) {
    log('info', 'adobe_extract_skipped', { reason: 'not_enabled', isEnabled: adobeService.isEnabled(), requestId });
    return null;
  }

  try {
    log('info', 'adobe_extraction_start', { fileName: file.name, fileType: file.type, requestId });
    log('debug', 'adobe_extraction_details', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      requestId
    });
    
    const buffer = await file.arrayBuffer();
    log('info', 'adobe_file_buffer', { fileName: file.name, bufferSize: buffer.byteLength, requestId });
    log('debug', 'adobe_buffer_details', { bufferSize: buffer.byteLength, requestId });
    
    const extractResult = await adobeService.extractFromBuffer(file.name, file.type, buffer);
    log('info', 'adobe_extraction_result', {
      success: extractResult.success,
      hasDetails: !!extractResult.details,
      error: extractResult.error,
      warnings: extractResult.warnings,
      requestId
    });
    
    log('debug', 'adobe_extraction_result_details', {
      success: extractResult.success,
      hasDetails: !!extractResult.details,
      error: extractResult.error || 'None',
      warnings: extractResult.warnings || 'None',
      textLength: extractResult.details?.text?.length || 0,
      textPreview: extractResult.details?.text?.substring(0, 200) || 'No text',
      requestId
    });

    if (!extractResult.success || !extractResult.details) {
      log('warn', 'adobe_extraction_failed', { reason: 'no_success_or_details', requestId });
      log('debug', 'adobe_extraction_failure_details', {
        success: extractResult.success,
        hasDetails: !!extractResult.details,
        error: extractResult.error,
        requestId
      });
      return null;
    }

    log('info', 'adobe_extraction_success', { fileName: file.name, requestId });
    log('debug', 'adobe_extraction_success_details', { message: 'Adobe extraction successful, returning raw extraction', requestId });
    
    // Return raw Adobe extraction results (no AI summarization)
    const rawExtract = extractResult.details;
    return {
      summary: 'Document extracted successfully',
      key_facts: [],
      entities: { people: [], orgs: [], dates: [] },
      action_items: [],
      confidence: 1.0, // 1.0 indicates successful extraction (no AI analysis performed)
      extraction_state: 'extracted',
      extraction_only: true,
      adobeExtractTextLength: rawExtract.text?.length || 0,
      adobeExtractTextPreview: rawExtract.text?.substring(0, 200) || 'No text',
      extraction_method: 'adobe_extract',
      // Include raw Adobe extraction data
      adobeExtract: {
        text: rawExtract.text,
        tables: rawExtract.tables,
        elements: rawExtract.elements
      }
    } as ExtendedAnalysisResult;
  } catch (error) {
    logWarning('analyze', 'adobe_extract_failed', 'Adobe extract failed', {
      fileName: file.name,
      fileType: file.type,
      error: error instanceof Error ? error.message : String(error),
      requestId,
      debug: {
        adobeEnabled: Boolean(env.ENABLE_ADOBE_EXTRACT),
        adobeClientIdSet: !!env.ADOBE_CLIENT_ID,
        adobeClientSecretSet: !!env.ADOBE_CLIENT_SECRET,
        fileTypeEligible: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type),
        analysisMethod: 'adobe_extract_failed',
        debugTimestamp: new Date().toISOString(),
        codeVersion: 'v2.3-debug'
      }
    });
    
    // Return null - no fallback to AI
    return null;
  }
}

// REMOVED: summarizeAdobeExtract function - AI summarization removed, returning raw Adobe extraction instead

// Helper function to safely parse JSON responses with hardened truncation handling
function safeJson(response: unknown): AnalysisResult {
  log('debug', 'safe_json_debug', {
    phase: 'safeJson',
    inputType: typeof response,
    keys: typeof response === 'object' && response !== null ? Object.keys(response) : [],
    snippet: typeof response === "string"
      ? response.slice(0, 200)
      : JSON.stringify(response || {}).slice(0, 200)
  });
  
  try {
    // Handle structured AI output - look for the actual JSON in the response
    if (response && typeof response === 'object' && 'output' in response && Array.isArray((response as Record<string, unknown>).output)) {
      const output = (response as Record<string, unknown>).output as unknown[];
      // Find the message with the actual content (prefer message type over reasoning type)
      const message = output.find((msg: unknown) => 
        (msg as Record<string, unknown>).content && Array.isArray((msg as Record<string, unknown>).content) && (msg as Record<string, unknown>).type === 'message'
      ) || output.find((msg: unknown) => 
        (msg as Record<string, unknown>).content && Array.isArray((msg as Record<string, unknown>).content)
      );
      
      if (message && typeof message === 'object' && message !== null && 'content' in message) {
        const messageContent = (message as Record<string, unknown>).content;
        if (Array.isArray(messageContent)) {
          // Find the output_text content (the actual response)
          const outputTextContent = messageContent.find((content: unknown) => 
            (content as Record<string, unknown>).type === 'output_text' && (content as Record<string, unknown>).text
          );
        
          if (outputTextContent && typeof outputTextContent === 'object' && outputTextContent !== null && 'text' in outputTextContent) {
            log('debug', 'safe_json_found_output', {
              phase: 'safeJson',
              snippet: (outputTextContent.text as string).substring(0, 200) + '...'
            });
            
            // Extract and clean the JSON text
            let text = (outputTextContent.text as string).trim();
            
            // Remove quotes if wrapped
            if (text.startsWith('"') && text.endsWith('"')) {
              text = text.slice(1, -1);
            }
            
            // Apply the hardened JSON extraction logic
            return extractValidJson(text);
          }
        }
      }
    }

    // Handle direct string input
    if (typeof response === "string") {
      return extractValidJson(response);
    }

    // Handle object with nested output_text
    if (response && typeof response === 'object' && 'result' in response && 
        response.result && typeof response.result === 'object' && 'output_text' in response.result) {
      return extractValidJson((response.result as Record<string, unknown>).output_text as string);
    }
    if (response && typeof response === 'object' && 'output_text' in response) {
      return extractValidJson((response as Record<string, unknown>).output_text as string);
    }

    // Handle already-parsed object
    if (typeof response === "object" && response && 'summary' in response) {
      return response as unknown as AnalysisResult;
    }

    // Fallback
    logWarning('analyze', 'safe_json_unexpected_format', 'Unexpected format in safeJson', { response });
    return {
      summary: "Analysis completed but response format was unexpected",
      key_facts: ["Document processed successfully"],
      entities: { people: [], orgs: [], dates: [] },
      action_items: [],
      confidence: 0.3
    };
  } catch (err) {
    logError('analyze', 'safe_json_parse_error', err as Error, { response });
    return {
      summary: "Analysis completed but response format was unexpected",
      key_facts: ["Document processed successfully"],
      entities: { people: [], orgs: [], dates: [] },
      action_items: [],
      confidence: 0.5
    };
  }
}

// Hardened JSON extraction that handles truncated/concatenated responses
function extractValidJson(input: string): AnalysisResult {
  try {
    const raw = typeof input === "string" ? input : JSON.stringify(input);

    // Find the first JSON object in the string, accounting for quoted braces and escapes.
    const jsonBlock = extractFirstJsonObject(raw);
    if (!jsonBlock) {
      throw new Error("No JSON object boundaries found");
    }

    const parsed = JSON.parse(jsonBlock);
    if (parsed && typeof parsed === "object" && parsed.summary) {
      log('debug', 'safe_json_valid_parsed', { phase: 'extractValidJson' });
      return parsed;
    }

    throw new Error("Parsed JSON does not contain expected structure");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError('analyze', 'safe_json_final_fallback', new Error(errorMessage), { phase: 'extractValidJson', snippet: String(input).slice(0, 200) });
  }

  // Final fallback — return structured failure
  return {
    summary: "Document analysis completed but JSON parsing failed",
    key_facts: ["Document processed successfully"],
    entities: { people: [], orgs: [], dates: [] },
    action_items: ["Review document format and retry analysis"],
    confidence: 0.3,
  };
}

/**
 * Extracts the first complete JSON object from a string, handling escaped characters.
 */
function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}


// MIME types allowed for analysis - only Adobe-supported types since AI analysis was removed
// Adobe PDF Services only supports: PDF, DOC, DOCX
const ALLOWED_ANALYSIS_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const MAX_ANALYSIS_FILE_SIZE = 8 * 1024 * 1024; // 8MB for inline analysis

// REMOVED: analyzeWithGenericAI function - AI analysis removed, only Adobe extraction supported

function validateAnalysisFile(file: File): { isValid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_ANALYSIS_FILE_SIZE) {
    return { 
      isValid: false, 
      error: `File size exceeds maximum limit of ${MAX_ANALYSIS_FILE_SIZE / (1024 * 1024)}MB for analysis` 
    };
  }

  // Check file type
  if (!ALLOWED_ANALYSIS_MIME_TYPES.includes(file.type)) {
    return { 
      isValid: false, 
      error: `File type ${file.type} is not supported for analysis` 
    };
  }

  return { isValid: true };
}

export async function analyzeWithCloudflareAI(
  file: File,
  question: string,
  env: Env,
  requestId?: string
): Promise<ExtendedAnalysisResult> {
  log('debug', 'analyze_with_cloudflare_ai_called', {
    fileType: file.type,
    fileName: file.name,
    requestId
  });
  
  // Try Adobe extraction first
  log('debug', 'attempting_adobe_extraction', { message: 'Attempting Adobe extraction', requestId });
  const adobeAnalysis = await attemptAdobeExtract(file, question, env, requestId);
  if (adobeAnalysis) {
    log('debug', 'adobe_analysis_successful', { message: 'Adobe analysis successful, returning result', requestId });
    return adobeAnalysis;
  }
  
  // Adobe extraction failed or ineligible - return error (no AI fallback)
  log('debug', 'adobe_extraction_failed', { message: 'Adobe extraction failed, no fallback available', requestId });
  log('info', 'adobe_extract_failed', {
    fileName: file.name,
    fileType: file.type,
    reason: 'adobe_extraction_failed_or_ineligible',
    requestId
  });
  
  // Return error response - no AI fallback
  return {
    summary: "Document extraction failed. Adobe PDF Services extraction is not available for this file type or is not configured.",
    key_facts: ["Adobe extraction failed or file type not supported"],
    entities: { people: [], orgs: [], dates: [] },
    action_items: ["Ensure Adobe PDF Services is configured", "Try a different file format (PDF, DOC, DOCX)"],
    confidence: 0.0,
    extraction_failed: true,
    extraction_method: 'adobe_extract_failed'
  } as ExtendedAnalysisResult;
}

export async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  const _startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  if (request.method !== 'POST') {
    throw HttpErrors.methodNotAllowed('Only POST method is allowed');
  }

  // Rate limiting for analysis endpoint
  const clientId = getClientId(request);
  if (!(await rateLimit(env, clientId, 30, 60))) { // 30 requests per minute
    logWarning('analyze', 'rate_limit.exceeded', 'Rate limit exceeded', { clientId });
    return createRateLimitResponse(60, {
      errorMessage: 'Rate limit exceeded. Please try again later.'
    });
  }

  try {
    logRequestStart('analyze', request.method, new URL(request.url).pathname);
    
    // Debug: Log environment variables
    log('info', 'environment_check', {
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ? 'SET' : 'NOT SET',
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN ? 'SET' : 'NOT SET'
    });

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const question = (formData.get('q') as string) || "Summarize and extract key facts for legal intake.";

    if (!file) {
      throw HttpErrors.badRequest('No file provided');
    }

    // Validate file
    const fileValidation = validateAnalysisFile(file);
    if (!fileValidation.isValid) {
      throw HttpErrors.badRequest(fileValidation.error!);
    }

    log('info', 'file_analysis_start', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      question: question,
      ENABLE_ADOBE_EXTRACT: env.ENABLE_ADOBE_EXTRACT,
      ADOBE_CLIENT_ID: env.ADOBE_CLIENT_ID ? 'SET' : 'NOT SET',
      requestId
    });

    // Debug: Log Adobe service status
    log('debug', 'adobe_service_status_check', {
      enableAdobeExtract: env.ENABLE_ADOBE_EXTRACT,
      adobeClientId: env.ADOBE_CLIENT_ID ? 'SET' : 'NOT SET',
      adobeClientSecret: env.ADOBE_CLIENT_SECRET ? 'SET' : 'NOT SET',
      fileTypeEligible: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type),
      requestId
    });

    // Perform analysis
    const analysis = await analyzeWithCloudflareAI(file, question, env, requestId);
    
    // Add debug information to analysis
    const extendedAnalysis = analysis as ExtendedAnalysisResult;
    extendedAnalysis.debug = {
      adobeEnabled: Boolean(env.ENABLE_ADOBE_EXTRACT),
      adobeClientIdSet: !!env.ADOBE_CLIENT_ID,
      adobeClientSecretSet: !!env.ADOBE_CLIENT_SECRET,
      fileTypeEligible: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type),
      analysisMethod: analysis.summary?.includes('Unable to analyze') ? 'fallback' : 'adobe',
      debugTimestamp: new Date().toISOString(),
      codeVersion: 'v2.3-debug',
      summaryContainsUnable: analysis.summary?.includes('Unable to analyze') || false,
      summaryContainsNotProvided: analysis.summary?.includes('not provided') || false,
      summaryLength: analysis.summary?.length || 0,
      // Add Adobe extraction details to debug
      adobeExtractTextLength: extendedAnalysis.adobeExtractTextLength || 0,
      adobeExtractTextPreview: extendedAnalysis.adobeExtractTextPreview || 'N/A'
    };

    log('info', 'analysis_completed', {
      fileName: file.name,
      confidence: analysis.confidence,
      summaryLength: analysis.summary?.length || 0,
      keyFactsCount: analysis.key_facts?.length || 0,
      requestId
    });

    const disclaimer = "Blawby provides general information, not legal advice. No attorney-client relationship is formed. For advice, consult a licensed attorney in your jurisdiction.";
    
    const metadata: {
      fileName: string;
      fileType: string;
      fileSize: number;
      question: string;
      timestamp: string;
      isAdobeEligible: boolean;
      debug?: Record<string, unknown>;
    } = {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      question: question,
      timestamp: new Date().toISOString(),
      isAdobeEligible: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)
    };

    // Only include debug information when DEBUG mode is enabled
    if (parseEnvBool(env.DEBUG)) {
      metadata.debug = {
        adobeClientIdConfigured: !!env.ADOBE_CLIENT_ID,
        adobeExtractEnabled: !!env.ENABLE_ADOBE_EXTRACT
      };
    }

    return createSuccessResponse({
      analysis,
      metadata,
      disclaimer
    });

  } catch (error) {
    logError('analyze', 'analysis_error', error as Error, {});
    
    // For analysis errors, return 200 with error information instead of 503
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallbackAnalysis: ExtendedAnalysisResult = {
      summary: "Document analysis encountered an error. Please try again or contact support if the issue persists.",
      key_facts: ["Analysis failed due to an internal error"],
      entities: { people: [], orgs: [], dates: [] },
      action_items: ["Retry the analysis", "Contact support if the issue persists"],
      confidence: 0.0,
      extraction_failed: true,
      extraction_method: 'error_fallback',
      error: errorMessage
    };

    return createSuccessResponse({
      analysis: fallbackAnalysis,
      metadata: {
        fileName: 'unknown',
        fileType: 'unknown',
        fileSize: 0,
        question: 'Analysis failed',
        timestamp: new Date().toISOString(),
        isAdobeEligible: false,
        error: errorMessage
      },
      disclaimer: "Blawby provides general information, not legal advice. No attorney-client relationship is formed. For advice, consult a licensed attorney in your jurisdiction."
    });
  }
}
