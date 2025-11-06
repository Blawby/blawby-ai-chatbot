import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/createTestUser.js';

test.describe('Organization Deletion Guard', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('API returns 409 when deleting an org with active managed subscription (if present)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const origin = new URL(page.url()).origin;

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
    }, { origin });

    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      test.skip(true, 'No organizations found for current user; skipping deletion guard API test.');
    }

    type Org = { id: string; stripeCustomerId?: string | null; subscriptionStatus?: string | null };
    const orgs = result.data as Org[];
    const target = orgs.find(o => {
      const status = String(o.subscriptionStatus || '').toLowerCase();
      return o.stripeCustomerId && !['canceled', 'none'].includes(status);
    });
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
    }, { origin, orgId: (target as any).id });

    expect(deleteRes.status).toBe(409);
    const code = (deleteRes.data && typeof deleteRes.data === 'object') ? (deleteRes.data as any).code : undefined;
    expect(code).toBe('SUBSCRIPTION_ACTIVE');
  });
});
