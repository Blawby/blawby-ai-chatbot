import type { Env } from '../types.js';
import type {
  SearchEntityType,
  SearchIndexPayload,
  SearchResultItem,
} from '../types/search.js';
import { Logger } from '../utils/logger.js';

const FTS_TABLE = 'search_index';
const REFS_TABLE = 'search_index_refs';

type RefRow = {
  entity_type: string;
  entity_id: string;
  practice_id: string;
  client_id: string | null;
  matter_id: string | null;
  file_id: string | null;
  fts_rowid: number;
};

type FtsRow = {
  rowid: number;
  entity_type: string;
  entity_id: string;
  practice_id: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  metadata: string | null;
};

type FtsHit = FtsRow & {
  rank: number;
  body_snippet: string | null;
  title_snippet: string | null;
};

export type SearchIndexQueryOptions = {
  practiceId: string;
  fts: string;
  scopes?: SearchEntityType[];
  limit?: number;
};

export class SearchIndexService {
  constructor(private env: Env) {}

  async upsert(
    entityType: SearchEntityType,
    entityId: string,
    practiceId: string,
    payload: SearchIndexPayload,
  ): Promise<void> {
    const existing = await this.findRef(entityType, entityId);
    const metadataJson = JSON.stringify(payload.metadata ?? {});

    if (existing) {
      await this.env.DB.prepare(
        `UPDATE ${FTS_TABLE}
           SET practice_id = ?, title = ?, subtitle = ?, body = ?, metadata = ?
         WHERE rowid = ?`,
      )
        .bind(
          practiceId,
          payload.title,
          payload.subtitle ?? null,
          payload.body ?? null,
          metadataJson,
          existing.fts_rowid,
        )
        .run();

      await this.env.DB.prepare(
        `UPDATE ${REFS_TABLE}
           SET practice_id = ?, client_id = ?, matter_id = ?, file_id = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE entity_type = ? AND entity_id = ?`,
      )
        .bind(
          practiceId,
          payload.clientId ?? null,
          payload.matterId ?? null,
          payload.fileId ?? null,
          entityType,
          entityId,
        )
        .run();
      return;
    }

    const insertResult = await this.env.DB.prepare(
      `INSERT INTO ${FTS_TABLE} (entity_type, entity_id, practice_id, title, subtitle, body, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        entityType,
        entityId,
        practiceId,
        payload.title,
        payload.subtitle ?? null,
        payload.body ?? null,
        metadataJson,
      )
      .run();

    const rowid = insertResult.meta.last_row_id;
    if (typeof rowid !== 'number') {
      throw new Error(`Insert did not return a rowid for ${entityType}:${entityId}`);
    }

    await this.env.DB.prepare(
      `INSERT INTO ${REFS_TABLE}
         (entity_type, entity_id, practice_id, client_id, matter_id, file_id, fts_rowid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        entityType,
        entityId,
        practiceId,
        payload.clientId ?? null,
        payload.matterId ?? null,
        payload.fileId ?? null,
        rowid,
      )
      .run();
  }

  async delete(entityType: SearchEntityType, entityId: string): Promise<void> {
    const ref = await this.findRef(entityType, entityId);
    if (!ref) return;

    await this.env.DB.batch([
      this.env.DB.prepare(`DELETE FROM ${FTS_TABLE} WHERE rowid = ?`).bind(ref.fts_rowid),
      this.env.DB.prepare(
        `DELETE FROM ${REFS_TABLE} WHERE entity_type = ? AND entity_id = ?`,
      ).bind(entityType, entityId),
    ]);
  }

  async cascadeDelete(entityType: SearchEntityType, entityId: string): Promise<RefRow[]> {
    const parent = await this.findRef(entityType, entityId);
    const children = await this.findChildren(entityType, entityId);
    const all = parent ? [parent, ...children] : children;
    if (all.length === 0) return [];

    const rowids = all.map((r) => r.fts_rowid);
    const placeholders = rowids.map(() => '?').join(',');

    await this.env.DB.batch([
      this.env.DB.prepare(`DELETE FROM ${FTS_TABLE} WHERE rowid IN (${placeholders})`).bind(
        ...rowids,
      ),
      ...all.map((r) =>
        this.env.DB.prepare(
          `DELETE FROM ${REFS_TABLE} WHERE entity_type = ? AND entity_id = ?`,
        ).bind(r.entity_type, r.entity_id),
      ),
    ]);

    return all;
  }

  async query(options: SearchIndexQueryOptions): Promise<SearchResultItem[]> {
    const limit = options.limit ?? 16;
    const scopeFilter = options.scopes && options.scopes.length > 0
      ? `AND r.entity_type IN (${options.scopes.map(() => '?').join(',')})`
      : '';

    // FTS5 column indexes for snippet(): match the CREATE VIRTUAL TABLE order.
    //   0 entity_type   1 entity_id   2 practice_id (UNINDEXED)
    //   3 title         4 subtitle    5 body        6 metadata (UNINDEXED)
    // snippet(table, col, beforeMark, afterMark, ellipses, max_tokens)
    const stmt = this.env.DB.prepare(
      `SELECT s.rowid as rowid,
              s.entity_type,
              s.entity_id,
              s.practice_id,
              s.title,
              s.subtitle,
              s.body,
              s.metadata,
              bm25(${FTS_TABLE}) as rank,
              snippet(${FTS_TABLE}, 5, '<mark>', '</mark>', '…', 12) as body_snippet,
              snippet(${FTS_TABLE}, 3, '<mark>', '</mark>', '…', 12) as title_snippet
         FROM ${FTS_TABLE} s
         JOIN ${REFS_TABLE} r
           ON r.entity_type = s.entity_type AND r.entity_id = s.entity_id
        WHERE ${FTS_TABLE} MATCH ?
          AND r.practice_id = ?
          ${scopeFilter}
        ORDER BY rank ASC
        LIMIT ?`,
    );

    const bindings: unknown[] = [options.fts, options.practiceId];
    if (options.scopes && options.scopes.length > 0) {
      bindings.push(...options.scopes);
    }
    bindings.push(limit);

    const rows = await stmt.bind(...bindings).all<FtsHit>();
    return (rows.results ?? []).map((row) => this.hitToItem(row));
  }

  async snippet(rowid: number, column: number, ftsQuery: string): Promise<string | null> {
    try {
      const stmt = this.env.DB.prepare(
        `SELECT snippet(${FTS_TABLE}, ?, '<mark>', '</mark>', '…', 16) as s
           FROM ${FTS_TABLE}
          WHERE rowid = ? AND ${FTS_TABLE} MATCH ?`,
      );
      const row = await stmt.bind(column, rowid, ftsQuery).first<{ s: string | null }>();
      return row?.s ?? null;
    } catch (error) {
      Logger.warn('snippet() failed', { rowid, error: String(error) });
      return null;
    }
  }

  async getRef(
    entityType: SearchEntityType,
    entityId: string,
  ): Promise<RefRow | null> {
    return this.findRef(entityType, entityId);
  }

  async indexStats(practiceId: string): Promise<{
    totalRows: number;
    byType: Record<string, number>;
  }> {
    const total = await this.env.DB.prepare(
      `SELECT COUNT(*) as c FROM ${REFS_TABLE} WHERE practice_id = ?`,
    )
      .bind(practiceId)
      .first<{ c: number }>();

    const byTypeRows = await this.env.DB.prepare(
      `SELECT entity_type, COUNT(*) as c
         FROM ${REFS_TABLE}
        WHERE practice_id = ?
        GROUP BY entity_type`,
    )
      .bind(practiceId)
      .all<{ entity_type: string; c: number }>();

    const byType: Record<string, number> = {};
    for (const row of byTypeRows.results ?? []) {
      byType[row.entity_type] = row.c;
    }

    return { totalRows: total?.c ?? 0, byType };
  }

  private async findRef(
    entityType: SearchEntityType,
    entityId: string,
  ): Promise<RefRow | null> {
    return this.env.DB.prepare(
      `SELECT entity_type, entity_id, practice_id, client_id, matter_id, file_id, fts_rowid
         FROM ${REFS_TABLE}
        WHERE entity_type = ? AND entity_id = ?`,
    )
      .bind(entityType, entityId)
      .first<RefRow>();
  }

  private async findChildren(
    entityType: SearchEntityType,
    entityId: string,
  ): Promise<RefRow[]> {
    let column: 'client_id' | 'matter_id' | 'file_id' | null = null;
    if (entityType === 'client') column = 'client_id';
    else if (entityType === 'matter') column = 'matter_id';
    else if (entityType === 'file') column = 'file_id';
    if (!column) return [];

    const rows = await this.env.DB.prepare(
      `SELECT entity_type, entity_id, practice_id, client_id, matter_id, file_id, fts_rowid
         FROM ${REFS_TABLE}
        WHERE ${column} = ?`,
    )
      .bind(entityId)
      .all<RefRow>();
    return rows.results ?? [];
  }

  private hitToItem(row: FtsHit): SearchResultItem {
    let metadata: Record<string, unknown> = {};
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }
    const archived = metadata.archived === true || metadata.status === 'archived';

    // Prefer body snippet when the body had a match (contains <mark>); fall
    // back to title snippet for title-only matches. If neither matched, omit.
    const snippet =
      row.body_snippet && row.body_snippet.includes('<mark>')
        ? row.body_snippet
        : row.title_snippet && row.title_snippet.includes('<mark>')
          ? row.title_snippet
          : undefined;

    return {
      entityType: row.entity_type as SearchEntityType,
      entityId: row.entity_id,
      title: row.title,
      subtitle: row.subtitle ?? undefined,
      snippet,
      score: row.rank,
      metadata,
      archived,
    };
  }
}
