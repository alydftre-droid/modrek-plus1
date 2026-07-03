-- 1) Only user_roles determines Modrek admin; the developer-email allowlist stays
--    because it is a hardcoded platform rule, not user-writable data.
CREATE OR REPLACE FUNCTION public.is_modrek_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id
      AND lower(coalesce(u.email, '')) IN ('aliana200713@gmail.com', 'alyedaft@gmail.com')
  )
$function$;

-- 2) Drop duplicate profile UPDATE policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 3) Block role self-escalation via a BEFORE UPDATE trigger.
--    Non-admins may update their profile, but never the role column.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'permission denied: role change requires admin privileges';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_self_change ON public.profiles;
CREATE TRIGGER profiles_prevent_role_self_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_self_change();