import type { Env } from '../types.js';
import { HttpErrors } from '../errorHandler.js';
import { ActivityService } from './ActivityService.js';

type MatterStatus = 'lead' | 'open' | 'in_progress' | 'completed' | 'archived';

interface MatterRecord {
  id: string;
  practice_id: string;
  status: string;
  title?: string | null;
  client_name?: string | null;
}

interface CreateLeadInput {
  practiceId: string;
  sessionId?: string | null;
  name?: string | null;
  email: string;
  phoneNumber: string;
  matterDetails: string;
  leadSource?: string | null;
}

interface StatusTransitionResult {
  matterId: string;
  status: MatterStatus;
  previousStatus: MatterStatus;
  updatedAt: string;
  acceptedBy?: {
    userId: string;
    acceptedAt: string;
  };
}

const CLOSED_STATUSES = new Set<MatterStatus>(['completed', 'archived']);

const STATUS_TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  lead: ['open', 'archived'],
  open: ['in_progress', 'archived'],
  in_progress: ['open', 'completed', 'archived'],
  completed: ['archived', 'in_progress'],
  archived: ['open']
};

export class MatterService {
  private activityService: ActivityService;

  constructor(private env: Env) {
    this.activityService = new ActivityService(env);
  }

  async getMatterIdBySessionId(practiceId: string, sessionId: string): Promise<string | null> {
    if (!practiceId || !sessionId) {
      return null;
    }

    const record = await this.env.DB.prepare(
      `SELECT id
         FROM matters
        WHERE practice_id = ?
          AND json_extract(custom_fields, '$.sessionId') = ?
        ORDER BY created_at DESC
        LIMIT 1`
    ).bind(practiceId, sessionId).first<{ id: string } | null>();

    return record?.id ?? null;
  }

  async createLeadFromContactForm(input: CreateLeadInput): Promise<{ matterId: string; matterNumber: string; createdAt: string }> {
    const now = new Date();
    const matterId = crypto.randomUUID();
    const createdAt = now.toISOString();

    const clientName = input.name?.trim() || 'New Lead';
    const leadSource = input.leadSource?.trim() || 'contact_form';

    const customFields = {
      sessionId: input.sessionId ?? null,
      source: 'contact_form',
      submittedAt: createdAt
    };
    // Atomically allocate next matter number using DB-backed counter
    const matterNumber = await this.generateMatterNumber(input.practiceId);

    await this.env.DB.prepare(
      `INSERT INTO matters (
         id,
         practice_id,
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
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lead', 'normal', ?, ?, ?, ?, ?)`
    ).bind(
      matterId,
      input.practiceId,
      clientName,
      input.email.trim(),
      input.phoneNumber.trim(),
      'General Consultation',
      `Lead: ${clientName}`,
      input.matterDetails.trim(),
      leadSource,
      matterNumber,
      JSON.stringify(customFields),
      createdAt,
      createdAt
    ).run();

    await this.activityService.createEvent({
      type: 'matter_event',
      eventType: 'matter_created',
      title: 'Lead Created',
      description: `${clientName} submitted a new lead via contact form.`,
      eventDate: createdAt,
      actorType: 'system',
      metadata: {
        matterId,
        practiceId: input.practiceId,
        source: leadSource,
        sessionId: input.sessionId ?? null
      }
    }, input.practiceId);

    return {
      matterId,
      matterNumber,
      createdAt
    };
  }

  async acceptLead(options: { practiceId: string; matterId: string; actorUserId: string }): Promise<StatusTransitionResult> {
    const eventDate = new Date().toISOString();
    const { matter, previousStatus } = await this.assertMatterForLeadAction(options.practiceId, options.matterId, 'accept');

    await this.updateMatterStatusInternal(options.practiceId, options.matterId, 'open');

    await this.activityService.createEvent({
      type: 'matter_event',
      eventType: 'accept',
      title: 'Lead Accepted',
      description: `${matter.client_name ?? 'Lead'} accepted and moved to open.`,
      eventDate,
      actorType: 'lawyer',
      actorId: options.actorUserId,
      metadata: {
        matterId: options.matterId,
        practiceId: options.practiceId,
        fromStatus: previousStatus,
        toStatus: 'open'
      }
    }, options.practiceId);

    return {
      matterId: options.matterId,
      status: 'open',
      previousStatus,
      updatedAt: eventDate,
      acceptedBy: {
        userId: options.actorUserId,
        acceptedAt: eventDate
      }
    };
  }

  async rejectLead(options: { practiceId: string; matterId: string; actorUserId: string; reason?: string | null }): Promise<StatusTransitionResult> {
    const eventDate = new Date().toISOString();
    const { matter, previousStatus } = await this.assertMatterForLeadAction(options.practiceId, options.matterId, 'reject');

    await this.updateMatterStatusInternal(options.practiceId, options.matterId, 'archived');

    await this.activityService.createEvent({
      type: 'matter_event',
      eventType: 'reject',
      title: 'Lead Rejected',
      description: options.reason?.trim() || `${matter.client_name ?? 'Lead'} was rejected.`,
      eventDate,
      actorType: 'lawyer',
      actorId: options.actorUserId,
      metadata: {
        matterId: options.matterId,
        practiceId: options.practiceId,
        fromStatus: previousStatus,
        toStatus: 'archived',
        reason: options.reason?.trim() ?? null
      }
    }, options.practiceId);

    return {
      matterId: options.matterId,
      status: 'archived',
      previousStatus,
      updatedAt: eventDate
    };
  }

  async transitionStatus(options: {
    practiceId: string;
    matterId: string;
    targetStatus: MatterStatus;
    actorUserId: string;
    reason?: string | null;
  }): Promise<StatusTransitionResult> {
    const eventDate = new Date().toISOString();
    const matter = await this.getMatter(options.practiceId, options.matterId);
    const previousStatus = this.normalizeStatus(matter.status);

    if (previousStatus === options.targetStatus) {
      throw HttpErrors.badRequest('Matter is already in the requested status');
    }

    const allowedNextStatuses = STATUS_TRANSITIONS[previousStatus];
    if (!allowedNextStatuses || !allowedNextStatuses.includes(options.targetStatus)) {
      throw HttpErrors.badRequest(`Cannot transition matter from ${previousStatus} to ${options.targetStatus}`);
    }

    await this.updateMatterStatusInternal(options.practiceId, options.matterId, options.targetStatus);

    await this.activityService.createEvent({
      type: 'matter_event',
      eventType: 'status_change',
      title: `Status Updated: ${options.targetStatus.replace('_', ' ')}`,
      description: options.reason?.trim() || `${matter.client_name ?? 'Matter'} moved from ${previousStatus} to ${options.targetStatus}.`,
      eventDate,
      actorType: 'lawyer',
      actorId: options.actorUserId,
      metadata: {
        matterId: options.matterId,
        practiceId: options.practiceId,
        fromStatus: previousStatus,
        toStatus: options.targetStatus,
        reason: options.reason?.trim() ?? null
      }
    }, options.practiceId);

    return {
      matterId: options.matterId,
      status: options.targetStatus,
      previousStatus,
      updatedAt: eventDate
    };
  }

  private async getMatter(practiceId: string, matterId: string): Promise<MatterRecord> {
    const record = await this.env.DB.prepare(
      `SELECT id, practice_id, status, title, client_name
         FROM matters
        WHERE id = ?`
    ).bind(matterId).first<MatterRecord | null>();

    if (!record) {
      throw HttpErrors.notFound('Matter not found');
    }

    if (record.practice_id !== practiceId) {
      throw HttpErrors.forbidden('Matter does not belong to this practice');
    }

    return record;
  }

  private async assertMatterForLeadAction(practiceId: string, matterId: string, action: 'accept' | 'reject'): Promise<{ matter: MatterRecord; previousStatus: MatterStatus }> {
    const matter = await this.getMatter(practiceId, matterId);
    const previousStatus = this.normalizeStatus(matter.status);

    if (previousStatus !== 'lead') {
      throw HttpErrors.badRequest(`Only leads can be ${action === 'accept' ? 'accepted' : 'rejected'}`);
    }

    return { matter, previousStatus };
  }

  private async updateMatterStatusInternal(practiceId: string, matterId: string, nextStatus: MatterStatus): Promise<void> {
    const now = new Date().toISOString();
    const closedAtValue = CLOSED_STATUSES.has(nextStatus) ? now : null;

    await this.env.DB.prepare(
      `UPDATE matters
          SET status = ?,
              updated_at = ?,
              closed_at = ?
        WHERE id = ?
          AND practice_id = ?`
    ).bind(
      nextStatus,
      now,
      closedAtValue,
      matterId,
      practiceId
    ).run();
  }

  private async generateMatterNumber(practiceId: string): Promise<string> {
    const year = new Date().getFullYear().toString();
    const counterName = `matter_number_${year}`;
    // Use SQLite UPSERT with RETURNING to atomically increment and fetch value
    const row = await this.env.DB.prepare(
      `INSERT INTO counters (organization_id, name, next_value)
         VALUES (?, ?, 1)
         ON CONFLICT(organization_id, name)
         DO UPDATE SET next_value = counters.next_value + 1
         RETURNING next_value`
    ).bind(practiceId, counterName).first<{ next_value?: number } | null>();

    const seq = Number(row?.next_value ?? 1);
    return `MAT-${year}-${seq.toString().padStart(3, '0')}`;
  }

  private normalizeStatus(status: string | null | undefined): MatterStatus {
    const normalized = (status ?? '').toLowerCase() as MatterStatus;
    if (!['lead', 'open', 'in_progress', 'completed', 'archived'].includes(normalized)) {
      throw HttpErrors.badRequest(`Unsupported matter status: ${status ?? 'unknown'}`);
    }
    return normalized;
  }
}
