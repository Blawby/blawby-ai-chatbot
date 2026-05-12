import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    upload: vi.fn(),
  },
}));

const { mockUploadViaPresignedUrl } = vi.hoisted(() => ({
  mockUploadViaPresignedUrl: vi.fn(),
}));

vi.mock('@/shared/lib/apiClient', () => ({
  apiClient: mockApiClient,
  isAbortError: (e: unknown) => e instanceof Error && e.name === 'AbortError',
  isHttpError: (e: unknown): e is { response: { status: number; data: unknown }; message?: string } =>
    typeof e === 'object' && e !== null && 'response' in e,
}));

vi.mock('@/shared/lib/presignedUpload', () => ({
  uploadViaPresignedUrl: mockUploadViaPresignedUrl,
}));

import {
  confirmIntakeUpload,
  deleteIntakeFile,
  listIntakeFiles,
  presignIntakeUpload,
  uploadIntakeFile,
} from '@/features/intake/api/intakeFilesApi';

const intakeUuid = 'intake-uuid-1';

const verifiedFilePayload = {
  id: 'file-1',
  intake_uuid: intakeUuid,
  upload_id: 'upload-1',
  file_name: 'contract.pdf',
  file_size: 1024,
  mime_type: 'application/pdf',
  status: 'verified',
  public_url: null,
  storage_key: 'r2-key-1',
  is_privileged: true,
  created_at: '2026-05-11T00:00:00Z',
  uploaded_by: 'user-1',
};

describe('intakeFilesApi', () => {
  beforeEach(() => {
    Object.values(mockApiClient).forEach((fn) => fn.mockReset());
    mockUploadViaPresignedUrl.mockReset();
  });

  describe('listIntakeFiles', () => {
    it('hits the scoped intake files endpoint and normalizes results', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: { data: [verifiedFilePayload] } });

      const files = await listIntakeFiles(intakeUuid);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/api/practice-client-intakes/${intakeUuid}/files`,
        expect.objectContaining({ signal: undefined }),
      );
      expect(files).toEqual([
        expect.objectContaining({
          id: 'file-1',
          uploadId: 'upload-1',
          fileName: 'contract.pdf',
          status: 'verified',
          isPrivileged: true,
        }),
      ]);
    });

    it('accepts plain array responses', async () => {
      mockApiClient.get.mockResolvedValueOnce({ data: [verifiedFilePayload] });
      const files = await listIntakeFiles(intakeUuid);
      expect(files).toHaveLength(1);
    });

    it('throws if intakeUuid is missing', async () => {
      await expect(listIntakeFiles('')).rejects.toThrow('intakeUuid is required.');
    });

    it('surfaces backend error messages', async () => {
      mockApiClient.get.mockRejectedValueOnce({
        response: { status: 403, data: { message: 'Forbidden' } },
      });
      await expect(listIntakeFiles(intakeUuid)).rejects.toThrow('Forbidden');
    });
  });

  describe('presignIntakeUpload', () => {
    it('posts to the presign endpoint with snake_case body', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        data: {
          data: {
            upload_id: 'upload-2',
            presigned_url: 'https://r2.example.com/sig',
            method: 'PUT',
            storage_key: 'key-2',
            expires_at: '2026-05-11T01:00:00Z',
          },
        },
      });

      const response = await presignIntakeUpload({
        intakeUuid,
        fileName: 'evidence.png',
        mimeType: 'image/png',
        fileSize: 2048,
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/practice-client-intakes/${intakeUuid}/files/presign`,
        { file_name: 'evidence.png', mime_type: 'image/png', file_size: 2048 },
        expect.any(Object),
      );
      expect(response.upload_id).toBe('upload-2');
    });
  });

  describe('confirmIntakeUpload', () => {
    it('posts to the confirm endpoint and normalizes the response', async () => {
      mockApiClient.post.mockResolvedValueOnce({ data: { data: verifiedFilePayload } });

      const file = await confirmIntakeUpload({ intakeUuid, uploadId: 'upload-1' });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/practice-client-intakes/${intakeUuid}/files/upload-1/confirm`,
        undefined,
        expect.any(Object),
      );
      expect(file.status).toBe('verified');
    });
  });

  describe('deleteIntakeFile', () => {
    it('requires a non-empty reason', async () => {
      await expect(
        deleteIntakeFile({ intakeUuid, fileId: 'file-1', reason: '   ' }),
      ).rejects.toThrow('A reason is required to delete this file.');
      expect(mockApiClient.delete).not.toHaveBeenCalled();
    });

    it('sends DELETE with reason in body', async () => {
      mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } });

      await deleteIntakeFile({ intakeUuid, fileId: 'file-1', reason: 'Wrong file' });

      expect(mockApiClient.delete).toHaveBeenCalledWith(
        `/api/practice-client-intakes/${intakeUuid}/files/file-1`,
        expect.objectContaining({ body: { reason: 'Wrong file' } }),
      );
    });
  });

  describe('uploadIntakeFile', () => {
    it('chains presign → R2 PUT → confirm', async () => {
      const presignedPayload = {
        upload_id: 'upload-x',
        presigned_url: 'https://r2.example.com/sig',
        method: 'PUT',
        storage_key: 'key-x',
        expires_at: '2026-05-11T01:00:00Z',
      };
      mockApiClient.post
        .mockResolvedValueOnce({ data: { data: presignedPayload } })
        .mockResolvedValueOnce({ data: { data: { ...verifiedFilePayload, upload_id: 'upload-x' } } });
      mockUploadViaPresignedUrl.mockResolvedValueOnce(undefined);

      const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
      const result = await uploadIntakeFile({ intakeUuid, file });

      expect(mockApiClient.post).toHaveBeenNthCalledWith(
        1,
        `/api/practice-client-intakes/${intakeUuid}/files/presign`,
        { file_name: 'doc.pdf', mime_type: 'application/pdf', file_size: 3 },
        expect.any(Object),
      );
      expect(mockUploadViaPresignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
          presignedUrl: 'https://r2.example.com/sig',
          method: 'PUT',
        }),
      );
      expect(mockApiClient.post).toHaveBeenNthCalledWith(
        2,
        `/api/practice-client-intakes/${intakeUuid}/files/upload-x/confirm`,
        undefined,
        expect.any(Object),
      );
      expect(result.uploadId).toBe('upload-x');
    });

    it('rejects files over 50 MB before calling presign', async () => {
      const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
      Object.defineProperty(big, 'size', { value: 52_428_801 });

      await expect(uploadIntakeFile({ intakeUuid, file: big })).rejects.toThrow('File is too large');
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('throws when intakeUuid is missing', async () => {
      const file = new File([new Uint8Array([1])], 'd.pdf', { type: 'application/pdf' });
      await expect(uploadIntakeFile({ intakeUuid: '', file })).rejects.toThrow('intakeUuid is required.');
    });
  });
});
