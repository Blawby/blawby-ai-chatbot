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
    const id = crypto.randomUUID();

    await this.env.DB.prepare(
      `INSERT INTO notification_destinations (
        id, user_id, provider, onesignal_id, platform, external_user_id, user_agent,
        created_at, updated_at, last_seen_at, disabled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, onesignal_id) DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        external_user_id = excluded.external_user_id,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at,
        disabled_at = NULL`
    ).bind(
      id,
      input.userId,
      'onesignal',
      input.onesignalId,
      input.platform,
      input.externalUserId,
      input.userAgent ?? null,
      now,
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

  async disableDestination(onesignalId: string, userId: string): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.env.DB.prepare(
      `UPDATE notification_destinations
          SET disabled_at = ?, updated_at = ?, last_seen_at = ?
        WHERE provider = ? AND onesignal_id = ? AND user_id = ? AND disabled_at IS NULL`
    ).bind(now, now, now, 'onesignal', onesignalId, userId).run();

    return result.success ? result.meta.changes : 0;
  }
}
