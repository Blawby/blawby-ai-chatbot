// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/preact';
import { queryCache } from '@/shared/lib/queryCache';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => (
    window.setTimeout(() => callback(Date.now()), 0)
  )) as typeof globalThis.requestAnimationFrame;
}

if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = ((handle: number) => {
    window.clearTimeout(handle);
  }) as typeof globalThis.cancelAnimationFrame;
}

const mocks = vi.hoisted(() => ({
  listIntakeFilesMock: vi.fn(),
  uploadIntakeFileMock: vi.fn(),
  deleteIntakeFileMock: vi.fn(),
}));

vi.mock('@/features/intake/api/intakeFilesApi', () => ({
  listIntakeFiles: mocks.listIntakeFilesMock,
  uploadIntakeFile: mocks.uploadIntakeFileMock,
  deleteIntakeFile: mocks.deleteIntakeFileMock,
}));

import { useIntakeFiles, intakeFilesCacheKey } from '@/features/intake/hooks/useIntakeFiles';

const verifiedFile = {
  id: 'file-1',
  intakeUuid: 'intake-1',
  uploadId: 'upload-1',
  fileName: 'contract.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  status: 'verified' as const,
  publicUrl: null,
  storageKey: 'key',
  isPrivileged: true,
  createdAt: '2026-05-11T00:00:00Z',
  uploadedBy: null,
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
};

const pendingFile = { ...verifiedFile, id: 'file-2', uploadId: 'upload-2', status: 'pending' as const };

describe('useIntakeFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCache.clear();
  });

  it('filters the list to verified files only', async () => {
    mocks.listIntakeFilesMock.mockResolvedValue([verifiedFile, pendingFile]);

    const { result } = renderHook(() => useIntakeFiles('intake-1'));

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });
    expect(result.current.files[0].id).toBe('file-1');
    expect(result.current.allFiles).toHaveLength(2);
  });

  it('does not fetch when intakeUuid is missing', async () => {
    renderHook(() => useIntakeFiles(null));

    // Allow useEffect microtask to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.listIntakeFilesMock).not.toHaveBeenCalled();
  });

  it('optimistically updates cache after upload', async () => {
    mocks.listIntakeFilesMock.mockResolvedValue([]);
    const newFile = { ...verifiedFile, id: 'file-new', uploadId: 'upload-new', fileName: 'evidence.png' };
    mocks.uploadIntakeFileMock.mockResolvedValue(newFile);

    const { result } = renderHook(() => useIntakeFiles('intake-1'));
    await waitFor(() => expect(result.current.files).toHaveLength(0));

    await act(async () => {
      await result.current.uploadFile(new File([new Uint8Array([1, 2])], 'evidence.png'));
    });

    const cacheKey = intakeFilesCacheKey('intake-1');
    expect(queryCache.get(cacheKey)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'file-new' }),
    ]));
  });

  it('removes file from cache after delete', async () => {
    mocks.listIntakeFilesMock.mockResolvedValue([verifiedFile]);
    mocks.deleteIntakeFileMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useIntakeFiles('intake-1'));
    await waitFor(() => expect(result.current.files).toHaveLength(1));

    await act(async () => {
      await result.current.deleteFile('file-1', 'wrong file');
    });

    expect(mocks.deleteIntakeFileMock).toHaveBeenCalledWith({
      intakeUuid: 'intake-1',
      fileId: 'file-1',
      reason: 'wrong file',
    });
    const cacheKey = intakeFilesCacheKey('intake-1');
    const cached = queryCache.get(cacheKey) as Array<{ id: string }> | undefined;
    expect(cached?.some((f) => f.id === 'file-1')).toBe(false);
  });
});
