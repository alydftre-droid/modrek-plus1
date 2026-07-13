CREATE OR REPLACE FUNCTION public.student_has_modrek_training_attempt(_exam_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _student_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exam_attempts a
       WHERE a.exam_id = _exam_id
         AND a.student_id = _student_id
     )
$$;

DROP POLICY IF EXISTS "Students access Modrek training exams through attempts" ON public.exams;
CREATE POLICY "Students access Modrek training exams through attempts"
ON public.exams
FOR SELECT
TO authenticated
USING (
  (
    COALESCE(source, 'teacher') = 'modrek_ai'
    OR owner_student_id = auth.uid()
    OR (teacher_id IS NULL AND group_id IS NULL)
  )
  AND public.student_has_modrek_training_attempt(id, auth.uid())
);

REVOKE EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';