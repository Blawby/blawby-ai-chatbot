import { getWorkerApiUrl } from '@/config/urls';
import { withWidgetAuthHeaders } from '@/shared/utils/widgetAuth';

export interface UploadProgress {
 loaded: number;
 total: number;
 percentage: number;
}

export type UploadContext = 'matter' | 'intake' | 'trust' | 'profile' | 'asset';
export type UploadSubContext = 'documents' | 'correspondence' | 'evidence';

interface PresignUploadRequest {
 file_name: string;
 mime_type: string;
 file_size: number;
 upload_context: UploadContext;
 entity_id?: string;
 matter_id?: string;
 sub_context?: UploadSubContext;
 is_privileged?: boolean;
}

interface PresignUploadResponse {
 upload_id: string;
 presigned_url: string;
 method: string;
 storage_key: string;
 expires_at: string;
}

interface ConfirmUploadResponse {
 upload_id: string;
 public_url: string | null;
 storage_key: string;
 status: 'pending' | 'verified' | 'rejected';
}

export interface BackendUploadResult {
 uploadId: string;
 publicUrl: string | null;
 storageKey: string;
 status: 'pending' | 'verified' | 'rejected';
}

interface BackendUploadOptions {
 file: File;
 uploadContext: UploadContext;
 entityId?: string;
 matterId?: string;
 subContext?: UploadSubContext;
 isPrivileged?: boolean;
 onProgress?: (progress: UploadProgress) => void;
 signal?: AbortSignal;
}

const buildWorkerUrl = (path: string): string => {
 const baseUrl = getWorkerApiUrl();
 return new URL(path, baseUrl).toString();
};

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
 try {
  const payload = await response.json() as { error?: string; message?: string };
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
 } catch {
  // Ignore parse errors and fall through to the fallback.
 }

 return fallback;
};

const uploadViaPresignedUrl = async (
 file: File,
 presignedUrl: string,
 method: string,
 onProgress?: (progress: UploadProgress) => void,
 signal?: AbortSignal
): Promise<void> => {
 await new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
   reject(new DOMException('Upload cancelled', 'AbortError'));
   return;
  }

  const xhr = new XMLHttpRequest();
  let abortHandler: (() => void) | null = null;

  const cleanup = () => {
   if (signal && abortHandler) {
    signal.removeEventListener('abort', abortHandler);
    abortHandler = null;
   }
  };

  xhr.upload.addEventListener('progress', (event) => {
   if (!event.lengthComputable || !onProgress) return;
   onProgress({
    loaded: event.loaded,
    total: event.total,
    percentage: Math.round((event.loaded / event.total) * 100),
   });
  });

  xhr.addEventListener('load', () => {
   cleanup();
   if (xhr.status >= 200 && xhr.status < 300) {
    resolve();
    return;
   }

   reject(new Error(`Upload failed with HTTP ${xhr.status}`));
  });

  xhr.addEventListener('error', () => {
   cleanup();
   reject(new Error('Network error during upload'));
  });

  xhr.addEventListener('abort', () => {
   cleanup();
   reject(new DOMException('Upload cancelled', 'AbortError'));
  });

  if (signal) {
   abortHandler = () => xhr.abort();
   signal.addEventListener('abort', abortHandler);
  }

  xhr.open(method.toUpperCase(), presignedUrl);

  if (method.toUpperCase() === 'POST') {
   const formData = new FormData();
   formData.append('file', file);
   xhr.send(formData);
   return;
  }

  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  xhr.send(file);
 });
};

const presignUpload = async (request: PresignUploadRequest, signal?: AbortSignal): Promise<PresignUploadResponse> => {
 const response = await fetch(buildWorkerUrl('/api/uploads/presign'), {
  method: 'POST',
  headers: withWidgetAuthHeaders({ 'Content-Type': 'application/json' }),
  credentials: 'include',
  body: JSON.stringify(request),
  signal,
 });

 if (!response.ok) {
  throw new Error(await readErrorMessage(response, 'Failed to prepare upload.'));
 }

 return await response.json() as PresignUploadResponse;
};

const confirmUpload = async (uploadId: string, signal?: AbortSignal): Promise<ConfirmUploadResponse> => {
 const response = await fetch(buildWorkerUrl(`/api/uploads/${encodeURIComponent(uploadId)}/confirm`), {
  method: 'POST',
  headers: withWidgetAuthHeaders(),
  credentials: 'include',
  signal,
 });

 if (!response.ok) {
  throw new Error(await readErrorMessage(response, 'Failed to confirm upload.'));
 }

 return await response.json() as ConfirmUploadResponse;
};

export interface BackendUploadRecord {
 id: string;
 upload_context: string;
 sub_context?: string | null;
 entity_id?: string | null;
 matter_id?: string | null;
 file_name: string;
 mime_type: string;
 file_size: number;
 storage_key: string;
 public_url: string | null;
 status: 'pending' | 'verified' | 'rejected';
 created_at: string;
 updated_at?: string | null;
}

interface ListUploadsParams {
 matterId: string;
 subContext?: UploadSubContext;
 signal?: AbortSignal;
}

export const listMatterUploads = async ({
 matterId,
 subContext,
 signal,
}: ListUploadsParams): Promise<BackendUploadRecord[]> => {
 const url = new URL(buildWorkerUrl('/api/uploads'));
 url.searchParams.set('matter_id', matterId);
 if (subContext) url.searchParams.set('sub_context', subContext);

 const response = await fetch(url.toString(), {
  method: 'GET',
  headers: withWidgetAuthHeaders(),
  credentials: 'include',
  signal,
 });

 if (!response.ok) {
  throw new Error(await readErrorMessage(response, 'Failed to list uploads.'));
 }

 const data = await response.json() as { data?: BackendUploadRecord[] } | BackendUploadRecord[];
 return Array.isArray(data) ? data : (data.data ?? []);
};

export const uploadFileViaBackend = async ({
 file,
 uploadContext,
 entityId,
 matterId,
 subContext,
 isPrivileged = true,
 onProgress,
 signal,
}: BackendUploadOptions): Promise<BackendUploadResult> => {
 const presigned = await presignUpload(
  {
   file_name: file.name,
   mime_type: file.type || 'application/octet-stream',
   file_size: file.size,
   upload_context: uploadContext,
   ...(entityId ? { entity_id: entityId } : {}),
   ...(matterId ? { matter_id: matterId } : {}),
   ...(subContext ? { sub_context: subContext } : {}),
   is_privileged: isPrivileged,
  },
  signal
 );

 await uploadViaPresignedUrl(file, presigned.presigned_url, presigned.method, onProgress, signal);
 const confirmed = await confirmUpload(presigned.upload_id, signal);

 return {
  uploadId: confirmed.upload_id,
  publicUrl: confirmed.public_url ?? null,
  storageKey: confirmed.storage_key,
  status: confirmed.status,
 };
};
