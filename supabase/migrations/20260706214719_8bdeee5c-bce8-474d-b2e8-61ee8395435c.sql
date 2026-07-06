CREATE OR REPLACE FUNCTION public.sync_exam_teacher_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'teacher_id' AND to_jsonb(NEW) ? 'created_by' THEN
    IF NEW.teacher_id IS NULL AND NEW.created_by IS NOT NULL THEN
      NEW.teacher_id := NEW.created_by;
    END IF;
    IF NEW.created_by IS NULL AND NEW.teacher_id IS NOT NULL THEN
      NEW.created_by := NEW.teacher_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_exam_teacher_columns ON public.exams;
CREATE TRIGGER trg_sync_exam_teacher_columns
BEFORE INSERT OR UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.sync_exam_teacher_columns();

NOTIFY pgrst, 'reload schema';