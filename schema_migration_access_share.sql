-- Run in Supabase SQL Editor after schema.sql (access share by email from team lead).
-- 1) Grants can exist without an invite (direct share).
-- 2) Signaling org / client ids for live view scoping (numeric ids as text).

ALTER TABLE access_grants
  ALTER COLUMN invite_id DROP NOT NULL;

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS signaling_org_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS signal_client_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS shared_expires_at TIMESTAMPTZ;

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
