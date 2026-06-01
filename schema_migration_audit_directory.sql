-- Audit directory: organizations for grouping audit members + user links.
-- Run in Supabase SQL Editor after prior migrations.

CREATE TABLE IF NOT EXISTS audit_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_organizations_created_by_name UNIQUE (created_by, name)
);

CREATE INDEX IF NOT EXISTS idx_audit_organizations_created_by
  ON audit_organizations(created_by);

ALTER TABLE users ADD COLUMN IF NOT EXISTS audit_org_id UUID
  REFERENCES audit_organizations(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "No direct client access" ON audit_organizations FOR ALL USING (FALSE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
