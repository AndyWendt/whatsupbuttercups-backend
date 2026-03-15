ALTER TABLE occurrence_completions
  ADD COLUMN user_id TEXT;

ALTER TABLE notification_events
  ADD COLUMN dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS idx_occurrence_completions_item_date
  ON occurrence_completions(item_id, occurred_on);

CREATE UNIQUE INDEX IF NOT EXISTS idx_occurrence_completions_item_date_unique
  ON occurrence_completions(item_id, occurred_on);

CREATE INDEX IF NOT EXISTS idx_notification_events_item_user
  ON notification_events(item_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_dedupe_key
  ON notification_events(dedupe_key);
