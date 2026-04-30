-- Migration 012: Performance Phase 1 – Index audit & support_messages gap fill
-- ---------------------------------------------------------------------------
-- Context: SpokesBot stores analytics data in Parquet files via Supabase Storage,
-- not a relational analytics_data table. SQL indexes therefore apply only to the
-- application tables: datasets, threads, messages, event_logs, support_messages,
-- organizations, and user_organizations.
--
-- Existing indexes (established in schema.sql + migration 007):
--   datasets          → idx_datasets_org_id, idx_datasets_status,
--                        idx_datasets_org_report_type, idx_datasets_org_status,
--                        idx_datasets_org_uploaded_at
--   threads           → idx_threads_user_id, idx_threads_dataset_id,
--                        idx_threads_org_id, idx_threads_org_id_id
--   messages          → idx_messages_thread_id, idx_messages_thread_id_created_at
--   event_logs        → idx_eventlogs_org_id, idx_event_logs_org_user
--   user_organizations → idx_user_orgs_user_id
--
-- Gap identified: support_messages has single-column indexes on org_id, status,
-- and thread_id (added in migration 009), but the admin support inbox loads
-- tickets filtered by BOTH org_id AND status simultaneously. A composite index
-- satisfies that query pattern with a single index scan instead of two.
--
-- All statements use IF NOT EXISTS so this migration is idempotent and safe
-- to re-run against environments that already have these indexes.
-- ---------------------------------------------------------------------------

-- ── 1. Composite: support_messages (organization_id, status) ─────────────────
-- Covers: the admin support inbox query:
--   WHERE organization_id = $1 AND status = 'open'
--   ORDER BY created_at DESC
-- The existing single-column idx_support_messages_org_id handles org-only
-- lookups; this composite eliminates the second filter pass on status.
CREATE INDEX IF NOT EXISTS idx_support_messages_org_status
    ON support_messages (organization_id, status);

-- ── 2. Composite: support_messages (organization_id, created_at DESC) ────────
-- Covers: loading all tickets for an org sorted by most recent first.
-- Pattern: WHERE organization_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_support_messages_org_created_at
    ON support_messages (organization_id, created_at DESC);

-- ── 3. Composite: support_messages (organization_id, status, created_at DESC) ─
-- Covers: the most common combined filter — open tickets for an org ordered
-- by recency. A 3-column covering index lets Postgres satisfy the WHERE and
-- ORDER BY entirely from the index (index-only scan) with no heap fetch needed.
CREATE INDEX IF NOT EXISTS idx_support_messages_org_status_created_at
    ON support_messages (organization_id, status, created_at DESC);
