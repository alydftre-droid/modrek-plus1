DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.exam_attempts
    WHERE status = 'in_progress'::public.exam_attempt_status
    GROUP BY exam_id, student_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique in-progress attempt guard: duplicate in-progress attempts exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_one_in_progress
ON public.exam_attempts (exam_id, student_id)
WHERE status = 'in_progress'::public.exam_attempt_status;