-- Blawby AI Chatbot Database Schema

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, -- This will be the ULID
  name TEXT NOT NULL,
  slug TEXT UNIQUE, -- Human-readable identifier (e.g., "north-carolina-legal-services")
  domain TEXT,
  config JSON,
  stripe_customer_id TEXT UNIQUE,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'plus', 'business', 'enterprise')),
  seats INTEGER DEFAULT 1 CHECK (seats > 0),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  user_info JSON,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  matter_id TEXT, -- Optional: link to specific matter for tighter integration
  user_id TEXT,
  content TEXT NOT NULL,
  is_user BOOLEAN NOT NULL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contact form submissions table
CREATE TABLE IF NOT EXISTS contact_forms (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  organization_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  matter_details TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'contacted', 'closed'
  assigned_lawyer TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  payment_required BOOLEAN DEFAULT FALSE,
  payment_amount INTEGER,
  intake_form JSON,
  active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lawyers table for organization member management
CREATE TABLE IF NOT EXISTS lawyers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  specialties JSON, -- Array of practice areas
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'on_leave'
  role TEXT DEFAULT 'attorney', -- 'attorney', 'paralegal', 'admin'
  hourly_rate INTEGER, -- in cents
  bar_number TEXT,
  license_state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matters table to represent legal matters
CREATE TABLE IF NOT EXISTS matters (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  matter_type TEXT NOT NULL, -- e.g., 'Family Law', 'Employment Law', etc.
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'lead', -- 'lead', 'open', 'in_progress', 'completed', 'archived'
  priority TEXT NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high' - maps from urgency
  assigned_lawyer_id TEXT,
  lead_source TEXT, -- 'website', 'referral', 'advertising', etc.
  estimated_value INTEGER, -- in cents
  billable_hours REAL DEFAULT 0,
  flat_fee INTEGER, -- in cents, if applicable
  retainer_amount INTEGER, -- in cents
  retainer_balance INTEGER DEFAULT 0, -- in cents
  statute_of_limitations DATE,
  court_jurisdiction TEXT,
  opposing_party TEXT,
  matter_number TEXT, -- Changed from case_number to matter_number
  tags JSON, -- Array of tags for categorization
  custom_fields JSON, -- Flexible metadata storage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

-- Matter events table for matter activity logs
CREATE TABLE IF NOT EXISTS matter_events (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'note', 'call', 'email', 'meeting', 'filing', 'payment', 'status_change'
  title TEXT NOT NULL,
  description TEXT,
  event_date DATETIME NOT NULL,
  created_by_lawyer_id TEXT,
  billable_time REAL DEFAULT 0, -- hours
  billing_rate INTEGER, -- in cents per hour
  amount INTEGER, -- in cents, for expenses/payments
  tags JSON, -- Array of tags
  metadata JSON, -- Additional structured data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Files table (replaces uploaded_files) - general-purpose file management
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  matter_id TEXT, -- Optional: link to specific matter
  session_id TEXT, -- Optional: link to chat session
  conversation_id TEXT, -- Optional: link to conversation
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL, -- Storage filename
  file_path TEXT, -- Full storage path
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  checksum TEXT, -- For integrity verification
  description TEXT,
  tags JSON, -- Array of tags for categorization
  access_level TEXT DEFAULT 'private', -- 'public', 'private', 'organization', 'client'
  shared_with JSON, -- Array of user IDs who have access
  version INTEGER DEFAULT 1,
  parent_file_id TEXT, -- For versioning
  is_deleted BOOLEAN DEFAULT FALSE,
  uploaded_by_lawyer_id TEXT,
  metadata JSON, -- Additional file metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

-- AI Training Data Tables --

-- Chat logs table for long-term storage of chat sessions
CREATE TABLE IF NOT EXISTS chat_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  organization_id TEXT,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matter questions table for Q&A pairs from intake
CREATE TABLE IF NOT EXISTS matter_questions (
  id TEXT PRIMARY KEY,
  matter_id TEXT,
  organization_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT DEFAULT 'ai-form', -- 'ai-form' | 'human-entry' | 'followup'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI generated summaries table for markdown matter summaries
CREATE TABLE IF NOT EXISTS ai_generated_summaries (
  id TEXT PRIMARY KEY,
  matter_id TEXT,
  summary TEXT NOT NULL,
  model_used TEXT,
  prompt_snapshot TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI feedback table for user quality ratings and intent tags
CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  organization_id TEXT,
  rating INTEGER, -- 1-5 scale
  thumbs_up BOOLEAN,
  comments TEXT,
  intent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ========================================
-- DEFAULT ORGANIZATIONS
-- ========================================
-- Default organizations are seeded via ./scripts/seed-organizations.sh
-- This keeps the schema file clean and allows for more flexible seeding

-- Payment history table for tracking all payment transactions
CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,
  payment_id TEXT UNIQUE NOT NULL,
  organization_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  amount INTEGER NOT NULL, -- in cents
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'cancelled', 'refunded'
  event_type TEXT NOT NULL, -- 'payment.completed', 'payment.failed', 'payment.refunded', etc.
  matter_type TEXT,
  matter_description TEXT,
  invoice_url TEXT,
  metadata JSON, -- Additional payment data
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Organization API tokens table for secure token storage
CREATE TABLE IF NOT EXISTS organization_api_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  token_name TEXT NOT NULL, -- Human-readable name for the token
  token_hash TEXT NOT NULL, -- SHA-256 hash of the actual token
  permissions JSON, -- Array of permissions this token has
  active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME, -- Optional expiration date
  created_by TEXT, -- Who created this token
  notes TEXT
);

-- Chat sessions table for session management
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
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_team_state ON chat_sessions(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_active ON chat_sessions(last_active);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_token_hash_organization ON chat_sessions(token_hash, organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

-- Chat messages table for storing conversation messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  token_count INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_organization ON chat_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);

-- Session summaries table for AI-generated summaries
CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  token_count INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id, created_at DESC);

-- Session audit events table for activity tracking
CREATE TABLE IF NOT EXISTS session_audit_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  payload TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_audit_events_session ON session_audit_events(session_id, created_at);

-- Sample data removed - use seed scripts for development data

-- ========================================
-- BETTER AUTH TABLES (SECURE SCHEMA)
-- ========================================
-- Note: Geolocation and IP detection features are disabled by default
-- Set ENABLE_AUTH_GEOLOCATION=true and ENABLE_AUTH_IP_DETECTION=true to enable

-- Users table for Better Auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER DEFAULT 0 NOT NULL,
  image TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  organization_id TEXT,
  stripe_customer_id TEXT UNIQUE,
  role TEXT,
  phone TEXT
);

-- Organization members for Better Auth multi-tenancy
CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'owner', 'admin', 'attorney', 'paralegal'
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  UNIQUE(organization_id, user_id)
);

-- Invitations for organization member onboarding
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
  invited_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
);

-- Stripe subscription table managed by Better Auth Stripe plugin
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  reference_id TEXT NOT NULL, -- References organizations.id for organization-level subscriptions
  stripe_subscription_id TEXT UNIQUE,
  status TEXT DEFAULT 'incomplete' NOT NULL CHECK(status IN ('incomplete', 'active', 'canceled', 'past_due', 'trialing', 'paused')),
  period_start INTEGER,
  period_end INTEGER,
  trial_start INTEGER,
  trial_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0 NOT NULL,
  seats INTEGER CHECK(seats > 0),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  -- Foreign key constraints for data integrity
  FOREIGN KEY (reference_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_reference_id ON subscriptions(reference_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
-- Note: stripe_subscription_id already has UNIQUE constraint in table definition

-- Organization events table for audit logging
CREATE TABLE IF NOT EXISTS organization_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  metadata JSON,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
);

-- Sessions table for Better Auth
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL
);

-- Accounts table for OAuth providers (SECURE)
-- OAuth provider data only, tokens should be encrypted at application level
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- OAuth tokens (should be encrypted at application level)
  access_token TEXT, -- Note: Should be encrypted before storage
  refresh_token TEXT, -- Note: Should be encrypted before storage
  id_token TEXT, -- Note: Should be encrypted before storage
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  -- Critical: Prevent duplicate provider accounts
  UNIQUE(provider_id, account_id),
  -- Also ensure one account per provider per user
  UNIQUE(provider_id, user_id)
);

-- Verifications table for email verification, password reset, etc.
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
);

-- Create indexes for Better Auth tables
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email, email_verified);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id_unique ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider_id, account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_provider_user ON accounts(provider_id, user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_identifier ON verifications(identifier);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verifications_value ON verifications(value);
CREATE INDEX IF NOT EXISTS idx_verifications_expires_at ON verifications(expires_at);

-- Create indexes for organization membership tables
CREATE INDEX IF NOT EXISTS idx_member_org ON member(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_user ON member(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_organization ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_events_org_created ON organization_events(organization_id, created_at DESC);

-- Create indexes for user_id columns
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_matters_user ON matters(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);

-- Create a view for secure user authentication data
-- This view can be used by the application to safely access user auth data
CREATE VIEW IF NOT EXISTS user_auth_summary AS
SELECT
  u.id,
  u.email,
  u.email_verified,
  u.name,
  u.created_at,
  -- Count OAuth providers
  COUNT(DISTINCT a.provider_id) as oauth_provider_count,
  -- Check if user has local password
  MAX(CASE WHEN a.password IS NOT NULL THEN 1 ELSE 0 END) as has_local_password
FROM users u
LEFT JOIN accounts a ON u.id = a.user_id
GROUP BY u.id, u.email, u.email_verified, u.name, u.created_at;

