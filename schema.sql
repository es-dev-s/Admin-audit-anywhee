-- schema.sql
-- Run in the SAME Supabase project as bug-free-robot/supabase_migration.sql.
-- Idempotent (IF NOT EXISTS). users must be created before audit_organizations (FK).

-- Users (audit dashboard login — separate from signaling `admins` table)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('team_lead', 'audit_member')),
  audit_org_id UUID,
  org_id BIGINT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Directory orgs (team lead — group audit members before sharing live access)
CREATE TABLE IF NOT EXISTS audit_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_organizations_created_by_name UNIQUE (created_by, name)
);

CREATE INDEX IF NOT EXISTS idx_audit_organizations_created_by
  ON audit_organizations(created_by);

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_audit_org_id_fkey
    FOREIGN KEY (audit_org_id) REFERENCES audit_organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope JSONB NOT NULL DEFAULT '{"team_ids": [], "member_ids": []}',
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  use_count INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Access grants
CREATE TABLE IF NOT EXISTS access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES invites(id) ON DELETE CASCADE,
  team_ids UUID[] NOT NULL DEFAULT '{}',
  member_ids UUID[] NOT NULL DEFAULT '{}',
  signaling_org_ids TEXT[] NOT NULL DEFAULT '{}',
  signal_client_ids TEXT[] NOT NULL DEFAULT '{}',
  shared_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by);
CREATE INDEX IF NOT EXISTS idx_access_grants_user_id ON access_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- RLS: block all direct client access, backend uses service role key
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Use DO blocks to avoid errors if policies already exist
DO $$ BEGIN
  CREATE POLICY "No direct client access" ON users FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON audit_organizations FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON invites FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON access_grants FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON refresh_tokens FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Super-admin–gated org visibility for audit team leads (see schema_migration_team_lead_org_access.sql)
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

-- Stream captures (camera / flag) — files in Cloudflare R2; scoped per user (see supabase/migrations/20260413120000_audit_captures.sql)
CREATE TABLE IF NOT EXISTS audit_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capture_type TEXT NOT NULL CHECK (capture_type IN ('screenshot', 'flag')),
  object_key TEXT,
  note TEXT,
  team_id BIGINT,
  member_id BIGINT,
  member_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_captures_user_id_created_at_idx
  ON audit_captures (user_id, created_at DESC);

ALTER TABLE audit_captures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON audit_captures FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Timeline events (team-lead activity feed; see supabase/migrations/20260415100000_audit_timeline_events.sql)
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
