-- Signaling org membership on users (API: /api/teams/:id/members, auditSignalingAccess, members/screen)

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id BIGINT;

COMMENT ON COLUMN users.org_id IS 'Signaling/live organization id; used for team roster and stream access checks.';

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (org_id) WHERE org_id IS NOT NULL;
