import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { D1Database } from '@cloudflare/workers-types';

describe('DB schema - subscriptions.stripe_customer_id allows NULL', () => {
  it('inserts a subscription row with NULL stripe_customer_id', async () => {
    const db = (env as { DB: D1Database }).DB;

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        subscription_tier TEXT DEFAULT 'free'
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        status TEXT DEFAULT 'incomplete' NOT NULL,
        period_start INTEGER,
        period_end INTEGER,
        seats INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        FOREIGN KEY(reference_id) REFERENCES organizations(id) ON DELETE RESTRICT
      )
    `).run();

    // Seed minimal org referenced by subscription
    await db.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug, subscription_tier) VALUES (?, ?, ?, ?)`).bind(
      'org_test_nullable', 'Test Org', 'test-org-nullable', 'free'
    ).run();

    // Generate unique IDs to avoid PK/UNIQUE constraint violations on repeated runs
    const subId = (globalThis.crypto?.randomUUID?.() ?? `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const stripeSubscriptionId = (globalThis.crypto?.randomUUID?.() ?? `stripe_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    // Perform insert with NULL stripe_customer_id explicitly
    const res = await db.prepare(`
      INSERT INTO subscriptions (
        id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status, period_start, period_end, seats, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
    `).bind(
      subId,
      'business',
      'org_test_nullable',
      stripeSubscriptionId,
      null, // stripe_customer_id should accept NULL
      'active',
      1700000000,
      1702592000,
      5
    ).run();

    expect(res.success).toBe(true);

    const row = await db.prepare(`SELECT stripe_customer_id FROM subscriptions WHERE id = ?`).bind(subId).first<{ stripe_customer_id: string | null }>();
    expect(row).toBeTruthy();
    expect(row?.stripe_customer_id).toBeNull();
  });
});


