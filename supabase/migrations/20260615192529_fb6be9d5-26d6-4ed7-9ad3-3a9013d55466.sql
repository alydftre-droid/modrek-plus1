
-- 1) Exams: remove broad NULL group_id read access
DROP POLICY IF EXISTS "Students can view purchased group exams" ON public.exams;
CREATE POLICY "Students can view purchased group exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND group_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id
      AND sgp.student_id = auth.uid()
  )
);

-- 2) teacher_assignments: drop overlapping/wide-open policies, keep minimal set
DROP POLICY IF EXISTS "Admin manage all" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Admins can manage teacher assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Admins manage assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "admin manage assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Allow All Authenticated Select" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teacher Select" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teacher insert own" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teacher view own" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers can insert assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers can view own assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers can view their own assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers insert assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers view assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teachers view own assignments" ON public.teacher_assignments;
DROP POLICY IF EXISTS "teacher view own assignment" ON public.teacher_assignments;

CREATE POLICY "Admins manage all teacher assignments"
ON public.teacher_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view own assignments"
ON public.teacher_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own assignments"
ON public.teacher_assignments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = teacher_id);

-- 3) live-recordings storage: anchor name match at end of video_url to prevent collisions
DROP POLICY IF EXISTS "Subscribed students, owner teacher, or admin can view recording" ON storage.objects;
CREATE POLICY "Subscribed students, owner teacher, or admin can view recording"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'live-recordings'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.live_session_recordings r
      JOIN public.student_group_purchases sgp
        ON sgp.group_id = r.group_id AND sgp.student_id = auth.uid()
      WHERE r.video_url = objects.name
         OR right(r.video_url, length(objects.name) + 1) = '/' || objects.name
    )
  )
);
