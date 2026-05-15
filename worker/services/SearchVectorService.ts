import type { Env } from '../types.js';
import type { SearchEntityType } from '../types/search.js';
import { Logger } from '../utils/logger.js';

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

export type VectorUpsertInput = {
  id: string;
  text: string;
  practiceId: string;
  entityType: SearchEntityType;
  entityId: string;
  clientId?: string;
  matterId?: string;
  fileId?: string;
  chunkIndex?: number;
  pageNumber?: number;
};

export type VectorMatch = {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
};

export class SearchVectorService {
  constructor(private env: Env) {}

  isEnabled(): boolean {
    return Boolean(this.env.SEARCH_VECTORS && this.env.AI) &&
      this.env.SEARCH_SEMANTIC_ENABLED !== 'false';
  }

  async upsertChunk(input: VectorUpsertInput): Promise<void> {
    if (!this.isEnabled() || !this.env.SEARCH_VECTORS || !this.env.AI) return;
    const embedding = await this.embed(input.text);
    if (!embedding) return;

    await this.env.SEARCH_VECTORS.upsert([
      {
        id: input.id,
        values: embedding,
        metadata: {
          practice_id: input.practiceId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          ...(input.clientId ? { client_id: input.clientId } : {}),
          ...(input.matterId ? { matter_id: input.matterId } : {}),
          ...(input.fileId ? { file_id: input.fileId } : {}),
          ...(input.chunkIndex !== undefined ? { chunk_index: input.chunkIndex } : {}),
          ...(input.pageNumber !== undefined ? { page_number: input.pageNumber } : {}),
        },
      },
    ]);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (!this.isEnabled() || !this.env.SEARCH_VECTORS || ids.length === 0) return;
    try {
      await this.env.SEARCH_VECTORS.deleteByIds(ids);
    } catch (error) {
      Logger.warn('Vectorize deleteByIds failed', {
        idCount: ids.length,
        error: String(error),
      });
    }
  }

  async query(
    queryText: string,
    practiceId: string,
    options: { topK?: number; entityType?: SearchEntityType } = {},
  ): Promise<VectorMatch[]> {
    if (!this.isEnabled() || !this.env.SEARCH_VECTORS || !this.env.AI) return [];
    const embedding = await this.embed(queryText);
    if (!embedding) return [];

    const filter: Record<string, unknown> = { practice_id: practiceId };
    if (options.entityType) filter.entity_type = options.entityType;

    try {
      const result = await this.env.SEARCH_VECTORS.query(embedding, {
        topK: options.topK ?? 12,
        filter: filter as VectorizeVectorMetadataFilter,
        returnMetadata: 'all',
      });
      return (result.matches ?? []).map((m) => ({
        id: m.id,
        score: m.score ?? 0,
        metadata: (m.metadata ?? {}) as Record<string, unknown>,
      }));
    } catch (error) {
      Logger.warn('Vectorize query failed', { error: String(error) });
      return [];
    }
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.env.AI) return null;
    try {
      const result = (await this.env.AI.run(EMBED_MODEL, {
        text: [text.slice(0, 4000)],
      })) as { data?: number[][] };
      return result.data?.[0] ?? null;
    } catch (error) {
      Logger.warn('Embedding failed', { error: String(error) });
      return null;
    }
  }

  chunkText(text: string, chunkSize = 1000, overlap = 400): string[] {
    if (!text) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start = end - overlap;
      if (start < 0) start = 0;
    }
    return chunks;
  }

  vectorIdFor(entityType: SearchEntityType, entityId: string, chunkIndex = 0): string {
    return `${entityType}:${entityId}:${chunkIndex}`;
  }
}
