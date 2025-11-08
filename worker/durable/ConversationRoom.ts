import type { DurableObjectState } from '@cloudflare/workers-types';
import { Env } from '../types';

interface BroadcastPayload {
  event: string;
  data: unknown;
}

export class ConversationRoom {
  private readonly clients = new Map<string, WritableStreamDefaultWriter<Uint8Array>>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname.endsWith('/stream')) {
      return this.handleStream(request.signal);
    }

    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const payload = await request.json<BroadcastPayload>();
      await this.broadcast(payload);
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  }

  private handleStream(abortSignal: AbortSignal): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const clientId = crypto.randomUUID();

    this.clients.set(clientId, writer);

    const heartbeatInterval = setInterval(() => {
      this.safeWrite(writer, { event: 'ping', data: { ts: Date.now() } }).catch(() => {
        clearInterval(heartbeatInterval);
        writer.close().catch(() => {});
        this.clients.delete(clientId);
      });
    }, 15000);

    abortSignal.addEventListener('abort', () => {
      clearInterval(heartbeatInterval);
      writer.close().catch(() => {});
      this.clients.delete(clientId);
    }, { once: true });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  }

  private async broadcast(payload: BroadcastPayload): Promise<void> {
    const failed: string[] = [];

    await Promise.all(Array.from(this.clients.entries()).map(async ([clientId, writer]) => {
      try {
        await this.safeWrite(writer, payload);
      } catch (error) {
        console.warn('Failed to broadcast to client', { clientId, error });
        failed.push(clientId);
      }
    }));

    for (const clientId of failed) {
      this.clients.delete(clientId);
    }
  }

  private async safeWrite(writer: WritableStreamDefaultWriter<Uint8Array>, payload: BroadcastPayload | { event: string; data: unknown }): Promise<void> {
    const text = `event: ${payload.event}\ndata: ${JSON.stringify(payload.data ?? null)}\n\n`;
    await writer.write(new TextEncoder().encode(text));
  }
}
