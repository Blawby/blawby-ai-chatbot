import { apiClient } from '@/shared/lib/apiClient';
import type { SearchEnvelope, SearchPin } from './searchTypes';

type Envelope<T> = { success: boolean; data: T };

export async function searchGlobal(
  practiceId: string,
  query: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<SearchEnvelope> {
  const params = new URLSearchParams();
  params.set('q', query);
  if (options.limit) params.set('limit', String(options.limit));
  const url = `/api/search/${encodeURIComponent(practiceId)}?${params.toString()}`;
  const res = await apiClient.get<Envelope<SearchEnvelope>>(url, { signal: options.signal });
  return res.data.data;
}

export async function listSearchPins(practiceId: string): Promise<SearchPin[]> {
  const res = await apiClient.get<Envelope<SearchPin[]>>(
    `/api/search/${encodeURIComponent(practiceId)}/pins`,
  );
  return res.data.data ?? [];
}

export async function addSearchPin(
  practiceId: string,
  entityType: string,
  entityId: string,
): Promise<{ id: string }> {
  const res = await apiClient.post<Envelope<{ id: string }>>(
    `/api/search/${encodeURIComponent(practiceId)}/pins`,
    { entityType, entityId },
  );
  return res.data.data;
}

export async function removeSearchPin(
  practiceId: string,
  pinId: string,
): Promise<void> {
  await apiClient.delete<Envelope<{ ok: boolean }>>(
    `/api/search/${encodeURIComponent(practiceId)}/pins/${encodeURIComponent(pinId)}`,
  );
}

export async function recordSearchClick(
  practiceId: string,
  queryLogId: string,
  entityType: string,
  entityId: string,
  rank: number,
): Promise<void> {
  await apiClient.post<Envelope<{ ok: boolean }>>(
    `/api/search/${encodeURIComponent(practiceId)}/click`,
    { queryLogId, entityType, entityId, rank },
  );
}
