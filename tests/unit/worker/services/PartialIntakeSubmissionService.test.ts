import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PartialIntakeSubmissionService } from '../../../../worker/services/PartialIntakeSubmissionService.js';
import { RemoteApiService } from '../../../../worker/services/RemoteApiService.js';
import type { Env } from '../../../../worker/types.js';

const baseEnv = (overrides: Partial<Env> = {}): Env => ({
  BACKEND_API_URL: 'https://backend.example.com',
  ...overrides,
} as Env);

describe('PartialIntakeSubmissionService', () => {
  let createIntakeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createIntakeSpy = vi.spyOn(RemoteApiService, 'createIntake');
  });

  afterEach(() => {
    createIntakeSpy.mockRestore();
  });

  it('POSTs the 4 required fields + conversation_id + failure_context on AI failure', async () => {
    createIntakeSpy.mockResolvedValue(new Response('{"uuid":"intake-1","status":"pending_review"}', { status: 200 }));
    const service = new PartialIntakeSubmissionService(baseEnv());

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'blawby-ai',
      amountMinor: 5000,
      slimContact: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+1-555-555-5555',
      },
      failureContext: {
        reason: 'upstream_transient_exhausted',
        mode_resolution_trace: { isPublic: true, isIntakeMode: true },
        timeline_ref: 'conv-1',
      },
    });

    expect(createIntakeSpy).toHaveBeenCalledTimes(1);
    const [, payload] = createIntakeSpy.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toMatchObject({
      slug: 'blawby-ai',
      amount: 5000,
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-555-5555',
      conversation_id: 'conv-1',
      failure_context: {
        reason: 'upstream_transient_exhausted',
        mode_resolution_trace: { isPublic: true, isIntakeMode: true },
        timeline_ref: 'conv-1',
      },
    });
  });

  it('omits last_user_message — PII must not leak into backend request body', async () => {
    createIntakeSpy.mockResolvedValue(new Response('{"uuid":"i"}', { status: 200 }));
    const service = new PartialIntakeSubmissionService(baseEnv());

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'blawby-ai',
      amountMinor: 0,
      slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
      failureContext: { reason: 'logic_failure', timeline_ref: 'conv-1' },
    });

    const [, payload] = createIntakeSpy.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload).not.toHaveProperty('last_user_message');
    expect(payload.failure_context as Record<string, unknown>).not.toHaveProperty('last_user_message');
  });

  it('omits phone when not collected (backend treats phone as optional)', async () => {
    createIntakeSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new PartialIntakeSubmissionService(baseEnv());

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'p',
      amountMinor: 0,
      slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
      failureContext: { reason: 'r' },
    });

    const [, payload] = createIntakeSpy.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload.phone).toBeUndefined();
  });

  it('includes collected description and urgency when AI got that far before failure', async () => {
    createIntakeSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new PartialIntakeSubmissionService(baseEnv());

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'p',
      amountMinor: 0,
      slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
      collectedFields: {
        description: 'Contract dispute',
        urgency: 'time_sensitive',
      },
      failureContext: { reason: 'r' },
    });

    const [, payload] = createIntakeSpy.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload.description).toBe('Contract dispute');
    expect(payload.urgency).toBe('time_sensitive');
  });

  it('does not throw when backend returns 500; emits intake.partial_submit_failed', async () => {
    createIntakeSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    const service = new PartialIntakeSubmissionService(baseEnv());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      service.submit({
        conversationId: 'conv-1',
        practiceSlug: 'p',
        amountMinor: 0,
        slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
        failureContext: { reason: 'r' },
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('intake.partial_submit_failed'),
      expect.objectContaining({
        conversationId: 'conv-1',
        status: 500,
      }),
    );
    warnSpy.mockRestore();
  });

  it('does not throw on AbortError; emits intake.partial_submit_failed with reason timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    createIntakeSpy.mockRejectedValue(abortError);
    const service = new PartialIntakeSubmissionService(baseEnv());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'p',
      amountMinor: 0,
      slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
      failureContext: { reason: 'r' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('intake.partial_submit_failed'),
      expect.objectContaining({
        conversationId: 'conv-1',
        reason: 'timeout',
      }),
    );
    warnSpy.mockRestore();
  });

  it('skips submission and logs when slim contact lacks name or email', async () => {
    const service = new PartialIntakeSubmissionService(baseEnv());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'p',
      amountMinor: 0,
      slimContact: { name: null, email: 'j@example.com', phone: null },
      failureContext: { reason: 'r' },
    });

    expect(createIntakeSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('intake.partial_submit_skipped'),
      expect.objectContaining({ reason: 'missing_required_fields', haveName: false }),
    );
    warnSpy.mockRestore();
  });

  it('skips submission when BACKEND_API_URL is unset', async () => {
    const service = new PartialIntakeSubmissionService(baseEnv({ BACKEND_API_URL: undefined as unknown as string }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await service.submit({
      conversationId: 'conv-1',
      practiceSlug: 'p',
      amountMinor: 0,
      slimContact: { name: 'Jane', email: 'j@example.com', phone: null },
      failureContext: { reason: 'r' },
    });

    expect(createIntakeSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('intake.partial_submit_skipped'),
      expect.objectContaining({ reason: 'backend_url_unset' }),
    );
    warnSpy.mockRestore();
  });
});
