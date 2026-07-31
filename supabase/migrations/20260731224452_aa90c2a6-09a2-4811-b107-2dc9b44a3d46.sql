-- 1) content: restrict anon exposure to explicit free-preview items only
DROP POLICY IF EXISTS "Public can view accessible current-term content" ON public.content;

CREATE POLICY "Authenticated can view accessible current-term content"
ON public.content
FOR SELECT
TO authenticated
USING (
  COALESCE(is_active, true)
  AND COALESCE(type, '') <> 'student_library'
  AND term_item_matches_current_system_term(subject_id, group_id, term)
  AND content_target_matches_student(education_type, subject_id, group_id, auth.uid(), target_section)
);

CREATE POLICY "Anon can view free preview current-term content"
ON public.content
FOR SELECT
TO anon
USING (
  COALESCE(is_active, true)
  AND COALESCE(is_free_preview, false) = true
  AND COALESCE(type, '') <> 'student_library'
  AND term_item_matches_current_system_term(subject_id, group_id, term)
);

-- 2) teacher_schedules: require authentication
DROP POLICY IF EXISTS "Anyone can view schedules" ON public.teacher_schedules;

CREATE POLICY "Authenticated members can view schedules"
ON public.teacher_schedules
FOR SELECT
TO authenticated
USING (
  auth.uid() = teacher_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'student'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);

DROP POLICY IF EXISTS "Teachers manage own schedules" ON public.teacher_schedules;
CREATE POLICY "Teachers manage own schedules"
ON public.teacher_schedules
FOR ALL
TO authenticated
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- 3) teacher_assignments: remove blanket authenticated read
DROP POLICY IF EXISTS "Authenticated can view teacher assignments" ON public.teacher_assignments;

CREATE POLICY "Students can view teacher assignments for browsing"
ON public.teacher_assignments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'student'::app_role));

-- 4) platform_settings: role-based admin checks only
DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;
CREATE POLICY "Admins can manage settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5) live-recordings storage: exact path matching instead of suffix comparison
DROP POLICY IF EXISTS "Subscribed students, owner teacher, or admin can view recording" ON storage.objects;
CREATE POLICY "Subscribed students, owner teacher, or admin can view recording"
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
      WHERE r.video_url = objects.name
         OR r.video_url = 'live-recordings/' || objects.name
    )
  )
);