-- Audit timeline: append-only events for team leads (login, org access, shares, member org assignment).
-- Populated from API routes; RLS blocks direct client access (service role from backend only).

CREATE TABLE IF NOT EXISTS audit_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_lead_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_email TEXT,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_name TEXT,
  audit_org_id UUID REFERENCES audit_organizations(id) ON DELETE SET NULL,
  audit_org_name TEXT,
  signaling_org_id BIGINT,
  signaling_org_label TEXT,
  live_team_id BIGINT,
  live_team_name TEXT,
  live_member_id BIGINT,
  live_member_name TEXT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'revoked')),
  reviewed_by_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  capture_id UUID REFERENCES audit_captures(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_timeline_events_team_lead_created_idx
  ON audit_timeline_events (team_lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_timeline_events_event_type_idx
  ON audit_timeline_events (team_lead_id, event_type);

ALTER TABLE audit_timeline_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON audit_timeline_events FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
