
-- SECURITY DEFINER RPC to let a newly authenticated user (e.g. Google signup)
-- finalize their account: set name/phone and choose student/teacher role.
-- Only works for the caller's own user_id, only allows student/teacher,
-- and only when the caller doesn't already have admin/support roles.

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

  -- Block if user already has a privileged role
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid AND role IN ('admin','support')
  ) THEN
    RAISE EXCEPTION 'role already assigned';
  END IF;

  SELECT email INTO existing_email FROM auth.users WHERE id = uid;

  -- Ensure profile row exists
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (uid, COALESCE(existing_email, ''), trim(_full_name), NULLIF(trim(COALESCE(_phone, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  -- Remove any other student/teacher roles before setting the chosen one (allows switch)
  DELETE FROM public.user_roles
  WHERE user_id = uid AND role IN ('student','teacher') AND role <> _role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Ensure wallet exists
  INSERT INTO public.wallets (user_id, balance)
  VALUES (uid, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_profile(text, text, public.app_role) TO authenticated;
