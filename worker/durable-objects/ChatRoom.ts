/* global WebSocketPair, WebSocket */
import type { DurableObjectState, WebSocket as WorkerWebSocket } from '@cloudflare/workers-types';
import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { requireAuth } from '../middleware/auth.js';

const PROTOCOL_VERSION = 1;
const NEGOTIATION_TIMEOUT_MS = 5000;
const MAX_CONTENT_LENGTH = 4000;
const MAX_ATTACHMENTS = 10;
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_FRAME_BYTES = 64 * 1024;
const PENDING_TTL_MS = 2 * 60 * 1000;
const PENDING_SWEEP_LIMIT = 20;
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface ConnectionAttachment {
  conversationId: string;
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

interface PendingRecord {
  content_hash: string;
  attachments_hash: string;
  allocated_seq: number;
  allocated_at: string;
}

interface ExistingMessageRecord {
  id: string;
  seq: number;
  server_ts: string;
  content: string;
  metadata: string | null;
  user_id: string | null;
  role: string;
}

interface MessageBroadcast extends Record<string, unknown> {
  conversation_id: string;
  message_id: string;
  client_id: string;
  seq: number;
  server_ts: string;
  user_id: string | null;
  role: 'user' | 'system';
  content: string;
  attachments?: string[];
  metadata?: Record<string, unknown>;
}

interface MessageAck {
  messageId: string;
  seq: number;
  serverTs: string;
}

interface PersistOptions {
  conversationId: string;
  clientId: string;
  content: string;
  attachments: string[];
  metadata: Record<string, unknown> | null;
  userId: string | null;
  role: 'user' | 'system';
}

type PersistResult =
  | { kind: 'ok'; ack: MessageAck; broadcast?: MessageBroadcast }
  | { kind: 'error'; code: 'invalid_payload' | 'internal_error'; message: string; closeCode?: number };

export class ChatRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private conversationId: string | null = null;
  private practiceId: string | null = null;
  private presenceInitialized = false;
  private readonly presenceCounts = new Map<string, number>();
  private cachedMembershipVersion: number | null = null;
  private membershipCheckedAt: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/membership-revoked') {
      if (!this.isInternalAuthorized(request)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      return this.handleMembershipRevocation(request);
    }

    if (url.pathname === '/internal/message') {
      if (!this.isInternalAuthorized(request)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      return this.handleInternalMessage(request);
    }

    const conversationId = this.extractConversationId(url);

    if (!conversationId) {
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

    const isMember = await this.isConversationMember(conversationId, auth.user.id);
    if (!isMember) {
      return new Response('Forbidden', { status: 403 });
    }

    const pair = new WebSocketPair();
    const client = pair[0] as unknown as WorkerWebSocket;
    const server = pair[1] as unknown as WorkerWebSocket;

    if (!this.conversationId) {
      this.conversationId = conversationId;
    }

    const attachment: ConnectionAttachment = {
      conversationId,
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

    const membershipOk = await this.ensureMembership(ws, attachment, frame.request_id);
    if (!membershipOk) {
      return;
    }

    switch (frame.type) {
      case 'message.send':
        await this.handleMessageSend(ws, attachment, frame);
        return;
      case 'resume':
        await this.handleResume(ws, attachment, frame);
        return;
      case 'typing.start':
        this.handleTyping(ws, attachment, frame, true);
        return;
      case 'typing.stop':
        this.handleTyping(ws, attachment, frame, false);
        return;
      case 'read.update':
        await this.handleReadUpdate(ws, attachment, frame);
        return;
      default:
        this.rejectInvalidPayload(ws, frame.request_id, 'Unhandled frame');
        return;
    }
  }

  async webSocketClose(ws: WorkerWebSocket): Promise<void> {
    this.clearNegotiationTimeout(ws);
    await this.handleSocketClosed(ws);
    await this.scheduleIdleAlarm();
  }

  async webSocketError(ws: WorkerWebSocket): Promise<void> {
    this.clearNegotiationTimeout(ws);
    await this.handleSocketClosed(ws);
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

    this.handleSocketOpened(attachment);

    return true;
  }

  private async handleMessageSend(
    ws: WorkerWebSocket,
    attachment: ConnectionAttachment,
    frame: ClientFrame
  ): Promise<void> {
    const conversationId = this.readString(frame.data.conversation_id);
    if (!conversationId || conversationId !== attachment.conversationId) {
      this.rejectInvalidPayload(ws, frame.request_id, 'conversation_id mismatch');
      return;
    }

    const clientId = this.readString(frame.data.client_id);
    if (!clientId) {
      this.rejectInvalidPayload(ws, frame.request_id, 'client_id required');
      return;
    }

    const content = this.readString(frame.data.content);
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      this.rejectInvalidPayload(ws, frame.request_id, 'content invalid');
      return;
    }

    const attachments = this.normalizeAttachments(frame.data.attachments);
    if (!attachments) {
      this.rejectInvalidPayload(ws, frame.request_id, 'attachments invalid');
      return;
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      this.rejectInvalidPayload(ws, frame.request_id, 'attachments limit exceeded');
      return;
    }

    const metadata = this.normalizeMetadata(frame.data.metadata);
    if (metadata === undefined) {
      this.rejectInvalidPayload(ws, frame.request_id, 'metadata invalid');
      return;
    }

    const payloadMetadata = this.withAttachments(metadata, attachments);
    if (payloadMetadata) {
      const metadataBytes = this.encoder.encode(JSON.stringify(payloadMetadata)).length;
      if (metadataBytes > MAX_METADATA_BYTES) {
        this.rejectInvalidPayload(ws, frame.request_id, 'metadata too large');
        return;
      }
    }

    const result = await this.persistMessage({
      conversationId,
      clientId,
      content,
      attachments,
      metadata: payloadMetadata,
      userId: attachment.userId,
      role: 'user'
    });

    if (result.kind === 'error') {
      this.sendFrame(ws, 'error', {
        code: result.code,
        message: result.message
      }, frame.request_id);
      if (result.closeCode) {
        this.closeSocket(ws, result.closeCode, result.code);
      }
      return;
    }

    this.sendFrame(ws, 'message.ack', {
      conversation_id: conversationId,
      client_id: clientId,
      message_id: result.ack.messageId,
      seq: result.ack.seq,
      server_ts: result.ack.serverTs
    }, frame.request_id);

    if (result.broadcast) {
      this.broadcastFrame('message.new', result.broadcast);
    }
  }

  private async handleResume(
    ws: WorkerWebSocket,
    attachment: ConnectionAttachment,
    frame: ClientFrame
  ): Promise<void> {
    const conversationId = this.readString(frame.data.conversation_id);
    const lastSeq = this.readNumber(frame.data.last_seq);

    if (!conversationId || conversationId !== attachment.conversationId || lastSeq === null || lastSeq < 0) {
      this.rejectInvalidPayload(ws, frame.request_id, 'resume payload invalid');
      return;
    }

    const latestSeq = await this.fetchLatestSeq(conversationId);
    if (latestSeq === null) {
      this.sendFrame(ws, 'error', {
        code: 'internal_error',
        message: 'latest_seq unavailable'
      }, frame.request_id);
      this.closeSocket(ws, 4500, 'internal_error');
      return;
    }

    if (lastSeq > latestSeq) {
      this.sendFrame(ws, 'error', {
        code: 'invalid_payload',
        message: 'last_seq ahead of latest'
      }, frame.request_id);
      this.closeSocket(ws, 4400, 'invalid_payload');
      return;
    }

    if (lastSeq === latestSeq) {
      this.sendFrame(ws, 'resume.ok', {
        conversation_id: conversationId,
        latest_seq: latestSeq
      }, frame.request_id);
      return;
    }

    this.sendFrame(ws, 'resume.gap', {
      conversation_id: conversationId,
      from_seq: lastSeq + 1,
      latest_seq: latestSeq
    }, frame.request_id);
  }

  private handleTyping(
    ws: WorkerWebSocket,
    attachment: ConnectionAttachment,
    frame: ClientFrame,
    isTyping: boolean
  ): void {
    const conversationId = this.readString(frame.data.conversation_id);
    if (!conversationId || conversationId !== attachment.conversationId) {
      this.rejectInvalidPayload(ws, frame.request_id, 'typing payload invalid');
      return;
    }

    this.broadcastFrame('typing', {
      conversation_id: conversationId,
      user_id: attachment.userId,
      is_typing: isTyping
    });
  }

  private async handleReadUpdate(
    ws: WorkerWebSocket,
    attachment: ConnectionAttachment,
    frame: ClientFrame
  ): Promise<void> {
    const conversationId = this.readString(frame.data.conversation_id);
    const lastReadSeq = this.readNumber(frame.data.last_read_seq);

    if (!conversationId || conversationId !== attachment.conversationId || lastReadSeq === null || lastReadSeq < 0) {
      this.rejectInvalidPayload(ws, frame.request_id, 'read payload invalid');
      return;
    }

    const latestSeq = await this.fetchLatestSeq(conversationId);
    if (latestSeq === null) {
      this.sendFrame(ws, 'error', {
        code: 'internal_error',
        message: 'latest_seq unavailable'
      }, frame.request_id);
      this.closeSocket(ws, 4500, 'internal_error');
      return;
    }

    const clamped = Math.min(lastReadSeq, latestSeq);
    const existing = await this.env.DB.prepare(`
      SELECT last_read_seq
      FROM conversation_read_state
      WHERE conversation_id = ? AND user_id = ?
    `).bind(conversationId, attachment.userId).first<{ last_read_seq: number } | null>();

    const currentSeq = existing?.last_read_seq ?? 0;
    if (clamped <= currentSeq) {
      return;
    }

    const updatedAt = new Date().toISOString();
    try {
      await this.env.DB.prepare(`
        INSERT INTO conversation_read_state (conversation_id, user_id, last_read_seq, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(conversation_id, user_id)
        DO UPDATE SET last_read_seq = excluded.last_read_seq, updated_at = excluded.updated_at
      `).bind(conversationId, attachment.userId, clamped, updatedAt).run();
    } catch {
      this.sendFrame(ws, 'error', {
        code: 'internal_error',
        message: 'Failed to update read state'
      }, frame.request_id);
      return;
    }

    this.broadcastFrame('read', {
      conversation_id: conversationId,
      user_id: attachment.userId,
      last_read_seq: clamped
    });
  }

  private async handleInternalMessage(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await request.json() as Record<string, unknown>;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const conversationId = this.readString(payload.conversation_id) ?? this.conversationId;
    if (!conversationId) {
      return new Response('conversation_id required', { status: 400 });
    }
    if (this.conversationId && conversationId !== this.conversationId) {
      return new Response('conversation_id mismatch', { status: 400 });
    }

    const roleValue = this.readString(payload.role);
    if (roleValue !== 'system' && roleValue !== 'user') {
      return new Response('role must be user or system', { status: 400 });
    }

    const content = this.readString(payload.content);
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return new Response('content invalid', { status: 400 });
    }

    const attachments = this.normalizeAttachments(payload.attachments);
    if (!attachments) {
      return new Response('attachments invalid', { status: 400 });
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      return new Response('attachments limit exceeded', { status: 400 });
    }

    const metadata = this.normalizeMetadata(payload.metadata);
    if (metadata === undefined) {
      return new Response('metadata invalid', { status: 400 });
    }

    const payloadMetadata = this.withAttachments(metadata, attachments);
    if (payloadMetadata) {
      const metadataBytes = this.encoder.encode(JSON.stringify(payloadMetadata)).length;
      if (metadataBytes > MAX_METADATA_BYTES) {
        return new Response('metadata too large', { status: 400 });
      }
    }

    const clientId = this.readString(payload.client_id) ?? crypto.randomUUID();
    const userId = this.readString(payload.user_id);

    const result = await this.persistMessage({
      conversationId,
      clientId,
      content,
      attachments,
      metadata: payloadMetadata,
      userId,
      role: roleValue
    });

    if (result.kind === 'error') {
      const status = result.code === 'invalid_payload' ? 400 : 500;
      return new Response(result.message, { status });
    }

    if (result.broadcast) {
      this.broadcastFrame('message.new', result.broadcast);
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        message_id: result.ack.messageId,
        seq: result.ack.seq,
        server_ts: result.ack.serverTs
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async persistMessage(options: PersistOptions): Promise<PersistResult> {
    const { conversationId, clientId, content, attachments, metadata, userId, role } = options;

    await this.sweepPending(conversationId);

    const contentHash = await this.hashString(content);
    const attachmentsHash = await this.hashString(JSON.stringify([...attachments].sort()));
    const pendingKey = this.pendingKey(conversationId, clientId);

    const pending = await this.ensurePendingRecord(
      conversationId,
      pendingKey,
      contentHash,
      attachmentsHash
    );
    if (!pending) {
      return {
        kind: 'error',
        code: 'internal_error',
        message: 'latest_seq unavailable',
        closeCode: 4500
      };
    }

    if (pending.content_hash !== contentHash || pending.attachments_hash !== attachmentsHash) {
      return {
        kind: 'error',
        code: 'invalid_payload',
        message: 'client_id payload mismatch',
        closeCode: 4400
      };
    }

    const practiceId = await this.getPracticeId(conversationId);
    if (!practiceId) {
      return {
        kind: 'error',
        code: 'internal_error',
        message: 'Conversation not found',
        closeCode: 4500
      };
    }

    const serverTs = new Date().toISOString();
    const messageId = crypto.randomUUID();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`
          INSERT INTO chat_messages (
            id,
            conversation_id,
            practice_id,
            user_id,
            role,
            content,
            metadata,
            token_count,
            created_at,
            seq,
            client_id,
            server_ts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          messageId,
          conversationId,
          practiceId,
          userId,
          role,
          content,
          metadataJson,
          null,
          serverTs,
          pending.allocated_seq,
          clientId,
          serverTs
        ),
        this.env.DB.prepare(`
          UPDATE conversations
          SET latest_seq = ?, updated_at = ?, last_message_at = ?
          WHERE id = ?
        `).bind(pending.allocated_seq, serverTs, serverTs, conversationId)
      ]);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.fetchExistingMessage(conversationId, clientId);
        if (!existing) {
          return {
            kind: 'error',
            code: 'internal_error',
            message: 'Failed to resolve idempotent message'
          };
        }

        await this.state.storage.delete(pendingKey);
        return {
          kind: 'ok',
          ack: {
            messageId: existing.id,
            seq: existing.seq,
            serverTs: existing.server_ts
          }
        };
      }

      return {
        kind: 'error',
        code: 'internal_error',
        message: 'Message persistence failed'
      };
    }

    await this.state.storage.delete(pendingKey);

    const broadcast: MessageBroadcast = {
      conversation_id: conversationId,
      message_id: messageId,
      client_id: clientId,
      seq: pending.allocated_seq,
      server_ts: serverTs,
      user_id: userId,
      role,
      content,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(metadata ? { metadata } : {})
    };

    return {
      kind: 'ok',
      ack: {
        messageId,
        seq: pending.allocated_seq,
        serverTs
      },
      broadcast
    };
  }

  private extractConversationId(url: URL): string | null {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === 'ws') {
      return parts[1] || null;
    }
    return null;
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

  private async isConversationMember(conversationId: string, userId: string): Promise<boolean> {
    const record = await this.env.DB.prepare(`
      SELECT 1
      FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
    `).bind(conversationId, userId).first();

    return Boolean(record);
  }

  private async ensureMembership(
    ws: WorkerWebSocket,
    attachment: ConnectionAttachment,
    requestId?: string
  ): Promise<boolean> {
    const now = Date.now();
    const shouldRefresh = !this.membershipCheckedAt || now - this.membershipCheckedAt > MEMBERSHIP_TTL_MS;
    if (!shouldRefresh && this.cachedMembershipVersion !== null) {
      return true;
    }

    let currentVersion: number | null = null;
    try {
      currentVersion = await this.fetchMembershipVersion(attachment.conversationId);
    } catch {
      currentVersion = null;
    }

    if (currentVersion === null) {
      this.sendFrame(ws, 'error', {
        code: 'internal_error',
        message: 'membership_version unavailable'
      }, requestId);
      this.closeSocket(ws, 4500, 'internal_error');
      return false;
    }

    this.membershipCheckedAt = now;
    if (this.cachedMembershipVersion !== null && currentVersion !== this.cachedMembershipVersion) {
      const stillMember = await this.isConversationMember(attachment.conversationId, attachment.userId);
      if (!stillMember) {
        this.closeSocket(ws, 4403, 'membership_revoked');
        return false;
      }
    }

    this.cachedMembershipVersion = currentVersion;
    return true;
  }

  private async fetchMembershipVersion(conversationId: string): Promise<number | null> {
    const record = await this.env.DB.prepare(`
      SELECT membership_version
      FROM conversations
      WHERE id = ?
    `).bind(conversationId).first<{ membership_version: number } | null>();

    if (!record || record.membership_version === null || record.membership_version === undefined) {
      return null;
    }

    const value = Number(record.membership_version);
    return Number.isFinite(value) ? value : null;
  }

  private async fetchLatestSeq(conversationId: string): Promise<number | null> {
    const record = await this.env.DB.prepare(`
      SELECT latest_seq
      FROM conversations
      WHERE id = ?
    `).bind(conversationId).first<{ latest_seq: number } | null>();

    if (!record || record.latest_seq === null || record.latest_seq === undefined) {
      return null;
    }

    const value = Number(record.latest_seq);
    return Number.isFinite(value) ? value : null;
  }

  private async handleMembershipRevocation(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await request.json() as Record<string, unknown>;
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const conversationId = this.readString(payload.conversation_id) ?? this.conversationId;
    if (!conversationId) {
      return new Response('conversation_id required', { status: 400 });
    }

    const membershipVersion = this.readNumber(payload.membership_version);
    if (membershipVersion === null || membershipVersion < 0) {
      return new Response('membership_version required', { status: 400 });
    }

    this.cachedMembershipVersion = membershipVersion;
    this.membershipCheckedAt = Date.now();

    const removedUserId = this.readString(payload.removed_user_id);
    if (removedUserId) {
      const sockets = this.state.getWebSockets(`user:${removedUserId}`);
      for (const socket of sockets) {
        this.closeSocket(socket, 4403, 'membership_revoked');
      }
    }

    this.broadcastFrame('membership.changed', {
      conversation_id: conversationId,
      membership_version: membershipVersion
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private handleSocketOpened(attachment: ConnectionAttachment): void {
    this.ensurePresenceCache();
    const current = this.presenceCounts.get(attachment.userId) ?? 0;
    this.presenceCounts.set(attachment.userId, current + 1);

    if (current === 0) {
      this.emitPresence(attachment.conversationId, attachment.userId, 'online');
    }
  }

  private async handleSocketClosed(ws: WorkerWebSocket): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment) {
      return;
    }
    if (!attachment.negotiated) {
      return;
    }

    this.ensurePresenceCache();
    const current = this.presenceCounts.get(attachment.userId) ?? 0;
    if (current <= 1) {
      this.presenceCounts.delete(attachment.userId);
      this.emitPresence(
        attachment.conversationId,
        attachment.userId,
        'offline',
        new Date().toISOString()
      );
    } else {
      this.presenceCounts.set(attachment.userId, current - 1);
    }
  }

  private ensurePresenceCache(): void {
    if (this.presenceInitialized) {
      return;
    }

    this.presenceCounts.clear();
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment || !attachment.negotiated) {
        continue;
      }
      const count = this.presenceCounts.get(attachment.userId) ?? 0;
      this.presenceCounts.set(attachment.userId, count + 1);
    }
    this.presenceInitialized = true;
  }

  private emitPresence(
    conversationId: string,
    userId: string,
    status: 'online' | 'offline',
    lastSeen?: string
  ): void {
    const data: Record<string, unknown> = {
      conversation_id: conversationId,
      user_id: userId,
      status
    };
    if (lastSeen) {
      data.last_seen = lastSeen;
    }
    this.broadcastFrame('presence', data);
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

  private normalizeAttachments(raw: unknown): string[] | null {
    if (raw === undefined || raw === null) {
      return [];
    }
    if (!Array.isArray(raw)) {
      return null;
    }
    const normalized = raw.map(item => this.readString(item)).filter(Boolean) as string[];
    if (normalized.length !== raw.length) {
      return null;
    }
    return normalized;
  }

  private normalizeMetadata(raw: unknown): Record<string, unknown> | null | undefined {
    if (raw === undefined) {
      return null;
    }
    if (raw === null) {
      return null;
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }
    return raw as Record<string, unknown>;
  }

  private withAttachments(
    metadata: Record<string, unknown> | null,
    attachments: string[]
  ): Record<string, unknown> | null {
    if (!metadata && attachments.length === 0) {
      return null;
    }
    const merged: Record<string, unknown> = metadata ? { ...metadata } : {};
    if (attachments.length > 0) {
      merged.attachments = attachments;
    }
    return merged;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number.isInteger(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private async hashString(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', this.encoder.encode(value));
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private pendingKey(conversationId: string, clientId: string): string {
    return `pending:${conversationId}:${clientId}`;
  }

  private async ensurePendingRecord(
    conversationId: string,
    key: string,
    contentHash: string,
    attachmentsHash: string
  ): Promise<PendingRecord | null> {
    const initialized = await this.ensureSeqInitialized(conversationId);
    if (!initialized) {
      return null;
    }

    let pending: PendingRecord | null = null;
    await this.state.storage.transaction(async (txn) => {
      const existing = await txn.get<PendingRecord>(key);
      if (existing) {
        pending = existing;
        return;
      }

      let current = await txn.get<number>('seq');
      if (current === undefined) {
        return;
      }
      const next = current + 1;
      pending = {
        content_hash: contentHash,
        attachments_hash: attachmentsHash,
        allocated_seq: next,
        allocated_at: new Date().toISOString()
      };
      await txn.put('seq', next);
      await txn.put(key, pending);
    });

    return pending;
  }

  private async ensureSeqInitialized(conversationId: string): Promise<boolean> {
    const current = await this.state.storage.get<number>('seq');
    if (current !== undefined) {
      return true;
    }

    const latestSeq = await this.fetchLatestSeq(conversationId);
    if (latestSeq === null) {
      return false;
    }

    await this.state.storage.transaction(async (txn) => {
      const stored = await txn.get<number>('seq');
      if (stored === undefined) {
        await txn.put('seq', latestSeq);
      }
    });

    return true;
  }

  private async sweepPending(conversationId: string): Promise<void> {
    const entries = await this.state.storage.list<PendingRecord>({
      prefix: `pending:${conversationId}:`,
      limit: PENDING_SWEEP_LIMIT
    });
    if (entries.size === 0) {
      return;
    }

    const cutoff = Date.now() - PENDING_TTL_MS;
    const expiredKeys: string[] = [];
    for (const [key, value] of entries.entries()) {
      const allocatedAt = Date.parse(value.allocated_at);
      if (!Number.isNaN(allocatedAt) && allocatedAt < cutoff) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      // Expiring pending records can leave seq gaps; resume.gap handles the missing range.
      await this.state.storage.delete(expiredKeys);
    }
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
        if (attachment.negotiationDeadline < next) {
          next = attachment.negotiationDeadline;
        }
      }
    }
    return next;
  }

  private async getPracticeId(conversationId: string): Promise<string | null> {
    if (this.practiceId) {
      return this.practiceId;
    }
    const record = await this.env.DB.prepare(`
      SELECT practice_id
      FROM conversations
      WHERE id = ?
    `).bind(conversationId).first<{ practice_id: string } | null>();

    if (!record?.practice_id) {
      return null;
    }
    this.practiceId = record.practice_id;
    return record.practice_id;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes('UNIQUE') &&
      error.message.includes('chat_messages') &&
      error.message.includes('conversation_id') &&
      error.message.includes('client_id');
  }

  private async fetchExistingMessage(
    conversationId: string,
    clientId: string
  ): Promise<ExistingMessageRecord | null> {
    const record = await this.env.DB.prepare(`
      SELECT id, seq, server_ts, content, metadata, user_id, role
      FROM chat_messages
      WHERE conversation_id = ? AND client_id = ?
    `).bind(conversationId, clientId).first<ExistingMessageRecord | null>();

    return record ?? null;
  }

  private broadcastFrame(type: string, data: Record<string, unknown>): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment?.negotiated) {
        continue;
      }
      this.sendFrame(socket, type, data);
    }
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

  private closeSocket(ws: WorkerWebSocket, code: number, reason?: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // Ignore closing errors.
    }
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = this.encoder.encode(a);
    const bufB = this.encoder.encode(b);
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
      result |= bufA[i] ^ bufB[i];
    }
    return result === 0;
  }

  private isInternalAuthorized(request: Request): boolean {
    const secret = this.env.INTERNAL_SECRET;
    if (!secret) {
      const nodeEnv = this.env.NODE_ENV ?? 'production';
      return nodeEnv !== 'production';
    }
    const provided = request.headers.get('X-Internal-Secret');
    if (!provided) {
      return false;
    }
    return this.timingSafeEqual(provided, secret);
  }

  private getAttachment(ws: WorkerWebSocket): ConnectionAttachment | null {
    const attachment = ws.deserializeAttachment() as ConnectionAttachment | null;
    if (!attachment?.conversationId || !attachment.userId) {
      return null;
    }
    return attachment;
  }

  private rejectInvalidPayload(ws: WorkerWebSocket, requestId: string | undefined, message: string): void {
    this.sendFrame(ws, 'error', {
      code: 'invalid_payload',
      message
    }, requestId);
    this.closeSocket(ws, 4400, 'invalid_payload');
  }
}
