-- ============================================================
-- Migration 003: Secure the datasets Supabase Storage bucket
-- ============================================================
-- Applies after migration 002.
--
-- The datasets table is already protected by RLS, but the underlying
-- Supabase Storage bucket is currently unguarded. This migration adds
-- storage policies that mirror the table-level RLS:
--
--   UPLOAD: Only admins can upload objects, scoped to their org.
--   READ:   Any authenticated org member can read objects.
--   DELETE: Only admins can delete objects.
--
-- Storage policies use the same SQL helper functions (get_my_org_id(),
-- is_org_admin()) defined in schema.sql.
-- ============================================================

BEGIN;

-- ── 0. Ensure the bucket exists ─────────────────────────────────────────────
-- Supabase creates buckets via the dashboard/API, not SQL DDL.
-- If the bucket doesn't exist yet, this INSERT will create it.
-- Safe to run multiple times due to ON CONFLICT.
INSERT INTO storage.buckets (id, name, public)
VALUES ('datasets', 'datasets', false)
ON CONFLICT (id) DO NOTHING;

-- ── 1. UPLOAD policy — only admins can upload ───────────────────────────────
-- The object path format is: {organization_id}/{dataset_id}.parquet
-- We extract the org_id from the first path segment and verify:
--   (a) The uploader belongs to that org
--   (b) The uploader is an admin
CREATE POLICY "admins_can_upload_datasets"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'datasets'
        AND (storage.foldername(name))[1] = get_my_org_id()::text
        AND is_org_admin()
    );

-- ── 2. READ policy — any org member can read ────────────────────────────────
-- Any authenticated user who belongs to the org that owns the object
-- can read it. No admin check needed — all org members should be able
-- to query datasets via the chat interface.
CREATE POLICY "org_members_can_read_datasets"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'datasets'
        AND (storage.foldername(name))[1] = get_my_org_id()::text
    );

-- ── 3. UPDATE policy — only admins can update/replace objects ───────────────
CREATE POLICY "admins_can_update_datasets"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'datasets'
        AND (storage.foldername(name))[1] = get_my_org_id()::text
        AND is_org_admin()
    );

-- ── 4. DELETE policy — only admins can delete objects ───────────────────────
CREATE POLICY "admins_can_delete_datasets"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'datasets'
        AND (storage.foldername(name))[1] = get_my_org_id()::text
        AND is_org_admin()
    );

COMMIT;
