-- Rebuild the content SELECT policy so that:
--  1. Admins (developers) always see EVERY content row.
--  2. Teachers always see the full content they uploaded.
--  3. Students see free / previewable / purchased / subscribed content.
-- The previous rewrite lost the TO authenticated targeting which, combined with
-- other permissive policies, could cause visibility gaps for the developer
-- when viewing a teacher's classroom. Restore explicit targeting and a clean
-- policy per audience.

DROP POLICY IF EXISTS "Content viewable by authorized users" ON public.content;

-- Admin / developer visibility (independent policy so nothing can filter it).
CREATE POLICY "Admins can view all content"
ON public.content
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Teacher / uploader visibility.
CREATE POLICY "Uploaders can view their own content"
ON public.content
FOR SELECT
TO authenticated
USING (auth.uid() = uploaded_by);

-- Student / general visibility (free, previewable, purchased, subscribed).
CREATE POLICY "Students can view accessible content"
ON public.content
FOR SELECT
TO authenticated
USING (
  COALESCE(is_paid, false) = false
  OR COALESCE(is_free_preview, false) = true
  OR (
    group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.student_id = auth.uid()
        AND sgp.group_id = content.group_id
    )
  )
  OR (
    subject_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.student_id = auth.uid()
        AND s.subject_id = content.subject_id
        AND s.is_active = true
        AND s.end_date > now()
    )
  )
);