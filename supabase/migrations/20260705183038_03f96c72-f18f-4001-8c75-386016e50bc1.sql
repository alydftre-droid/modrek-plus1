
-- 1) Tighten ai_sources SELECT to admins/teachers/uploader/subscribed students
DROP POLICY IF EXISTS "AI sources viewable by authenticated" ON public.ai_sources;
DROP POLICY IF EXISTS "AI sources accessible by authenticated" ON public.ai_sources;
DROP POLICY IF EXISTS "Authenticated users can view AI sources" ON public.ai_sources;

CREATE POLICY "Entitled users can view AI sources"
ON public.ai_sources
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'teacher'::app_role)
  OR auth.uid() = uploaded_by
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.student_id = auth.uid()
      AND s.subject_id = ai_sources.subject_id
      AND s.is_active = true
      AND s.end_date > now()
  )
  OR EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE sgp.student_id = auth.uid()
      AND cg.subject_id = ai_sources.subject_id
  )
);

-- 2) Revoke EXECUTE from anon/public on privileged SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_modrek_admin(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_modrek_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_test_student(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_subject_default_prices(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subject_default_prices(text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], integer, double precision) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], integer, double precision) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.modrek_search_cache_cleanup() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.modrek_search_cache_cleanup() TO service_role;

REVOKE EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) TO authenticated, service_role;
