import { getWorkerApiUrl } from '@/config/urls';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';
import { uploadViaPresignedUrl, type UploadProgress } from '@/shared/lib/presignedUpload';

export type { UploadProgress };

export type UploadScopeType = 'matter' | 'intake' | 'trust' | 'profile' | 'asset';
export type UploadSubContext = 'documents' | 'correspondence' | 'evidence';

const MAX_UPLOAD_FILE_SIZE_BYTES = 52_428_800; // Matches backend presign schema max (50 MiB).
const MAX_UPLOAD_FILE_NAME_LENGTH = 255;
const MAX_UPLOAD_MIME_LENGTH = 100;

interface PresignUploadRequest {
  file_name: string;
  mime_type: string;
  file_size: number;
  scope_type?: UploadScopeType;
  scope_id?: string;
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

// Frontend-only types (camelCase, internal to this client). The wire-shape
// counterpart is `BackendUploadRecord` below — that one lives in
// worker/types/wire/upload.ts and is re-exported via @/shared/types/wire.
export interface UploadResult {
  uploadId: string;
  publicUrl: string | null;
  storageKey: string;
  status: 'pending' | 'verified' | 'rejected';
}

interface UploadOptions {
  file: File;
  scopeType?: UploadScopeType;
  scopeId?: string;
  subContext?: UploadSubContext;
  isPrivileged?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

const validateUploadInput = (options: UploadOptions): void => {
  const { file, scopeType, scopeId } = options;

  const fileName = typeof file.name === 'string' ? file.name.trim() : '';
  if (!fileName) {
    throw new Error('File name is required.');
  }
  if (fileName.length > MAX_UPLOAD_FILE_NAME_LENGTH) {
    throw new Error(`File name must be ${MAX_UPLOAD_FILE_NAME_LENGTH} characters or fewer.`);
  }

  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new Error('File size must be a positive number of bytes.');
  }
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error('File is too large. Maximum allowed size is 50 MB.');
  }

  const mimeType = (file.type || 'application/octet-stream').trim();
  if (!mimeType) {
    throw new Error('File MIME type is required.');
  }
  if (mimeType.length > MAX_UPLOAD_MIME_LENGTH) {
    throw new Error(`File MIME type must be ${MAX_UPLOAD_MIME_LENGTH} characters or fewer.`);
  }

  if (scopeType === 'matter' && (!scopeId || scopeId.trim().length === 0)) {
    throw new Error('Matter uploads require a scope ID.');
  }
};

const buildWorkerUrl = (path: string): string => {
  const baseUrl = getWorkerApiUrl();
  return new URL(path, baseUrl).toString();
};

const readApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isHttpError(error)) {
    const payload = error.response.data as { error?: string; message?: string } | undefined;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const presignUpload = async (request: PresignUploadRequest, signal?: AbortSignal): Promise<PresignUploadResponse> => {
  try {
    const { data } = await apiClient.post<PresignUploadResponse>(
      buildWorkerUrl('/api/uploads/presign'),
      request,
      { signal },
    );
    return data;
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to prepare upload.'));
  }
};

const confirmUpload = async (uploadId: string, signal?: AbortSignal): Promise<ConfirmUploadResponse> => {
  try {
    const { data } = await apiClient.post<ConfirmUploadResponse>(
      buildWorkerUrl(`/api/uploads/${encodeURIComponent(uploadId)}/confirm`),
      undefined,
      { signal },
    );
    return data;
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to confirm upload.'));
  }
};

// Wire types live in worker/types/wire/upload.ts (single source of truth).
// Re-exported here for existing consumers; new code should import from
// `@/shared/types/wire` directly.
import type { BackendUploadRecord, BackendUploadsListResponse } from '@/shared/types/wire';
export type { BackendUploadRecord };

interface ListUploadsParams {
  scopeType: UploadScopeType;
  scopeId: string;
  subContext?: UploadSubContext;
  signal?: AbortSignal;
}

export const listUploadsByScope = async ({
  scopeType,
  scopeId,
  subContext,
  signal,
}: ListUploadsParams): Promise<BackendUploadRecord[]> => {
  const params: Record<string, string> = {
    scope_type: scopeType,
    scope_id: scopeId,
  };
  if (subContext) params.sub_context = subContext;

  try {
    const { data } = await apiClient.get<BackendUploadsListResponse | BackendUploadRecord[]>(
      buildWorkerUrl('/api/uploads'),
      { params, signal },
    );
    if (Array.isArray(data)) return data;
    return data.uploads ?? [];
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to list uploads.'));
  }
};

export const uploadFileViaBackend = async ({
  file,
  scopeType,
  scopeId,
  subContext,
  isPrivileged = true,
  onProgress,
  signal,
}: UploadOptions): Promise<UploadResult> => {
  validateUploadInput({
    file,
    scopeType,
    scopeId,
    subContext,
    isPrivileged,
    onProgress,
    signal,
  });

  const presigned = await presignUpload(
    {
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      ...(scopeType ? { scope_type: scopeType } : {}),
      ...(scopeId ? { scope_id: scopeId } : {}),
      ...(subContext ? { sub_context: subContext } : {}),
      is_privileged: isPrivileged,
    },
    signal
  );

  await uploadViaPresignedUrl({
    file,
    presignedUrl: presigned.presigned_url,
    method: presigned.method,
    onProgress,
    signal,
  });
  const confirmed = await confirmUpload(presigned.upload_id, signal);

  return {
    uploadId: confirmed.upload_id,
    publicUrl: confirmed.public_url ?? null,
    storageKey: confirmed.storage_key,
    status: confirmed.status,
  };
};
