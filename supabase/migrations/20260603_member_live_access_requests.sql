-- Audit members request live access; team leads approve/reject (grants access_grants on approve).

CREATE TABLE IF NOT EXISTS member_live_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_lead_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_scope TEXT NOT NULL CHECK (share_scope IN ('team', 'member')),
  signaling_org_id BIGINT NOT NULL,
  signal_client_id BIGINT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  message TEXT,
  decline_reason TEXT,
  live_team_name TEXT,
  live_member_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT member_live_access_requests_member_scope_chk CHECK (
    (share_scope = 'team' AND signal_client_id IS NULL)
    OR (share_scope = 'member' AND signal_client_id IS NOT NULL AND signal_client_id > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_member_live_access_requests_tl_status
  ON member_live_access_requests (team_lead_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_live_access_requests_member
  ON member_live_access_requests (audit_member_id, requested_at DESC);

ALTER TABLE member_live_access_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON member_live_access_requests FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
