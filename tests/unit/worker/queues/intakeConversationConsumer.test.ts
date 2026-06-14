import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleIntakeConversationQueue } from '../../../../worker/queues/intakeConversationConsumer.js';
import type { Env } from '../../../../worker/types.js';
import type { IntakeConversationQueueMessage } from '../../../../worker/types/intakeConversationQueue.js';

const event: IntakeConversationQueueMessage = {
  type: 'conversation.created',
  id: '9b985218-b5a1-4c11-99df-1632127eca04',
  organization_id: 'a60ba192-7b41-4124-b14c-402c7694afc1',
  client_user_id: '47608de5-13bc-4111-b603-46dc0d8f5bce',
  is_anonymous: false,
  status: 'active',
  priority: 'normal',
  created_at: '2026-06-14T11:21:23.989Z',
};

const buildBatch = () => ({
  messages: [{ body: event }],
  ackAll: vi.fn(),
  retryAll: vi.fn(),
}) as unknown as MessageBatch<IntakeConversationQueueMessage>;

const env = {
  BACKEND_API_URL: 'https://backend.example.com',
  WORKER_EVENT_SECRET: 'secret',
} as Env;

describe('handleIntakeConversationQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([401, 403, 429, 500])('retries the batch when the backend returns %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const batch = buildBatch();

    await handleIntakeConversationQueue(batch, env);

    expect(batch.retryAll).toHaveBeenCalledOnce();
    expect(batch.ackAll).not.toHaveBeenCalled();
  });

  it('acknowledges a successful batch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const batch = buildBatch();

    await handleIntakeConversationQueue(batch, env);

    expect(batch.ackAll).toHaveBeenCalledOnce();
    expect(batch.retryAll).not.toHaveBeenCalled();
  });

  it('acknowledges non-retryable client errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid payload', { status: 400 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const batch = buildBatch();

    await handleIntakeConversationQueue(batch, env);

    expect(batch.ackAll).toHaveBeenCalledOnce();
    expect(batch.retryAll).not.toHaveBeenCalled();
  });
});
