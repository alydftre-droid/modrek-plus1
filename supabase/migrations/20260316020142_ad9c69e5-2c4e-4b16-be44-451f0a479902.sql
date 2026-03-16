-- Allow teachers to view purchases for groups they own
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
    AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

-- Allow teachers to view video progress for their students
CREATE POLICY "Teachers can view student video progress"
ON public.video_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_teacher_choices
    WHERE student_teacher_choices.student_id = video_progress.user_id
    AND student_teacher_choices.teacher_id = auth.uid()
  )
);