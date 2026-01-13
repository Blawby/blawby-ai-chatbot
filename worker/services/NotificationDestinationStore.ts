import type { Env } from '../types.js';

interface UpsertDestinationInput {
  userId: string;
  onesignalId: string;
  platform: string;
  externalUserId: string;
  userAgent?: string | null;
}

export class NotificationDestinationStore {
  constructor(private env: Env) {}

  async upsertDestination(input: UpsertDestinationInput): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.env.DB.prepare(
      `SELECT id, created_at FROM notification_destinations
       WHERE provider = ? AND onesignal_id = ?`
    ).bind('onesignal', input.onesignalId).first<{ id?: string; created_at?: string }>();

    const id = existing?.id ?? crypto.randomUUID();
    const createdAt = existing?.created_at ?? now;

    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO notification_destinations (
        id, user_id, provider, onesignal_id, platform, external_user_id, user_agent,
        created_at, updated_at, last_seen_at, disabled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      input.userId,
      'onesignal',
      input.onesignalId,
      input.platform,
      input.externalUserId,
      input.userAgent ?? null,
      createdAt,
      now,
      now,
      null
    ).run();
  }

  async disableDestinationsForUser(userId: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.env.DB.prepare(
      `UPDATE notification_destinations
          SET disabled_at = ?, updated_at = ?, last_seen_at = ?
        WHERE user_id = ? AND disabled_at IS NULL`
    ).bind(now, now, now, userId).run();

    return result.success ? result.meta.changes : 0;
  }
}
