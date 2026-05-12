import {
  intakeFileConfirmPath,
  intakeFileItemPath,
  intakeFilePresignPath,
  intakeFilesPath,
} from '@/config/urls';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';
import {
  uploadViaPresignedUrl,
  type UploadProgress,
} from '@/shared/lib/presignedUpload';

export type { UploadProgress };

const MAX_UPLOAD_FILE_SIZE_BYTES = 52_428_800;
const MAX_UPLOAD_FILE_NAME_LENGTH = 255;
const MAX_UPLOAD_MIME_LENGTH = 100;

export type IntakeFileStatus = 'pending' | 'verified' | 'rejected' | 'deleted';

export interface IntakeFile {
  id: string;
  intakeUuid: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  status: IntakeFileStatus;
  publicUrl: string | null;
  storageKey: string | null;
  isPrivileged: boolean;
  createdAt: string | null;
  uploadedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedReason: string | null;
}

interface IntakePresignResponse {
  upload_id: string;
  presigned_url: string;
  method: string;
  storage_key: string;
  expires_at: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const readApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isHttpError(error)) {
    const payload = error.response.data as { error?: string; message?: string } | undefined;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`Invalid intake file payload: ${field} is missing.`);
};

const requiredNumber = (value: unknown, field: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Invalid intake file payload: ${field} is missing.`);
};

const normalizeStatus = (value: unknown): IntakeFileStatus => {
  if (value === 'verified' || value === 'pending' || value === 'rejected' || value === 'deleted') {
    return value;
  }
  return 'pending';
};

const normalizeIntakeFile = (raw: unknown): IntakeFile => {
  if (!isRecord(raw)) {
    throw new Error('Invalid intake file payload: expected object.');
  }
  return {
    id: requiredString(raw.id, 'id'),
    intakeUuid: requiredString(raw.intake_uuid ?? raw.intakeUuid, 'intake_uuid'),
    uploadId: requiredString(raw.upload_id ?? raw.uploadId, 'upload_id'),
    fileName: requiredString(raw.file_name ?? raw.fileName, 'file_name'),
    fileSize: requiredNumber(raw.file_size ?? raw.fileSize, 'file_size'),
    mimeType: optionalString(raw.mime_type ?? raw.mimeType),
    status: normalizeStatus(raw.status),
    publicUrl: optionalString(raw.public_url ?? raw.publicUrl),
    storageKey: optionalString(raw.storage_key ?? raw.storageKey),
    isPrivileged: typeof raw.is_privileged === 'boolean'
      ? raw.is_privileged
      : typeof raw.isPrivileged === 'boolean'
        ? raw.isPrivileged
        : true,
    createdAt: optionalString(raw.created_at ?? raw.createdAt),
    uploadedBy: optionalString(raw.uploaded_by ?? raw.uploadedBy),
    deletedAt: optionalString(raw.deleted_at ?? raw.deletedAt),
    deletedBy: optionalString(raw.deleted_by ?? raw.deletedBy),
    deletedReason: optionalString(raw.deleted_reason ?? raw.deletedReason),
  };
};

const unwrap = <T>(payload: unknown): T => {
  if (isRecord(payload) && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
};

export interface ListIntakeFilesOptions {
  signal?: AbortSignal;
}

export const listIntakeFiles = async (
  intakeUuid: string,
  options: ListIntakeFilesOptions = {},
): Promise<IntakeFile[]> => {
  if (!intakeUuid) {
    throw new Error('intakeUuid is required.');
  }
  try {
    const { data } = await apiClient.get<unknown>(intakeFilesPath(intakeUuid), { signal: options.signal });
    const unwrapped = unwrap<unknown>(data);
    const list = Array.isArray(unwrapped)
      ? unwrapped
      : isRecord(unwrapped) && Array.isArray((unwrapped as { files?: unknown }).files)
        ? (unwrapped as { files: unknown[] }).files
        : [];
    return list.map(normalizeIntakeFile);
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to list intake files.'));
  }
};

export interface PresignIntakeUploadInput {
  intakeUuid: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  signal?: AbortSignal;
}

export const presignIntakeUpload = async (
  input: PresignIntakeUploadInput,
): Promise<IntakePresignResponse> => {
  if (!input.intakeUuid) throw new Error('intakeUuid is required.');
  try {
    const { data } = await apiClient.post<unknown>(
      intakeFilePresignPath(input.intakeUuid),
      {
        file_name: input.fileName,
        mime_type: input.mimeType,
        file_size: input.fileSize,
      },
      { signal: input.signal },
    );
    return unwrap<IntakePresignResponse>(data);
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to prepare intake upload.'));
  }
};

export interface ConfirmIntakeUploadInput {
  intakeUuid: string;
  uploadId: string;
  signal?: AbortSignal;
}

export const confirmIntakeUpload = async (
  input: ConfirmIntakeUploadInput,
): Promise<IntakeFile> => {
  try {
    const { data } = await apiClient.post<unknown>(
      intakeFileConfirmPath(input.intakeUuid, input.uploadId),
      undefined,
      { signal: input.signal },
    );
    return normalizeIntakeFile(unwrap<unknown>(data));
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to confirm intake upload.'));
  }
};

export interface DeleteIntakeFileInput {
  intakeUuid: string;
  fileId: string;
  reason: string;
  signal?: AbortSignal;
}

export const deleteIntakeFile = async ({
  intakeUuid,
  fileId,
  reason,
  signal,
}: DeleteIntakeFileInput): Promise<void> => {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new Error('A reason is required to delete this file.');
  }
  try {
    await apiClient.delete<unknown>(intakeFileItemPath(intakeUuid, fileId), {
      body: { reason: trimmedReason },
      signal,
    });
  } catch (error) {
    throw new Error(readApiErrorMessage(error, 'Failed to delete intake file.'));
  }
};

export interface UploadIntakeFileInput {
  intakeUuid: string;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

const validateUploadInput = (file: File): void => {
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
  if (mimeType.length > MAX_UPLOAD_MIME_LENGTH) {
    throw new Error(`File MIME type must be ${MAX_UPLOAD_MIME_LENGTH} characters or fewer.`);
  }
};

export const uploadIntakeFile = async ({
  intakeUuid,
  file,
  onProgress,
  signal,
}: UploadIntakeFileInput): Promise<IntakeFile> => {
  if (!intakeUuid) {
    throw new Error('intakeUuid is required.');
  }
  validateUploadInput(file);

  const presigned = await presignIntakeUpload({
    intakeUuid,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    signal,
  });

  await uploadViaPresignedUrl({
    file,
    presignedUrl: presigned.presigned_url,
    method: presigned.method,
    onProgress,
    signal,
  });

  return confirmIntakeUpload({
    intakeUuid,
    uploadId: presigned.upload_id,
    signal,
  });
};
