import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env } from '../types.js';

/**
 * Durable Object for atomic rate limiting and counters
 */
export class ChatCounterObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Atomically increment and check limit
    if (url.pathname === '/increment') {
      const limitParam = url.searchParams.get('limit');
      const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : Infinity;
      
      const ttlParam = url.searchParams.get('ttl');
      const parsedTtl = ttlParam ? Number.parseInt(ttlParam, 10) : Number.NaN;
      const ttl = Number.isFinite(parsedTtl) ? parsedTtl : 0;

      return await this.state.storage.transaction(async (tx) => {
        let count = await tx.get<number>('count') || 0;
        
        if (count >= limit) {
          return new Response(JSON.stringify({ exceeded: true, current: count }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        count++;
        await tx.put('count', count);

        // Schedule deletion if it's the first increment and TTL is provided
        if (count === 1 && ttl > 0) {
          const alarmTime = Date.now() + (ttl * 1000);
          await this.state.storage.setAlarm(alarmTime);
        }

        return new Response(JSON.stringify({ exceeded: false, current: count }), {
          headers: { 'Content-Type': 'application/json' }
        });
      });
    }

    // Get current count without incrementing
    if (url.pathname === '/get') {
      const count = await this.state.storage.get<number>('count') || 0;
      return new Response(JSON.stringify({ current: count }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Alarm handler for TTL expiration
   */
  async alarm() {
    // Clear all storage when the alarm fires, effectively resetting the counter
    await this.state.storage.deleteAll();
  }
}
