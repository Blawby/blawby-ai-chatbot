-- Migration: Drop legacy notifications table
-- Date: 2026-03-10
-- Description: Remove in-app notifications storage; keep destinations + delivery results.

DROP TABLE IF EXISTS notifications;
