import type { Env } from '../types.js';
import type { IntakeConversationQueueMessage } from '../types/intakeConversationQueue.js';

export async function handleIntakeConversationQueue(
  batch: MessageBatch<IntakeConversationQueueMessage>,
  env: Env,
): Promise<void> {
  if (!env.BACKEND_API_URL || !env.WORKER_EVENT_SECRET) {
    batch.retryAll();
    return;
  }

  const events = batch.messages.map((m) => m.body);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${env.BACKEND_API_URL}/api/worker-events/intake-conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.WORKER_EVENT_SECRET}`,
      },
      body: JSON.stringify({ events }),
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('intakeConversationConsumer: fetch timed out after 30s');
    }
    batch.retryAll();
    return;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    console.error('intakeConversationConsumer: backend rejected event batch', {
      status: res.status,
      responseBody,
      batchSize: batch.messages.length,
    });

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      batch.retryAll();
    } else {
      batch.ackAll();
    }
    return;
  }

  batch.ackAll();
}
