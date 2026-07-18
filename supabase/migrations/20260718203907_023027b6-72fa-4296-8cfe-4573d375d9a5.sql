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
    SELECT id, name, is_active
    INTO resolved
    FROM public.sub_subjects
    WHERE id = NEW.sub_subject_id
      AND group_id = NEW.group_id
    LIMIT 1;

    IF FOUND THEN
      NEW.sub_subject := resolved.name;
      RETURN NEW;
    ELSE
      NEW.sub_subject_id := NULL;
    END IF;
  END IF;

  IF NEW.sub_subject_id IS NULL AND NULLIF(NEW.sub_subject, '') IS NOT NULL THEN
    SELECT id, name
    INTO resolved
    FROM public.sub_subjects
    WHERE group_id = NEW.group_id
      AND trim(name) = trim(NEW.sub_subject)
    ORDER BY COALESCE(is_active, true) DESC, order_index NULLS LAST, created_at
    LIMIT 1;

    IF FOUND THEN
      NEW.sub_subject_id := resolved.id;
      NEW.sub_subject := resolved.name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() TO service_role;