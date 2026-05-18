import { useEffect, useState } from 'preact/hooks';

import { apiClient } from '@/shared/lib/apiClient';
import { uploadDownloadPath } from '@/config/urls';
import { isImageFile } from '@/shared/utils/fileTypeUtils';

interface DownloadResponse {
  download_url: string;
  expires_at?: string;
}

// Backend's presigned-URL TTL is 15 min; refresh slightly early so a request
// in-flight when the URL expires doesn't 403.
const SAFETY_MARGIN_MS = 60_000;
const DEFAULT_TTL_MS = 15 * 60_000;

const cache = new Map<string, { url: string; expiresAt: number }>();

const readCache = (uploadId: string): string | null => {
  const entry = cache.get(uploadId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt - SAFETY_MARGIN_MS) {
    cache.delete(uploadId);
    return null;
  }
  return entry.url;
};

const writeCache = (uploadId: string, url: string, expiresAtIso?: string): void => {
  const expiresAt = expiresAtIso ? Date.parse(expiresAtIso) : Date.now() + DEFAULT_TTL_MS;
  cache.set(uploadId, { url, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + DEFAULT_TTL_MS });
};

/**
 * Fetch a fresh presigned download URL. Always hits the backend — callers that
 * want caching should use {@link useUploadPreviewUrl} instead.
 */
export const fetchUploadDownloadUrl = async (uploadId: string, signal?: AbortSignal): Promise<string> => {
  const { data } = await apiClient.get<DownloadResponse>(uploadDownloadPath(uploadId), { signal });
  if (!data?.download_url) {
    throw new Error('Backend did not return a download_url.');
  }
  writeCache(uploadId, data.download_url, data.expires_at);
  return data.download_url;
};

/**
 * Resolves a renderable URL for an upload's thumbnail / preview. When the
 * record carries a `public_url`, pass through. Otherwise call /download to
 * mint a 15-min presigned URL and cache it.
 *
 * Returns `null` (no fetch) for non-image mime types so the consumer can fall
 * back to a file-type icon without spending a round trip.
 */
export const useUploadPreviewUrl = (
  uploadId: string,
  publicUrl: string | null,
  mimeType: string,
): { url: string | null; isLoading: boolean } => {
  const isImage = isImageFile(mimeType);
  const initial = publicUrl ?? (isImage ? readCache(uploadId) : null);
  const [url, setUrl] = useState<string | null>(initial);
  const [isLoading, setIsLoading] = useState<boolean>(!initial && isImage);

  useEffect(() => {
    if (publicUrl) {
      setUrl(publicUrl);
      setIsLoading(false);
      return;
    }
    if (!isImage || !uploadId) {
      setUrl(null);
      setIsLoading(false);
      return;
    }
    const cached = readCache(uploadId);
    if (cached) {
      setUrl(cached);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    fetchUploadDownloadUrl(uploadId, controller.signal)
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setUrl(resolved);
        setIsLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error?.name === 'AbortError' || error?.name === 'CanceledError') return;
        setUrl(null);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [uploadId, publicUrl, mimeType, isImage]);

  return { url, isLoading };
};
