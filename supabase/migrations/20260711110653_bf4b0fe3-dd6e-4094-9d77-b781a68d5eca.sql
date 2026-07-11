DROP POLICY IF EXISTS "AI sources accessible by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view AI sources" ON storage.objects;

CREATE POLICY "Entitled users can view AI source files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-sources'
  AND EXISTS (
    SELECT 1
    FROM public.ai_sources src
    WHERE src.subject_id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'teacher'::public.app_role)
        OR auth.uid() = src.uploaded_by
        OR EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.student_id = auth.uid()
            AND s.subject_id = src.subject_id
            AND s.is_active = true
            AND s.end_date > now()
        )
        OR EXISTS (
          SELECT 1
          FROM public.student_group_purchases sgp
          JOIN public.content_groups cg ON cg.id = sgp.group_id
          WHERE sgp.student_id = auth.uid()
            AND cg.subject_id = src.subject_id
        )
      )
  )
);