import { beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import type { D1Database } from '@cloudflare/workers-types';

process.env.NODE_ENV = 'test';

beforeAll(async () => {
  // Ensure Better Auth secret is configured for tests
  // This forces Better Auth to use D1 instead of the memory adapter
  
  // Try to get the secret from environment (should be loaded from .dev.vars)
  let secret = (env as any).BETTER_AUTH_SECRET;
  
  // If no secret is available, generate a test-only secret
  // This ensures tests run while maintaining security
  if (!secret) {
    console.warn('⚠️  BETTER_AUTH_SECRET not found in environment, generating test secret');
    // Generate a cryptographically secure test secret (32+ characters)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    secret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    
    // Set it in the environment for this test run
    Object.assign(env, { BETTER_AUTH_SECRET: secret });
  }
  
  if (!secret || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET must be at least 32 characters for security. ' +
      'Current length: ' + (secret?.length || 0)
    );
  }
  
  console.log('✅ Better Auth configured for tests with D1 (not memory adapter)');

  // Initialize database schema for tests
  try {
    const db = (env as { DB: D1Database }).DB;
    
    // Create organizations table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        domain TEXT,
        config JSON,
        stripe_customer_id TEXT UNIQUE,
        subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'business', 'enterprise')),
        seats INTEGER DEFAULT 1 CHECK (seats > 0),
        is_personal INTEGER DEFAULT 0 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Create chat_sessions table
    await db.prepare(`
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

    // Create Better Auth users table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER DEFAULT 0 NOT NULL,
        image TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        organization_id TEXT,
        stripe_customer_id TEXT UNIQUE,
        role TEXT,
        phone TEXT,
        bio TEXT,
        secondary_phone_encrypted TEXT,
        address_street_encrypted TEXT,
        address_city_encrypted TEXT,
        address_state_encrypted TEXT,
        address_zip_encrypted TEXT,
        address_country_encrypted TEXT,
        preferred_contact_method TEXT,
        theme TEXT DEFAULT 'system',
        accent_color TEXT DEFAULT 'default',
        font_size TEXT DEFAULT 'medium',
        language TEXT DEFAULT 'en',
        spoken_language TEXT DEFAULT 'en',
        country TEXT DEFAULT 'us',
        timezone TEXT,
        date_format TEXT DEFAULT 'MM/DD/YYYY',
        time_format TEXT DEFAULT '12-hour',
        auto_save_conversations INTEGER DEFAULT 1,
        typing_indicators INTEGER DEFAULT 1,
        notification_responses_push INTEGER DEFAULT 1,
        notification_tasks_push INTEGER DEFAULT 1,
        notification_tasks_email INTEGER DEFAULT 1,
        notification_messaging_push INTEGER DEFAULT 1,
        receive_feedback_emails INTEGER DEFAULT 0,
        marketing_emails INTEGER DEFAULT 0,
        security_alerts INTEGER DEFAULT 1,
        two_factor_enabled INTEGER DEFAULT 0,
        email_notifications INTEGER DEFAULT 1,
        login_alerts INTEGER DEFAULT 1,
        session_timeout INTEGER DEFAULT 604800,
        last_password_change INTEGER,
        selected_domain TEXT,
        linkedin_url TEXT,
        github_url TEXT,
        custom_domains TEXT,
        onboarding_completed INTEGER DEFAULT 0,
        onboarding_data TEXT,
        last_login_method TEXT,
        pii_consent_given INTEGER DEFAULT 0,
        pii_consent_date INTEGER,
        data_retention_consent INTEGER DEFAULT 0,
        marketing_consent INTEGER DEFAULT 0,
        data_processing_consent INTEGER DEFAULT 0,
        data_retention_expiry INTEGER,
        last_data_access INTEGER,
        data_deletion_requested INTEGER DEFAULT 0,
        data_deletion_date INTEGER
      )
    `).run();

    // Create Better Auth sessions table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL,
        active_organization_id TEXT
      )
    `).run();

    // Create Better Auth accounts table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        UNIQUE(provider_id, account_id),
        UNIQUE(provider_id, user_id)
      )
    `).run();

    // Create Better Auth verifications table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
      )
    `).run();

    // Create members table (if not already exists)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        UNIQUE(organization_id, user_id)
      )
    `).run();

    // Create subscriptions table (if not already exists)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        stripe_subscription_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        status TEXT DEFAULT 'incomplete' NOT NULL CHECK(status IN ('incomplete', 'incomplete_expired', 'active', 'canceled', 'past_due', 'unpaid', 'trialing')),
        period_start INTEGER,
        period_end INTEGER,
        trial_start INTEGER,
        trial_end INTEGER,
        cancel_at_period_end INTEGER DEFAULT 0 NOT NULL,
        seats INTEGER CHECK(seats > 0),
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `).run();
  } catch (error) {
    console.error('CRITICAL: Failed to initialize test database schema. Tests cannot proceed without a valid database schema.');
    console.error('Original error:', error);
    throw new Error(`Database schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});
