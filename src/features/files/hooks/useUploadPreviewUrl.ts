import { useEffect, useState } from 'preact/hooks';

import { apiClient } from '@/shared/lib/apiClient';
import { uploadDownloadPath } from '@/config/urls';

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
 * Resolves a renderable URL for an upload. When the record carries a
 * `public_url`, pass through. Otherwise call /download to mint a 15-min
 * presigned URL and cache it.
 *
 * The `enabled` flag lets the consumer skip the fetch when no URL is needed
 * (e.g. a document tile that only resolves on click). Defaults to true.
 */
export const useUploadPreviewUrl = (
  uploadId: string,
  publicUrl: string | null,
  enabled: boolean = true,
): { url: string | null; isLoading: boolean } => {
  const initial = publicUrl ?? (enabled ? readCache(uploadId) : null);
  const [url, setUrl] = useState<string | null>(initial);
  const [isLoading, setIsLoading] = useState<boolean>(!initial && enabled);

  useEffect(() => {
    if (publicUrl) {
      setUrl(publicUrl);
      setIsLoading(false);
      return;
    }
    if (!enabled || !uploadId) {
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
  }, [uploadId, publicUrl, enabled]);

  return { url, isLoading };
};
