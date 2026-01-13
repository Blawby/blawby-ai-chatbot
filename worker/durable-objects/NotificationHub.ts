/* global WritableStreamDefaultWriter */
import type { DurableObjectState } from '@cloudflare/workers-types';

export class NotificationHub {
  private connections = new Map<string, WritableStreamDefaultWriter<Uint8Array>>();
  private encoder = new TextEncoder();

  constructor(private state: DurableObjectState) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/stream' && request.method === 'GET') {
      return this.handleStream(request);
    }

    if (url.pathname === '/publish' && request.method === 'POST') {
      return this.handlePublish(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleStream(request: Request): Response {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const connectionId = crypto.randomUUID();
    this.connections.set(connectionId, writer);

    const send = (payload: string) => writer.write(this.encoder.encode(payload));

    send('event: open\ndata: {}\n\n');

    const keepAlive = setInterval(() => {
      void send(': keep-alive\n\n');
    }, 15000);

    const close = () => {
      clearInterval(keepAlive);
      this.connections.delete(connectionId);
      void writer.close();
    };

    request.signal.addEventListener('abort', close, { once: true });

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  private async handlePublish(request: Request): Promise<Response> {
    const payload = await request.json();
    const message = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
    const encoded = this.encoder.encode(message);

    const stale: string[] = [];

    for (const [id, writer] of this.connections) {
      try {
        await writer.write(encoded);
      } catch {
        stale.push(id);
      }
    }

    stale.forEach((id) => this.connections.delete(id));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
