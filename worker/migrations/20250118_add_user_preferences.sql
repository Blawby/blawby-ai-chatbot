-- Add user preference columns to users table
-- Migration: Add user preferences and settings
-- Date: 2025-01-18

-- Profile Information
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN secondary_phone TEXT;
ALTER TABLE users ADD COLUMN address_street TEXT;
ALTER TABLE users ADD COLUMN address_city TEXT;
ALTER TABLE users ADD COLUMN address_state TEXT;
ALTER TABLE users ADD COLUMN address_zip TEXT;
ALTER TABLE users ADD COLUMN address_country TEXT;
ALTER TABLE users ADD COLUMN preferred_contact_method TEXT;

-- App Preferences
ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'system';
ALTER TABLE users ADD COLUMN accent_color TEXT DEFAULT 'default';
ALTER TABLE users ADD COLUMN font_size TEXT DEFAULT 'medium';
-- Interface language: Controls UI language (en, es, fr, de, etc.)
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
-- Spoken language: User's primary spoken language for AI interactions and content generation
ALTER TABLE users ADD COLUMN spoken_language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN country TEXT DEFAULT 'us';
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN date_format TEXT DEFAULT 'MM/DD/YYYY';
ALTER TABLE users ADD COLUMN time_format TEXT DEFAULT '12-hour';

-- Chat Preferences
ALTER TABLE users ADD COLUMN auto_save_conversations INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN typing_indicators INTEGER DEFAULT 1;

-- Notification Settings
ALTER TABLE users ADD COLUMN notification_responses_push INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN notification_tasks_push INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN notification_tasks_email INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN notification_messaging_push INTEGER DEFAULT 1;

-- Email Settings
ALTER TABLE users ADD COLUMN receive_feedback_emails INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN marketing_emails INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN security_alerts INTEGER DEFAULT 1;

-- Security Settings
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN login_alerts INTEGER DEFAULT 1;
-- Session timeout in seconds (604800 = 7 days)
ALTER TABLE users ADD COLUMN session_timeout INTEGER DEFAULT 604800;
-- Last password change timestamp (Unix timestamp)
ALTER TABLE users ADD COLUMN last_password_change INTEGER;

-- Links
ALTER TABLE users ADD COLUMN selected_domain TEXT;
ALTER TABLE users ADD COLUMN linkedin_url TEXT;
ALTER TABLE users ADD COLUMN github_url TEXT;

-- Onboarding
ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN onboarding_data TEXT;

