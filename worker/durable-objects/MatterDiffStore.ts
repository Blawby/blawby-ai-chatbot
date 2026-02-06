import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env } from '../types.js';

type DiffEntry = {
  activityId: string;
  matterId: string;
  fields: string[];
  userId?: string | null;
  createdAt?: string | null;
};

type DiffLookupRequest = {
  activityIds: string[];
};

type DiffStoreRequest = {
  entries: DiffEntry[];
};

type DiffStoreResponse = {
  success: boolean;
  stored?: number;
  diffs?: Record<string, DiffEntry>;
  error?: string;
};

const STORE_PATH = '/internal/diffs';
const LOOKUP_PATH = '/internal/lookup';

export class MatterDiffStore {
  private readonly state: DurableObjectState;
  private readonly _env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this._env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === STORE_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const payload = await request.json().catch(() => null) as DiffStoreRequest | null;
      const entries = Array.isArray(payload?.entries) ? payload?.entries ?? [] : [];
      if (entries.length === 0) {
        return this.json({ success: false, error: 'No diff entries provided' }, 400);
      }
      const updates = new Map<string, DiffEntry>();
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const activityId = typeof entry.activityId === 'string' ? entry.activityId.trim() : '';
        const matterId = typeof entry.matterId === 'string' ? entry.matterId.trim() : '';
        if (!activityId || !matterId) continue;
        const fields = Array.isArray(entry.fields)
          ? entry.fields.filter((field) => typeof field === 'string' && field.trim().length > 0)
          : [];
        if (fields.length === 0) continue;
        updates.set(`diff:${activityId}`, {
          activityId,
          matterId,
          fields,
          userId: typeof entry.userId === 'string' ? entry.userId : null,
          createdAt: (typeof entry.createdAt === 'string' || typeof entry.createdAt === 'number') 
            ? (typeof entry.createdAt === 'number' ? new Date(entry.createdAt).toISOString() : entry.createdAt) 
            : null
        });
      }

      if (updates.size === 0) {
        return this.json({ success: false, error: 'No valid diff entries provided' }, 400);
      }

      await this.state.storage.put(Object.fromEntries(updates));
      return this.json({ success: true, stored: updates.size }, 200);
    }

    if (url.pathname === LOOKUP_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const payload = await request.json().catch(() => null) as DiffLookupRequest | null;
      const activityIds = Array.isArray(payload?.activityIds)
        ? payload?.activityIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (activityIds.length === 0) {
        return this.json({ success: true, diffs: {} }, 200);
      }

      const keys = activityIds.map((id) => `diff:${id}`);
      const stored = await this.state.storage.get<DiffEntry>(keys);
      const diffs: Record<string, DiffEntry> = {};
      for (const [key, value] of stored) {
        if (!value) continue;
        const activityId = key.replace(/^diff:/, '');
        diffs[activityId] = value;
      }
      return this.json({ success: true, diffs }, 200);
    }

    return new Response('Not found', { status: 404 });
  }

  private json(data: DiffStoreResponse, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
