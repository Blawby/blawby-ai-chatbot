import { matterNestedPath } from '@/config/urls';
import { apiClient } from '@/shared/lib/apiClient';

type FetchOptions = {
  signal?: AbortSignal;
};

type ApiEnvelope<T> = {
  data?: T;
};

export interface MatterFileUpload {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileType: string | null;
  mimeType: string | null;
  publicUrl: string | null;
  storageKey: string;
  createdAt: string | null;
}

export interface MatterFile {
  id: string;
  matterId: string;
  uploadId: string;
  linkedBy: string | null;
  linkedAt: string | null;
  upload: MatterFileUpload;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const requiredString = (value: unknown, fieldName: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Invalid matter file payload: ${fieldName} is missing.`);
};

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const requiredNumber = (value: unknown, fieldName: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Invalid matter file payload: ${fieldName} is missing.`);
};

const normalizeMatterFile = (input: unknown): MatterFile => {
  if (!isRecord(input)) {
    throw new Error('Invalid matter file payload: expected object.');
  }

  const uploadRaw = input.upload;
  if (!isRecord(uploadRaw)) {
    throw new Error('Invalid matter file payload: upload object is missing.');
  }

  return {
    id: requiredString(input.id, 'id'),
    matterId: requiredString(input.matter_id, 'matter_id'),
    uploadId: requiredString(input.upload_id, 'upload_id'),
    linkedBy: optionalString(input.linked_by),
    linkedAt: optionalString(input.linked_at),
    upload: {
      uploadId: requiredString(uploadRaw.upload_id, 'upload.upload_id'),
      fileName: requiredString(uploadRaw.file_name, 'upload.file_name'),
      fileSize: requiredNumber(uploadRaw.file_size, 'upload.file_size'),
      fileType: optionalString(uploadRaw.file_type),
      mimeType: optionalString(uploadRaw.mime_type),
      publicUrl: optionalString(uploadRaw.public_url),
      storageKey: requiredString(uploadRaw.storage_key, 'upload.storage_key'),
      createdAt: optionalString(uploadRaw.created_at),
    },
  };
};

const normalizeMatterFilesList = (payload: unknown): MatterFile[] => {
  if (Array.isArray(payload)) {
    return payload.map(normalizeMatterFile);
  }

  if (isRecord(payload) && Array.isArray((payload as ApiEnvelope<unknown>).data)) {
    const data = (payload as ApiEnvelope<unknown[]>).data;
    return Array.isArray(data) ? data.map(normalizeMatterFile) : [];
  }

  throw new Error('Invalid matter files response: expected an array payload.');
};

const normalizeMatterFileSingle = (payload: unknown): MatterFile => {
  if (isRecord(payload) && isRecord((payload as ApiEnvelope<unknown>).data)) {
    return normalizeMatterFile((payload as ApiEnvelope<unknown>).data);
  }
  return normalizeMatterFile(payload);
};

export const listMatterFiles = async (
  practiceId: string,
  matterId: string,
  options: FetchOptions = {}
): Promise<MatterFile[]> => {
  const response = await apiClient.get(
    matterNestedPath(practiceId, matterId, 'files'),
    { signal: options.signal }
  );
  return normalizeMatterFilesList(response.data);
};

export const linkUploadToMatter = async (
  practiceId: string,
  matterId: string,
  uploadId: string,
  options: FetchOptions = {}
): Promise<MatterFile> => {
  const response = await apiClient.post(
    matterNestedPath(practiceId, matterId, 'files'),
    { upload_id: uploadId },
    { signal: options.signal }
  );
  return normalizeMatterFileSingle(response.data);
};
