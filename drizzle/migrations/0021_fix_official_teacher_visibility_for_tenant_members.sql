CREATE OR REPLACE FUNCTION public.platform_actor_ok(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NULL
      OR public.has_role(auth.uid(), 'admin')
      OR _owner IS NULL
      OR public.user_platform_id(_owner) IS NULL
      OR public.user_platform_id(_owner) IS NOT DISTINCT FROM public.user_platform_id(auth.uid())
$function$;

CREATE OR REPLACE FUNCTION public.platform_scope_ok(_owner_id uuid, _viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _owner_id IS NULL
      OR public.user_platform_id(_owner_id) IS NULL
      OR public.user_platform_id(_owner_id) IS NOT DISTINCT FROM public.user_platform_id(_viewer_id)
$function$;

REVOKE ALL ON FUNCTION public.platform_actor_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_actor_ok(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_scope_ok(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_scope_ok(uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';