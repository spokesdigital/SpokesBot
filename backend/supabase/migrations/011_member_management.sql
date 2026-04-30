-- Member management for client organisations.
-- Adds joined_at tracking, a performance index, and two SECURITY DEFINER
-- helper functions so the backend can read auth.users without exposing it
-- directly to the PostgREST layer.

-- Track when each membership was created so we can order results and
-- make get_my_org_id() deterministic for users who belong to multiple orgs.
ALTER TABLE user_organizations
    ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

-- Fast lookups by org (member list, count, etc.)
CREATE INDEX IF NOT EXISTS idx_user_organizations_org_id
    ON user_organizations(organization_id);

-- Make get_my_org_id() deterministic: always return the earliest membership.
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT organization_id
    FROM   user_organizations
    WHERE  user_id = auth.uid()
    ORDER BY joined_at ASC
    LIMIT  1;
$$;

-- Return all members of an org with their email addresses.
-- SECURITY DEFINER so the backend can read auth.users via RPC.
CREATE OR REPLACE FUNCTION get_org_members(p_org_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, role TEXT, joined_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT uo.user_id, au.email, uo.role, uo.joined_at
    FROM   user_organizations uo
    JOIN   auth.users au ON au.id = uo.user_id
    WHERE  uo.organization_id = p_org_id
    ORDER BY uo.joined_at ASC;
$$;

-- Resolve an email address to a user UUID (returns NULL if not found).
-- Used to check whether an invited email already has an account before
-- deciding whether to call auth.admin.invite_user_by_email.
CREATE OR REPLACE FUNCTION lookup_user_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
    SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
