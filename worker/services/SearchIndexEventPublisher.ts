import type { Env } from '../types.js';
import type {
  SearchEntityType,
  SearchIndexEvent,
  SearchIndexPayload,
} from '../types/search.js';
import { Logger } from '../utils/logger.js';

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
