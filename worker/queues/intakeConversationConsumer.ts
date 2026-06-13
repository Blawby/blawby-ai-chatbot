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

  const res = await fetch(`${env.BACKEND_API_URL}/api/worker-events/intake-conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WORKER_EVENT_SECRET}`,
    },
    body: JSON.stringify({ events }),
  });

  if (!res.ok) {
    batch.retryAll();
    return;
  }

  batch.ackAll();
}
