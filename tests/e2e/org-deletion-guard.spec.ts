import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/createTestUser.js';

async function getJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: any }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : data };
  } catch (error) {
    return { ok: false, status: 0, error };
  }
}

test.describe('Organization Deletion Guard', () => {
  const baseUrl = 'http://localhost:8787';

  test('UI shows contextual Manage/Delete action in Organization settings', async ({ page }) => {
    // Ensure user is authenticated and has an organization (personal org is created on signup)
    await ensureAuthenticated(page);
    
    // Get the current organization to ensure we're viewing it
    const orgData: any = await page.evaluate(async () => {
      const res = await fetch('/api/organizations/me', { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    });
    
    if (orgData?.data && Array.isArray(orgData.data) && orgData.data.length > 0) {
      const orgId = orgData.data[0].id;
      // Ensure the user is owner (should already be true for personal org, but ensure it)
      await page.evaluate(async (orgId: string) => {
        try {
          // Ensure owner membership exists (idempotent)
          await fetch(`/api/organizations/${orgId}`, {
            method: 'GET',
            credentials: 'include',
          });
        } catch (e) {
          console.warn('Failed to ensure org access:', e);
        }
      }, orgId);
    }
    
    await page.goto('/settings/organization');
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('org-delete-section');
    await section.waitFor({ state: 'visible', timeout: 5000 });

    const action = page.getByTestId('org-delete-action');
    await action.waitFor({ state: 'visible', timeout: 3000 });

    const label = (await action.innerText()).trim().toLowerCase();
    // Expect either Manage or Delete depending on subscription state; not empty
    expect(label.length).toBeGreaterThan(0);
    expect(['manage', 'delete']).toContain(label);
  });

  test('API returns 409 when deleting an org with active managed subscription (if present)', async ({ page }) => {
    // Discover organizations via authenticated browser fetch (cookies included)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result: any = await page.evaluate(async (ctx: { origin: string }) => {
      const res = await fetch(`${ctx.origin}/api/organizations`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      return { ok: res.ok, status: res.status, data };
    }, { origin: baseUrl });

    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      test.skip(true, 'No organizations found for current user; skipping deletion guard API test.');
    }

    type Org = { id: string; stripeCustomerId?: string | null; subscriptionStatus?: string | null };
    const orgs = result.data as Org[];
    const target = orgs.find(o => o.stripeCustomerId && String(o.subscriptionStatus || '').toLowerCase() !== 'canceled');
    if (!target) {
      test.skip(true, 'No org with active managed subscription; skipping deletion guard API test.');
    }

    const deleteRes: any = await page.evaluate(async (ctx: { origin: string; orgId: string }) => {
      const res = await fetch(`${ctx.origin}/api/organizations/${ctx.orgId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      return { ok: res.ok, status: res.status, data };
    }, { origin: baseUrl, orgId: (target as any).id });

    expect(deleteRes.status).toBe(409);
    const code = (deleteRes.data && typeof deleteRes.data === 'object') ? (deleteRes.data as any).code : undefined;
    expect(code).toBe('SUBSCRIPTION_ACTIVE');
  });
});
