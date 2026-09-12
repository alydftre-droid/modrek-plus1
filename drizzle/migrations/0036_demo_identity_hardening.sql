CREATE OR REPLACE FUNCTION public.is_demo_email(p_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(lower(COALESCE(p_email, '')) LIKE '%@modrekplus.demo', false);
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid; flagged boolean;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT COALESCE(p.is_demo, false) INTO flagged FROM public.profiles p WHERE p.id = uid;
  IF COALESCE(flagged, false) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.demo_accounts d WHERE d.user_id = uid) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = uid AND public.is_demo_email(u.email));
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_demo_flag_for_demo_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_demo_email(NEW.email)
     OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id AND public.is_demo_email(u.email))
     OR EXISTS (SELECT 1 FROM public.demo_accounts d WHERE d.user_id = NEW.id)
  THEN
    NEW.is_demo := true;
    NEW.is_test_account := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zzy_force_demo_flag ON public.profiles;
CREATE TRIGGER zzy_force_demo_flag
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.force_demo_flag_for_demo_email();

UPDATE public.profiles p
SET is_demo = true, is_test_account = true
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND public.is_demo_email(u.email))
  AND (COALESCE(p.is_demo, false) = false OR COALESCE(p.is_test_account, false) = false);

INSERT INTO public.demo_accounts (user_id, email, label, role, is_active)
SELECT u.id, lower(u.email), COALESCE(NULLIF(p.full_name, ''), 'حساب معاينة'),
       (CASE WHEN COALESCE(p.role,'') IN ('admin','teacher','student') THEN COALESCE(p.role,'student')
             WHEN lower(u.email) LIKE 'demo.admin%' THEN 'admin'
             WHEN lower(u.email) LIKE 'demo.teacher%' THEN 'teacher'
             ELSE 'student' END)::public.app_role,
       true
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE public.is_demo_email(u.email)
  AND NOT EXISTS (SELECT 1 FROM public.demo_accounts d WHERE d.user_id = u.id);

DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;
CREATE POLICY "Admins can manage settings" ON public.platform_settings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.current_user_is_demo())
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND NOT public.current_user_is_demo());