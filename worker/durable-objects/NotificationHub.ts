/* global WebSocketPair, WebSocket */
import type { DurableObjectState, WebSocket as WorkerWebSocket } from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { requireAuth } from '../middleware/auth.js';

const PROTOCOL_VERSION = 1;
const NEGOTIATION_TIMEOUT_MS = 5000;
const MAX_FRAME_BYTES = 64 * 1024;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface ConnectionAttachment {
  userId: string;
  negotiated: boolean;
  negotiationDeadline: number | null;
  lastActivityAt: number;
}

interface ClientFrame {
  type: string;
  data: Record<string, unknown>;
  request_id?: string;
}

export class NotificationHub {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private userId: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.handlePublish(request);
    }

    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (!this.isOriginAllowed(request.headers.get('Origin'))) {
      return new Response('Forbidden', { status: 403 });
    }

    let auth;
    try {
      auth = await requireAuth(request, this.env);
    } catch (error) {
      if (error instanceof HttpError) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }

    if (!this.userId) {
      this.userId = auth.user.id;
    }

    if (this.userId !== auth.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as unknown as [WorkerWebSocket, WorkerWebSocket];

    const attachment: ConnectionAttachment = {
      userId: auth.user.id,
      negotiated: false,
      negotiationDeadline: null,
      lastActivityAt: Date.now()
    };

    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server as unknown as WebSocket, [`user:${auth.user.id}`]);
    this.scheduleNegotiationTimeout(server);
    await this.scheduleIdleAlarm();

    return new Response(null, { status: 101, webSocket: client as unknown as WebSocket });
  }

  async webSocketMessage(ws: WorkerWebSocket, message: string | ArrayBuffer): Promise<void> {
    const payloadSize = typeof message === 'string'
      ? this.encoder.encode(message).length
      : message.byteLength;
    if (payloadSize > MAX_FRAME_BYTES) {
      this.sendFrame(ws, 'error', {
        code: 'invalid_payload',
        message: 'Frame too large'
      });
      this.closeSocket(ws, 4400, 'invalid_payload');
      return;
    }

    const payload = typeof message === 'string' ? message : this.decoder.decode(message);
    let frame: ClientFrame;

    try {
      frame = JSON.parse(payload) as ClientFrame;
    } catch {
      this.closeSocket(ws, 4400, 'invalid_payload');
      return;
    }

    if (!frame.type || typeof frame.type !== 'string' || typeof frame.data !== 'object' || !frame.data) {
      this.closeSocket(ws, 4400, 'invalid_payload');
      return;
    }

    const attachment = this.getAttachment(ws);
    if (!attachment) {
      this.closeSocket(ws, 4400, 'invalid_payload');
      return;
    }

    attachment.lastActivityAt = Date.now();
    ws.serializeAttachment(attachment);
    await this.scheduleIdleAlarm();

    if (!attachment.negotiated) {
      if (frame.type !== 'auth') {
        this.closeSocket(ws, 4401, 'negotiation_required');
        return;
      }

      const ok = this.handleAuth(ws, attachment, frame);
      if (!ok) {
        return;
      }

      return;
    }

    this.sendFrame(ws, 'error', {
      code: 'invalid_payload',
      message: 'Unhandled frame'
    }, frame.request_id);
    this.closeSocket(ws, 4400, 'invalid_payload');
  }

  async webSocketClose(ws: WorkerWebSocket): Promise<void> {
    this.clearNegotiationTimeout(ws);
    await this.scheduleIdleAlarm();
  }

  async webSocketError(ws: WorkerWebSocket): Promise<void> {
    this.clearNegotiationTimeout(ws);
    await this.scheduleIdleAlarm();
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment) {
        continue;
      }
      if (!attachment.negotiated && attachment.negotiationDeadline && now > attachment.negotiationDeadline) {
        this.closeSocket(socket, 4408, 'negotiation_timeout');
        continue;
      }
      if (now - attachment.lastActivityAt > IDLE_TIMEOUT_MS) {
        this.closeSocket(socket, 4410, 'idle_timeout');
      }
    }
    await this.scheduleIdleAlarm();
  }

  private handleAuth(ws: WorkerWebSocket, attachment: ConnectionAttachment, frame: ClientFrame): boolean {
    const protocolVersion = Number(frame.data.protocol_version);
    if (protocolVersion !== PROTOCOL_VERSION) {
      this.sendFrame(ws, 'auth.error', {
        code: 'protocol_version_unsupported',
        message: 'Unsupported protocol version'
      }, frame.request_id);
      this.closeSocket(ws, 4400, 'protocol_version_unsupported');
      return false;
    }

    attachment.negotiated = true;
    ws.serializeAttachment(attachment);
    this.clearNegotiationTimeout(ws);

    this.sendFrame(ws, 'auth.ok', {
      user_id: attachment.userId
    }, frame.request_id);

    return true;
  }

  private async handlePublish(request: Request): Promise<Response> {
    let auth;
    try {
      auth = await requireAuth(request, this.env);
    } catch (error) {
      if (error instanceof HttpError) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }

    if (!this.userId) {
      this.userId = auth.user.id;
    }

    if (this.userId !== auth.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await request.json() as Record<string, unknown>;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    for (const socket of this.state.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment?.negotiated) {
        continue;
      }
      try {
        this.sendFrame(socket, 'notification.new', payload);
      } catch {
        this.closeSocket(socket, 4500, 'internal_error');
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private isOriginAllowed(origin: string | null): boolean {
    if (!origin) {
      return false;
    }

    const rawList = this.env.ALLOWED_WS_ORIGINS;
    if (!rawList) {
      return false;
    }

    const allowlist = rawList
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);

    return allowlist.includes(origin);
  }

  private async scheduleIdleAlarm(): Promise<void> {
    const nextDeadline = this.nextAlarmDeadline();
    if (nextDeadline === null) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const scheduleAt = Math.max(nextDeadline, Date.now());
    await this.state.storage.setAlarm(new Date(scheduleAt));
  }

  private nextAlarmDeadline(): number | null {
    let next: number | null = null;
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment) {
        continue;
      }
      const idleDeadline = attachment.lastActivityAt + IDLE_TIMEOUT_MS;
      if (next === null || idleDeadline < next) {
        next = idleDeadline;
      }
      if (!attachment.negotiated && attachment.negotiationDeadline) {
        if (next === null || attachment.negotiationDeadline < next) {
          next = attachment.negotiationDeadline;
        }
      }
    }
    return next;
  }

  private sendFrame(ws: WorkerWebSocket, type: string, data: Record<string, unknown>, requestId?: string): void {
    const payload: Record<string, unknown> = { type, data };
    if (requestId) {
      payload.request_id = requestId;
    }
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Socket already closed, ignore.
    }
  }

  private closeSocket(ws: WorkerWebSocket, code: number, reason?: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // Ignore closing errors.
    }
  }

  private getAttachment(ws: WorkerWebSocket): ConnectionAttachment | null {
    const attachment = ws.deserializeAttachment() as ConnectionAttachment | null;
    if (!attachment?.userId) {
      return null;
    }
    return attachment;
  }

  private scheduleNegotiationTimeout(ws: WorkerWebSocket): void {
    const attachment = this.getAttachment(ws);
    if (!attachment || attachment.negotiated) {
      return;
    }
    attachment.negotiationDeadline = Date.now() + NEGOTIATION_TIMEOUT_MS;
    ws.serializeAttachment(attachment);
    void this.scheduleIdleAlarm();
  }

  private clearNegotiationTimeout(ws: WorkerWebSocket): void {
    const attachment = this.getAttachment(ws);
    if (!attachment) {
      return;
    }
    attachment.negotiationDeadline = null;
    ws.serializeAttachment(attachment);
    void this.scheduleIdleAlarm();
  }
}
