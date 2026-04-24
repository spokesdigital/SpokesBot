-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Creates the help_articles table used by the Help page and Admin CMS.

CREATE TABLE IF NOT EXISTS help_articles (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text         NOT NULL,
  body        text         NOT NULL,
  category    text         NOT NULL DEFAULT 'general',
  sort_order  integer      NOT NULL DEFAULT 0,
  is_published boolean     NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Index for the public listing query (published articles ordered by category + sort_order)
CREATE INDEX IF NOT EXISTS help_articles_category_sort_idx
  ON help_articles (category, sort_order)
  WHERE is_published = true;

-- RLS: enable row-level security
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;

-- Published articles are readable by anyone (no auth required for the Help page)
CREATE POLICY "Published articles are public"
  ON help_articles
  FOR SELECT
  USING (is_published = true);

-- All operations are performed via the service_role key on the backend,
-- which bypasses RLS — no additional policies needed for admin writes.

-- Seed 3 starter articles (optional — delete if you prefer to add via the admin UI)
INSERT INTO help_articles (title, body, category, sort_order, is_published) VALUES
  (
    'How do I change the reporting period?',
    'Use the date selector in the top-right corner of the overview page to switch between common reporting windows like Last 7 Days or Last 30 Days.',
    'getting_started', 1, true
  ),
  (
    'What do the KPI cards represent?',
    'The overview cards summarize the best-available performance fields from your connected dataset, such as spend, revenue, CTR, and ROAS when those columns are present.',
    'dashboards', 1, true
  ),
  (
    'Why might some cards show missing values?',
    'Some dashboards depend on dataset columns like impressions, clicks, revenue, cost, and a usable date field. When those fields are absent, the UI keeps the card structure but cannot compute the metric yet.',
    'troubleshooting', 1, true
  );
