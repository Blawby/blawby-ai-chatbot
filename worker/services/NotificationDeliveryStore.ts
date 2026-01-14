import type { Env } from '../types.js';

export type DeliveryChannel = 'email' | 'push';
export type DeliveryStatus = 'success' | 'failure';

interface DeliveryResultInput {
  notificationId: string;
  userId: string;
  channel: DeliveryChannel;
  provider: string;
  status: DeliveryStatus;
  errorMessage?: string | null;
  externalUserId?: string | null;
}

export class NotificationDeliveryStore {
  constructor(private env: Env) {}

  async recordResult(input: DeliveryResultInput): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      `INSERT INTO notification_delivery_results (
        id, notification_id, user_id, channel, provider, status, error_message, external_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      input.notificationId,
      input.userId,
      input.channel,
      input.provider,
      input.status,
      input.errorMessage ?? null,
      input.externalUserId ?? null,
      now
    ).run();
  }
}
