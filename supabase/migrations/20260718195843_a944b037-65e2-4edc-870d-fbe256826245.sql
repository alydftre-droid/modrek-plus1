CREATE OR REPLACE FUNCTION public.trg_content_infer_sub_subject_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved RECORD;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sub_subject_id IS NOT NULL THEN
    SELECT id, name
    INTO resolved
    FROM public.sub_subjects
    WHERE id = NEW.sub_subject_id
      AND group_id = NEW.group_id
      AND COALESCE(is_active, true) = true
    LIMIT 1;

    IF FOUND THEN
      NEW.sub_subject := resolved.name;
    ELSE
      NEW.sub_subject_id := NULL;
    END IF;
  END IF;

  IF NEW.sub_subject_id IS NULL AND NULLIF(NEW.sub_subject, '') IS NOT NULL THEN
    SELECT id, name
    INTO resolved
    FROM public.sub_subjects
    WHERE group_id = NEW.group_id
      AND COALESCE(is_active, true) = true
      AND trim(name) = trim(NEW.sub_subject)
    ORDER BY order_index NULLS LAST, created_at
    LIMIT 1;

    IF FOUND THEN
      NEW.sub_subject_id := resolved.id;
      NEW.sub_subject := resolved.name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_infer_sub_subject_before_write ON public.content;
CREATE TRIGGER trg_content_infer_sub_subject_before_write
BEFORE INSERT OR UPDATE OF group_id, sub_subject_id, sub_subject ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.trg_content_infer_sub_subject_before_write();

REVOKE EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() TO service_role;

UPDATE public.content c
SET
  sub_subject_id = ss.id,
  sub_subject = ss.name
FROM public.sub_subjects ss
WHERE c.group_id = ss.group_id
  AND c.sub_subject_id IS NULL
  AND NULLIF(c.sub_subject, '') IS NOT NULL
  AND trim(c.sub_subject) = trim(ss.name)
  AND COALESCE(ss.is_active, true) = true;