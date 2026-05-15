import type { Env } from '../types.js';
import type {
  SearchEntityType,
  SearchIndexEvent,
  SearchIndexPayload,
} from '../types/search.js';
import { Logger } from '../utils/logger.js';
import { SearchVectorService } from './SearchVectorService.js';

export class SearchIndexEventPublisher {
  constructor(private env: Env) {}

  publishUpsert(
    entityType: SearchEntityType,
    entityId: string,
    practiceId: string,
    payload: SearchIndexPayload,
  ): Promise<void> {
    return this.send({
      op: 'upsert',
      entityType,
      entityId,
      practiceId,
      payload,
      version: Date.now(),
    });
  }

  publishDelete(
    entityType: SearchEntityType,
    entityId: string,
    practiceId: string,
  ): Promise<void> {
    return this.send({
      op: 'delete',
      entityType,
      entityId,
      practiceId,
      version: Date.now(),
    });
  }

  publishCascadeDelete(
    entityType: SearchEntityType,
    entityId: string,
    practiceId: string,
  ): Promise<void> {
    return this.send({
      op: 'cascade_delete',
      entityType,
      entityId,
      practiceId,
      version: Date.now(),
    });
  }

  publishBackfill(practiceId: string, cookieKey: string): Promise<void> {
    return this.send({
      op: 'backfill',
      practiceId,
      cookieKey,
      version: Date.now(),
    });
  }

  /**
   * Publish one upsert per text chunk for a file. Called after Adobe Extract
   * (or any other extractor) produces document text. The consumer routes
   * file_chunk upserts through both FTS5 (for keyword search inside docs)
   * and Vectorize (for semantic search inside docs).
   *
   * Chunk size + overlap match SearchVectorService.chunkText defaults so the
   * same chunks land in both indexes.
   */
  async publishFileChunks(params: {
    fileId: string;
    practiceId: string;
    fileName: string;
    extractedText: string;
    clientId?: string;
    matterId?: string;
    chunkSize?: number;
    overlap?: number;
  }): Promise<number> {
    const { fileId, practiceId, fileName, extractedText, clientId, matterId } = params;
    if (!extractedText || extractedText.trim().length === 0) return 0;

    // Delegate to SearchVectorService.chunkText so the chunking math lives
    // in one place — same code path the consumer uses when it re-chunks
    // for the Vectorize side, so both indexes stay in sync on chunk
    // boundaries.
    const vectorService = new SearchVectorService(this.env);
    const chunks = vectorService.chunkText(
      extractedText,
      params.chunkSize,
      params.overlap,
    );

    const version = Date.now();
    let published = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkBody = chunks[i];
      await this.send({
        op: 'upsert',
        entityType: 'file_chunk',
        entityId: `${fileId}:${i}`,
        practiceId,
        payload: {
          title: fileName,
          subtitle: `File chunk ${i + 1}/${chunks.length}`,
          body: chunkBody,
          fileId,
          clientId,
          matterId,
          metadata: {
            chunkIndex: i,
            chunkCount: chunks.length,
            sourceFileId: fileId,
          },
        },
        version: version + i, // unique per chunk so latest-wins picks the freshest publish
      });
      published += 1;
    }
    return published;
  }

  private async send(event: SearchIndexEvent): Promise<void> {
    if (!this.env.SEARCH_INDEX_EVENTS) {
      Logger.warn('SEARCH_INDEX_EVENTS queue binding missing; dropping event', {
        op: event.op,
      });
      return;
    }
    try {
      await this.env.SEARCH_INDEX_EVENTS.send(event);
    } catch (error) {
      Logger.warn('Failed to enqueue search index event', {
        op: event.op,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
