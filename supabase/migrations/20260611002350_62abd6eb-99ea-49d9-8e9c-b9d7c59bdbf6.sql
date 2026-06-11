
DROP POLICY IF EXISTS "ad_targets_authenticated_read" ON public.ad_targets;

CREATE OR REPLACE VIEW public.ad_targets_safe
WITH (security_invoker = false) AS
SELECT
  id, ad_id, target_type, stage, education_type, grade, section, created_at,
  CASE
    WHEN auth.uid() IS NOT NULL AND auth.uid() = ANY(student_ids)
      THEN ARRAY[auth.uid()]::uuid[]
    ELSE '{}'::uuid[]
  END AS student_ids
FROM public.ad_targets;

GRANT SELECT ON public.ad_targets_safe TO authenticated, anon;

DROP POLICY IF EXISTS "Students can view actions for their sessions" ON public.live_session_actions;
CREATE POLICY "Students can view actions for their sessions"
ON public.live_session_actions
FOR SELECT
TO authenticated
USING (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    JOIN public.content_groups cg ON cg.id = ls.group_id
    JOIN public.subscriptions s
      ON s.subject_id = cg.subject_id
     AND s.student_id = auth.uid()
     AND s.is_active = true
    WHERE ls.id = live_session_actions.session_id
  )
);

DROP POLICY IF EXISTS "Anyone can view recordings" ON storage.objects;
CREATE POLICY "Authenticated can view recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'live-recordings');
