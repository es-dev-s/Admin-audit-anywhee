-- Team-lead share controls: explicit revoke + default auto-revoke window support.
ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS shared_expires_at TIMESTAMPTZ;

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_access_grants_user_active_window
  ON access_grants (user_id, shared_expires_at)
  WHERE revoked_at IS NULL;
