ALTER TABLE datasets
    ADD COLUMN IF NOT EXISTS report_name TEXT;

UPDATE datasets
SET report_name = regexp_replace(file_name, '\.[^.]+$', '')
WHERE report_name IS NULL OR btrim(report_name) = '';
