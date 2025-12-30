import { createAnalysisErrorResponse } from './responseUtils.js';
import type { Env } from '../types.js';

/**
 * Type adapter for file analysis - contains only the properties needed by analyzeFile
 */
export type FileAnalysisEnv = Pick<
  Env,
  | 'FILES_BUCKET'
  | 'DB'
  | 'ENABLE_ADOBE_EXTRACT'
  | 'ADOBE_CLIENT_ID'
  | 'ADOBE_CLIENT_SECRET'
  | 'ADOBE_TECHNICAL_ACCOUNT_ID'
  | 'ADOBE_TECHNICAL_ACCOUNT_EMAIL'
  | 'ADOBE_ORGANIZATION_ID'
  | 'ADOBE_IMS_BASE_URL'
  | 'ADOBE_PDF_SERVICES_BASE_URL'
  | 'ADOBE_SCOPE'
  | 'DEBUG'
>;

/**
 * Analyzes files using the vision API
 */
export async function analyzeFile(env: FileAnalysisEnv, fileId: string, question?: string): Promise<Record<string, unknown>> {
  console.log('=== ANALYZE FILE FUNCTION CALLED ===');
  console.log('File ID:', fileId);
  console.log('Question:', question);
  
  // Question parameter is kept for API compatibility but not used (Adobe extraction doesn't need it)
  const _analysisQuestion = question || "Extract document content";
  
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

    // File analysis is now handled by the /api/analyze endpoint
    // This utility function is kept for backward compatibility but should not be used directly
    // Return an error directing users to use the analyze endpoint instead
    return createAnalysisErrorResponse(
      "File analysis should be performed through the /api/analyze endpoint. This utility function is deprecated."
    ) as unknown as Record<string, unknown>;

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
  // Format: practiceId-conversationId-timestamp-random (new format)
  // Legacy format: practice-slug-uuid-timestamp-random (old format with sessionId)
  // Example (new): 01K0TNGNKTM4Q0AG0XF0A8ST0Q-5b69514f-ef86-45ea-996d-4f2764b40d27-1754974140878-11oeburbd
  // Example (old): north-carolina-legal-services-5b69514f-ef86-45ea-996d-4f2764b40d27-1754974140878-11oeburbd
  
  // Split by hyphens and look for UUID pattern
  const parts = fileId.split('-');
  console.log('File ID parts:', parts);
  
  if (parts.length >= 6) {
    // Find the UUID part (8-4-4-4-12 format) - this could be conversationId (new format) or sessionId (legacy)
    let practiceIdOrSlug = '';
    let conversationIdOrSessionId = '';
    let timestamp = '';
    let random = '';
    
    // Look for UUID pattern in the middle
    for (let i = 0; i < parts.length - 2; i++) {
      const potentialUuid = parts.slice(i, i + 5).join('-');
      console.log(`Checking potential UUID at index ${i}:`, potentialUuid);
      
      if (potentialUuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        // Found UUID, reconstruct the parts
        practiceIdOrSlug = parts.slice(0, i).join('-');
        conversationIdOrSessionId = potentialUuid;
        timestamp = parts[i + 5];
        random = parts[i + 6];
        
        console.log('Successfully parsed file ID:', { practiceIdOrSlug, conversationIdOrSessionId, timestamp, random, fileId });
        
        // Try to find the file with new format first (conversationId)
        const newFormatPrefix = `uploads/${practiceIdOrSlug}/${conversationIdOrSessionId}/${fileId}`;
        console.log('Looking for file with new format prefix:', newFormatPrefix);
        
        try {
          const objects = await env.FILES_BUCKET.list({ prefix: newFormatPrefix });
          console.log('R2 objects found:', objects.objects.length);
          if (objects.objects.length > 0) {
            const filePath = objects.objects[0].key;
            console.log('Found file path:', filePath);
            return filePath;
          } else {
            console.log('No R2 objects found with new format prefix:', newFormatPrefix);
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
 * NOTE: This function is kept for API compatibility but questions are not used with Adobe extraction
 */
export function getAnalysisQuestion(analysisType: string, specificQuestion?: string): string {
  if (specificQuestion) {
    return specificQuestion;
  }
  // Return a generic message since Adobe extraction doesn't use questions
  return "Extract document content";
}
