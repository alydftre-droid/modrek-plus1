DROP POLICY IF EXISTS platform_isolation_teacher_profiles ON public.teacher_profiles;
DROP POLICY IF EXISTS platform_isolation_teacher_assignments ON public.teacher_assignments;
DROP POLICY IF EXISTS platform_isolation_student_teacher_choices ON public.student_teacher_choices;
DROP POLICY IF EXISTS platform_isolation_content_groups ON public.content_groups;

DROP POLICY IF EXISTS "Anyone can view active current-term groups" ON public.content_groups;
CREATE POLICY "Anyone can view active current-term groups"
ON public.content_groups
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND group_matches_current_system_term(subject_id, term)
);

GRANT SELECT ON public.teacher_profiles TO anon, authenticated;
GRANT SELECT ON public.teacher_assignments TO anon, authenticated;
GRANT SELECT ON public.teacher_schedules TO authenticated;
GRANT SELECT ON public.content_groups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_teacher_choices TO authenticated;
GRANT ALL ON public.teacher_profiles, public.teacher_assignments, public.teacher_schedules, public.content_groups, public.student_teacher_choices TO service_role;

NOTIFY pgrst, 'reload schema';