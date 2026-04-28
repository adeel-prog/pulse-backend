-- Fix Supabase RLS errors like:
--   permission denied for function has_role
--
-- Lovable/Supabase projects often use public.has_role(...) inside row-level
-- security policies. Browser requests run as the `anon` or `authenticated`
-- database role, so those roles must be allowed to execute every matching
-- helper function signature.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'member', 'user');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
  ) THEN
    CREATE TABLE public.user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role public.app_role NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, role)
    );
  END IF;
END
$$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- Lovable may have generated a different has_role signature before this
-- migration was added. Grant execute on every public.has_role overload so the
-- current app starts working without guessing its exact function arguments.
DO $$
DECLARE
  function_identity text;
BEGIN
  FOR function_identity IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_role'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.has_role(%s) FROM PUBLIC', function_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.has_role(%s) TO anon', function_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.has_role(%s) TO authenticated', function_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.has_role(%s) TO service_role', function_identity);
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
