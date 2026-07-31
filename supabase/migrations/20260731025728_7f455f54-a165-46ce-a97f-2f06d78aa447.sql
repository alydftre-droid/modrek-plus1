-- Make the students' safe ads-targeting view bypass the admin-only RLS on the base table,
-- while still masking other students' ids.
ALTER VIEW public.ad_targets_safe SET (security_invoker = false);
GRANT SELECT ON public.ad_targets_safe TO authenticated;
GRANT SELECT ON public.ad_targets_safe TO anon;