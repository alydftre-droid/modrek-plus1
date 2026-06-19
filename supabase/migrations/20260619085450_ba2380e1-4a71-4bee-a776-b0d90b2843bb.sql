DROP POLICY IF EXISTS "Content viewable by authorized users" ON public.content;

CREATE POLICY "Content viewable by authorized users"
ON public.content
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = uploaded_by
  OR COALESCE(is_paid, false) = false
  OR (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = auth.uid()
        AND sgp.group_id = content.group_id
    )
  )
  OR (
    subject_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.student_id = auth.uid()
        AND s.subject_id = content.subject_id
        AND s.is_active = true
        AND s.end_date > now()
    )
  )
);