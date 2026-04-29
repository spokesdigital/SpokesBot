-- Support inbox + chat-escalation durability.
-- Safe for existing environments: uses IF NOT EXISTS guards and additive alters.

CREATE TABLE IF NOT EXISTS support_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'chat_escalation')),
    thread_id       UUID NULL REFERENCES threads(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE support_messages
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE support_messages
    ADD COLUMN IF NOT EXISTS thread_id UUID NULL REFERENCES threads(id) ON DELETE SET NULL;

-- If the table already existed without constraints, (re)apply them safely.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_status_check'
    ) THEN
        ALTER TABLE support_messages
            ADD CONSTRAINT support_messages_status_check CHECK (status IN ('open', 'resolved'));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_source_check'
    ) THEN
        ALTER TABLE support_messages
            ADD CONSTRAINT support_messages_source_check CHECK (source IN ('manual', 'chat_escalation'));
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_support_messages_org_id
    ON support_messages(organization_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_status
    ON support_messages(status);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread_id
    ON support_messages(thread_id);

-- One open escalation ticket per user/org/thread at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_chat_escalation_per_thread
    ON support_messages(user_id, organization_id, thread_id)
    WHERE status = 'open' AND source = 'chat_escalation' AND thread_id IS NOT NULL;
