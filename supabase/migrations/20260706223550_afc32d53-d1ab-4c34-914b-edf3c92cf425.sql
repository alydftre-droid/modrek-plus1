DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'exam_question_type'
      AND e.enumlabel = 'tf'
  ) THEN
    ALTER TYPE public.exam_question_type ADD VALUE 'tf';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_exam_question_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.question_type::text = 'tf' THEN
    NEW.question_type := 'true_false'::public.exam_question_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_exam_question_type ON public.exam_questions;
CREATE TRIGGER trg_normalize_exam_question_type
BEFORE INSERT OR UPDATE OF question_type ON public.exam_questions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_exam_question_type();

UPDATE public.exam_questions
SET question_type = 'true_false'::public.exam_question_type
WHERE question_type::text = 'tf';

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(_attempt_id uuid, _tab_switches integer DEFAULT 0, _fullscreen_exits integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_total_score numeric := 0;
  v_max_score numeric := 0;
  v_q record;
  v_ans record;
  v_correct_opts uuid[];
  v_pct numeric := 0;
  v_passed boolean := false;
  v_time_spent integer;
  v_needs_ai boolean := false;
  v_similarity numeric := 0;
  v_awarded numeric := 0;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة');
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم التسليم مسبقاً');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود');
  END IF;

  v_max_score := COALESCE(v_exam.total_marks, 0);

  FOR v_q IN SELECT * FROM public.exam_questions WHERE exam_id = v_attempt.exam_id LOOP
    IF v_q.question_type::text IN ('mcq','true_false','tf') THEN
      SELECT array_agg(id ORDER BY order_index) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      SELECT * INTO v_ans FROM public.exam_answers
      WHERE attempt_id = _attempt_id AND question_id = v_q.id;

      IF FOUND AND COALESCE(v_ans.selected_option_ids, '{}') @> COALESCE(v_correct_opts, '{}')
         AND COALESCE(v_correct_opts, '{}') @> COALESCE(v_ans.selected_option_ids, '{}')
         AND array_length(COALESCE(v_correct_opts, '{}'), 1) IS NOT NULL THEN
        v_awarded := COALESCE(v_q.marks, 0);
      ELSE
        v_awarded := 0;
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = true
      WHERE attempt_id = _attempt_id AND question_id = v_q.id;
      v_total_score := v_total_score + v_awarded;

    ELSIF v_q.question_type::text IN ('short_answer','fill_blank') THEN
      SELECT * INTO v_ans FROM public.exam_answers
      WHERE attempt_id = _attempt_id AND question_id = v_q.id;

      v_similarity := CASE
        WHEN NOT FOUND OR COALESCE(trim(v_ans.answer_text), '') = '' THEN 0
        WHEN lower(trim(v_ans.answer_text)) = lower(trim(COALESCE(v_q.correct_answer, ''))) THEN 1
        WHEN COALESCE(v_q.correct_answer, '') <> '' AND lower(COALESCE(v_q.correct_answer, '')) LIKE '%' || lower(trim(v_ans.answer_text)) || '%' THEN 0.8
        ELSE 0
      END;
      v_awarded := ROUND((COALESCE(v_q.marks, 0) * v_similarity)::numeric, 2);

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_similarity >= 0.8,
          auto_graded = true
      WHERE attempt_id = _attempt_id AND question_id = v_q.id;
      v_total_score := v_total_score + v_awarded;

    ELSIF v_q.question_type::text = 'essay' THEN
      v_needs_ai := true;
      UPDATE public.exam_answers
      SET auto_graded = false,
          ai_feedback = COALESCE(ai_feedback, 'بانتظار التصحيح الذكي العادل.')
      WHERE attempt_id = _attempt_id AND question_id = v_q.id;
    END IF;
  END LOOP;

  IF v_max_score <= 0 THEN v_max_score := v_total_score; END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN ROUND((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := EXTRACT(EPOCH FROM (now() - v_attempt.started_at))::integer;

  UPDATE public.exam_attempts
  SET status = CASE WHEN v_needs_ai THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(),
      completed_at = now(),
      total_score = v_total_score,
      max_score = v_max_score,
      percentage = v_pct,
      passed = v_passed,
      is_graded = NOT v_needs_ai,
      graded_at = CASE WHEN v_needs_ai THEN NULL ELSE now() END,
      time_spent_seconds = COALESCE(time_spent_seconds, v_time_spent),
      tab_switch_count = COALESCE(_tab_switches, 0),
      fullscreen_exit_count = COALESCE(_fullscreen_exits, 0),
      updated_at = now()
  WHERE id = _attempt_id;

  PERFORM public.refresh_student_exam_stats(v_student);

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', _attempt_id,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_ai_grading', v_needs_ai
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_exam_question_type() TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated, service_role;