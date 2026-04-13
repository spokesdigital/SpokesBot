-- Migration 006: Add report_type column to datasets table
-- Supports categorizing uploaded CSVs by report type.

ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'overview'
  CHECK (report_type IN ('overview', 'google_ads', 'meta_ads'));

COMMENT ON COLUMN datasets.report_type IS 'Type of report: overview, google_ads, or meta_ads';
