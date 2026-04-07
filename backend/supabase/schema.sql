-- SpokesBot Supabase Schema
-- Version 5 — Migration 002 applied
-- Changes: dataset status constraint updated, 'ready' → 'completed'

-- --------------------------------------------------------
-- 0. USER → ORGANIZATION BRIDGE (Critical for RLS)
-- --------------------------------------------------------
CREATE TABLE user_organizations (
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    PRIMARY KEY (user_id, organization_id)
);

-- --------------------------------------------------------
-- 1. Organizations (Tenants)
-- --------------------------------------------------------
CREATE TABLE organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE user_organizations
    ADD CONSTRAINT fk_user_organizations_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- --------------------------------------------------------
-- 2. Datasets — with full ingestion lifecycle
-- --------------------------------------------------------
CREATE TABLE datasets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name     TEXT,
    detected_date_column TEXT,
    metric_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_profile  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingestion_warnings TEXT[] NOT NULL DEFAULT '{}',
    file_name       TEXT    NOT NULL,
    file_size       BIGINT,                        -- bytes, set on intake
    row_count       INTEGER DEFAULT 0,
    column_headers  TEXT[]  NOT NULL DEFAULT '{}', -- populated after parse; used by LangGraph agent sandbox
    storage_path    TEXT,                          -- Supabase Storage path to .parquet; NULL until ready
    status          TEXT    NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    error_message   TEXT,                          -- populated on failure
    uploaded_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END;
$$;
CREATE TRIGGER datasets_updated_at
    BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- --------------------------------------------------------
-- 3. Event Logs
-- --------------------------------------------------------
CREATE TABLE event_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    event_type      TEXT NOT NULL,
    event_metadata  JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- --------------------------------------------------------
-- 4. Chat Threads (LangGraph Checkpointer)
-- --------------------------------------------------------
CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dataset_id      UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    title           TEXT DEFAULT 'New Conversation',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- --------------------------------------------------------
-- 5. Chat Messages
-- --------------------------------------------------------
CREATE TABLE messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- --------------------------------------------------------
-- ROW LEVEL SECURITY
-- --------------------------------------------------------
ALTER TABLE organizations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- HELPER FUNCTIONS  (used by RLS policies and API layer)
-- --------------------------------------------------------

-- Returns the organization_id the current user belongs to
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT organization_id
    FROM   user_organizations
    WHERE  user_id = auth.uid()
    LIMIT  1;
$$;

-- Returns the role of the current user in their org ('admin' | 'user')
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role
    FROM   user_organizations
    WHERE  user_id         = auth.uid()
      AND  organization_id = get_my_org_id()
    LIMIT  1;
$$;

-- Boolean convenience: is current user an org admin?
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT get_my_role() = 'admin';
$$;

-- --------------------------------------------------------
-- RLS POLICIES
-- --------------------------------------------------------

-- Organizations: members of an org can read it; only admins can update
CREATE POLICY "org_members_can_select"
    ON organizations FOR SELECT
    USING (id = get_my_org_id());

CREATE POLICY "org_admins_can_update"
    ON organizations FOR UPDATE
    USING (id = get_my_org_id() AND is_org_admin());

-- user_organizations: users can see their own membership row
CREATE POLICY "users_see_own_membership"
    ON user_organizations FOR SELECT
    USING (user_id = auth.uid());

-- Datasets: all org members read; only admins insert/update/delete
CREATE POLICY "org_members_select_datasets"
    ON datasets FOR SELECT
    USING (organization_id = get_my_org_id());

CREATE POLICY "org_admins_insert_datasets"
    ON datasets FOR INSERT
    WITH CHECK (organization_id = get_my_org_id() AND is_org_admin());

CREATE POLICY "org_admins_update_datasets"
    ON datasets FOR UPDATE
    USING (organization_id = get_my_org_id() AND is_org_admin());

CREATE POLICY "org_admins_delete_datasets"
    ON datasets FOR DELETE
    USING (organization_id = get_my_org_id() AND is_org_admin());

-- Threads: users can manage their own threads
CREATE POLICY "users_manage_own_threads"
    ON threads FOR ALL
    USING (user_id = auth.uid());

-- Messages: users can manage messages in their own threads only
CREATE POLICY "users_manage_own_messages"
    ON messages FOR ALL
    USING (
        thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
    );

-- Event Logs: users see their own; admins see all in org
CREATE POLICY "users_see_own_event_logs"
    ON event_logs FOR SELECT
    USING (user_id = auth.uid() OR (organization_id = get_my_org_id() AND is_org_admin()));

CREATE POLICY "backend_inserts_event_logs"
    ON event_logs FOR INSERT
    WITH CHECK (organization_id = get_my_org_id());

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------
CREATE INDEX idx_datasets_org_id        ON datasets(organization_id);
CREATE INDEX idx_datasets_status        ON datasets(status);
CREATE INDEX idx_threads_user_id        ON threads(user_id);
CREATE INDEX idx_threads_dataset_id     ON threads(dataset_id);
CREATE INDEX idx_messages_thread_id     ON messages(thread_id);
CREATE INDEX idx_eventlogs_org_id       ON event_logs(organization_id);
CREATE INDEX idx_user_orgs_user_id      ON user_organizations(user_id);
