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
export async function analyzeFile(env: FileAnalysisEnv, fileId: string, _question?: string): Promise<Record<string, unknown>> {
  // Question parameter is kept for API compatibility but not used (Adobe extraction doesn't need it)
  
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
    } catch (dbError) {
      console.warn('Failed to get file metadata from database:', dbError);
    }

    // Construct file path
    let filePath = fileRecord?.file_path;
    
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
    const fileObject = await env.FILES_BUCKET.get(filePath);
    if (!fileObject) {
      console.warn('File not found in R2 storage for analysis:', filePath);
      return createAnalysisErrorResponse(
        "The uploaded file could not be retrieved from storage for analysis."
      ) as unknown as Record<string, unknown>;
    }


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
  // Handle the actual file ID format with UUID
  // Format: practiceId-conversationId-timestamp-random (new format)
  // Legacy format: practice-slug-uuid-timestamp-random (old format with sessionId)
  // Example (new): 01K0TNGNKTM4Q0AG0XF0A8ST0Q-5b69514f-ef86-45ea-996d-4f2764b40d27-1754974140878-11oeburbd
  // Example (old): north-carolina-legal-services-5b69514f-ef86-45ea-996d-4f2764b40d27-1754974140878-11oeburbd
  
  // Split by hyphens and look for UUID pattern
  const parts = fileId.split('-');
  
  if (parts.length >= 6) {
    // Find the UUID part (8-4-4-4-12 format) - this could be conversationId (new format) or sessionId (legacy)
    let practiceIdOrSlug = '';
    let conversationIdOrSessionId = '';
    let _timestamp = '';
    let _random = '';
    
    // Look for UUID pattern in the middle
    for (let i = 0; i < parts.length - 2; i++) {
      const potentialUuid = parts.slice(i, i + 5).join('-');
      
      if (potentialUuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        // Found UUID, reconstruct the parts
        practiceIdOrSlug = parts.slice(0, i).join('-');
        conversationIdOrSessionId = potentialUuid;
        _timestamp = parts[i + 5];
        _random = parts[i + 6];
        
        // Try to find the file with new format first (conversationId)
        const newFormatPrefix = `uploads/${practiceIdOrSlug}/${conversationIdOrSessionId}/${fileId}`;
        
        try {
          const objects = await env.FILES_BUCKET.list({ prefix: newFormatPrefix });
          if (objects.objects.length > 0) {
            const filePath = objects.objects[0].key;
            return filePath;
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

      if (allObjects.truncated) {
        console.warn('R2 listing was truncated, some files may not be searched');
      }
      
      // Look for any object that contains the fileId
      const matchingObject = allObjects.objects.find(obj => obj.key.includes(fileId));
      if (matchingObject) {
        const filePath = matchingObject.key;
        return filePath;
      }
    } catch (searchError) {
      console.warn('Failed to search all R2 objects:', searchError);
    }
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
