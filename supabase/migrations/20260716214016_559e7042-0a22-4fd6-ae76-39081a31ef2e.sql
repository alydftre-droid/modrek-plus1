ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_content_free_preview
  ON public.content (is_free_preview)
  WHERE is_free_preview = true;

-- Data API grants required by the app's content reads.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content TO authenticated;
GRANT ALL ON public.content TO service_role;
GRANT SELECT ON public.content_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_groups TO authenticated;
GRANT ALL ON public.content_groups TO service_role;
GRANT SELECT ON public.subjects TO anon;
GRANT SELECT ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_group_purchases TO authenticated;
GRANT ALL ON public.student_group_purchases TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

DROP POLICY IF EXISTS "Content viewable by authorized users" ON public.content;
DROP POLICY IF EXISTS "Admins can view all content" ON public.content;
DROP POLICY IF EXISTS "Uploaders can view their own content" ON public.content;
DROP POLICY IF EXISTS "Students can view accessible content" ON public.content;

CREATE POLICY "Admins can view all content"
ON public.content
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Uploaders can view their own content"
ON public.content
FOR SELECT
TO authenticated
USING (auth.uid() = uploaded_by);

CREATE POLICY "Students can view accessible content"
ON public.content
FOR SELECT
TO authenticated
USING (
  COALESCE(is_paid, false) = false
  OR COALESCE(is_free_preview, false) = true
  OR (
    group_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = auth.uid()
        AND sgp.group_id = content.group_id
    )
  )
  OR (
    subject_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.student_id = auth.uid()
        AND s.subject_id = content.subject_id
        AND s.is_active = true
        AND s.end_date > now()
    )
  )
);

CREATE OR REPLACE FUNCTION public.content_guard_free_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_free_preview, false) = true
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.is_free_preview := false;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_free_preview, false) IS DISTINCT FROM COALESCE(OLD.is_free_preview, false)
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.is_free_preview := OLD.is_free_preview;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_guard_free_preview ON public.content;
CREATE TRIGGER trg_content_guard_free_preview
BEFORE INSERT OR UPDATE ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.content_guard_free_preview();