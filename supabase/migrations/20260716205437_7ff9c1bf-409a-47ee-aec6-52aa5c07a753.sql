
-- 1. Add is_free_preview column to content
ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_content_free_preview
  ON public.content (is_free_preview)
  WHERE is_free_preview = true;

-- 2. Extend the SELECT visibility policy so free-preview items are visible to
--    authenticated users regardless of subscription/group purchase.
DROP POLICY IF EXISTS "Content viewable by authorized users" ON public.content;

CREATE POLICY "Content viewable by authorized users"
ON public.content
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = uploaded_by
  OR COALESCE(is_paid, false) = false
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

-- 3. Prevent teachers from setting or clearing is_free_preview on their own
--    updates. Admins keep full control via the existing "Admins can manage
--    content" ALL policy.
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
      -- Silently revert unauthorized changes rather than failing the whole update.
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
