-- ============================================================
-- Migration 002: Rename dataset status 'ready' → 'completed'
-- ============================================================
-- Applies after migration 001.
-- Aligns the DB constraint with the upload.py status lifecycle:
--   queued → processing → completed | failed
-- ============================================================

BEGIN;

-- ── 1. Migrate any existing 'ready' rows ─────────────────────────────────────
UPDATE datasets
SET    status = 'completed'
WHERE  status = 'ready';

-- ── 2. Replace the CHECK constraint ──────────────────────────────────────────
ALTER TABLE datasets
    DROP CONSTRAINT IF EXISTS datasets_status_check;

ALTER TABLE datasets
    ADD CONSTRAINT datasets_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

COMMIT;
