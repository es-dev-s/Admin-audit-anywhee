-- Live / signaling organization id for audit members (distinct from audit_org_id directory UUID).
-- Run in Supabase SQL Editor if this column is missing (fixes "column users.org_id does not exist").

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id BIGINT;

COMMENT ON COLUMN users.org_id IS 'Signaling/live organization id; used for team roster and stream access checks.';

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (org_id) WHERE org_id IS NOT NULL;
