-- ============================================================
-- Migration 001: Update role values from 'member' → 'user'
-- ============================================================
-- Applies to: SpokesBot — backend/supabase/schema.sql (v3)
-- Run this once in the Supabase SQL editor after schema.sql
-- has been applied.
--
-- Note: uses DROP CONSTRAINT IF EXISTS so it is safe whether or not a prior
-- CHECK constraint exists on the table.
--
-- Steps:
--   1. Migrate any existing 'member' rows to 'user'
--   2. Drop + recreate the CHECK constraint
--   3. Update the column DEFAULT
--   4. Re-declare all three helper functions (idempotent)
-- ============================================================

BEGIN;

-- ── 1. Migrate existing data ──────────────────────────────────────────────────
-- Must run BEFORE the old constraint is dropped, not after.
-- Safe no-op if no 'member' rows exist yet.
UPDATE user_organizations
SET    role = 'user'
WHERE  role = 'member';

-- ── 2. Replace the CHECK constraint ──────────────────────────────────────────
-- IF EXISTS handles the case where no prior constraint was applied.
ALTER TABLE user_organizations
    DROP CONSTRAINT IF EXISTS user_organizations_role_check;

ALTER TABLE user_organizations
    ADD CONSTRAINT user_organizations_role_check
    CHECK (role IN ('admin', 'user'));

-- ── 3. Update the column default ─────────────────────────────────────────────
ALTER TABLE user_organizations
    ALTER COLUMN role SET DEFAULT 'user';

-- ── 4. Re-declare helper functions (idempotent, SECURITY DEFINER) ─────────────
-- SECURITY DEFINER means these functions execute with the privileges of their
-- owner (postgres), not the calling user. This is required so RLS policies can
-- call them without granting direct table access to anon/authenticated roles.

-- Returns the org_id the current JWT user belongs to.
-- Used by every RLS policy that needs tenant isolation.
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT organization_id
    FROM   user_organizations
    WHERE  user_id = auth.uid()
    LIMIT  1;
$$;

-- Returns 'admin' or 'user' for the current JWT user within their org.
-- Calls get_my_org_id() so both org + role are resolved from a single membership row.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role
    FROM   user_organizations
    WHERE  user_id         = auth.uid()
      AND  organization_id = get_my_org_id()
    LIMIT  1;
$$;

-- Boolean convenience wrapper used by INSERT/UPDATE/DELETE RLS policies.
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT get_my_role() = 'admin';
$$;

COMMIT;
