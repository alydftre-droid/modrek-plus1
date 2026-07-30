-- 1) Notifications: remove blanket NULL-user broadcast visibility
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
CREATE POLICY "Users can view their notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2) Real entitlement logic for library access tiers
CREATE OR REPLACE FUNCTION public.has_library_access(_user_id uuid, _tier text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _tier IS NULL OR _tier = 'free' THEN true
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    WHEN _tier IN ('premium', 'vip') THEN EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.student_id = _user_id
        AND s.is_active = true
        AND s.end_date > now()
    )
    ELSE false
  END;
$function$;

-- 3) Consolidate duplicated admin policies on teacher_profiles
DROP POLICY IF EXISTS "Admin manage all profiles" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Admins Manage All" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.teacher_profiles;

CREATE POLICY "Admins manage teacher profiles"
ON public.teacher_profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));