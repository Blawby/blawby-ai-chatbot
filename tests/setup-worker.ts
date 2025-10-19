import { beforeAll } from 'vitest';
import { env } from '@cloudflare/vitest-pool-workers/testing';

process.env.NODE_ENV = 'test';

beforeAll(async () => {
  // Initialize database schema for tests
  try {
    // Create organizations table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        domain TEXT,
        config JSON,
        subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'business', 'enterprise')),
        seats INTEGER DEFAULT 1 CHECK (seats > 0),
        is_personal INTEGER DEFAULT 0 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create chat_sessions table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT,
        token_hash TEXT,
        state TEXT NOT NULL DEFAULT 'active',
        status_reason TEXT,
        retention_horizon_days INTEGER NOT NULL DEFAULT 180,
        is_hold INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        UNIQUE(id, organization_id)
      )
    `).run();

    // Create usage_quotas table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS usage_quotas (
        organization_id TEXT NOT NULL,
        period TEXT NOT NULL,
        messages_used INTEGER NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
        messages_limit INTEGER NOT NULL DEFAULT -1 CHECK (messages_limit >= -1),
        override_messages INTEGER,
        files_used INTEGER NOT NULL DEFAULT 0 CHECK (files_used >= 0),
        files_limit INTEGER NOT NULL DEFAULT -1 CHECK (files_limit >= -1),
        override_files INTEGER,
        last_updated INTEGER NOT NULL,
        PRIMARY KEY (organization_id, period)
      )
    `).run();
  } catch (error) {
    console.warn('Failed to initialize test database schema:', error);
  }
});
