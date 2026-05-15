import type { Env } from '../types.js';
import { Logger } from '../utils/logger.js';
import { SearchIndexService } from './SearchIndexService.js';
import { SearchVectorService } from './SearchVectorService.js';
import { normalizeForIndex } from '../utils/normalizeForIndex.js';
import type { SearchEntityType } from '../types/search.js';

type ListEndpoint = {
  type: SearchEntityType;
  path: string;
};

const ENTITY_ENDPOINTS: readonly ListEndpoint[] = [
  { type: 'client', path: '/api/clients' },
  { type: 'matter', path: '/api/matters' },
  { type: 'invoice', path: '/api/invoices' },
  { type: 'intake', path: '/api/practice-client-intakes' },
];

const PAGE_SIZE = 100;
const MAX_PAGES_PER_TYPE = 10;
const COOKIE_KV_PREFIX = 'backfill-cookie:';
const COOKIE_TTL_SECONDS = 60 * 5;

export class SearchBackfillService {
  constructor(private env: Env) {}

  async storeCookie(cookieKey: string, cookie: string): Promise<void> {
    if (!this.env.CHAT_SESSIONS) return;
    await this.env.CHAT_SESSIONS.put(cookieKey, cookie, {
      expirationTtl: COOKIE_TTL_SECONDS,
    });
  }

  async run(practiceId: string, cookieKey: string): Promise<{
    counts: Record<string, number>;
    errors: string[];
  }> {
    const cookie = this.env.CHAT_SESSIONS
      ? await this.env.CHAT_SESSIONS.get(cookieKey)
      : null;
    if (!cookie) {
      Logger.warn('backfill cookie missing or expired', { cookieKey });
      return { counts: {}, errors: ['cookie expired or missing'] };
    }

    const baseUrl = this.env.BACKEND_API_URL;
    if (!baseUrl) {
      return { counts: {}, errors: ['BACKEND_API_URL not configured'] };
    }

    const indexService = new SearchIndexService(this.env);
    const vectorService = new SearchVectorService(this.env);
    const counts: Record<string, number> = {};
    const errors: string[] = [];

    for (const endpoint of ENTITY_ENDPOINTS) {
      try {
        const indexed = await this.walkEntityType(
          baseUrl,
          cookie,
          endpoint,
          practiceId,
          indexService,
          vectorService,
        );
        counts[endpoint.type] = indexed;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${endpoint.type}: ${msg}`);
        Logger.warn('backfill walk failed', { type: endpoint.type, error: msg });
      }
    }

    if (this.env.CHAT_SESSIONS) {
      await this.env.CHAT_SESSIONS.delete(cookieKey);
    }

    Logger.info('search backfill complete', { practiceId, counts, errors: errors.length });
    return { counts, errors };
  }

  private async walkEntityType(
    baseUrl: string,
    cookie: string,
    endpoint: ListEndpoint,
    practiceId: string,
    indexService: SearchIndexService,
    vectorService: SearchVectorService,
  ): Promise<number> {
    let indexed = 0;
    for (let page = 1; page <= MAX_PAGES_PER_TYPE; page += 1) {
      const url = `${baseUrl}${endpoint.path}?practice_id=${encodeURIComponent(practiceId)}&page=${page}&per_page=${PAGE_SIZE}`;
      const response = await fetch(url, {
        headers: { Cookie: cookie, Accept: 'application/json' },
      });
      if (!response.ok) {
        Logger.warn('backfill page fetch failed', {
          type: endpoint.type,
          page,
          status: response.status,
        });
        return indexed;
      }
      const payload = (await response.json().catch(() => null)) as unknown;
      const items = extractItemsArray(payload);
      if (items.length === 0) return indexed;

      for (const item of items) {
        const normalized = normalizeForIndex(endpoint.path, item, practiceId);
        if (!normalized) continue;
        try {
          await indexService.upsert(
            normalized.entityType,
            normalized.entityId,
            normalized.practiceId,
            normalized.payload,
          );
          if (
            vectorService.isEnabled() &&
            normalized.payload.body &&
            normalized.payload.body.length > 0
          ) {
            await vectorService.upsertChunk({
              id: vectorService.vectorIdFor(normalized.entityType, normalized.entityId, 0),
              text: `${normalized.payload.title} ${normalized.payload.subtitle ?? ''} ${normalized.payload.body}`,
              practiceId: normalized.practiceId,
              entityType: normalized.entityType,
              entityId: normalized.entityId,
              clientId: normalized.payload.clientId,
              matterId: normalized.payload.matterId,
              fileId: normalized.payload.fileId,
            });
          }
          indexed += 1;
        } catch (error) {
          Logger.warn('backfill upsert failed', {
            type: endpoint.type,
            entityId: normalized.entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (items.length < PAGE_SIZE) return indexed;
    }
    return indexed;
  }
}

export function makeBackfillCookieKey(practiceId: string): string {
  return `${COOKIE_KV_PREFIX}${practiceId}:${crypto.randomUUID()}`;
}

function extractItemsArray(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'matters', 'clients', 'invoices', 'intakes']) {
    const value = obj[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  return [];
}
