import { test, expect } from '@playwright/test';
import { ensureAuthenticated, verifyPersonalOrg } from './helpers/createTestUser';

async function getJson<T>(page: any, url: string, init?: RequestInit): Promise<T> {
  const res = await page.evaluate(async ({ url, init }) => {
    const r = await fetch(url, { credentials: 'include', ...(init || {}) });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  }, { url, init });
  expect(res.ok, `GET ${url} failed: ${res.status} ${res.text}`).toBeTruthy();
  return JSON.parse(res.text) as T;
}

async function sendJson<T>(page: any, url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await page.evaluate(async ({ url, method, body, headers }) => {
    const r = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body != null ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  }, { url, method, body, headers });
  expect(res.ok, `${method} ${url} failed: ${res.status} ${res.text}`).toBeTruthy();
  return JSON.parse(res.text) as T;
}

function key(suffix: string) {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${suffix}`;
}

test.describe('Matter lead lifecycle (conversation-centric)', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await verifyPersonalOrg(page);
  });

  test('submit lead → list → accept → verify status', async ({ page }) => {
    const orgs = await getJson<{ success: boolean; data: Array<{ id: string }> }>(page, '/api/organizations/me');
    expect(orgs.success).toBeTruthy();
    expect(orgs.data.length).toBeGreaterThan(0);
    const organizationId = orgs.data[0].id;

    const formsResp = await sendJson<{ success: boolean; data: { matterId: string; matterNumber: string } }>(
      page,
      '/api/forms',
      'POST',
      {
        organizationId,
        email: 'lead-e2e@example.com',
        phoneNumber: '+15551234567',
        matterDetails: 'E2E test lead submission.'
      },
      { 'Idempotency-Key': key('forms') }
    );
    expect(formsResp.success).toBeTruthy();
    const matterId = formsResp.data.matterId;

    const list = await getJson<{ success: boolean; data: { items: Array<{ id: string; status: string }> } }>(
      page,
      `/api/organizations/${encodeURIComponent(organizationId)}/workspace/matters?status=lead&limit=10`
    );
    expect(list.success).toBeTruthy();
    expect(Array.isArray(list.data.items)).toBeTruthy();
    const found = list.data.items.some(i => i.id === matterId);
    expect(found).toBeTruthy();

    const acceptResp = await sendJson<{ success: boolean; data: { matterId: string; status: string } }>(
      page,
      `/api/organizations/${encodeURIComponent(organizationId)}/workspace/matters/${encodeURIComponent(matterId)}/accept`,
      'POST',
      undefined,
      { 'Idempotency-Key': key('accept') }
    );
    expect(acceptResp.success).toBeTruthy();
    expect(acceptResp.data.matterId).toBe(matterId);
    expect(acceptResp.data.status).toBe('open');

    const single = await getJson<{ success: boolean; data: { matter: { id: string; status: string; acceptedBy?: { userId?: string | null } | null } } }>(
      page,
      `/api/organizations/${encodeURIComponent(organizationId)}/workspace/matters/${encodeURIComponent(matterId)}`
    );
    expect(single.success).toBeTruthy();
    expect(single.data.matter.id).toBe(matterId);
    expect(single.data.matter.status).toBe('open');
  });

  test('submit lead → reject → verify archived', async ({ page }) => {
    const orgs = await getJson<{ success: boolean; data: Array<{ id: string }> }>(page, '/api/organizations/me');
    expect(orgs.success).toBeTruthy();
    expect(Array.isArray(orgs.data) && orgs.data.length > 0).toBeTruthy();
    const organizationId = orgs.data[0].id;

    const formsResp = await sendJson<{ success: boolean; data: { matterId: string } }>(
      page,
      '/api/forms',
      'POST',
      {
        organizationId,
        email: 'lead-e2e-2@example.com',
        phoneNumber: '+15557654321',
        matterDetails: 'E2E reject flow.'
      },
      { 'Idempotency-Key': key('forms2') }
    );
    expect(formsResp.success).toBeTruthy();
    expect(typeof formsResp.data?.matterId).toBe('string');
    const matterId = formsResp.data.matterId;

    const rejectResp = await sendJson<{ success: boolean; data: { matterId: string; status: string } }>(
      page,
      `/api/organizations/${encodeURIComponent(organizationId)}/workspace/matters/${encodeURIComponent(matterId)}/reject`,
      'POST',
      { reason: 'Not a fit' },
      { 'Idempotency-Key': key('reject') }
    );
    expect(rejectResp.success).toBeTruthy();
    expect(rejectResp.data.status).toBe('archived');
  });
});
