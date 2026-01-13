import type { Env } from '../types.js';

export interface OneSignalNotificationInput {
  title: string;
  body?: string | null;
  url?: string | null;
  data?: Record<string, unknown> | null;
}

const DEFAULT_API_BASE = 'https://onesignal.com/api/v1';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailBody(input: OneSignalNotificationInput): string {
  const lines = [input.body ?? ''].filter(Boolean);
  if (input.url) {
    lines.push(`Open: ${input.url}`);
  }
  const joined = lines.join('\n');
  return `<p>${escapeHtml(joined).replace(/\n/g, '<br>')}</p>`;
}

export class OneSignalService {
  private appId: string;
  private restApiKey: string;
  private apiBase: string;

  constructor(env: Env) {
    this.appId = env.ONESIGNAL_APP_ID ?? '';
    this.restApiKey = env.ONESIGNAL_REST_API_KEY ?? '';
    this.apiBase = env.ONESIGNAL_API_BASE ?? DEFAULT_API_BASE;
  }

  static isConfigured(env: Env): boolean {
    return Boolean(env.ONESIGNAL_APP_ID && env.ONESIGNAL_REST_API_KEY);
  }

  async sendPush(externalUserId: string, input: OneSignalNotificationInput): Promise<void> {
    await this.send({
      app_id: this.appId,
      headings: { en: input.title },
      contents: { en: input.body ?? '' },
      url: input.url ?? undefined,
      data: input.data ?? undefined,
      include_external_user_ids: [externalUserId],
      channel_for_external_user_ids: 'push'
    });
  }

  async sendEmail(email: string, input: OneSignalNotificationInput): Promise<void> {
    await this.send({
      app_id: this.appId,
      headings: { en: input.title },
      contents: { en: input.body ?? '' },
      url: input.url ?? undefined,
      data: input.data ?? undefined,
      include_email_tokens: [email],
      email_subject: input.title,
      email_body: buildEmailBody(input)
    });
  }

  private async send(payload: Record<string, unknown>): Promise<void> {
    if (!this.appId || !this.restApiKey) {
      throw new Error('OneSignal is not configured');
    }

    const response = await fetch(`${this.apiBase}/notifications`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.restApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OneSignal request failed (${response.status}): ${errorText}`);
    }
  }
}
