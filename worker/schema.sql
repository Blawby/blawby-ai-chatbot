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
  is_personal INTEGER DEFAULT 0 NOT NULL,
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
-- DEFAULT ORGANIZATION SEEDING
-- ========================================
-- The critical public/default organization `blawby-ai` (ID: 01K0TNGNKTM4Q0AG0XF0A8ST0Q)
-- is seeded via D1 migration: 20250129_seed_blawby_ai_org.sql
-- This org MUST exist across all environments for public chat/Stripe defaults.

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
  
  -- Profile Information
  bio TEXT,
  -- TODO: These fields are named *_encrypted but not actually encrypted yet
  -- TODO: Integrate PIIEncryptionService to encrypt/decrypt these fields
  secondary_phone_encrypted TEXT, -- Encrypted PII
  address_street_encrypted TEXT, -- Encrypted PII
  address_city_encrypted TEXT, -- Encrypted PII
  address_state_encrypted TEXT, -- Encrypted PII
  address_zip_encrypted TEXT, -- Encrypted PII
  address_country_encrypted TEXT, -- Encrypted PII
  preferred_contact_method TEXT,
  
  -- App Preferences
  theme TEXT DEFAULT 'system',
  accent_color TEXT DEFAULT 'default',
  font_size TEXT DEFAULT 'medium',
  -- Interface language: Controls UI language (en, es, fr, de, etc.)
  language TEXT DEFAULT 'en',
  -- Spoken language: User's primary spoken language for AI interactions and content generation
  spoken_language TEXT DEFAULT 'en',
  country TEXT DEFAULT 'us',
  timezone TEXT,
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  time_format TEXT DEFAULT '12-hour',
  
  -- Chat Preferences
  auto_save_conversations INTEGER DEFAULT 1,
  typing_indicators INTEGER DEFAULT 1,
  
  -- Notification Settings
  notification_responses_push INTEGER DEFAULT 1,
  notification_tasks_push INTEGER DEFAULT 1,
  notification_tasks_email INTEGER DEFAULT 1,
  notification_messaging_push INTEGER DEFAULT 1,
  
  -- Email Settings
  receive_feedback_emails INTEGER DEFAULT 0,
  marketing_emails INTEGER DEFAULT 0,
  security_alerts INTEGER DEFAULT 1,
  
  -- Security Settings
  two_factor_enabled INTEGER DEFAULT 0,
  email_notifications INTEGER DEFAULT 1,
  login_alerts INTEGER DEFAULT 1,
  -- Session timeout in seconds (604800 = 7 days)
  session_timeout INTEGER DEFAULT 604800,
  -- Last password change timestamp (Unix timestamp)
  last_password_change INTEGER,
  
  -- Links
  selected_domain TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  custom_domains TEXT, -- JSON string for custom domains array
  
  -- Onboarding
  onboarding_completed INTEGER DEFAULT 0,
  onboarding_data TEXT,
  
  -- Better Auth lastLoginMethod plugin
  last_login_method TEXT,
  
  -- PII Compliance & Consent
  pii_consent_given INTEGER DEFAULT 0,
  pii_consent_date INTEGER,
  data_retention_consent INTEGER DEFAULT 0,
  marketing_consent INTEGER DEFAULT 0,
  data_processing_consent INTEGER DEFAULT 0,
  
  -- Data Retention & Deletion
  data_retention_expiry INTEGER,
  last_data_access INTEGER,
  data_deletion_requested INTEGER DEFAULT 0,
  data_deletion_date INTEGER
);

-- PII Access Audit Log - Enhanced with encryption, retention, and compliance
CREATE TABLE IF NOT EXISTS pii_access_audit (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Access type with enum constraint
  access_type TEXT NOT NULL CHECK (access_type IN ('read', 'update', 'delete', 'export')),
  
  pii_fields TEXT NOT NULL, -- JSON array of accessed fields
  access_reason TEXT, -- Business justification
  accessed_by TEXT NOT NULL, -- User ID or system identifier - must be explicitly provided
  
  -- Encrypted PII fields with metadata
  -- Key versioning: v1, v2, etc. - see ENCRYPTION_KEY_MANAGEMENT.md for details
  ip_address_encrypted TEXT, -- Encrypted IP address
  ip_address_key_version TEXT, -- Encryption key version (e.g., 'v1')
  ip_address_hash TEXT, -- SHA-256 hash for lookups without decryption
  
  user_agent_encrypted TEXT, -- Encrypted user agent
  user_agent_key_version TEXT, -- Encryption key version (e.g., 'v1')
  user_agent_hash TEXT, -- SHA-256 hash for lookups without decryption
  
  -- Retention metadata
  retention_expires_at INTEGER, -- When this log should be deleted
  deleted_at INTEGER, -- Soft deletion timestamp
  retention_policy_id TEXT, -- Reference to retention policy applied
  
  -- Consent tracking
  consent_id TEXT, -- Reference to consent record
  legal_basis TEXT CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 
                                          'vital_interests', 'public_task', 'legitimate_interest')), -- Legal basis for processing (GDPR Article 6)
  consent_version TEXT, -- Version of consent at time of access
  
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Consistency constraints for encrypted fields (all-or-nothing)
  CHECK ((ip_address_encrypted IS NULL AND ip_address_hash IS NULL AND ip_address_key_version IS NULL) OR
         (ip_address_encrypted IS NOT NULL AND ip_address_hash IS NOT NULL AND ip_address_key_version IS NOT NULL)),
  CHECK ((user_agent_encrypted IS NULL AND user_agent_hash IS NULL AND user_agent_key_version IS NULL) OR
         (user_agent_encrypted IS NOT NULL AND user_agent_hash IS NOT NULL AND user_agent_key_version IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS pii_audit_user_idx ON pii_access_audit(user_id);
CREATE INDEX IF NOT EXISTS pii_audit_timestamp_idx ON pii_access_audit(timestamp);
CREATE INDEX IF NOT EXISTS pii_audit_org_idx ON pii_access_audit(organization_id);
CREATE INDEX IF NOT EXISTS pii_audit_retention_idx ON pii_access_audit(retention_expires_at);
CREATE INDEX IF NOT EXISTS pii_audit_deleted_idx ON pii_access_audit(deleted_at);
CREATE INDEX IF NOT EXISTS pii_audit_consent_idx ON pii_access_audit(consent_id);
CREATE INDEX IF NOT EXISTS pii_audit_ip_hash_idx ON pii_access_audit(ip_address_hash);
CREATE INDEX IF NOT EXISTS pii_audit_user_agent_hash_idx ON pii_access_audit(user_agent_hash);

-- Organization members for Better Auth multi-tenancy
CREATE TABLE IF NOT EXISTS members (
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
  stripe_customer_id TEXT,
  status TEXT DEFAULT 'incomplete' NOT NULL CHECK(status IN ('incomplete', 'incomplete_expired', 'active', 'canceled', 'past_due', 'unpaid', 'trialing')),
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
  user_id TEXT NOT NULL,
  active_organization_id TEXT,
  -- Foreign key constraint for active_organization_id
  FOREIGN KEY (active_organization_id) REFERENCES organizations(id) ON DELETE SET NULL
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
  value TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_verifications_expires_at ON verifications(expires_at);

-- Create indexes for organization membership tables
CREATE INDEX IF NOT EXISTS idx_member_org ON members(organization_id);
CREATE INDEX IF NOT EXISTS idx_member_user ON members(user_id);
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

-- ========================================
-- TRIGGERS FOR AUTOMATIC UPDATED_AT TIMESTAMPS
-- ========================================
-- These triggers ensure that updated_at columns are automatically updated
-- when rows are modified, using the same millisecond timestamp format
-- as the auth schema defaults: (strftime('%s', 'now') * 1000)

-- Trigger for users table
CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Trigger for sessions table
CREATE TRIGGER IF NOT EXISTS trigger_sessions_updated_at
  AFTER UPDATE ON sessions
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE sessions SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Trigger for accounts table
CREATE TRIGGER IF NOT EXISTS trigger_accounts_updated_at
  AFTER UPDATE ON accounts
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE accounts SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Trigger for verifications table
CREATE TRIGGER IF NOT EXISTS trigger_verifications_updated_at
  AFTER UPDATE ON verifications
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE verifications SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Trigger for organizations table
CREATE TRIGGER IF NOT EXISTS trigger_organizations_updated_at
  AFTER UPDATE ON organizations
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE organizations SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Trigger for subscriptions table
CREATE TRIGGER IF NOT EXISTS trigger_subscriptions_updated_at
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE subscriptions SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;

-- Conversations feature schema
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  matter_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('ai','human','mixed')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','archived')),
  title TEXT,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (matter_id) REFERENCES matters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_status
  ON conversations(organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_matter
  ON conversations(matter_id);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client','paralegal','attorney','admin','owner')),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  is_muted INTEGER DEFAULT 0,
  last_read_message_id TEXT,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_participants_user_org
  ON conversation_participants(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_participants_conv
  ON conversation_participants(conversation_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  sender_user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','system','file','matter_update')),
  reply_to_message_id TEXT,
  metadata TEXT,
  is_edited INTEGER DEFAULT 0,
  edited_at DATETIME,
  is_deleted INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON conversation_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_org
  ON conversation_messages(sender_user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON conversation_messages(reply_to_message_id);

CREATE TABLE IF NOT EXISTS conversation_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_conv
  ON conversation_files(conversation_id);

-- Existing table index enhancements
CREATE INDEX IF NOT EXISTS idx_files_org_session ON files(organization_id, session_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_session_created
  ON chat_messages(organization_id, session_id, created_at);
