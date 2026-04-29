-- ============================================================
-- Migration 008: Add metadata column to messages
-- ============================================================

ALTER TABLE messages ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
