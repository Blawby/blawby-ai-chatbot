import type { Env } from '../types';
import { HttpErrors, handleError } from '../errorHandler';
import { z } from 'zod';
// SessionService removed - using conversations instead
import { ActivityService } from '../services/ActivityService';
import { StatusService, type StatusUpdate } from '../services/StatusService.js';
import { Logger } from '../utils/logger';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

/**
 * Updates status once and logs failures for debugging.
 */
async function updateStatus(
  env: Env,
  statusUpdate: Omit<StatusUpdate, 'createdAt' | 'updatedAt' | 'expiresAt'>,
  createdAt?: number
): Promise<void> {
  try {
    await StatusService.setStatus(env, statusUpdate, createdAt);
    Logger.info('Status update successful', {
      statusId: statusUpdate.id,
      status: statusUpdate.status
    });
  } catch (error) {
    const lastError = error instanceof Error ? error : new Error(String(error));

    Logger.error('Status update failed', {
      statusId: statusUpdate.id,
      status: statusUpdate.status,
      error: lastError.message,
      errorStack: lastError.stack
    });

    Logger.error('ALERT: Critical status update failure', {
      statusId: statusUpdate.id,
      conversationId: statusUpdate.conversationId,
      practiceId: statusUpdate.practiceId,
      status: statusUpdate.status,
      message: statusUpdate.message,
      error: lastError.message
    });

    throw lastError;
  }
}


// File upload validation schema
const fileUploadValidationSchema = z.object({
  file: z.instanceof(File, { message: 'File is required' }),
  practiceId: z.string().optional(), // Make practiceId optional to allow practice-context fallback
  conversationId: z.string().min(1, 'Conversation ID is required').optional()
});

// File type validation
const ALLOWED_FILE_TYPES = [
  'text/plain',
  'text/csv',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/svg',
  'image/bmp',
  'image/tiff',
  'image/tif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/avi',
  'video/mov',
  'video/m4v',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/webm'
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (increased for larger SVG files and other media)

// Disallowed file extensions for security
const DISALLOWED_EXTENSIONS = ['exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar', 'msi', 'app'];

const normalizeOrigin = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return null;
    }
  }
};

const resolvePublicOrigin = (request: Request, env: Env): string => {
  const explicitOrigin = normalizeOrigin(env.CLOUDFLARE_PUBLIC_URL);

  if (explicitOrigin) {
    return explicitOrigin;
  }

  return '';
};

function validateFile(file: File): { isValid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { isValid: false, error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  // Check file extension for security FIRST (before file type)
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && DISALLOWED_EXTENSIONS.includes(extension)) {
    return { isValid: false, error: `File extension .${extension} is not allowed for security reasons` };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { isValid: false, error: `File type ${file.type} is not supported` };
  }

  return { isValid: true };
}

async function storeFile(
  file: File,
  practiceId: string,
  conversationId: string,
  env: Env,
  request?: Request
): Promise<{ fileId: string; url: string; storageKey: string }> {
  if (!env.FILES_BUCKET) {
    throw HttpErrors.internalServerError('File storage is not configured');
  }

  // Generate unique file ID
  const fileId = `${practiceId}-${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const fileExtension = file.name.split('.').pop() || '';
  const storageKey = `uploads/${practiceId}/${conversationId}/${fileId}.${fileExtension}`;

  // Check if the practice exists - this is required for file operations
  // This check MUST happen before any R2 upload to prevent orphaned files
  const existingPractice = await RemoteApiService.validatePractice(env, practiceId, request);
  
  if (!existingPractice) {
    // Log anomaly for monitoring and alerting
    Logger.error('Practice not found during file upload - this indicates a data integrity issue', {
      practiceId,
      conversationId,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      timestamp: new Date().toISOString(),
      anomaly: 'missing_practice_during_file_upload',
      severity: 'high'
    });

    // Emit monitoring metric/alert
    // In production, this would integrate with your monitoring system (e.g., DataDog, New Relic, etc.)
    console.error('🚨 MONITORING ALERT: Missing practice during file upload', {
      practiceId,
      conversationId,
      fileId,
      alertType: 'missing_practice',
      severity: 'high',
      timestamp: new Date().toISOString()
    });

    // Return clear error response
    throw new Error(`Practice '${practiceId}' not found. Please ensure the practice exists before uploading files. Contact your system administrator.`);
  }

  Logger.info('Storing file:', {
    fileId,
    storageKey,
    practiceId,
    conversationId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  });

  // Store file in R2 bucket. Use ArrayBuffer for broad compatibility with types
  const body: ArrayBuffer = await file.arrayBuffer();
  await env.FILES_BUCKET.put(storageKey, body, {
    httpMetadata: {
      // …existing metadata…
      contentType: file.type,
      cacheControl: 'public, max-age=31536000'
    },
    customMetadata: {
      originalName: file.name,
      practiceId,
      conversationId,
      uploadedAt: new Date().toISOString()
    }
  });

  // Document analysis has been removed - files are stored but not processed

  Logger.info('File stored in R2 successfully:', storageKey);

  // Try to store file metadata in database, but don't fail if it doesn't work
  try {
    const stmt = env.DB.prepare(`
      INSERT INTO files (
        id, practice_id, conversation_id, original_name, file_name, file_path, 
        file_type, file_size, mime_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    await stmt.bind(
      fileId,
      practiceId,
      conversationId,
      file.name,
      `${fileId}.${fileExtension}`,
      storageKey,
      fileExtension,
      file.size,
      file.type
    ).run();

    Logger.info('File metadata stored in database successfully');
  } catch (error) {
    // Log the error but don't fail the upload
    Logger.warn('Failed to store file metadata in database:', error);
    // Continue with the upload since the file is already stored in R2
  }

  // Generate public URL based on trusted env origin.
  // Falls back to relative path if no explicit origin is configured.
  const getPublicUrl = (fileIdStr: string, req?: Request): string => {
    const relativePath = `/api/files/${fileIdStr}`;
    
    if (req) {
      const publicOrigin = resolvePublicOrigin(req, env);
      if (publicOrigin) {
        return `${publicOrigin}${relativePath}`;
      }
    }
    
    // Fallback to relative URL (shouldn't happen in practice)
    return relativePath;
  };
  
  const url = getPublicUrl(fileId, request);

  // Create activity event for file upload (non-blocking)
  const createActivityEvent = async () => {
    try {
      const activityService = new ActivityService(env);
      const eventType = 'file_uploaded';
      const eventTitle = 'File Uploaded';
      
      await activityService.createEvent({
        type: 'conversation_event',
        eventType,
        title: eventTitle,
        description: `${eventTitle}: ${file.name}`,
        eventDate: new Date().toISOString(),
        actorType: 'user',
        actorId: undefined, // Don't populate created_by_lawyer_id with conversationId
        metadata: {
          conversationId,
          practiceId,
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          storageKey
        }
      }, practiceId);
      
      Logger.info('Activity event created for file upload:', { fileId, fileName: file.name });
    } catch (error) {
      Logger.warn('Failed to create activity event for file upload:', error);
      // Errors are swallowed - don't fail the upload
    }
  };

  // Fire-and-forget activity event creation with bounded timeout
  const timeoutId = setTimeout(() => {
    Logger.warn('File activity event creation timed out');
  }, 5000);
  
  createActivityEvent()
    .finally(() => clearTimeout(timeoutId))
    .catch(error => {
      Logger.warn('File activity event creation failed:', error);
    });

  Logger.info('File upload completed:', { fileId, url, storageKey });

  return { fileId, url, storageKey };
}

export async function handleFiles(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // File upload endpoint
  if (path === '/api/files/upload' && request.method === 'POST') {
    // Declare variables in outer scope for rollback capability
    let resolvedPracticeId: string;
    let resolvedConversationId: string;

    try {
      // Parse form data
      const formData = await request.formData();
      
      // Extract and validate required fields
      const file = formData.get('file') as File;
      const rawPracticeId = formData.get('practiceId');
      const practiceId = typeof rawPracticeId === 'string' && rawPracticeId.trim() ? rawPracticeId.trim() : undefined;
      const rawConversationId = formData.get('conversationId');
      const conversationId = typeof rawConversationId === 'string' && rawConversationId.trim()
        ? rawConversationId.trim()
        : undefined;
      
      // Extract optional metadata fields
      const description = formData.get('description') as string | null;
      const category = formData.get('category') as string | null;

      // Validate input
      const validationResult = fileUploadValidationSchema.safeParse({ file, practiceId, conversationId });
      if (!validationResult.success) {
        throw HttpErrors.badRequest('Invalid upload data', validationResult.error.issues);
      }

      // Validate file
      const fileValidation = validateFile(file);
      if (!fileValidation.isValid) {
        throw HttpErrors.badRequest(fileValidation.error!);
      }

      // Create a simple request for middleware with practiceId in URL
      const middlewareUrl = new URL(request.url);
      if (practiceId) {
        middlewareUrl.searchParams.set('practiceId', practiceId);
      }

      // Create a lightweight request for middleware (no body needed)
      const middlewareRequest = new Request(middlewareUrl.toString(), {
        method: 'GET', // Middleware doesn't need the POST body
        headers: request.headers
      });

      // Always use practice context middleware to get authoritative practice ID
      const requestWithContext = await withPracticeContext(middlewareRequest, env, {
        requirePractice: true
      });
      const contextPracticeId = getPracticeId(requestWithContext);
      
      // Compare submitted practiceId with context-derived ID and reject if they differ
      if (practiceId && practiceId !== contextPracticeId) {
        throw HttpErrors.badRequest('Submitted practiceId does not match authenticated practice context');
      }
      
      const normalizedPracticeId = contextPracticeId;
      
      const normalizedConversationId = conversationId ?? null;

      // Validate that trimmed IDs are not empty
      if (!normalizedPracticeId) {
        throw HttpErrors.badRequest('practiceId cannot be empty after trimming');
      }

      const hasConversation = Boolean(normalizedConversationId);
      const storageConversationId = hasConversation
        ? normalizedConversationId as string
        : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      if (hasConversation) {
        // Validate conversation exists and belongs to practice
        const { ConversationService } = await import('../services/ConversationService.js');
        const conversationService = new ConversationService(env);
        try {
          const conversation = await conversationService.getConversation(
            normalizedConversationId as string,
            normalizedPracticeId
          );
          resolvedPracticeId = conversation.practice_id;
          resolvedConversationId = conversation.id;
        } catch (error) {
          throw HttpErrors.badRequest(
            `Conversation not found or does not belong to practice: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      } else {
        resolvedPracticeId = normalizedPracticeId;
        resolvedConversationId = storageConversationId;
      }

      // Update status to indicate file stored
      let statusId: string | null = null;
      let statusCreatedAt: number | null = null;
      if (hasConversation) {
        try {
          // StatusService migration completed: now uses conversationId instead of sessionId
          // See: [TRACKING-ISSUE: StatusService sessionId->conversationId migration]
          // Migration date: 2025-01-XX
          // Note: Status records have 24h TTL, so old records with sessionId will expire naturally
          statusId = await StatusService.createFileProcessingStatus(
            env,
            resolvedConversationId,
            resolvedPracticeId,
            file.name,
            'processing',
            10
          );
          // Get the createdAt timestamp for this statusId to preserve it across updates
          if (statusId) {
            statusCreatedAt = await StatusService.getStatusCreatedAt(env, statusId);
          }
        } catch (statusError) {
          Logger.warn('Failed to create initial file processing status:', statusError);
          // Continue without status tracking if status creation fails
        }
      }

      // Store file with error handling
      let fileId: string, url: string, storageKey: string;
      const result = await storeFile(file, resolvedPracticeId, resolvedConversationId, env, request);
      fileId = result.fileId;
      url = result.url;
      storageKey = result.storageKey;

      // Update status to indicate file stored
      if (statusId) {
        try {
          // StatusService migration completed: StatusUpdate interface now uses conversationId
          // See: [TRACKING-ISSUE: StatusService sessionId->conversationId migration]
          // Migration date: 2025-01-XX
          // All status updates now use conversationId consistently
          await updateStatus(env, {
            id: statusId,
            conversationId: resolvedConversationId,
            practiceId: resolvedPracticeId,
            type: 'file_processing',
            status: 'processing',
            message: `File ${file.name} uploaded successfully, starting analysis...`,
            progress: 50,
            data: { fileName: file.name, fileId, url }
          }, statusCreatedAt ?? undefined);
        } catch (_statusUpdateError) {
          // Error is already logged by updateStatus, just continue
          Logger.warn('Continuing despite status update failure after file storage');
        }
      }

      Logger.info('File upload successful:', {
        fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        practiceId: resolvedPracticeId,
        conversationId: hasConversation ? resolvedConversationId : null,
        url,
        statusId
      });

      // Document analysis has been removed - files are stored but not processed

      // File storage complete

      const responseBody = {
        success: true,
        data: {
          fileId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          url,
          storageKey,
          statusId,
          message: 'File uploaded successfully',
          ...(hasConversation ? { conversationId: resolvedConversationId } : {}),
          // Include metadata fields if provided
          ...(description && { description }),
          ...(category && { category }),
          metadata: {
            ...(description && { description }),
            ...(category && { category })
          }
        }
      };

      const responseHeaders = new Headers({ 'Content-Type': 'application/json' });

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: responseHeaders
      });

    } catch (error) {
      // Handle upload failure
      return handleError(error);
    }
  }

  // File download endpoint
  if (path.startsWith('/api/files/') && request.method === 'GET') {
    try {
      const fileId = path.split('/').pop();
      if (!fileId) {
        throw HttpErrors.badRequest('File ID is required');
      }

      console.log('File download request:', { fileId, path });

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
        // Continue without database metadata
      }

      // Get file from R2 bucket
      if (!env.FILES_BUCKET) {
        throw HttpErrors.internalServerError('File storage is not configured');
      }

      // Try to construct the file path from the fileId if we don't have database metadata
      let filePath = fileRecord?.file_path;
      if (!filePath) {
        console.log('No file path found for fileId:', fileId);
        throw HttpErrors.notFound('File not found');
      }

      if (!filePath) {
        console.log('No file path found for fileId:', fileId);
        throw HttpErrors.notFound('File not found');
      }

      console.log('Attempting to get file from R2:', filePath);
      const fileObject = await env.FILES_BUCKET.get(filePath);
      if (!fileObject) {
        console.log('File not found in R2 storage:', filePath);
        throw HttpErrors.notFound('File not found in storage');
      }

      console.log('File found in R2, returning response');

      // Guard against nullable fileObject.body
      if (!fileObject.body) {
        console.error('File object body is null or undefined');
        throw HttpErrors.internalServerError('File content unavailable');
      }

      // Return file with appropriate headers
      const headers = new Headers();
      const contentType = fileRecord?.mime_type || fileObject.httpMetadata?.contentType || 'application/octet-stream';
      headers.set('Content-Type', contentType);
      
      // Handle Content-Disposition based on mime type
      const filename = fileRecord?.original_name || fileId;
      const sanitizedFilename = filename.replace(/["\r\n]/g, ''); // Strip quotes and newlines
      
      if (contentType === 'image/svg+xml') {
        // Force attachment for SVG files to prevent XSS
        headers.set('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      } else {
        headers.set('Content-Disposition', `inline; filename="${sanitizedFilename}"`);
      }
      
      if (fileRecord?.file_size) {
        headers.set('Content-Length', fileRecord.file_size.toString());
      }
      
      // Propagate cache control from stored object if present
      if (fileObject.httpMetadata?.cacheControl) {
        headers.set('Cache-Control', fileObject.httpMetadata.cacheControl);
      }

      // Use non-null assertion after explicit null check
      return new Response(fileObject.body as BodyInit, {
        status: 200,
        headers
      });
    } catch (error) {
      Logger.error('File download error:', error);
      return handleError(error);
    }
  }

  throw HttpErrors.notFound('Invalid file endpoint');
}
