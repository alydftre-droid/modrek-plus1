-- Exam submission production repair: unified resilient submit + diagnostics

CREATE TABLE IF NOT EXISTS public.exam_attempt_debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  student_id uuid,
  exam_id uuid,
  attempt_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.exam_attempt_debug_logs TO service_role;

ALTER TABLE public.exam_attempt_debug_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages exam debug logs" ON public.exam_attempt_debug_logs;
CREATE POLICY "Service role manages exam debug logs"
ON public.exam_attempt_debug_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_created_at ON public.exam_attempt_debug_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_attempt_id ON public.exam_attempt_debug_logs(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_exam_student ON public.exam_attempt_debug_logs(exam_id, student_id) WHERE exam_id IS NOT NULL AND student_id IS NOT NULL;

ALTER TABLE public.exam_attempts ALTER COLUMN status SET DEFAULT 'in_progress'::public.exam_attempt_status;
ALTER TABLE public.exam_attempts ALTER COLUMN submitted_at DROP NOT NULL;
ALTER TABLE public.exam_attempts ALTER COLUMN submitted_at DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.log_exam_attempt_debug(
  _stage text,
  _student_id uuid DEFAULT NULL,
  _exam_id uuid DEFAULT NULL,
  _attempt_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.exam_attempt_debug_logs(stage, student_id, exam_id, attempt_id, payload)
  VALUES (_stage, _student_id, _exam_id, _attempt_id, COALESCE(_payload, '{}'::jsonb));
EXCEPTION WHEN others THEN
  RAISE LOG '[exam-debug] log_insert_failed stage=% student_id=% exam_id=% attempt_id=% error=%', _stage, _student_id, _exam_id, _attempt_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.log_exam_attempt_debug(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_exam_attempt_debug(text, uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_exam_grading_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(_value, '')), '[أإآٱا]', 'ا', 'g'),
          '[ىي]', 'ي', 'g'
        ),
        'ة', 'ه', 'g'
      ),
      '[^[:alnum:]ء-ي]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.smart_exam_text_score(_answer text, _model text, _max_score numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  a text := public.normalize_exam_grading_text(_answer);
  m text := public.normalize_exam_grading_text(_model);
  a_words text[];
  m_words text[];
  common_count integer := 0;
  meaningful_model_count integer := 0;
  coverage numeric := 0;
  word text;
BEGIN
  IF coalesce(_max_score, 0) <= 0 OR a = '' OR m = '' THEN
    RETURN 0;
  END IF;

  IF a = m OR position(a in m) > 0 OR position(m in a) > 0 THEN
    RETURN round(_max_score::numeric, 2);
  END IF;

  a_words := regexp_split_to_array(a, '\s+');
  m_words := regexp_split_to_array(m, '\s+');

  FOREACH word IN ARRAY m_words LOOP
    IF length(word) >= 3 THEN
      meaningful_model_count := meaningful_model_count + 1;
      IF word = ANY(a_words) THEN
        common_count := common_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF meaningful_model_count = 0 THEN
    RETURN 0;
  END IF;

  coverage := common_count::numeric / meaningful_model_count::numeric;

  RETURN round((
    CASE
      WHEN coverage >= 0.85 THEN _max_score
      WHEN coverage >= 0.70 THEN _max_score * 0.85
      WHEN coverage >= 0.55 THEN _max_score * 0.70
      WHEN coverage >= 0.40 THEN _max_score * 0.50
      WHEN coverage >= 0.25 THEN _max_score * 0.30
      WHEN coverage >= 0.15 THEN _max_score * 0.15
      ELSE 0
    END
  )::numeric, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_modrek_ai_training_exam_for_student(
  _source text,
  _owner_student_id uuid,
  _teacher_id uuid,
  _group_id uuid,
  _student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _student_id IS NOT NULL
     AND _owner_student_id = _student_id
     AND (
       COALESCE(_source, 'teacher') = 'modrek_ai'
       OR (_teacher_id IS NULL AND _group_id IS NULL)
     )
$$;

CREATE OR REPLACE FUNCTION public.is_modrek_training_exam_accessible(
  _exam_id uuid,
  _student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _student_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.exams e
       WHERE e.id = _exam_id
         AND e.is_published = true
         AND e.status = 'published'::exam_status
         AND (
           public.is_modrek_ai_training_exam_for_student(e.source, e.owner_student_id, e.teacher_id, e.group_id, _student_id)
           OR (
             EXISTS (
               SELECT 1
               FROM public.exam_attempts a
               WHERE a.exam_id = e.id
                 AND a.student_id = _student_id
             )
             AND (
               COALESCE(e.source, 'teacher') = 'modrek_ai'
               OR e.owner_student_id = _student_id
               OR (e.teacher_id IS NULL AND e.group_id IS NULL)
             )
           )
         )
     )
$$;

CREATE OR REPLACE FUNCTION public.start_modrek_training_attempt(_exam_id uuid, _attempt_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_attempt public.exam_attempts%ROWTYPE;
  v_existing_count integer := 0;
  v_attempt_id uuid;
  v_max_score numeric := 0;
BEGIN
  PERFORM public.log_exam_attempt_debug('training_start.received', v_student, _exam_id, _attempt_id, jsonb_build_object('exam_id', _exam_id, 'attempt_id', _attempt_id));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'التدريب غير متاح', 'code', 'training_unavailable');
  END IF;

  IF NOT public.is_modrek_training_exam_accessible(_exam_id, v_student) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو غير متاح', 'code', 'training_not_available');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
      AND exam_id = _exam_id
      AND student_id = v_student
    LIMIT 1;

    IF FOUND THEN
      IF v_attempt.status = 'in_progress'::exam_attempt_status THEN
        RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resumed', true, 'training_exam', true, 'code', 'attempt_resumed');
      END IF;
      RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'already_submitted', true, 'training_exam', true, 'code', 'already_submitted');
    END IF;
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE exam_id = _exam_id
    AND student_id = v_student
    AND status = 'in_progress'::exam_attempt_status
  ORDER BY started_at DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resumed', true, 'training_exam', true, 'code', 'attempt_resumed');
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id
    AND student_id = v_student
    AND status IN ('submitted','graded','expired');

  IF v_existing_count >= COALESCE(v_exam.max_attempts, 999) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد المحاولات', 'training_exam', true, 'code', 'max_attempts_reached');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions
  WHERE exam_id = _exam_id
    AND question_type::text <> 'section';

  IF COALESCE(v_max_score, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا توجد أسئلة صالحة في هذا التدريب', 'training_exam', true, 'code', 'no_questions');
  END IF;

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score, status, submitted_at)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score, 'in_progress'::exam_attempt_status, NULL)
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id
    AND q.question_type::text <> 'section'
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  PERFORM public.log_exam_attempt_debug('training_start.created', v_student, _exam_id, v_attempt_id, jsonb_build_object('max_score', v_max_score));
  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false, 'training_exam', true, 'code', 'attempt_created');
END;
$$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM public.log_exam_attempt_debug('start.received', v_student, _exam_id, NULL, jsonb_build_object('student_id', v_student, 'exam_id', _exam_id));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح', 'code', 'exam_unavailable');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(_exam_id, v_student);

  IF v_is_training_exam THEN
    RETURN public.start_modrek_training_attempt(_exam_id, NULL);
  END IF;

  IF COALESCE(v_exam.source, 'teacher') = 'modrek_ai'
     OR v_exam.owner_student_id IS NOT NULL
     OR (v_exam.teacher_id IS NULL AND v_exam.group_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو غير متاح', 'training_exam', true, 'code', 'training_not_available');
  END IF;

  IF v_exam.group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير مرتبط بمجموعة', 'code', 'missing_group');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND sgp.student_id = v_student
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين', 'code', 'not_in_group');
  END IF;

  IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'target_mismatch');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يبدأ وقت الامتحان بعد', 'code', 'not_started');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت إتاحة الامتحان', 'code', 'ended');
  END IF;

  SELECT * INTO v_existing_attempt
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  ORDER BY started_at DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_existing_attempt.id, 'student_id', v_student, 'exam_id', _exam_id, 'resumed', true, 'training_exam', false, 'code', 'attempt_resumed');
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded','expired');

  IF v_existing_count >= COALESCE(v_exam.max_attempts, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد المحاولات', 'code', 'max_attempts_reached');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions
  WHERE exam_id = _exam_id
    AND question_type::text <> 'section';

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score, status, submitted_at)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score, 'in_progress'::public.exam_attempt_status, NULL)
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id
    AND q.question_type::text <> 'section'
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  PERFORM public.log_exam_attempt_debug('start.created', v_student, _exam_id, v_attempt_id, jsonb_build_object('attempt_id', v_attempt_id, 'precreated_answers', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt_id)));

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'student_id', v_student, 'exam_id', _exam_id, 'resumed', false, 'training_exam', false, 'code', 'attempt_created');
END;
$$;

CREATE OR REPLACE FUNCTION public.grade_exam_attempt_core(
  _attempt_id uuid,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
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
  v_ans public.exam_answers%ROWTYPE;
  v_correct_opts uuid[];
  v_selected_opts uuid[];
  v_pct numeric := 0;
  v_passed boolean := false;
  v_time_spent integer;
  v_needs_ai boolean := false;
  v_needs_manual boolean := false;
  v_awarded numeric := 0;
  v_answer_text text;
  v_question_type text;
  v_feedback text;
  v_is_training_exam boolean := false;
  v_questions_count integer := 0;
  v_answers_count integer := 0;
BEGIN
  PERFORM public.log_exam_attempt_debug('core.received', v_student, NULL, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_student_id', v_student, 'tab_switches', COALESCE(_tab_switches, 0), 'fullscreen_exits', COALESCE(_fullscreen_exits, 0)));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة', 'code', 'attempt_not_found', 'received_attempt_id', _attempt_id, 'received_student_id', v_student);
  END IF;

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_attempt.exam_id, 'already_submitted', true, 'code', 'already_submitted');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود', 'code', 'exam_not_found');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(v_exam.id, v_student);

  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = v_exam.group_id
        AND sgp.student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب', 'code', 'exam_not_accessible');
    END IF;

    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'exam_target_mismatch');
    END IF;
  END IF;

  SELECT COALESCE(sum(q.marks), 0), COUNT(*) INTO v_max_score, v_questions_count
  FROM public.exam_questions q
  WHERE q.exam_id = v_attempt.exam_id
    AND q.question_type::text <> 'section';

  SELECT COUNT(*) INTO v_answers_count FROM public.exam_answers WHERE attempt_id = v_attempt.id;
  PERFORM public.log_exam_attempt_debug('core.before_grading', v_student, v_exam.id, v_attempt.id, jsonb_build_object('questions_count', v_questions_count, 'answers_count', v_answers_count, 'max_score', v_max_score));

  FOR v_q IN
    SELECT *
    FROM public.exam_questions
    WHERE exam_id = v_attempt.exam_id
      AND question_type::text <> 'section'
    ORDER BY order_index
  LOOP
    v_question_type := v_q.question_type::text;

    INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct, auto_graded, ai_feedback)
    VALUES (v_attempt.id, v_q.id, '{}'::uuid[], NULL, 0, false, true, 'لم يجب الطالب على هذا السؤال.')
    ON CONFLICT (attempt_id, question_id) DO NOTHING;

    SELECT * INTO v_ans
    FROM public.exam_answers
    WHERE attempt_id = v_attempt.id AND question_id = v_q.id;

    v_awarded := 0;
    v_feedback := NULL;
    v_answer_text := COALESCE(v_ans.answer_text, '');
    v_selected_opts := COALESCE(v_ans.selected_option_ids, '{}'::uuid[]);

    IF v_question_type IN ('mcq','true_false','tf') THEN
      SELECT COALESCE(array_agg(id ORDER BY order_index), '{}'::uuid[]) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      IF cardinality(v_correct_opts) > 0
         AND v_selected_opts @> v_correct_opts
         AND v_correct_opts @> v_selected_opts THEN
        v_awarded := COALESCE(v_q.marks, 0);
        v_feedback := 'إجابة صحيحة.';
      ELSIF cardinality(v_selected_opts) = 0 THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSE
        v_awarded := 0;
        v_feedback := 'إجابة غير صحيحة. راجع الإجابة الصحيحة.';
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = true,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;

    ELSIF v_question_type IN ('short_answer','fill_blank','essay') THEN
      IF trim(v_answer_text) = '' THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSIF COALESCE(trim(v_q.correct_answer), '') = '' THEN
        v_awarded := 0;
        v_needs_manual := true;
        v_feedback := 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.';
      ELSE
        v_awarded := public.smart_exam_text_score(v_answer_text, v_q.correct_answer, COALESCE(v_q.marks, 0));
        v_needs_ai := true;
        v_feedback := CASE
          WHEN v_awarded >= COALESCE(v_q.marks, 0) THEN 'إجابة صحيحة بالمعنى.'
          WHEN v_awarded > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.'
          ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.'
        END;
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = NOT v_needs_manual,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;
    END IF;

    v_total_score := v_total_score + COALESCE(v_awarded, 0);
  END LOOP;

  IF v_max_score <= 0 THEN
    v_max_score := greatest(COALESCE(v_exam.total_marks, 0), v_total_score);
  END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN round((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);

  UPDATE public.exam_attempts
  SET status = CASE WHEN v_needs_manual THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(),
      completed_at = now(),
      total_score = v_total_score,
      score = v_total_score,
      max_score = v_max_score,
      total = v_max_score,
      percentage = v_pct,
      passed = v_passed,
      is_graded = NOT v_needs_manual,
      graded_at = CASE WHEN v_needs_manual THEN NULL ELSE now() END,
      time_spent_seconds = CASE WHEN COALESCE(time_spent_seconds, 0) > 0 THEN time_spent_seconds ELSE v_time_spent END,
      time_taken = CASE WHEN COALESCE(time_taken, 0) > 0 THEN time_taken ELSE v_time_spent END,
      tab_switch_count = COALESCE(_tab_switches, 0),
      fullscreen_exit_count = COALESCE(_fullscreen_exits, 0),
      fullscreen_exits = COALESCE(_fullscreen_exits, 0),
      updated_at = now()
  WHERE id = v_attempt.id;

  PERFORM public.refresh_student_exam_stats(v_student);
  PERFORM public.log_exam_attempt_debug('core.completed', v_student, v_exam.id, v_attempt.id, jsonb_build_object('total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'final_status', CASE WHEN v_needs_manual THEN 'submitted' ELSE 'graded' END));

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_exam.id, 'total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'needs_ai_grading', v_needs_ai, 'needs_manual_grading', v_needs_manual, 'code', 'submitted');
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt_resilient(
  _exam_id uuid DEFAULT NULL,
  _attempt_id uuid DEFAULT NULL,
  _answers jsonb DEFAULT '[]'::jsonb,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_direct_attempt public.exam_attempts%ROWTYPE;
  v_direct_found boolean := false;
  v_found boolean := false;
  v_recovered boolean := false;
  v_submit jsonb;
  v_answer jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_answer_text text;
  v_flagged boolean;
  v_attempt_row_json jsonb := NULL;
  v_answers_count integer := CASE WHEN jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(_answers, '[]'::jsonb)) ELSE 0 END;
  v_latest_in_progress_count integer := 0;
  v_latest_any_attempt public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM public.log_exam_attempt_debug('submit.received', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'answers_count', v_answers_count));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT count(*) INTO v_latest_in_progress_count
  FROM public.exam_attempts
  WHERE student_id = v_student
    AND status = 'in_progress'::public.exam_attempt_status;

  SELECT * INTO v_latest_any_attempt
  FROM public.exam_attempts
  WHERE student_id = v_student
  ORDER BY COALESCE(updated_at, submitted_at, completed_at, started_at, created_at) DESC
  LIMIT 1;

  IF _exam_id IS NULL AND _attempt_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      _exam_id := v_attempt.exam_id;
      _attempt_id := v_attempt.id;
      v_found := true;
      v_recovered := true;
      PERFORM public.log_exam_attempt_debug('submit.recovered_latest_without_context', v_student, _exam_id, _attempt_id, jsonb_build_object('reason', 'missing_exam_and_attempt'));
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.rejected.missing_context', v_student, NULL, NULL, jsonb_build_object('latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt', CASE WHEN v_latest_any_attempt.id IS NOT NULL THEN to_jsonb(v_latest_any_attempt) ELSE NULL END));
      RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة', 'code', 'missing_attempt_context', 'received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt_status', v_latest_any_attempt.status, 'latest_any_attempt_id', v_latest_any_attempt.id);
    END IF;
  END IF;

  IF _attempt_id IS NOT NULL AND NOT v_found THEN
    SELECT * INTO v_direct_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
    LIMIT 1;
    v_direct_found := FOUND;

    IF v_direct_found THEN
      v_attempt_row_json := to_jsonb(v_direct_attempt);
      IF v_direct_attempt.student_id = v_student AND _exam_id IS NULL THEN
        _exam_id := v_direct_attempt.exam_id;
      END IF;
    END IF;

    IF v_direct_found
       AND v_direct_attempt.student_id = v_student
       AND (_exam_id IS NULL OR v_direct_attempt.exam_id = _exam_id) THEN
      v_attempt := v_direct_attempt;
      v_found := true;
    END IF;
  END IF;

  IF (NOT v_found OR v_attempt.status <> 'in_progress'::public.exam_attempt_status) AND _exam_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE exam_id = _exam_id
      AND student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_found := true;
      v_recovered := true;
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      _exam_id := v_attempt.exam_id;
      v_found := true;
      v_recovered := true;
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE exam_id = _exam_id
      AND student_id = v_student
      AND status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status, 'expired'::public.exam_attempt_status)
    ORDER BY COALESCE(submitted_at, completed_at, started_at, created_at) DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'student_id', v_student, 'exam_id', v_attempt.exam_id, 'attempt_row', to_jsonb(v_attempt), 'already_submitted', true, 'recovered_attempt', true, 'code', 'already_submitted');
    END IF;
  END IF;

  IF NOT v_found THEN
    PERFORM public.log_exam_attempt_debug('submit.failed.attempt_not_found', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'direct_attempt_row', v_attempt_row_json, 'latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt', CASE WHEN v_latest_any_attempt.id IS NOT NULL THEN to_jsonb(v_latest_any_attempt) ELSE NULL END));
    RETURN jsonb_build_object(
      'success', false,
      'error', 'محاولة غير صالحة',
      'code', 'attempt_not_found',
      'received_attempt_id', _attempt_id,
      'received_exam_id', _exam_id,
      'received_student_id', v_student,
      'direct_attempt_row', v_attempt_row_json,
      'latest_in_progress_count', v_latest_in_progress_count,
      'latest_any_attempt_id', v_latest_any_attempt.id,
      'latest_any_attempt_status', v_latest_any_attempt.status,
      'root_cause', CASE
        WHEN _attempt_id IS NOT NULL AND v_direct_found IS FALSE THEN 'received_attempt_id_does_not_exist_in_database'
        WHEN _attempt_id IS NOT NULL AND v_direct_found IS TRUE AND v_direct_attempt.student_id <> v_student THEN 'received_attempt_belongs_to_different_student'
        WHEN _exam_id IS NOT NULL AND v_latest_in_progress_count = 0 THEN 'no_in_progress_attempt_for_this_student_and_exam'
        ELSE 'attempt_context_not_resolvable'
      END
    );
  END IF;

  PERFORM public.log_exam_attempt_debug('submit.resolved', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('received_attempt_id', _attempt_id, 'resolved_attempt_id', v_attempt.id, 'created_at', v_attempt.created_at, 'status', v_attempt.status, 'recovered', v_recovered));

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'student_id', v_student, 'exam_id', v_attempt.exam_id, 'attempt_row', to_jsonb(v_attempt), 'already_submitted', true, 'recovered_attempt', v_recovered, 'code', 'already_submitted');
  END IF;

  IF jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(COALESCE(_answers, '[]'::jsonb)) LOOP
      BEGIN
        v_question_id := COALESCE(v_answer->>'questionId', v_answer->>'question_id')::uuid;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM public.exam_questions q
        WHERE q.id = v_question_id
          AND q.exam_id = v_attempt.exam_id
          AND q.question_type::text <> 'section'
      ) THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(array_agg(value::uuid), '{}'::uuid[])
      INTO v_selected
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(v_answer->'selectedOptionIds') = 'array' THEN v_answer->'selectedOptionIds'
          WHEN jsonb_typeof(v_answer->'selected_option_ids') = 'array' THEN v_answer->'selected_option_ids'
          ELSE '[]'::jsonb
        END
      ) AS selected(value)
      WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      v_answer_text := NULLIF(COALESCE(v_answer->>'answerText', v_answer->>'answer_text', ''), '');
      v_flagged := lower(COALESCE(v_answer->>'flagged', 'false')) IN ('true', '1', 'yes', 'y');

      INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, time_spent_seconds, flagged_for_review, answered_at)
      VALUES (v_attempt.id, v_question_id, COALESCE(v_selected, '{}'::uuid[]), v_answer_text, 0, v_flagged, now())
      ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option_ids = EXCLUDED.selected_option_ids,
          answer_text = EXCLUDED.answer_text,
          flagged_for_review = EXCLUDED.flagged_for_review,
          answered_at = now();
    END LOOP;
  END IF;

  v_submit := public.grade_exam_attempt_core(v_attempt.id, COALESCE(_tab_switches, 0), COALESCE(_fullscreen_exits, 0));

  PERFORM public.log_exam_attempt_debug('submit.core_result', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('result', v_submit, 'attempt_after_submit', (SELECT to_jsonb(a) FROM public.exam_attempts a WHERE a.id = v_attempt.id), 'answers_after_submit', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt.id)));

  RETURN v_submit || jsonb_build_object('attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'student_id', v_student, 'exam_id', v_attempt.exam_id, 'attempt_row', to_jsonb(v_attempt), 'recovered_attempt', v_recovered, 'code', COALESCE(v_submit->>'code', 'submitted'));
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _attempt_id uuid,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam_id uuid := NULL;
  v_res jsonb;
BEGIN
  PERFORM public.log_exam_attempt_debug('legacy_submit.received', v_student, NULL, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_student_id', v_student, 'note', 'legacy RPC bridged to submit_exam_attempt_resilient'));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id LIMIT 1;
    IF FOUND AND v_attempt.student_id = v_student THEN
      v_exam_id := v_attempt.exam_id;
    END IF;
  END IF;

  IF v_exam_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_exam_id := v_attempt.exam_id;
    END IF;
  END IF;

  v_res := public.submit_exam_attempt_resilient(v_exam_id, COALESCE(_attempt_id, v_attempt.id), '[]'::jsonb, COALESCE(_tab_switches, 0), COALESCE(_fullscreen_exits, 0));

  PERFORM public.log_exam_attempt_debug('legacy_submit.completed', v_student, COALESCE(v_exam_id, (v_res->>'exam_id')::uuid), COALESCE((v_res->>'resolved_attempt_id')::uuid, (v_res->>'attempt_id')::uuid, _attempt_id), jsonb_build_object('result', v_res));
  RETURN v_res || jsonb_build_object('legacy_bridge', true);
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_exam_grading_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_exam_grading_text(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.smart_exam_text_score(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';