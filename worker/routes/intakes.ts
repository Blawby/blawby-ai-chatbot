import { parseJsonBody } from '../utils.js';
import { HttpErrors, createSuccessResponse } from '../errorHandler.js';
import type { Env } from '../types.js';
import { HttpError } from '../types.js';
import { optionalAuth } from '../middleware/auth.js';
import { withPracticeContext, getPracticeId } from '../middleware/practiceContext.js';
import { ConversationService } from '../services/ConversationService.js';
import { RemoteApiService } from '../services/RemoteApiService.js';
import { NotificationService } from '../services/NotificationService.js';
import { enqueueNotification, getAdminRecipients } from '../services/NotificationPublisher.js';

const PAID_STATUSES = new Set(['succeeded', 'paid', 'complete', 'completed']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (source: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const normalizeStatus = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
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

const createSystemMessage = (options: {
  practiceName: string;
  paymentRequired: boolean;
}): string => {
  if (options.paymentRequired) {
    return `Payment received. ${options.practiceName} will review your intake and follow up here shortly.`;
  }
  return `Your intake has been received. ${options.practiceName} will review your request and follow up here shortly.`;
};

export async function handleIntakes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'api' || segments[1] !== 'intakes') {
    throw HttpErrors.notFound('Intake route not found');
  }

  if (segments.length === 3 && segments[2] === 'confirm' && request.method === 'POST') {
    const authContext = await optionalAuth(request, env);
    if (!authContext) {
      throw HttpErrors.unauthorized('Authentication required');
    }

    const requestWithContext = await withPracticeContext(request, env, {
      requirePractice: true,
      allowUrlOverride: true
    });
    const practiceId = getPracticeId(requestWithContext);
    const practiceSlug = url.searchParams.get('practiceSlug')?.trim() || null;

    const body = await parseJsonBody(request) as Record<string, unknown>;
    const intakeUuid = typeof body.intakeUuid === 'string' ? body.intakeUuid.trim() : '';
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';

    if (!intakeUuid || !conversationId) {
      throw HttpErrors.badRequest('intakeUuid and conversationId are required');
    }

    const conversationService = new ConversationService(env);
    await conversationService.validateParticipantAccess(conversationId, practiceId, authContext.user.id);

    const intakeStatus = await RemoteApiService.getPracticeClientIntakeStatus(env, intakeUuid, request);
    if (!intakeStatus) {
      throw HttpErrors.notFound('Intake not found');
    }

    let practice = null;
    try {
      practice = await RemoteApiService.getPractice(env, practiceId, request);
    } catch (error) {
      if (error instanceof HttpError) {
        console.warn('[Intake] Practice lookup failed; continuing with intake settings only', {
          practiceId,
          status: error.status,
          message: error.message
        });
      } else {
        throw error;
      }
    }

    const settingsSlug = practiceSlug ?? practice?.slug ?? null;
    const settings = settingsSlug
      ? await RemoteApiService.getPracticeClientIntakeSettings(env, settingsSlug, request)
      : null;
    const paymentRequired = settings?.paymentLinkEnabled === true;
    const status = normalizeStatus(intakeStatus.status);

    if (paymentRequired && !status) {
      throw HttpErrors.paymentRequired('Payment status not available');
    }

    if (paymentRequired && status && !PAID_STATUSES.has(status)) {
      throw HttpErrors.paymentRequired('Payment not completed', { status });
    }

    const existing = await env.DB.prepare(
      `SELECT id
         FROM matters
        WHERE practice_id = ?
          AND json_extract(custom_fields, '$.intakeUuid') = ?
        LIMIT 1`
    ).bind(practiceId, intakeUuid).first<{ id: string } | null>();

    if (existing?.id) {
      return createSuccessResponse({ matterId: existing.id, reused: true });
    }

    const metadata = isRecord(intakeStatus.metadata) ? intakeStatus.metadata : null;
    const clientName = readString(metadata, ['name']) ?? 'New Lead';
    const clientEmail = readString(metadata, ['email']);
    const clientPhone = readString(metadata, ['phone']);
    const description = readString(metadata, ['description']);
    const matterType = 'Consultation';
    const title = clientName ? `Intake from ${clientName}` : 'New Intake';

    const amount = typeof intakeStatus.amount === 'number' ? intakeStatus.amount : null;
    const currency = typeof intakeStatus.currency === 'string' ? intakeStatus.currency : null;

    const matterId = crypto.randomUUID();
    const matterNumber = await generateMatterNumber(env, practiceId);
    const now = new Date().toISOString();

    const customFields = {
      intakeUuid,
      sessionId: conversationId,
      source: 'intake',
      payment: {
        status: status ?? null,
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
      description ?? null,
      'normal',
      'intake',
      matterNumber,
      JSON.stringify(customFields),
      now,
      now
    ).run();

    try {
      await conversationService.attachMatter(conversationId, practiceId, matterId);
    } catch (error) {
      console.warn('[Intake] Failed to attach matter to conversation', error);
    }

    const practiceName = practice?.name ?? settings?.organization?.name ?? 'the practice';
    try {
      await conversationService.sendSystemMessage({
        conversationId,
        practiceId,
        content: createSystemMessage({ practiceName, paymentRequired }),
        role: 'system',
        metadata: {
          intakeUuid,
          paymentStatus: status ?? null,
          paymentRequired
        },
        recipientUserId: authContext.user.id,
        request
      });
    } catch (error) {
      console.warn('[Intake] Failed to send intake confirmation message', error);
    }

    try {
      const notifier = new NotificationService(env);
      await notifier.sendMatterCreatedNotification({
        type: 'matter_created',
        practiceConfig: practice ?? undefined,
        matterInfo: {
          type: matterType,
          description: description ?? undefined
        },
        clientInfo: {
          name: clientName,
          email: clientEmail ?? undefined,
          phone: clientPhone ?? undefined
        }
      });
    } catch (error) {
      void error;
    }

    if (practice) {
      try {
        const recipients = await getAdminRecipients(env, practiceId, request, {
          actorUserId: authContext.user.id,
          category: 'intake'
        });
        if (recipients.length > 0) {
          await enqueueNotification(env, {
            eventId: crypto.randomUUID(),
            dedupeKey: `intake:${intakeUuid}`,
            dedupeWindow: 'permanent',
            practiceId,
            conversationId,
            category: 'intake',
            entityType: 'matter',
            entityId: matterId,
            title: paymentRequired ? 'Consultation fee received' : 'New intake submitted',
            body: `${clientName} submitted an intake for ${matterType}.`,
            link: '/practice/leads',
            metadata: {
              matterId,
              conversationId,
              intakeUuid,
              paymentStatus: status ?? null
            },
            recipients
          });
        }
      } catch (error) {
        void error;
      }
    } else {
      console.warn('[Intake] Skipping admin notifications because practice lookup failed.');
    }

    return createSuccessResponse({
      matterId,
      conversationId,
      intakeUuid,
      paymentRequired,
      paymentStatus: status ?? null
    });
  }

  throw HttpErrors.methodNotAllowed('Unsupported method for intake endpoint');
}
