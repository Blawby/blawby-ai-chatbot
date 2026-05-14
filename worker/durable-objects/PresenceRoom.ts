/* global WebSocketPair, WebSocket */
/**
 * PresenceRoom — practice-scoped presence tracker.
 *
 * One DO instance per practice. Each authenticated client opens a single
 * WebSocket to it (regardless of which conversation they're viewing). The DO
 * holds a `Map<userId, Set<wsRef>>` so that a user with multiple tabs only
 * goes offline when the *last* tab disconnects. State changes broadcast a
 * compact `{ type: 'presence', online: string[] }` snapshot to every connected
 * client. Subscribers also receive a snapshot immediately on join so the UI
 * reflects current state without waiting for the next change.
 *
 * Wire format (server → client):
 *   { type: 'presence', online: string[] }   // full snapshot
 *
 * Wire format (client → server):
 *   { type: 'identify', userId: string }     // sent right after open
 *   { type: 'ping' }                          // optional liveness keep-alive
 *
 * Hibernation-safe: connection state is reconstructed from
 * `state.acceptWebSocket(ws, [userId])` tags so the user mapping survives DO
 * eviction across cold starts.
 */
import type { DurableObjectState, WebSocket as CFWebSocket } from '@cloudflare/workers-types';
import type { Env } from '../types.js';

interface IdentifyFrame { type: 'identify'; userId: string }
interface PingFrame { type: 'ping' }
type ClientFrame = IdentifyFrame | PingFrame;

export class PresenceRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/snapshot') && request.method === 'GET') {
        return new Response(JSON.stringify({ online: this.collectOnlineUserIds() }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Internal fan-out from ChatRoom — relays per-conversation typing events
      // so connected clients can render "typing…" in the conversation list.
      if (url.pathname.endsWith('/typing') && request.method === 'POST') {
        return this.handleTypingFanout(request);
      }
      return new Response('expected websocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const userId = (url.searchParams.get('userId') ?? '').trim();
    if (!userId) {
      return new Response('userId required', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Tag the server-side socket with the userId so the hibernation-safe
    // `getTags(ws)` lookup tells us who hung up after a cold start.
    this.state.acceptWebSocket(server, [userId]);
    this.broadcastSnapshot();

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: CFWebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string') return;
    let parsed: ClientFrame | null = null;
    try { parsed = JSON.parse(raw) as ClientFrame; } catch { return; }
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.type === 'ping') {
      // Echo a snapshot so latency-sensitive clients can measure rtt + refresh.
      this.sendFrameTo(ws, this.buildSnapshotFrame());
    }
    // 'identify' is a no-op on the wire today — userId is locked at the URL
    // query string and stored as a tag during accept. Reserved for future use.
  }

  webSocketClose(ws: CFWebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    // The closing socket may still appear in state.getWebSockets() while the
    // close is being processed; pass it through so collectOnlineUserIds can
    // exclude it and remote tabs see the user drop offline immediately.
    this.broadcastSnapshot(ws);
  }

  webSocketError(ws: CFWebSocket): void {
    this.broadcastSnapshot(ws);
  }

  private async handleTypingFanout(request: Request): Promise<Response> {
    let payload: { conversationId?: unknown; userId?: unknown; isTyping?: unknown };
    try {
      payload = await request.json() as typeof payload;
    } catch {
      return new Response('invalid json', { status: 400 });
    }
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : '';
    const userId = typeof payload.userId === 'string' ? payload.userId : '';
    const isTyping = Boolean(payload.isTyping);
    if (!conversationId || !userId) {
      return new Response('conversationId and userId required', { status: 400 });
    }
    const frame = JSON.stringify({
      type: 'typing',
      conversation_id: conversationId,
      user_id: userId,
      is_typing: isTyping
    });
    for (const ws of this.state.getWebSockets()) {
      this.sendFrameTo(ws, frame);
    }
    return new Response(null, { status: 204 });
  }

  private collectOnlineUserIds(exclude?: CFWebSocket): string[] {
    const ids = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      const tags = this.state.getTags(ws);
      const userId = tags.find((tag) => typeof tag === 'string' && tag.length > 0);
      if (userId) ids.add(userId);
    }
    return Array.from(ids);
  }

  private buildSnapshotFrame(exclude?: CFWebSocket): string {
    return JSON.stringify({ type: 'presence', online: this.collectOnlineUserIds(exclude) });
  }

  private broadcastSnapshot(exclude?: CFWebSocket): void {
    const payload = this.buildSnapshotFrame(exclude);
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      this.sendFrameTo(ws, payload);
    }
  }

  private sendFrameTo(ws: CFWebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // Hibernated/dead sockets throw; safe to ignore — they'll be GC'd.
    }
  }
}
