-- Audit captures: screenshots (camera) and flag snapshots stored in R2, scoped per auditor user.
-- Run in Supabase SQL editor or via supabase db push.

CREATE TABLE IF NOT EXISTS public.audit_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  capture_type text NOT NULL CHECK (capture_type IN ('screenshot', 'flag')),
  object_key text,
  note text,
  team_id bigint,
  member_id bigint,
  member_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_captures_user_id_created_at_idx
  ON public.audit_captures (user_id, created_at DESC);

COMMENT ON TABLE public.audit_captures IS 'PNG captures from stream toolbar; object_key is path in R2 bucket';

-- If your users.id column is text (not uuid), drop the FK above and use:
-- ALTER TABLE public.audit_captures DROP CONSTRAINT audit_captures_user_id_fkey;
-- ALTER TABLE public.audit_captures ALTER COLUMN user_id TYPE text USING user_id::text;
