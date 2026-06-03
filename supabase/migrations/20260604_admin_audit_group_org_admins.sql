-- Link org_admin / it_ops (signaling admins) to existing audit groups — same clients as audit team leads.

CREATE TABLE IF NOT EXISTS admin_audit_group_org_admins (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID NOT NULL REFERENCES admin_audit_groups(id) ON DELETE CASCADE,
  signaling_admin_id   BIGINT NOT NULL,
  assigned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_username TEXT NOT NULL,
  CONSTRAINT admin_audit_group_org_admins_unique UNIQUE (group_id, signaling_admin_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_goa_group ON admin_audit_group_org_admins(group_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_goa_admin ON admin_audit_group_org_admins(signaling_admin_id);

ALTER TABLE admin_audit_group_org_admins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON admin_audit_group_org_admins FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
