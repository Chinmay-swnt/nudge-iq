-- Migration: 0002_pipeline.sql
-- Adds columns and tables for upload-first processing pipeline

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_path text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'created';
  -- created | uploaded | transcribing | extracting | processed | failed
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS duration_seconds int;

ALTER TABLE action_items ADD COLUMN IF NOT EXISTS owner_name_raw text;   -- name as spoken, before matching
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source_quote text;     -- transcript sentence it came from
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS confidence real;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS created_by text DEFAULT 'manual'; -- 'manual' | 'ai'

CREATE TABLE IF NOT EXISTS reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) NOT NULL,
  kind text NOT NULL,                 -- 'due_soon' | 'overdue' | 'escalation'
  sent_at timestamptz DEFAULT now(),
  provider_message_id text,
  UNIQUE(task_id, kind, (sent_at::date))
);

-- RLS for reminders_log
ALTER TABLE reminders_log ENABLE ROW LEVEL SECURITY;
