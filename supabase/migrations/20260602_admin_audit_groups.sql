-- Migration: admin_audit_groups + admin_audit_group_clients + admin_audit_group_members
-- Run in the SAME Supabase project as schema.sql and supabase_migration.sql.
-- Idempotent (IF NOT EXISTS).
--
-- Purpose:
--   Super-admins (via admin-dashboard) create named "Audit Groups" that
--   collect specific signaling clients. They then assign those groups to
--   audit team leads. Team leads can ONLY see clients in their assigned groups;
--   they cannot request additional access or see anything outside their groups.

-- ─── 1. Groups (created by super-admin, identified by name) ─────────────────
CREATE TABLE IF NOT EXISTS admin_audit_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  -- signaling_org_id: optional — group can span multiple orgs or be
  -- org-scoped. NULL = cross-org group.
  signaling_org_id BIGINT,
  created_by_username TEXT NOT NULL,  -- signaling admin username (audit has no super_admin account)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_audit_groups_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_groups_org
  ON admin_audit_groups(signaling_org_id) WHERE signaling_org_id IS NOT NULL;

-- ─── 2. Clients assigned to each group ──────────────────────────────────────
-- References signaling clients by their integer id (clients.id in signing DB).
CREATE TABLE IF NOT EXISTS admin_audit_group_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES admin_audit_groups(id) ON DELETE CASCADE,
  signal_client_id BIGINT NOT NULL,   -- clients.id from signing server DB
  signal_org_id    BIGINT NOT NULL,   -- clients.org_id (denormalised for fast filter)
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_audit_group_clients_unique UNIQUE (group_id, signal_client_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_gc_group   ON admin_audit_group_clients(group_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_gc_client  ON admin_audit_group_clients(signal_client_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_gc_org     ON admin_audit_group_clients(signal_org_id);

-- ─── 3. Groups assigned to audit team leads ──────────────────────────────────
-- A team lead can be given multiple groups.
CREATE TABLE IF NOT EXISTS admin_audit_group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES admin_audit_groups(id) ON DELETE CASCADE,
  team_lead_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_username TEXT NOT NULL,
  CONSTRAINT admin_audit_group_members_unique UNIQUE (group_id, team_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_gm_group     ON admin_audit_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_gm_team_lead ON admin_audit_group_members(team_lead_id);

-- ─── 4. RLS: block all direct access; backend uses service-role key ──────────
ALTER TABLE admin_audit_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_group_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_group_members  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON admin_audit_groups FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON admin_audit_group_clients FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON admin_audit_group_members FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. Helper: get all signal_client_ids a team lead may see ───────────────
-- Used by audit API to build the allowed-client set quickly.
CREATE OR REPLACE FUNCTION get_team_lead_allowed_clients(p_team_lead_id UUID)
RETURNS TABLE(signal_client_id BIGINT, signal_org_id BIGINT, group_id UUID, group_name TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT
    gc.signal_client_id,
    gc.signal_org_id,
    g.id   AS group_id,
    g.name AS group_name
  FROM admin_audit_group_members  gm
  JOIN admin_audit_groups          g  ON g.id = gm.group_id
  JOIN admin_audit_group_clients   gc ON gc.group_id = g.id
  WHERE gm.team_lead_id = p_team_lead_id;
$$;
