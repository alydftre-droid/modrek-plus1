DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student', 'support');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'admin'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'admin';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'teacher'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'teacher';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'student'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'student';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'support'
    ) THEN
      ALTER TYPE public.app_role ADD VALUE 'support';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.complete_user_profile(
  _full_name text,
  _phone text,
  _role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_email text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  IF _full_name IS NULL OR length(trim(_full_name)) < 3 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = uid AND role IN ('admin','support')
  ) THEN
    RAISE EXCEPTION 'role already assigned';
  END IF;

  SELECT email INTO existing_email FROM auth.users WHERE id = uid;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    uid,
    COALESCE(existing_email, ''),
    trim(_full_name),
    NULLIF(trim(COALESCE(_phone, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email);

  DELETE FROM public.user_roles
  WHERE user_id = uid
    AND role IN ('student','teacher')
    AND role <> _role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (uid, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_profile(text, text, public.app_role) TO authenticated;