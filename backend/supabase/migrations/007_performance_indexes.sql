-- Migration 007: Performance indexes for production scale
-- -------------------------------------------------------------------
-- Purpose:
--   B-Tree indexes on the most frequently filtered/sorted columns across
--   datasets, threads, messages, and event_logs tables. Targeted at the
--   exact query patterns issued by the analytics router and dashboard API.
--
-- Existing baseline (already in schema.sql — do NOT re-create):
--   idx_datasets_org_id          datasets(organization_id)
--   idx_datasets_status          datasets(status)
--   idx_threads_user_id          threads(user_id)
--   idx_threads_dataset_id       threads(dataset_id)
--   idx_messages_thread_id       messages(thread_id)
--   idx_eventlogs_org_id         event_logs(organization_id)
--   idx_user_orgs_user_id        user_organizations(user_id)
--
-- New indexes added here cover composite and sort-order patterns that the
-- single-column baseline indexes cannot satisfy without a second filter
-- pass or a filesort step.
--
-- All statements use IF NOT EXISTS so this migration is idempotent and safe
-- to re-run.  Index creation acquires an ACCESS SHARE lock (read-allowed)
-- and is fast on the dataset sizes expected at SpokesBot's current scale.
-- For tables with millions of rows in a live production database, prefer
-- running each CREATE INDEX CONCURRENTLY statement manually outside this
-- migration transaction.
-- -------------------------------------------------------------------

-- ── 1. Composite: datasets (organization_id, report_type) ────────────────────
-- Covers: GET /datasets?report_type=google_ads  — the channel page load that
-- filters datasets to a single report type for a single org.
-- The existing single-column idx_datasets_org_id still fires for org-only
-- queries; this composite eliminates the secondary report_type filter pass.
CREATE INDEX IF NOT EXISTS idx_datasets_org_report_type
    ON datasets (organization_id, report_type);

-- ── 2. Composite: datasets (organization_id, status) ────────────────────────
-- Covers: the 30-second live-refresh polling for "completed" datasets per org.
-- Pattern: WHERE organization_id = $1 AND status = 'completed'
CREATE INDEX IF NOT EXISTS idx_datasets_org_status
    ON datasets (organization_id, status);

-- ── 3. Composite: datasets (organization_id, uploaded_at DESC) ───────────────
-- Covers: ORDER BY uploaded_at DESC used when selecting the most recent dataset
-- as the default for a channel page. The DESC matches the sort direction so
-- Postgres can use an index-only backward scan.
CREATE INDEX IF NOT EXISTS idx_datasets_org_uploaded_at
    ON datasets (organization_id, uploaded_at DESC);

-- ── 4. Single: threads (organization_id) ────────────────────────────────────
-- Covers: admin "list all threads in my org" query.
-- The existing idx_threads_user_id covers per-user lookups; this index covers
-- the cross-user admin view where only organization_id is the filter predicate.
CREATE INDEX IF NOT EXISTS idx_threads_org_id
    ON threads (organization_id);

-- ── 5. Composite: threads (organization_id, id) ──────────────────────────────
-- Covers: org-scoped thread detail lookup — verifying that a thread belongs to
-- the caller's org before streaming messages.
-- Pattern: WHERE organization_id = $1 AND id = $2
CREATE INDEX IF NOT EXISTS idx_threads_org_id_id
    ON threads (organization_id, id);

-- ── 6. Composite: messages (thread_id, created_at ASC) ──────────────────────
-- Covers: loading the full conversation history for a thread, always ordered
-- chronologically. The existing idx_messages_thread_id handles filtering;
-- adding created_at here lets Postgres satisfy the ORDER BY from the index
-- with no separate sort step (index-only ordered scan).
CREATE INDEX IF NOT EXISTS idx_messages_thread_id_created_at
    ON messages (thread_id, created_at ASC);

-- ── 7. Composite: event_logs (organization_id, user_id) ─────────────────────
-- Covers: the activity feed query that filters by org for admins and by user_id
-- for regular users. The existing idx_eventlogs_org_id covers org-only;
-- this composite eliminates the second filter pass on user_id.
CREATE INDEX IF NOT EXISTS idx_event_logs_org_user
    ON event_logs (organization_id, user_id);
