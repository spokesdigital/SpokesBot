ALTER TABLE datasets
    ADD COLUMN IF NOT EXISTS detected_date_column TEXT;

ALTER TABLE datasets
    ADD COLUMN IF NOT EXISTS metric_mappings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE datasets
    ADD COLUMN IF NOT EXISTS schema_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE datasets
    ADD COLUMN IF NOT EXISTS ingestion_warnings TEXT[] NOT NULL DEFAULT '{}';
