-- 1) Fix mutable search_path on internal maintenance function
CREATE OR REPLACE FUNCTION public.modrek_touch_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_touch_cache() FROM PUBLIC, anon, authenticated;

-- 2) Revoke anon EXECUTE on admin-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.admin_financial_close_preview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_financial_close(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_monthly_history_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_monthly_period_teachers(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.modrek_admin_repair_source(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.modrek_library_diagnostics() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_financial_close_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monthly_history_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monthly_period_teachers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_admin_repair_source(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_library_diagnostics() TO authenticated;