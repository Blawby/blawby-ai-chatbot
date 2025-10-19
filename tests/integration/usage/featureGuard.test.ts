import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '@cloudflare/vitest-pool-workers/testing';
import { requireFeature } from '../../../worker/middleware/featureGuard.js';
import { UsageService } from '../../../worker/services/UsageService.js';
import * as authModule from '../../../worker/middleware/auth.js';
import type { Env } from '../../../worker/types.js';

const optionalAuthSpy = vi.spyOn(authModule, 'optionalAuth');

const ORG_ID = 'org-feature-guard';
const PERSONAL_ORG_ID = 'org-personal';
const NOW = Date.now();

async function seedOrganization(options: { id: string; slug: string; tier: 'free' | 'plus' | 'business' | 'enterprise'; isPersonal?: boolean }) {
  const { id, slug, tier, isPersonal = false } = options;
  await env.DB.prepare(`
    INSERT INTO organizations (
      id, name, slug, domain, config,
      subscription_tier, seats, is_personal,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    `${slug} Org`,
    slug,
    `${slug}.example.com`,
    JSON.stringify({}),
    tier,
    1,
    isPersonal ? 1 : 0,
    NOW,
    NOW
  ).run();
}

async function seedUsage(
  organizationId: string,
  { metric = 'messages', used, limit }: { metric?: 'messages' | 'files'; used: number; limit: number }
) {
  const period = UsageService.getCurrentPeriod();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO usage_quotas (
      organization_id,
      period,
      messages_used,
      messages_limit,
      override_messages,
      files_used,
      files_limit,
      override_files,
      last_updated
    )
    VALUES (?, ?, 0, -1, NULL, 0, -1, NULL, ?)
  `).bind(organizationId, period, now).run();

  if (metric === 'messages') {
    await env.DB.prepare(`
      UPDATE usage_quotas
         SET messages_used = ?,
             messages_limit = ?,
             override_messages = ?,
             last_updated = ?
       WHERE organization_id = ? AND period = ?
    `).bind(used, limit, limit, now, organizationId, period).run();
  } else {
    await env.DB.prepare(`
      UPDATE usage_quotas
         SET files_used = ?,
             files_limit = ?,
             override_files = ?,
             last_updated = ?
       WHERE organization_id = ? AND period = ?
    `).bind(used, limit, limit, now, organizationId, period).run();
  }
}

describe('Feature Guard - quota enforcement', () => {
  beforeEach(async () => {
    optionalAuthSpy.mockResolvedValue(null);
    
    // Clear KV namespace to prevent stale usage snapshots
    try {
      const kvKeys = await env.USAGE_QUOTAS.list();
      if (kvKeys.keys.length > 0) {
        await Promise.all(kvKeys.keys.map(key => env.USAGE_QUOTAS.delete(key.name)));
      }
    } catch (error) {
      console.warn('Failed to clear USAGE_QUOTAS KV namespace:', error);
    }
    
    await env.DB.prepare('DELETE FROM chat_sessions').run();
    await env.DB.prepare('DELETE FROM usage_quotas').run();
    await env.DB.prepare('DELETE FROM organizations').run();

    await seedOrganization({ id: ORG_ID, slug: 'feature-guard', tier: 'free' });
    await seedOrganization({ id: PERSONAL_ORG_ID, slug: 'personal', tier: 'business', isPersonal: true });
  });

  afterEach(() => {
    optionalAuthSpy.mockReset();
  });

  it('allows requests when usage is below the limit', async () => {
    await seedUsage(ORG_ID, { metric: 'messages', used: 1, limit: 2 });

    const result = await requireFeature(
      new Request('https://test.local/api/protected'),
      env as unknown as Env,
      {
        feature: 'chat',
        allowAnonymous: true,
        quotaMetric: 'messages',
      },
      {
        organizationId: ORG_ID,
      }
    );

    expect(result.organizationId).toBe(ORG_ID);
    expect(result.isAnonymous).toBe(true);
  });

  it('blocks requests when usage has reached the limit', async () => {
    await seedUsage(ORG_ID, { metric: 'messages', used: 2, limit: 2 });

    await expect(
      requireFeature(
        new Request('https://test.local/api/protected'),
        env as unknown as Env,
        {
          feature: 'chat',
          allowAnonymous: true,
          quotaMetric: 'messages',
        },
        {
          organizationId: ORG_ID,
        }
      )
    ).rejects.toMatchObject({ status: 402 });
  });

  it('blocks personal organizations when requireNonPersonal is true', async () => {
    await seedUsage(PERSONAL_ORG_ID, { metric: 'files', used: 0, limit: -1 });

    await expect(
      requireFeature(
        new Request('https://test.local/api/protected'),
        env as unknown as Env,
        {
          feature: 'files',
          allowAnonymous: true,
          quotaMetric: 'files',
          requireNonPersonal: true,
        },
        { organizationId: PERSONAL_ORG_ID }
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it('blocks file requests when file usage exceeds the limit', async () => {
    await seedUsage(ORG_ID, { metric: 'files', used: 2, limit: 2 });

    await expect(
      requireFeature(
        new Request('https://test.local/api/protected'),
        env as unknown as Env,
        {
          feature: 'files',
          allowAnonymous: true,
          quotaMetric: 'files',
        },
        { organizationId: ORG_ID }
      )
    ).rejects.toMatchObject({ status: 402 });
  });

  it('enforces minimum tier requirements', async () => {
    await seedUsage(ORG_ID, { metric: 'messages', used: 0, limit: -1 });

    await expect(
      requireFeature(
        new Request('https://test.local/api/protected'),
        env as unknown as Env,
        {
          feature: 'api',
          allowAnonymous: true,
          minTier: ['business'],
        },
        { organizationId: ORG_ID }
      )
    ).rejects.toMatchObject({ status: 402 });
  });
});
