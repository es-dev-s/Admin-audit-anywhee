-- Team leads must be approved by a super-admin (via admin-dashboard) before they can
-- view live org data or share access for that signaling organization.

CREATE TABLE IF NOT EXISTS team_lead_org_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_lead_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signaling_org_id BIGINT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_username TEXT,
  CONSTRAINT team_lead_org_access_unique_org UNIQUE (team_lead_id, signaling_org_id)
);

CREATE INDEX IF NOT EXISTS idx_team_lead_org_access_tl ON team_lead_org_access(team_lead_id);
CREATE INDEX IF NOT EXISTS idx_team_lead_org_access_status ON team_lead_org_access(status);
CREATE INDEX IF NOT EXISTS idx_team_lead_org_access_org ON team_lead_org_access(signaling_org_id);

ALTER TABLE team_lead_org_access ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON team_lead_org_access FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
