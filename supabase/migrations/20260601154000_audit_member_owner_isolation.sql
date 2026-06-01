-- Enforce per-team-lead ownership for audit members.
-- This prevents cross-admin visibility/share leakage.

BEGIN;

-- 1) Backfill created_by for invite-created members when possible.
UPDATE users u
SET created_by = i.created_by
FROM access_grants ag
JOIN invites i ON i.id = ag.invite_id
WHERE u.id = ag.user_id
  AND u.role = 'audit_member'
  AND u.created_by IS NULL
  AND i.created_by IS NOT NULL;

-- 2) Query performance for owner-scoped member listing.
CREATE INDEX IF NOT EXISTS idx_users_role_created_by
  ON users(role, created_by);

-- 3) Hard guard: every audit_member must have an owning team_lead.
CREATE OR REPLACE FUNCTION enforce_audit_member_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'audit_member' AND NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'audit_member rows must include created_by (team_lead owner)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_audit_member_owner ON users;
CREATE TRIGGER trg_enforce_audit_member_owner
  BEFORE INSERT OR UPDATE OF role, created_by ON users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_member_owner();

COMMIT;
