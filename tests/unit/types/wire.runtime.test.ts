/**
 * Runtime sanity-check that representative wire payloads parse cleanly
 * through their Zod schemas. One fixture per resource — extra coverage
 * for the contract that backend-owned shape changes will surface here
 * (failing test) before they cause production decoding errors.
 *
 * Fixtures use real shape (not minimal) so optional/null-returning
 * branches get exercised. Parse results are compared with toMatchObject
 * to stay tolerant of `.passthrough()`-introduced index signatures.
 */
import { describe, it, expect } from 'vitest';

import { BackendMatterSchema, BackendMatterTaskSchema } from '../../../worker/types/wire/matter';
import { BackendInvoiceSchema } from '../../../worker/types/wire/invoice';
import { BackendUploadRecordSchema } from '../../../worker/types/wire/upload';
import { BackendSessionSchema } from '../../../worker/types/wire/auth';
import {
  BackendIntakeCreatePayloadSchema,
  BackendIntakeCreateResponseSchema,
} from '../../../worker/types/wire/intake';
import { PracticeSchema, ConversationConfigSchema } from '../../../worker/types/wire/practice';
import { BackendUserDetailSchema } from '../../../worker/types/wire/client';
import {
  BackendActivityEventSchema,
  BackendActivityListResponseSchema,
} from '../../../worker/types/wire/activity';

describe('wire schemas — runtime parse fixtures', () => {
  it('parses a representative BackendMatter', () => {
    const fixture = {
      id: 'm-1',
      organization_id: 'org-1',
      client_id: 'c-1',
      title: 'Smith v Jones',
      description: 'Personal injury matter',
      billing_type: 'contingency',
      contingency_percentage: 33.3,
      practice_service_id: 'svc-1',
      case_number: 'CV-2024-001',
      matter_type: 'civil',
      urgency: 'time_sensitive',
      open_date: '2024-01-15',
      close_date: null,
      status: 'active',
      created_at: '2024-01-15T12:00:00Z',
      updated_at: '2024-02-01T09:30:00Z',
      assignee_ids: ['u-1', 'u-2'],
    };
    const parsed = BackendMatterSchema.parse(fixture);
    expect(parsed).toMatchObject({ id: 'm-1', billing_type: 'contingency' });
  });

  it('parses a BackendMatterTask with required enums', () => {
    const parsed = BackendMatterTaskSchema.parse({
      id: 't-1',
      matter_id: 'm-1',
      name: 'Review discovery',
      status: 'in_progress',
      priority: 'high',
      stage: 'discovery',
      assignee_id: 'u-2',
    });
    expect(parsed.status).toBe('in_progress');
  });

  it('parses a BackendInvoice with line items', () => {
    const parsed = BackendInvoiceSchema.parse({
      id: 'inv-1',
      organization_id: 'org-1',
      client_id: 'c-1',
      connected_account_id: 'acct-1',
      invoice_number: 'INV-001',
      status: 'open',
      total: 50000,
      issue_date: '2024-02-01',
      due_date: '2024-03-01',
      line_items: [
        { id: 'li-1', description: 'Initial consultation', quantity: 1, unit_price: 50000, line_total: 50000 },
      ],
    });
    expect(parsed.line_items?.length).toBe(1);
  });

  it('parses a BackendUploadRecord', () => {
    const parsed = BackendUploadRecordSchema.parse({
      id: 'u-1',
      upload_context: 'matter',
      matter_id: 'm-1',
      file_name: 'discovery.pdf',
      mime_type: 'application/pdf',
      file_size: 102400,
      storage_key: 'uploads/matter/m-1/discovery.pdf',
      public_url: null,
      status: 'verified',
      created_at: '2024-02-01T12:00:00Z',
    });
    expect(parsed.status).toBe('verified');
  });

  it('parses a BackendSession (open-shape passthrough)', () => {
    const parsed = BackendSessionSchema.parse({
      id: 'sess-1',
      created_at: '2024-02-01T12:00:00Z',
      expires_at: '2024-02-08T12:00:00Z',
      // Backend may include arbitrary extras — passthrough preserves them.
      ipAddress: '127.0.0.1',
    });
    expect(parsed.id).toBe('sess-1');
  });

  it('parses BackendIntakeCreate request and response', () => {
    const payload = BackendIntakeCreatePayloadSchema.parse({
      slug: 'acme-law',
      amount: 7500,
      name: 'Jane Doe',
      email: 'jane@example.com',
      conversation_id: 'conv-1',
      description: 'Slip and fall at restaurant',
      urgency: 'routine',
    });
    expect(payload.email).toBe('jane@example.com');

    const response = BackendIntakeCreateResponseSchema.parse({
      success: true,
      data: {
        uuid: 'intake-1',
        status: 'pending',
        payment_link_url: null,
        organization: { name: 'Acme Law' },
      },
    });
    expect(response.success).toBe(true);
  });

  it('parses a Practice with full ConversationConfig', () => {
    const conversationConfig = ConversationConfigSchema.parse({
      availableServices: ['family', 'criminal'],
      serviceQuestions: { family: ['Are you currently divorced?'] },
      domain: 'acme-law.com',
      description: 'Family and criminal law',
      brandColor: '#1a1a1a',
      accentColor: '#ff6600',
      voice: {
        enabled: false,
        provider: 'cloudflare',
      },
      consultationFee: 7500,
      billingIncrementMinutes: 6,
    });
    expect(conversationConfig.availableServices.length).toBe(2);

    const practice = PracticeSchema.parse({
      id: 'p-1',
      name: 'Acme Law',
      slug: 'acme-law',
      conversationConfig,
      kind: 'practice',
      subscriptionStatus: 'active',
      createdAt: 1700000000000,
      updatedAt: 1700001000000,
    });
    expect(practice.kind).toBe('practice');
    expect(practice.subscriptionStatus).toBe('active');
  });

  it('parses a BackendUserDetail', () => {
    const parsed = BackendUserDetailSchema.parse({
      id: 'ud-1',
      practice_id: 'p-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0100',
      status: 'active',
      address: {
        city: 'Portland',
        state: 'OR',
      },
    });
    expect(parsed.status).toBe('active');
    expect(parsed.address?.city).toBe('Portland');
  });

  it('parses an activity feed page', () => {
    const event = BackendActivityEventSchema.parse({
      id: 'evt-1',
      uid: 'p-1:m-1',
      type: 'matter_event',
      event_type: 'matter.status_changed',
      title: 'Matter opened',
      description: 'Status changed to active',
      event_date: '2024-02-01T12:00:00Z',
      actor_type: 'user',
      actor_id: 'u-1',
      created_at: '2024-02-01T12:00:00Z',
    });
    expect(event.type).toBe('matter_event');

    const list = BackendActivityListResponseSchema.parse({
      success: true,
      data: {
        items: [event],
        hasMore: false,
        total: 1,
      },
    });
    expect(list.data?.items.length).toBe(1);
  });

  it('rejects malformed payloads (regression guard)', () => {
    // Invalid TaskStatus enum
    expect(() => BackendMatterTaskSchema.parse({
      id: 't-1',
      matter_id: 'm-1',
      name: 'Bad',
      status: 'unknown_status',
      priority: 'high',
      stage: 'discovery',
    })).toThrow();

    // Missing required `id`
    expect(() => BackendMatterSchema.parse({
      title: 'no id',
    })).toThrow();
  });
});
