-- 1. Demo flag on profiles (additive, default false → zero impact on real users)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- 2. Helper: is this user a demo account?
CREATE OR REPLACE FUNCTION public.is_demo_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(is_demo, false) FROM public.profiles WHERE id = _user_id),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.is_demo_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_demo_account(uuid) TO authenticated, service_role;

-- 3. Demo accounts registry (metadata only, never passwords)
CREATE TABLE IF NOT EXISTS public.demo_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  label text NOT NULL,
  role public.app_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  last_password_reset_at timestamptz,
  notes text
);

GRANT SELECT ON public.demo_accounts TO authenticated;
GRANT ALL ON public.demo_accounts TO service_role;
ALTER TABLE public.demo_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read demo accounts" ON public.demo_accounts;
CREATE POLICY "Admins read demo accounts" ON public.demo_accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Demo audit log
CREATE TABLE IF NOT EXISTS public.demo_account_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  demo_user_id uuid,
  demo_email text,
  demo_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.demo_account_audit_logs TO authenticated;
GRANT ALL ON public.demo_account_audit_logs TO service_role;
ALTER TABLE public.demo_account_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read demo audit logs" ON public.demo_account_audit_logs;
CREATE POLICY "Admins read demo audit logs" ON public.demo_account_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_demo_audit_created_at ON public.demo_account_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_accounts_role ON public.demo_accounts (role);

-- 5. Anti-tampering: only service_role or admins may set/change is_demo
CREATE OR REPLACE FUNCTION public.prevent_demo_flag_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  uid uuid;
BEGIN
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  BEGIN
    uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    uid := NULL;
  END;

  IF jwt_role IS NULL AND uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND COALESCE(NEW.is_demo, false) = true THEN
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT public.has_role(uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only service_role or admins can create demo accounts';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_demo, false) IS DISTINCT FROM COALESCE(NEW.is_demo, false) THEN
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT public.has_role(uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only service_role or admins can change is_demo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_demo_flag_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_demo_flag_tampering
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_demo_flag_tampering();

-- 6. Isolation: demo students are treated like test students everywhere
--    (hidden from every teacher-facing query, never counted in commissions)
CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE(is_test_account, false) = true
        OR COALESCE(is_demo, false) = true
        OR NULLIF(test_account_code, '') IS NOT NULL
        OR (COALESCE(role, '') = 'student' AND COALESCE(full_name, '') ILIKE '%تجريبي%')
      FROM public.profiles
      WHERE id = _user_id
    ),
    false
  );
$$;

-- 7. Isolation: demo teachers are only discoverable by demo users and admins
DROP POLICY IF EXISTS "Public can view approved profiles" ON public.teacher_profiles;
CREATE POLICY "Public can view approved profiles" ON public.teacher_profiles
  FOR SELECT
  USING (
    is_approved = true
    AND (
      NOT public.is_demo_account(teacher_id)
      OR public.is_demo_account(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- 8. Admin-only helper views/RPCs for demo listing (server-side guarded)
CREATE OR REPLACE FUNCTION public.admin_list_demo_accounts()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  label text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_login_at timestamptz,
  last_password_reset_at timestamptz,
  full_name text,
  is_banned boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_caller();
  RETURN QUERY
  SELECT d.id, d.user_id, d.email, d.label, d.role::text, d.is_active,
         d.created_at, d.updated_at, d.last_login_at, d.last_password_reset_at,
         p.full_name, COALESCE(p.is_banned, false)
  FROM public.demo_accounts d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  ORDER BY d.role, d.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_demo_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_demo_accounts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_demo_audit_logs(_limit integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  actor_email text,
  action text,
  demo_email text,
  demo_role text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_caller();
  RETURN QUERY
  SELECT l.id, l.actor_email, l.action, l.demo_email, l.demo_role, l.metadata, l.created_at
  FROM public.demo_account_audit_logs l
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 30), 200));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_demo_audit_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_demo_audit_logs(integer) TO authenticated, service_role;