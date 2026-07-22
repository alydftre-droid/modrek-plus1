CREATE OR REPLACE FUNCTION public.enforce_exam_pass_threshold()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pct numeric;
BEGIN
  IF NEW.max_score IS NOT NULL AND NEW.max_score > 0 THEN
    v_pct := COALESCE(NEW.percentage, round((COALESCE(NEW.total_score,0)::numeric / NEW.max_score) * 100, 2));
    NEW.percentage := v_pct;
    NEW.passed := v_pct >= 50;
  ELSE
    NEW.passed := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_exam_pass_threshold ON public.exam_attempts;
CREATE TRIGGER trg_enforce_exam_pass_threshold
  BEFORE INSERT OR UPDATE OF total_score, max_score, percentage, passed
  ON public.exam_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_exam_pass_threshold();

UPDATE public.exam_attempts
SET passed = CASE
  WHEN max_score IS NOT NULL AND max_score > 0
    THEN round((COALESCE(total_score,0)::numeric / max_score) * 100, 2) >= 50
  ELSE false
END
WHERE status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status);