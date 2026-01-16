import { createHmac, timingSafeEqual } from 'crypto';
import { Buffer } from 'buffer';
import type { Env, NotificationRecipientSnapshot } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { ConversationService } from '../services/ConversationService.js';
import { enqueueNotification } from '../services/NotificationPublisher.js';
import { RemoteApiService } from '../services/RemoteApiService.js';

const SIGNATURE_HEADER = 'X-Blawby-Signature';
const TIMESTAMP_HEADER = 'X-Blawby-Timestamp';
const MAX_SKEW_MS = 5 * 60 * 1000;

type IntakeWebhookPayload = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (source: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const readNumber = (source: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
};

const readRecord = (source: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const value = source[key];
  return isRecord(value) ? value : null;
};

const normalizePriority = (urgency: string | null): 'low' | 'normal' | 'high' => {
  if (!urgency) return 'normal';
  const normalized = urgency.trim().toLowerCase();
  if (['high', 'urgent', 'immediate', 'asap'].includes(normalized)) return 'high';
  if (['low', 'not urgent', 'low_priority'].includes(normalized)) return 'low';
  return 'normal';
};

const parseSignatureHeader = (value: string | null): { signature: string | null; timestamp: string | null } => {
  if (!value) return { signature: null, timestamp: null };
  const parts = value.split(',').map((part) => part.trim());
  let signature: string | null = null;
  let timestamp: string | null = null;
  parts.forEach((part) => {
    if (part.startsWith('v1=')) {
      signature = part.slice(3);
    } else if (part.startsWith('t=')) {
      timestamp = part.slice(2);
    }
  });
  if (!signature && /^[a-f0-9]+$/i.test(value)) {
    signature = value;
  }
  return { signature, timestamp };
};

const toEpochMs = (value: number): number => (value < 1e12 ? value * 1000 : value);

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return timingSafeEqual(bufA, bufA) && false;
  }
  return timingSafeEqual(bufA, bufB);
};

const normalizeRecipients = (value: unknown): NotificationRecipientSnapshot[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): NotificationRecipientSnapshot | null => {
      if (!isRecord(entry)) return null;
      const userId = readString(entry, ['userId', 'user_id', 'id']);
      if (!userId) return null;
      const email = readString(entry, ['email']);
      const preferences = isRecord(entry.preferences) ? entry.preferences : null;
      return {
        userId,
        email: email ?? null,
        preferences: preferences ?? undefined
      };
    })
    .filter((entry): entry is NotificationRecipientSnapshot => entry !== null);
};

const generateMatterNumber = async (env: Env, practiceId: string): Promise<string> => {
  const year = new Date().getFullYear().toString();
  const counterName = `matter_number_${year}`;
  const row = await env.DB.prepare(
    `INSERT INTO counters (practice_id, name, next_value)
       VALUES (?, ?, 1)
       ON CONFLICT(practice_id, name)
       DO UPDATE SET next_value = counters.next_value + 1
       RETURNING next_value`
  ).bind(practiceId, counterName).first<{ next_value?: number } | null>();

  const seq = Number(row?.next_value ?? 1);
  return `MAT-${year}-${seq.toString().padStart(3, '0')}`;
};

const verifySignature = (request: Request, rawBody: string, env: Env): { timestampMs: number } => {
  const secret = env.INTAKE_WEBHOOK_SECRET;
  if (!secret) {
    throw HttpErrors.internalServerError('Webhook secret not configured');
  }

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const headerTimestamp = request.headers.get(TIMESTAMP_HEADER);
  const parsed = parseSignatureHeader(signatureHeader);
  const signature = parsed.signature;
  const timestampRaw = headerTimestamp || parsed.timestamp;

  if (!signature || !timestampRaw) {
    throw HttpErrors.unauthorized('Webhook signature missing');
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    throw HttpErrors.unauthorized('Invalid webhook timestamp');
  }

  const timestampMs = toEpochMs(timestamp);
  if (Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
    throw HttpErrors.unauthorized('Webhook timestamp outside allowed window');
  }

  const payloadToSign = `${timestampRaw}.${rawBody}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');

  if (!safeEqual(signature, expectedSignature)) {
    throw HttpErrors.unauthorized('Invalid webhook signature');
  }

  return { timestampMs };
};

const normalizePayload = (payload: IntakeWebhookPayload): IntakeWebhookPayload => {
  if (isRecord(payload.data)) {
    return payload.data as IntakeWebhookPayload;
  }
  return payload;
};

export async function handleWebhooks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/webhooks/intake-paid' && request.method === 'POST') {
    const rawBody = await request.text();
    verifySignature(request, rawBody, env);

    let payload: IntakeWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as IntakeWebhookPayload;
    } catch {
      throw HttpErrors.badRequest('Invalid JSON payload');
    }

    const data = normalizePayload(payload);
    const practiceId = readString(data, ['practiceId', 'practice_id']);
    const intakeUuid = readString(data, ['intakeUuid', 'intake_uuid', 'uuid']);
    const conversationId = readString(data, ['conversationId', 'conversation_id', 'sessionId', 'session_id']);

    if (!practiceId || !intakeUuid) {
      throw HttpErrors.badRequest('Missing practiceId or intakeUuid');
    }

    const practiceExists = await RemoteApiService.validatePractice(env, practiceId);
    if (!practiceExists) {
      throw HttpErrors.notFound('Practice not found');
    }

    const paymentRecord = readRecord(data, 'payment') ?? {};
    const paymentStatus = readString(paymentRecord, ['status', 'payment_status'])
      ?? readString(data, ['paymentStatus', 'payment_status']);

    if (!paymentStatus || !['succeeded', 'paid'].includes(paymentStatus.toLowerCase())) {
      return new Response(JSON.stringify({
        success: true,
        data: { ignored: true, reason: 'Payment not completed' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await env.DB.prepare(
      `SELECT id
         FROM matters
        WHERE practice_id = ?
          AND json_extract(custom_fields, '$.intakeUuid') = ?
        LIMIT 1`
    ).bind(practiceId, intakeUuid).first<{ id: string } | null>();

    if (existing?.id) {
      return new Response(JSON.stringify({
        success: true,
        data: { matterId: existing.id, reused: true }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const clientRecord = readRecord(data, 'client') ?? {};
    const intakeRecord = readRecord(data, 'intake') ?? {};

    const clientName = readString(clientRecord, ['name', 'fullName'])
      ?? readString(data, ['clientName', 'client_name'])
      ?? 'New Lead';
    const clientEmail = readString(clientRecord, ['email']) ?? readString(data, ['clientEmail', 'client_email']);
    const clientPhone = readString(clientRecord, ['phone', 'phoneNumber', 'phone_number'])
      ?? readString(data, ['clientPhone', 'client_phone']);

    const matterType = readString(intakeRecord, ['matterType', 'matter_type', 'practiceArea', 'service'])
      ?? readString(data, ['matterType', 'matter_type'])
      ?? 'General';
    const description = readString(intakeRecord, ['description', 'summary', 'details'])
      ?? readString(data, ['description'])
      ?? null;
    const urgency = readString(intakeRecord, ['urgency', 'priority'])
      ?? readString(data, ['urgency', 'priority']);
    const leadSource = readString(intakeRecord, ['leadSource', 'lead_source', 'source'])
      ?? readString(data, ['leadSource', 'lead_source', 'source'])
      ?? 'intake';
    const title = readString(intakeRecord, ['title'])
      ?? `${matterType} Intake`;

    const amount = readNumber(paymentRecord, ['amount'])
      ?? readNumber(data, ['amount']);
    const currency = readString(paymentRecord, ['currency'])
      ?? readString(data, ['currency']);

    const matterId = crypto.randomUUID();
    const matterNumber = await generateMatterNumber(env, practiceId);
    const now = new Date().toISOString();

    const customFields = {
      intakeUuid,
      sessionId: conversationId ?? null,
      source: 'intake',
      urgency: urgency ?? null,
      payment: {
        status: paymentStatus,
        amount: amount ?? null,
        currency: currency ?? null
      }
    };

    await env.DB.prepare(`
      INSERT INTO matters (
        id,
        practice_id,
        user_id,
        client_name,
        client_email,
        client_phone,
        matter_type,
        title,
        description,
        status,
        priority,
        lead_source,
        matter_number,
        custom_fields,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)
    `).bind(
      matterId,
      practiceId,
      null,
      clientName,
      clientEmail ?? null,
      clientPhone ?? null,
      matterType,
      title,
      description,
      normalizePriority(urgency),
      leadSource,
      matterNumber,
      JSON.stringify(customFields),
      now,
      now
    ).run();

    const conversationService = new ConversationService(env);

    if (conversationId) {
      try {
        await conversationService.attachMatter(conversationId, practiceId, matterId);
      } catch (error) {
        console.warn('[Webhook] Failed to attach matter to conversation', error);
      }

      let practiceName = readString(data, ['practiceName', 'practice_name']) ?? 'the practice';
      if (!practiceName || practiceName === 'the practice') {
        try {
          const practice = await RemoteApiService.getPractice(env, practiceId);
          if (practice?.name) {
            practiceName = practice.name;
          }
        } catch {
          // fallback to default
        }
      }

      try {
        await conversationService.sendSystemMessage({
          conversationId,
          practiceId,
          content: `Payment received. ${practiceName} will review your intake and follow up here shortly.`,
          role: 'system',
          metadata: {
            intakePaymentUuid: intakeUuid,
            paymentStatus
          }
        });
      } catch (error) {
        console.warn('[Webhook] Failed to send intake payment message', error);
      }
    }

    const recipients = normalizeRecipients(data.recipients);
    if (recipients.length > 0) {
      await enqueueNotification(env, {
        eventId: crypto.randomUUID(),
        dedupeKey: `intake:${intakeUuid}`,
        practiceId,
        category: 'intake',
        entityType: 'matter',
        entityId: matterId,
        title: 'New intake paid',
        body: `${clientName} completed payment for ${matterType}.`,
        link: '/practice/leads',
        metadata: {
          matterId,
          conversationId,
          intakeUuid,
          action: 'created'
        },
        recipients
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        matterId,
        conversationId: conversationId ?? null
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  throw HttpErrors.notFound('Webhook endpoint not found');
}
