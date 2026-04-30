-- Enable RLS on support_messages and add row-level policies.
-- The backend service client bypasses RLS for admin operations, so these
-- policies guard against direct Supabase API calls from the browser.

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users can read only their own support messages
CREATE POLICY "users_read_own_support_messages"
    ON support_messages FOR SELECT
    USING (user_id = auth.uid());

-- Users can insert support messages only for themselves in their own org
CREATE POLICY "users_insert_own_support_messages"
    ON support_messages FOR INSERT
    WITH CHECK (user_id = auth.uid() AND organization_id = get_my_org_id());

-- Admins can read all support messages in their org
CREATE POLICY "admins_read_org_support_messages"
    ON support_messages FOR SELECT
    USING (organization_id = get_my_org_id() AND is_org_admin());

-- Admins can update (resolve) support messages in their org
CREATE POLICY "admins_update_org_support_messages"
    ON support_messages FOR UPDATE
    USING (organization_id = get_my_org_id() AND is_org_admin());
