ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS fullscreen_exit_count integer NOT NULL DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_student_exam_stats(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int := 0;
  v_avg numeric := 0;
  v_best numeric := 0;
  v_time bigint := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_statistics' AND column_name = 'average_percentage'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.exam_statistics
        (student_id, total_exams_taken, total_passed, average_percentage, total_time_spent_seconds, by_subject, best_subject, weakest_subject, updated_at)
      SELECT $1,
             COUNT(*),
             COUNT(*) FILTER (WHERE passed),
             ROUND(COALESCE(AVG(percentage), 0), 2),
             COALESCE(SUM(time_spent_seconds), 0),
             '{}'::jsonb,
             NULL,
             NULL,
             now()
      FROM public.exam_attempts
      WHERE student_id = $1 AND status IN ('submitted','graded')
      ON CONFLICT (student_id) DO UPDATE
      SET total_exams_taken = EXCLUDED.total_exams_taken,
          total_passed = EXCLUDED.total_passed,
          average_percentage = EXCLUDED.average_percentage,
          total_time_spent_seconds = EXCLUDED.total_time_spent_seconds,
          updated_at = now()
    $sql$ USING _student_id;
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(AVG(percentage),0), COALESCE(MAX(percentage),0), COALESCE(SUM(time_spent_seconds),0)
  INTO v_total, v_avg, v_best, v_time
  FROM public.exam_attempts
  WHERE student_id = _student_id AND status IN ('submitted','graded');

  INSERT INTO public.exam_statistics (
    student_id, total_exams_taken, average_score, best_score, total_time_spent, updated_at
  ) VALUES (
    _student_id, v_total, ROUND(v_avg,2), v_best, v_time, now()
  )
  ON CONFLICT (student_id) DO UPDATE
  SET total_exams_taken = EXCLUDED.total_exams_taken,
      average_score = EXCLUDED.average_score,
      best_score = EXCLUDED.best_score,
      total_time_spent = EXCLUDED.total_time_spent,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_student_exam_stats(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';