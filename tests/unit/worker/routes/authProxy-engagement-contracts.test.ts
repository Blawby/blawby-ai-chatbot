import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBackendProxy } from '../../../../worker/routes/authProxy.js';
import type { Env } from '../../../../worker/types.js';

const practiceId = 'practice-1';

const buildEnv = (): Env => ({
  NODE_ENV: 'test',
  BACKEND_API_URL: 'https://backend.test',
  IDEMPOTENCY_SALT: 'test-salt',
} as Env);

const buildRequest = (path: string): Request =>
  new Request(`https://worker.test${path}`, {
    method: 'GET',
    headers: { Cookie: 'session=present' },
  });

const validEngagement = {
  id: 'engagement-1',
  intake_id: 'intake-1',
  organization_id: practiceId,
  status: 'draft',
  proposal_data: {
    client_summary: {
      client_name: 'Client Name',
      matter_summary: 'Draft engagement matter',
    },
    fees: {
      billing_type: 'hourly',
    },
  },
  created_at: '2026-06-20T00:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('handleBackendProxy engagement contract validation', () => {
  it('passes through valid engagement contract list responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        data: [validEngagement],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
    );

    const response = await handleBackendProxy(
      buildRequest(`/api/engagement-contracts/${practiceId}?page=1&limit=20`),
      buildEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [validEngagement],
    });
  });

  it('passes through empty engagement contract lists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        data: [],
        pagination: { page: 1, limit: 20, total: 0 },
      }),
    );

    const response = await handleBackendProxy(
      buildRequest(`/api/engagement-contracts/${practiceId}?page=1&limit=20`),
      buildEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [],
      pagination: { total: 0 },
    });
  });

  it('passes through engagement contract lists that use backend aliases', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        contracts: [validEngagement],
        page: 1,
        limit: 20,
        total: 1,
      }),
    );

    const response = await handleBackendProxy(
      buildRequest(`/api/engagement-contracts/${practiceId}?page=1&limit=20`),
      buildEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      contracts: [validEngagement],
    });
  });

  it('passes through malformed engagement contract records from upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        data: [{
          ...validEngagement,
          proposal_data: {
            draft_meta: {},
            source_snapshot: {},
          },
        }],
        pagination: { page: 1, limit: 20, total: 1 },
      }),
    );

    const response = await handleBackendProxy(
      buildRequest(`/api/engagement-contracts/${practiceId}?page=1&limit=20`),
      buildEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [{
        ...validEngagement,
        proposal_data: {
          draft_meta: {},
          source_snapshot: {},
        },
      }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
  });

  it('fast-fails upstream HTML errors with JSON diagnostics', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<!DOCTYPE html><title>502: Bad gateway</title>', {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      }),
    );

    const response = await handleBackendProxy(
      buildRequest(`/api/engagement-contracts/${practiceId}?page=1&limit=20`),
      buildEnv(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Engagement contract upstream request failed',
      details: {
        path: `/api/engagement-contracts/${practiceId}`,
        status: 502,
        contentType: 'text/html; charset=UTF-8',
        bodyPreview: expect.stringContaining('Bad gateway'),
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[ERROR] [engagement-contracts] Upstream request failed with non-JSON response',
      expect.objectContaining({
        path: `/api/engagement-contracts/${practiceId}`,
        status: 502,
        contentType: 'text/html; charset=UTF-8',
      }),
    );
  });
});
