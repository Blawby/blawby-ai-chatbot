import type { Env } from '../types.js';
import type { SearchIndexEvent } from '../types/search.js';
import { SearchIndexService } from '../services/SearchIndexService.js';
import { SearchVectorService } from '../services/SearchVectorService.js';
import { SearchBackfillService } from '../services/SearchBackfillService.js';
import { Logger } from '../utils/logger.js';

type QueueMessage<T> = {
  body: T;
  ack(): void;
};

export async function handleSearchIndexQueue(
  batch: MessageBatch<SearchIndexEvent>,
  env: Env,
): Promise<void> {
  Logger.initialize({ DEBUG: env.DEBUG, NODE_ENV: env.NODE_ENV });

  const indexService = new SearchIndexService(env);
  const vectorService = new SearchVectorService(env);
  const start = Date.now();
  let processed = 0;
  let failures = 0;

  const grouped = groupByEntity(batch.messages);

  for (const group of grouped) {
    const latest = pickLatest(group.messages);
    try {
      await applyEvent(latest.body, env, indexService, vectorService);
      processed += 1;
    } catch (error) {
      failures += 1;
      Logger.warn('search index event failed', {
        op: latest.body.op,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    for (const msg of group.messages) {
      msg.ack();
    }
  }

  Logger.info('search_index.consumed', {
    batch_size: batch.messages.length,
    processed,
    failures,
    took_ms: Date.now() - start,
  });
}

function eventKey(event: SearchIndexEvent): string {
  if (event.op === 'backfill') return `backfill:${event.practiceId}`;
  return `${event.entityType}:${event.entityId}`;
}

function groupByEntity(
  messages: readonly QueueMessage<SearchIndexEvent>[],
): Array<{ key: string; messages: Array<QueueMessage<SearchIndexEvent>> }> {
  const map = new Map<string, Array<QueueMessage<SearchIndexEvent>>>();
  for (const msg of messages) {
    const k = eventKey(msg.body);
    const list = map.get(k);
    if (list) list.push(msg);
    else map.set(k, [msg]);
  }
  return Array.from(map.entries()).map(([key, msgs]) => ({ key, messages: msgs }));
}

function pickLatest(
  msgs: Array<QueueMessage<SearchIndexEvent>>,
): QueueMessage<SearchIndexEvent> {
  return msgs.reduce((acc, m) => (m.body.version > acc.body.version ? m : acc));
}

async function applyEvent(
  event: SearchIndexEvent,
  env: Env,
  indexService: SearchIndexService,
  vectorService: SearchVectorService,
): Promise<void> {
  switch (event.op) {
    case 'upsert': {
      await indexService.upsert(
        event.entityType,
        event.entityId,
        event.practiceId,
        event.payload,
      );
      if (event.entityType === 'file_chunk' && event.payload.body && vectorService.isEnabled()) {
        await vectorService.upsertChunk({
          id: vectorService.vectorIdFor(
            event.entityType,
            event.entityId,
            (event.payload.metadata?.chunkIndex as number) ?? 0,
          ),
          text: event.payload.body,
          practiceId: event.practiceId,
          entityType: event.entityType,
          entityId: event.entityId,
          clientId: event.payload.clientId,
          matterId: event.payload.matterId,
          fileId: event.payload.fileId,
          chunkIndex: event.payload.metadata?.chunkIndex as number | undefined,
          pageNumber: event.payload.metadata?.pageNumber as number | undefined,
        });
      }
      return;
    }
    case 'delete': {
      await indexService.delete(event.entityType, event.entityId);
      if (vectorService.isEnabled()) {
        await vectorService.deleteByIds([
          vectorService.vectorIdFor(event.entityType, event.entityId, 0),
        ]);
      }
      return;
    }
    case 'cascade_delete': {
      const removed = await indexService.cascadeDelete(
        event.entityType,
        event.entityId,
      );
      if (vectorService.isEnabled() && removed.length > 0) {
        const ids = removed.map((r) =>
          vectorService.vectorIdFor(
            r.entity_type as Parameters<typeof vectorService.vectorIdFor>[0],
            r.entity_id,
            0,
          ),
        );
        await vectorService.deleteByIds(ids);
      }
      return;
    }
    case 'backfill': {
      const backfill = new SearchBackfillService(env);
      const result = await backfill.run(event.practiceId, event.cookieKey);
      Logger.info('search index backfill ran', {
        practiceId: event.practiceId,
        ...result,
      });
      return;
    }
  }
}
