/* global WebSocketPair, WebSocket */
import type { DurableObjectState, WebSocket as WorkerWebSocket } from '@cloudflare/workers-types';
import type { Env } from '../types.js';

interface ChecklistItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  description?: string;
  required: boolean;
}

interface MatterProgressData {
  stage: string;
  checklist: ChecklistItem[];
  nextActions: string[];
  missing?: string[];
  completed: boolean;
  metadata?: Record<string, unknown>;
}

interface StoredProgress {
  data: MatterProgressData;
  updatedAt: string;
}

interface ProgressFrame {
  type: 'progress.snapshot' | 'progress.update';
  data: MatterProgressData;
  updated_at: string;
}

const STATUS_PATH = '/internal/status';
const WS_PATH = '/internal/ws';

export class MatterProgressRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly ready: Promise<void>;
  private progress: MatterProgressData | null = null;
  private updatedAt: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<StoredProgress>('progress');
      if (stored?.data) {
        this.progress = stored.data;
        this.updatedAt = stored.updatedAt;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === STATUS_PATH) {
      return this.handleStatus(request);
    }

    if (url.pathname === WS_PATH) {
      return this.handleWebSocket(request);
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(_ws: WorkerWebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Clients should only listen for progress updates.
  }

  async webSocketClose(_ws: WorkerWebSocket): Promise<void> {
    // No-op.
  }

  private handleWebSocket(request: Request): Response {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0] as unknown as WorkerWebSocket;
    const server = pair[1] as unknown as WorkerWebSocket;

    this.state.acceptWebSocket(server as unknown as WebSocket);
    this.sendSnapshot(server);

    return new Response(null, { status: 101, webSocket: client as unknown as WebSocket });
  }

  private async handleStatus(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      if (!this.progress || !this.updatedAt) {
        return new Response(JSON.stringify({ success: false, error: 'No progress available' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        data: {
          progress: this.progress,
          updatedAt: this.updatedAt
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
      const candidate = payload && typeof payload === 'object'
        ? (payload.data && typeof payload.data === 'object' ? payload.data : payload)
        : null;

      const normalized = normalizeProgress(candidate);
      if (!normalized) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid progress payload'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const updatedAt = new Date().toISOString();
      this.progress = normalized;
      this.updatedAt = updatedAt;
      await this.state.storage.put('progress', { data: normalized, updatedAt });
      this.broadcast({ type: 'progress.update', data: normalized, updated_at: updatedAt });

      return new Response(JSON.stringify({ success: true, data: { updatedAt } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  private sendSnapshot(ws: WorkerWebSocket): void {
    if (!this.progress || !this.updatedAt) {
      return;
    }
    this.sendFrame(ws, {
      type: 'progress.snapshot',
      data: this.progress,
      updated_at: this.updatedAt
    });
  }

  private broadcast(frame: ProgressFrame): void {
    for (const socket of this.state.getWebSockets()) {
      this.sendFrame(socket as unknown as WorkerWebSocket, frame);
    }
  }

  private sendFrame(ws: WorkerWebSocket, frame: ProgressFrame): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch (error) {
      if (this.env?.NODE_ENV !== 'production') {
        console.warn('[MatterProgressRoom] Failed to send frame', error);
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }
}

const normalizeProgress = (raw: unknown): MatterProgressData | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const stage = typeof record.stage === 'string' ? record.stage.trim() : '';
  if (!stage) {
    return null;
  }

  const checklistRaw = Array.isArray(record.checklist) ? record.checklist : [];
  const checklist = checklistRaw
    .map((item, index) => normalizeChecklistItem(item, index))
    .filter((item): item is ChecklistItem => Boolean(item));

  const nextActions = Array.isArray(record.nextActions)
    ? record.nextActions.filter((item): item is string => typeof item === 'string')
    : [];

  const missing = Array.isArray(record.missing)
    ? record.missing.filter((item): item is string => typeof item === 'string')
    : undefined;

  const completed = typeof record.completed === 'boolean'
    ? record.completed
    : false;

  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : undefined;

  return {
    stage,
    checklist,
    nextActions,
    missing,
    completed,
    metadata
  };
};

const normalizeChecklistItem = (raw: unknown, index: number): ChecklistItem | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    return null;
  }
  const id = typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : `item-${index}`;
  const statusRaw = typeof record.status === 'string' ? record.status : 'pending';
  const status = statusRaw === 'completed' || statusRaw === 'in_progress' ? statusRaw : 'pending';
  const description = typeof record.description === 'string' ? record.description : undefined;
  const required = typeof record.required === 'boolean' ? record.required : true;

  return {
    id,
    title,
    status,
    description,
    required
  };
};
