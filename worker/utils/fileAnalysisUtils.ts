import { createAnalysisErrorResponse } from './responseUtils.js';
import type { Env } from '../types.js';

/**
 * Type adapter for file analysis - contains only the properties needed by analyzeFile
 */
export type FileAnalysisEnv = Pick<
  Env,
  | 'FILES_BUCKET'
  | 'DB'
  | 'AI'
  | 'ENABLE_ADOBE_EXTRACT'
  | 'ADOBE_CLIENT_ID'
  | 'ADOBE_CLIENT_SECRET'
  | 'ADOBE_TECHNICAL_ACCOUNT_ID'
  | 'ADOBE_TECHNICAL_ACCOUNT_EMAIL'
  | 'ADOBE_ORGANIZATION_ID'
  | 'ADOBE_IMS_BASE_URL'
  | 'ADOBE_PDF_SERVICES_BASE_URL'
  | 'ADOBE_SCOPE'
  | 'CLOUDFLARE_ACCOUNT_ID'
  | 'CLOUDFLARE_API_TOKEN'
  | 'CLOUDFLARE_PUBLIC_URL'
  | 'AI_MODEL_DEFAULT'
  | 'AI_MAX_TEXT_LENGTH'
  | 'AI_MAX_TABLES'
  | 'AI_MAX_ELEMENTS'
  | 'AI_MAX_STRUCTURED_PAYLOAD_LENGTH'
  | 'DEBUG'
>;

/**
 * Analyzes files using the vision API
 */
export async function analyzeFile(env: FileAnalysisEnv, fileId: string, question?: string): Promise<Record<string, unknown>> {
  console.log('=== ANALYZE FILE FUNCTION CALLED ===');
  console.log('File ID:', fileId);
  console.log('Question:', question);
  
  // Determine the appropriate question based on file type or use default
  const defaultQuestion = "Analyze this document and provide a comprehensive summary with key facts, entities, and actionable insights. Focus on information relevant for legal intake or professional services.";
  
  const analysisQuestion = question || defaultQuestion;
  
  try {
    // Get file from R2 storage
    if (!env.FILES_BUCKET) {
      console.warn('FILES_BUCKET not configured, skipping file analysis');
      return createAnalysisErrorResponse(
        "File analysis is not configured. Please contact support.",
        ["Contact support to enable file analysis"]
      ) as unknown as Record<string, unknown>;
    }

    // Try to get file metadata from database first
    let fileRecord = null;
    try {
      const stmt = env.DB.prepare(`
        SELECT * FROM files WHERE id = ? AND is_deleted = FALSE
      `);
      fileRecord = await stmt.bind(fileId).first();
      console.log('Database file record:', fileRecord);
    } catch (dbError) {
      console.warn('Failed to get file metadata from database:', dbError);
    }

    // Construct file path
    let filePath = fileRecord?.file_path;
    console.log('Initial file path from database:', filePath);
    
    if (!filePath) {
      filePath = await findFilePathInR2(env, fileId);
    }

    if (!filePath) {
      console.warn('Could not determine file path for analysis:', fileId);
      return createAnalysisErrorResponse(
        "Unable to locate the uploaded file for analysis. The file may have been moved or deleted."
      ) as unknown as Record<string, unknown>;
    }

    // Get file from R2
    console.log('Attempting to get file from R2:', filePath);
    const fileObject = await env.FILES_BUCKET.get(filePath);
    if (!fileObject) {
      console.warn('File not found in R2 storage for analysis:', filePath);
      return createAnalysisErrorResponse(
        "The uploaded file could not be retrieved from storage for analysis."
      ) as unknown as Record<string, unknown>;
    }

    console.log('R2 file object:', {
      size: fileObject.size,
      etag: fileObject.etag,
      httpMetadata: fileObject.httpMetadata,
      customMetadata: fileObject.customMetadata
    });

    // Get the file body as ArrayBuffer
    const fileBuffer = await fileObject.arrayBuffer();
    console.log('File buffer size:', fileBuffer.byteLength);
    // Only log buffer size, not content
    console.log('File buffer size:', fileBuffer.byteLength);

    // Create a File object for the analyze endpoint
    const file = new File([fileBuffer], fileRecord?.original_name || fileId, {
      type: fileRecord?.mime_type || fileObject.httpMetadata?.contentType || 'application/octet-stream'
    });

    // Call the analyze function directly
    const { analyzeWithCloudflareAI } = await import('../routes/analyze.js');
    
    try {
      console.log('Calling analyzeWithCloudflareAI with file:', {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      const analysis = await analyzeWithCloudflareAI(file, analysisQuestion, env as Env);
      console.log('Analysis completed successfully:', {
        confidence: analysis.confidence,
        keyFactsCount: analysis.key_facts?.length || 0
      });
      return analysis as unknown as Record<string, unknown>;
    } catch (error) {
      console.error('Analysis error:', error);
      return createAnalysisErrorResponse(
        "The file analysis failed due to a technical error. The AI service may be temporarily unavailable."
      ) as unknown as Record<string, unknown>;
    }

  } catch (error) {
    console.error('File analysis error:', error);
    return createAnalysisErrorResponse(
      "An unexpected error occurred during file analysis. Please try again or contact support."
    ) as unknown as Record<string, unknown>;
  }
}

/**
 * Finds file path in R2 storage by file ID
 */
async function findFilePathInR2(env: FileAnalysisEnv, fileId: string): Promise<string | null> {
  console.log('No file path from database, attempting to construct from file ID');
  
  // Handle the actual file ID format with UUID
  // Format: organization-slug-uuid-timestamp-random
  // Example: north-carolina-legal-services-5b69514f-ef86-45ea-996d-4f2764b40d27-1754974140878-11oeburbd
  
  // Split by hyphens and look for UUID pattern
  const parts = fileId.split('-');
  console.log('File ID parts:', parts);
  
  if (parts.length >= 6) {
    // Find the UUID part (8-4-4-4-12 format)
    let organizationSlug = '';
    let sessionId = '';
    let timestamp = '';
    let random = '';
    
    // Look for UUID pattern in the middle
    for (let i = 0; i < parts.length - 2; i++) {
      const potentialUuid = parts.slice(i, i + 5).join('-');
      console.log(`Checking potential UUID at index ${i}:`, potentialUuid);
      
      if (potentialUuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        // Found UUID, reconstruct the parts
        organizationSlug = parts.slice(0, i).join('-');
        sessionId = potentialUuid;
        timestamp = parts[i + 5];
        random = parts[i + 6];
        
        console.log('Successfully parsed file ID:', { organizationSlug, sessionId, timestamp, random, fileId });
        
        // Try to find the file with this prefix
        const prefix = `uploads/${organizationSlug}/${sessionId}/${fileId}`;
        console.log('Looking for file with prefix:', prefix);
        
        try {
          const objects = await env.FILES_BUCKET.list({ prefix });
          console.log('R2 objects found:', objects.objects.length);
          if (objects.objects.length > 0) {
            const filePath = objects.objects[0].key;
            console.log('Found file path:', filePath);
            return filePath;
          } else {
            console.log('No R2 objects found with prefix:', prefix);
          }
        } catch (listError) {
          console.warn('Failed to list R2 objects:', listError);
        }
        break;
      }
    }
    
    // Fallback: search all uploads with bounded listing
    try {
      const allObjects = await env.FILES_BUCKET.list({
        prefix: 'uploads/',
        limit: 1000  // Add reasonable limit to avoid performance issues
      });
      console.log('Total R2 objects found:', allObjects.objects.length);

      if (allObjects.truncated) {
        console.warn('R2 listing was truncated, some files may not be searched');
      }
      
      // Look for any object that contains the fileId
      const matchingObject = allObjects.objects.find(obj => obj.key.includes(fileId));
      if (matchingObject) {
        const filePath = matchingObject.key;
        console.log('Found file path by searching all objects:', filePath);
        return filePath;
      } else {
        console.log('No matching object found for fileId:', fileId);
      }
    } catch (searchError) {
      console.warn('Failed to search all R2 objects:', searchError);
    }
  } else {
    console.log('File ID does not have enough parts for parsing:', parts.length);
  }
  
  return null;
}

/**
 * Determines the appropriate analysis question based on document type
 */
export function getAnalysisQuestion(analysisType: string, specificQuestion?: string): string {
  if (specificQuestion) {
    return specificQuestion;
  }

  switch (analysisType) {
    case 'legal_document':
      return "Analyze this legal document and identify: 1) Document type/form name (e.g., 'IRS Form 501(c)(3) application', 'Employment contract', 'Lease agreement'), 2) Key parties involved, 3) Important dates and deadlines, 4) Critical terms or obligations, 5) Potential legal issues or concerns, 6) Required next steps. Focus on information needed for legal intake and matter creation.";
    case 'contract':
      return "Analyze this contract and identify: 1) Contract type (employment, lease, service agreement, etc.), 2) Parties involved, 3) Key terms and obligations, 4) Important dates and deadlines, 5) Potential issues or unfair terms, 6) Termination clauses, 7) Dispute resolution methods. Focus on legal implications and potential concerns.";
    case 'government_form':
      return "Analyze this government form and identify: 1) Form name and number, 2) Purpose of the form, 3) Filing deadlines, 4) Required information or documentation, 5) Potential legal implications, 6) Next steps or actions required. Focus on compliance and legal requirements.";
    case 'medical_document':
      return "Analyze this medical document and identify: 1) Document type (medical bill, diagnosis, treatment plan, etc.), 2) Medical condition or injury, 3) Treatment received, 4) Dates of service, 5) Costs or insurance information, 6) Potential legal implications (personal injury, medical malpractice, insurance disputes). Focus on legal relevance.";
    case 'image':
      return "Analyze this image and identify: 1) What the image shows (accident scene, injury, property damage, document, etc.), 2) Key details relevant to legal matters, 3) Potential legal implications, 4) Type of legal case this might support (personal injury, property damage, evidence, etc.), 5) Additional documentation that might be needed.";
    case 'resume':
      return "Analyze this resume and identify: 1) Professional background and experience, 2) Skills and qualifications, 3) Employment history, 4) Education and certifications, 5) Potential legal matters this person might need help with (employment disputes, contract negotiations, business formation, etc.). Focus on legal service needs.";
    default:
      return "Analyze this document and identify: 1) Document type and purpose, 2) Key parties and dates, 3) Important terms or requirements, 4) Potential legal implications, 5) Required actions or next steps. Focus on information needed for legal intake and matter creation.";
  }
}
