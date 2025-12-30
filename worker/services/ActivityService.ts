import { createHmac } from 'crypto';
import type { Env } from '../types';

export interface ActivityEvent {
  id: string;
  uid: string; // Globally unique identifier across all sources (e.g., prefixed or UUID)
  type: 'matter_event' | 'conversation_event';
  eventType: string; // 'payment', 'status_change', 'document_added', etc.
  title: string;
  description: string;
  eventDate: string;
  actorType?: 'user' | 'lawyer' | 'system';
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityQueryOptions {
  matterId?: string;
  conversationId?: string;
  limit?: number; // default 25, max 50
  cursor?: string; // opaque pagination token
  since?: string; // ISO 8601 timestamp
  until?: string; // ISO 8601 timestamp
  type?: string[]; // event types to filter by
  actorType?: 'user' | 'lawyer' | 'system';
}

export interface ActivityQueryResult {
  items: ActivityEvent[];
  nextCursor?: string;
  total?: number;
  hasMore: boolean;
}

export class ActivityService {
  constructor(private env: Env) {}

  async getMatterEvents(matterId: string, practiceId: string): Promise<ActivityEvent[]> {
    const stmt = this.env.DB.prepare(`
      SELECT 
        id,
        event_type,
        title,
        description,
        event_date,
        created_by_lawyer_id,
        metadata,
        created_at
      FROM matter_events 
      WHERE matter_id = ? AND matter_id IN (
        SELECT id FROM matters WHERE practice_id = ?
      )
      ORDER BY event_date DESC, created_at DESC
    `);
    
    const result = await stmt.bind(matterId, practiceId).all();
    const rows = result.results as Record<string, unknown>[];
    
    return rows.map(row => ({
      id: String(row.id),
      uid: `matter_evt_${row.id}_${String(row.event_date).replace(/[-:TZ]/g, '')}`,
      type: 'matter_event' as const,
      eventType: String(row.event_type),
      title: String(row.title),
      description: String(row.description || ''),
      eventDate: String(row.event_date),
      actorType: row.created_by_lawyer_id ? 'lawyer' as const : 'system' as const,
      actorId: row.created_by_lawyer_id ? String(row.created_by_lawyer_id) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
      createdAt: String(row.created_at)
    }));
  }

  async getConversationEvents(conversationId: string, practiceId: string): Promise<ActivityEvent[]> {
    const stmt = this.env.DB.prepare(`
      SELECT 
        id,
        event_type,
        actor_type,
        actor_id,
        payload,
        created_at
      FROM session_audit_events 
      WHERE conversation_id = ? AND conversation_id IN (
        SELECT id FROM conversations WHERE practice_id = ?
      )
      ORDER BY created_at DESC
    `);
    
    const result = await stmt.bind(conversationId, practiceId).all();
    const rows = result.results as Record<string, unknown>[];
    
    return rows.map(row => ({
      id: String(row.id),
      uid: `conversation_evt_${row.id}_${String(row.created_at).replace(/[-:TZ]/g, '')}`,
      type: 'conversation_event' as const,
      eventType: String(row.event_type),
      title: String(row.event_type).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: String(row.payload || ''),
      eventDate: String(row.created_at),
      actorType: row.actor_type as 'user' | 'lawyer' | 'system',
      actorId: row.actor_id ? String(row.actor_id) : undefined,
      metadata: { payload: row.payload },
      createdAt: String(row.created_at)
    }));
  }

  async getCombinedActivity(matterId?: string, conversationId?: string, practiceId?: string): Promise<ActivityEvent[]> {
    if (!practiceId) {
      throw new Error('Practice ID is required for activity queries');
    }

    const matterEvents = matterId ? await this.getMatterEvents(matterId, practiceId) : [];
    const conversationEvents = conversationId ? await this.getConversationEvents(conversationId, practiceId) : [];
    
    const combined = [...matterEvents, ...conversationEvents];
    return combined.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  }

  async queryActivity(options: ActivityQueryOptions & { practiceId: string }): Promise<ActivityQueryResult> {
    const {
      practiceId,
      matterId,
      conversationId,
      limit = 25,
      cursor,
      since,
      until,
      type,
      actorType
    } = options;

    // Validate limit
    const validatedLimit = Math.min(Math.max(limit, 1), 50);

    // Decode cursor if provided
    let cursorData: Record<string, unknown> | null = null;
    if (cursor) {
      try {
        cursorData = this.decodeCursor(cursor, options as unknown as Record<string, unknown>);
      } catch (_error) {
        throw new Error('Invalid cursor');
      }
    }

    // Build the combined query with proper filtering and pagination
    const query = `
      WITH combined_events AS (
        SELECT 
          'matter_event' as type,
          id,
          event_type,
          title,
          description,
          event_date as event_date,
          created_by_lawyer_id as actor_id,
          CASE WHEN created_by_lawyer_id IS NOT NULL THEN 'lawyer' ELSE 'system' END as actor_type,
          metadata,
          created_at
        FROM matter_events 
        WHERE (? IS NULL OR matter_id = ?)
          AND matter_id IN (SELECT id FROM matters WHERE practice_id = ?)
          AND (? IS NULL OR event_date >= ?)
          AND (? IS NULL OR event_date <= ?)
          AND (? IS NULL OR event_type IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR (CASE WHEN created_by_lawyer_id IS NOT NULL THEN 'lawyer' ELSE 'system' END) = ?)

        UNION ALL

        SELECT 
          'conversation_event' as type,
          id,
          event_type,
          event_type as title,
          payload as description,
          created_at as event_date,
          actor_id,
          actor_type,
          json_object('payload', payload) as metadata,
          created_at
        FROM session_audit_events 
        WHERE (? IS NULL OR conversation_id = ?)
          AND conversation_id IN (SELECT id FROM conversations WHERE practice_id = ?)
          AND (? IS NULL OR created_at >= ?)
          AND (? IS NULL OR created_at <= ?)
          AND (? IS NULL OR event_type IN (SELECT value FROM json_each(?)))
          AND (? IS NULL OR actor_type = ?)
      ),
      filtered_events AS (
        SELECT * FROM combined_events
        WHERE (? IS NULL OR (event_date < ? OR (event_date = ? AND (created_at < ? OR (created_at = ? AND id < ?)))))
        ORDER BY event_date DESC, created_at DESC, id DESC
        LIMIT ?
      )
      SELECT * FROM filtered_events;
    `;

    // Prepare parameters
    const typeFilter = type ? JSON.stringify(type) : null;
    const params = [
      // Matter events filters - convert undefined to null for D1 compatibility
      matterId ?? null, matterId ?? null, practiceId, since ?? null, since ?? null, until ?? null, until ?? null, typeFilter, typeFilter, actorType ?? null, actorType ?? null,
      // Conversation events filters - convert undefined to null for D1 compatibility
      conversationId ?? null, conversationId ?? null, practiceId, since ?? null, since ?? null, until ?? null, until ?? null, typeFilter, typeFilter, actorType ?? null, actorType ?? null,
      // Cursor pagination - ensure null instead of undefined
      cursorData?.lastEventDate || null, cursorData?.lastEventDate || null, cursorData?.lastEventDate || null, 
      cursorData?.lastCreatedAt || null, cursorData?.lastCreatedAt || null, cursorData?.lastId || null,
      // Limit
      validatedLimit
    ];

    const stmt = this.env.DB.prepare(query);
    const result = await stmt.bind(...params).all();
    const rows = result.results as Record<string, unknown>[];

    // Transform results
    const items: ActivityEvent[] = rows.map(row => ({
      id: String(row.id),
      uid: `${row.type}_${row.id}_${String(row.event_date).replace(/[-:TZ]/g, '')}`,
      type: row.type as 'matter_event' | 'conversation_event',
      eventType: String(row.event_type),
      title: String(row.title),
      description: String(row.description || ''),
      eventDate: String(row.event_date),
      actorType: row.actor_type as 'user' | 'lawyer' | 'system',
      actorId: row.actor_id ? String(row.actor_id) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : {},
      createdAt: String(row.created_at)
    }));

    // Generate next cursor if there are more results
    let nextCursor: string | undefined;
    let hasMore = false;
    
    if (items.length === validatedLimit) {
      const lastItem = items[items.length - 1];
      hasMore = true;
      nextCursor = this.generateNextCursor(lastItem, options);
    }

    // Get total count (optional, for performance reasons)
    let total: number | undefined;
    try {
      const countQuery = `
        WITH combined_events AS (
          SELECT id FROM matter_events 
          WHERE (? IS NULL OR matter_id = ?)
            AND matter_id IN (SELECT id FROM matters WHERE practice_id = ?)
            AND (? IS NULL OR event_date >= ?)
            AND (? IS NULL OR event_date <= ?)
            AND (? IS NULL OR event_type IN (SELECT value FROM json_each(?)))
            AND (? IS NULL OR (CASE WHEN created_by_lawyer_id IS NOT NULL THEN 'lawyer' ELSE 'system' END) = ?)

          UNION ALL

          SELECT id FROM session_audit_events 
          WHERE (? IS NULL OR conversation_id = ?)
            AND conversation_id IN (SELECT id FROM conversations WHERE practice_id = ?)
            AND (? IS NULL OR created_at >= ?)
            AND (? IS NULL OR created_at <= ?)
            AND (? IS NULL OR event_type IN (SELECT value FROM json_each(?)))
            AND (? IS NULL OR actor_type = ?)
        )
        SELECT COUNT(*) as total FROM combined_events;
      `;
      
      const countStmt = this.env.DB.prepare(countQuery);
      const countResult = await countStmt.bind(
        matterId ?? null, matterId ?? null, practiceId, since ?? null, since ?? null, until ?? null, until ?? null, typeFilter, typeFilter, actorType ?? null, actorType ?? null,
        conversationId ?? null, conversationId ?? null, practiceId, since ?? null, since ?? null, until ?? null, until ?? null, typeFilter, typeFilter, actorType ?? null, actorType ?? null
      ).first() as Record<string, unknown> | null;
      
      total = Number(countResult?.total) || 0;
    } catch (error) {
      // If count query fails, just don't include total
      console.warn('Failed to get total count:', error);
    }

    return {
      items,
      nextCursor,
      total,
      hasMore
    };
  }

  async createEvent(event: Omit<ActivityEvent, 'id' | 'createdAt' | 'uid'>, _practiceId: string): Promise<string> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    if (event.type === 'matter_event') {
      const stmt = this.env.DB.prepare(`
        INSERT INTO matter_events (
          id, matter_id, event_type, title, description, event_date,
          created_by_lawyer_id, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      await stmt.bind(
        eventId,
        event.metadata?.matterId,
        event.eventType,
        event.title,
        event.description,
        event.eventDate,
        event.actorId || null,
        JSON.stringify(event.metadata || {}),
        now,
        now
      ).run();
    } else if (event.type === 'conversation_event') {
      const stmt = this.env.DB.prepare(`
        INSERT INTO session_audit_events (
          id, conversation_id, event_type, actor_type, actor_id, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      await stmt.bind(
        eventId,
        event.metadata?.conversationId,
        event.eventType,
        event.actorType || 'system',
        event.actorId || null,
        event.description,
        now
      ).run();
    }
    
    return eventId;
  }

  // Cursor management
  private encodeCursor(data: Record<string, unknown>): string {
    const secret = this.env.IDEMPOTENCY_SALT || 'fallback-cursor-secret';
    const payload = JSON.stringify(data);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    
    const signedData = { payload, signature };
    
    return Buffer.from(JSON.stringify(signedData))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private decodeCursor(cursor: string, currentFilters: Record<string, unknown>): Record<string, unknown> {
    try {
      // Decode base64url
      const padding = '='.repeat((4 - cursor.length % 4) % 4);
      const padded = (cursor + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString());
      
      // Verify HMAC signature
      const secret = this.env.IDEMPOTENCY_SALT || 'fallback-cursor-secret';
      const expectedSignature = createHmac('sha256', secret)
        .update(decoded.payload)
        .digest('hex');
      
      if (decoded.signature !== expectedSignature) {
        throw new Error('Invalid cursor signature');
      }
      
      const cursorData = JSON.parse(decoded.payload);
      return { ...cursorData, filters: currentFilters };
    } catch (_error) {
      throw new Error('Invalid or tampered cursor');
    }
  }

  private generateNextCursor(lastItem: ActivityEvent, options: ActivityQueryOptions): string {
    const cursorData = {
      lastEventDate: lastItem.eventDate,
      lastCreatedAt: lastItem.createdAt,
      lastId: lastItem.id,
      limit: options.limit || 25
    };
    
    return this.encodeCursor(cursorData);
  }
}
