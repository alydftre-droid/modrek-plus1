
-- 1) Fix SECURITY DEFINER view
DROP VIEW IF EXISTS public.ad_targets_safe;
CREATE VIEW public.ad_targets_safe
WITH (security_invoker = true) AS
SELECT id, ad_id, target_type, stage, education_type, grade, section, created_at,
       CASE
         WHEN auth.uid() IS NOT NULL AND (auth.uid() = ANY (student_ids)) THEN ARRAY[auth.uid()]
         ELSE '{}'::uuid[]
       END AS student_ids
  FROM public.ad_targets;
GRANT SELECT ON public.ad_targets_safe TO authenticated, anon;

-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.request_external_sync(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_group_sub_subjects() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trigger_external_sync_after_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_external_sync(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_group_sub_subjects() TO authenticated, service_role;

-- 3) ai_lessons subscription gate
DROP POLICY IF EXISTS "Authenticated users can view ai lessons" ON public.ai_lessons;
CREATE POLICY "Subscribed students or staff can view ai lessons"
ON public.ai_lessons
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    WHERE sgp.student_id = auth.uid()
      AND sgp.group_id = ai_lessons.group_id
  )
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.student_id = auth.uid()
      AND s.subject_id = ai_lessons.subject_id
      AND s.is_active = true
      AND s.end_date > now()
  )
);

-- 4) ai_lesson_pages mirrors lesson access
DROP POLICY IF EXISTS "Authenticated users can view ai lesson pages" ON public.ai_lesson_pages;
CREATE POLICY "Lesson access controls page access"
ON public.ai_lesson_pages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR auth.uid() = created_by
  OR EXISTS (
    SELECT 1
    FROM public.ai_lessons l
    LEFT JOIN public.student_group_purchases sgp
      ON sgp.group_id = l.group_id AND sgp.student_id = auth.uid()
    LEFT JOIN public.subscriptions s
      ON s.subject_id = l.subject_id AND s.student_id = auth.uid()
         AND s.is_active = true AND s.end_date > now()
    WHERE l.id = ai_lesson_pages.lesson_id
      AND (sgp.id IS NOT NULL OR s.id IS NOT NULL)
  )
);

-- 5) live-recordings storage: drop broad authenticated SELECT
DROP POLICY IF EXISTS "Authenticated can view recordings" ON storage.objects;
CREATE POLICY "Subscribed students, owner teacher, or admin can view recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'live-recordings'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.live_session_recordings r
      JOIN public.student_group_purchases sgp
        ON sgp.group_id = r.group_id AND sgp.student_id = auth.uid()
      WHERE r.video_url LIKE '%' || name || '%'
    )
  )
);
