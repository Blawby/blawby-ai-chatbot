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
        period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND CAST(SUBSTR(period, 6, 2) AS INTEGER) BETWEEN 1 AND 12),
        messages_used INTEGER NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
        messages_limit INTEGER NOT NULL DEFAULT -1 CHECK (messages_limit >= -1),
        override_messages INTEGER CHECK (override_messages IS NULL OR override_messages >= -1),
        files_used INTEGER NOT NULL DEFAULT 0 CHECK (files_used >= 0),
        files_limit INTEGER NOT NULL DEFAULT -1 CHECK (files_limit >= -1),
        override_files INTEGER CHECK (override_files IS NULL OR override_files >= -1),
        last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (organization_id, period),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `).run();

    // Create users table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create members table
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        UNIQUE(organization_id, user_id)
      )
    `).run();

    // Create indexes for usage_quotas
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_usage_quotas_period ON usage_quotas(period)
    `).run();
    
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_usage_quotas_org_period ON usage_quotas(organization_id, period)
    `).run();

    // Create indexes for members
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_member_org ON members(organization_id)
    `).run();
    
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_member_user ON members(user_id)
    `).run();
  } catch (error) {
    console.error('CRITICAL: Failed to initialize test database schema. Tests cannot proceed without a valid database schema.');
    console.error('Original error:', error);
    throw new Error(`Database schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});
