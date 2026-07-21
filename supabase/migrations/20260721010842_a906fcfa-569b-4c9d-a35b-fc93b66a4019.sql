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

CREATE OR REPLACE FUNCTION public.is_exam_non_answer(_answer text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  a text := public.normalize_exam_grading_text(_answer);
BEGIN
  IF a = '' THEN
    RETURN true;
  END IF;

  IF a IN ('?', '0', 'لا', 'لم', 'مش', 'معرفش', 'ماعرفش', 'مدري') THEN
    RETURN true;
  END IF;

  RETURN a LIKE '%لا اعرف%'
      OR a LIKE '%لا ادري%'
      OR a LIKE '%لا اعلم%'
      OR a LIKE '%مش عارف%'
      OR a LIKE '%مش عارفه%'
      OR a LIKE '%معرفش%'
      OR a LIKE '%ماعرفش%'
      OR a LIKE '%مش فاكر%'
      OR a LIKE '%لا اتذكر%'
      OR a LIKE '%لم اجب%'
      OR a LIKE '%بدون اجابه%';
END;
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
  a_meaningful text[] := ARRAY[]::text[];
  m_meaningful text[] := ARRAY[]::text[];
  a_numbers text[] := ARRAY[]::text[];
  m_numbers text[] := ARRAY[]::text[];
  common_count integer := 0;
  a_count integer := 0;
  m_count integer := 0;
  answer_coverage numeric := 0;
  model_coverage numeric := 0;
  combined numeric := 0;
  word text;
  stop_words text[] := ARRAY['من','في','على','علي','عن','الى','الي','ان','إن','أن','هو','هي','هما','هم','هن','هذا','هذه','ذلك','تلك','الذي','التي','الذين','او','أو','و','ثم','كما','كل','اي','أي','لا','لم','لن','ما','مع','بين','عند','اذا','إذا','كان','كانت','يكون','تكون','قد','لقد','حتى','حتي','فقط','غير','بعد','قبل','خلال','حول','له','لها','به','بها','فيها'];
BEGIN
  IF coalesce(_max_score, 0) <= 0 OR a = '' OR m = '' THEN
    RETURN 0;
  END IF;
  IF public.is_exam_non_answer(_answer) THEN
    RETURN 0;
  END IF;
  a_words := regexp_split_to_array(a, '\s+');
  m_words := regexp_split_to_array(m, '\s+');
  FOREACH word IN ARRAY a_words LOOP
    IF word ~ '^[0-9]+$' THEN a_numbers := array_append(a_numbers, word); END IF;
    IF length(word) >= 3 AND NOT word = ANY(stop_words) AND NOT word = ANY(a_meaningful) THEN
      a_meaningful := array_append(a_meaningful, word);
    END IF;
  END LOOP;
  FOREACH word IN ARRAY m_words LOOP
    IF word ~ '^[0-9]+$' THEN m_numbers := array_append(m_numbers, word); END IF;
    IF length(word) >= 3 AND NOT word = ANY(stop_words) AND NOT word = ANY(m_meaningful) THEN
      m_meaningful := array_append(m_meaningful, word);
    END IF;
  END LOOP;
  a_count := cardinality(a_meaningful);
  m_count := cardinality(m_meaningful);
  IF m_count = 0 OR a_count = 0 THEN RETURN 0; END IF;
  IF a = m THEN RETURN round(_max_score::numeric, 2); END IF;
  IF m_count <= 4 AND (position(a in m) > 0 OR position(m in a) > 0) THEN
    IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
      RETURN round((_max_score * 0.40)::numeric, 2);
    END IF;
    RETURN round(_max_score::numeric, 2);
  END IF;
  FOREACH word IN ARRAY a_meaningful LOOP
    IF word = ANY(m_meaningful) THEN common_count := common_count + 1; END IF;
  END LOOP;
  IF common_count = 0 THEN RETURN 0; END IF;
  answer_coverage := common_count::numeric / a_count::numeric;
  model_coverage := common_count::numeric / m_count::numeric;
  combined := greatest(model_coverage, least(answer_coverage, model_coverage + 0.25));
  IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
    combined := least(combined, 0.45);
  END IF;
  RETURN round((CASE
    WHEN combined >= 0.85 AND model_coverage >= 0.60 THEN _max_score
    WHEN combined >= 0.65 THEN _max_score * 0.80
    WHEN combined >= 0.45 THEN _max_score * 0.60
    WHEN combined >= 0.28 THEN _max_score * 0.40
    WHEN combined >= 0.15 THEN _max_score * 0.20
    ELSE 0 END)::numeric, 2);
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
  IF v_student IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated'); END IF;
  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة', 'code', 'attempt_not_found', 'received_attempt_id', _attempt_id, 'received_student_id', v_student);
  END IF;
  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_attempt.exam_id, 'already_submitted', true, 'code', 'already_submitted');
  END IF;
  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود', 'code', 'exam_not_found'); END IF;
  v_is_training_exam := public.is_modrek_training_exam_accessible(v_exam.id, v_student);
  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.student_group_purchases sgp WHERE sgp.group_id = v_exam.group_id AND sgp.student_id = v_student) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب', 'code', 'exam_not_accessible');
    END IF;
    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'exam_target_mismatch');
    END IF;
  END IF;
  SELECT COALESCE(sum(q.marks), 0), COUNT(*) INTO v_max_score, v_questions_count FROM public.exam_questions q WHERE q.exam_id = v_attempt.exam_id AND q.question_type::text <> 'section';
  SELECT COUNT(*) INTO v_answers_count FROM public.exam_answers WHERE attempt_id = v_attempt.id;
  PERFORM public.log_exam_attempt_debug('core.before_grading', v_student, v_exam.id, v_attempt.id, jsonb_build_object('questions_count', v_questions_count, 'answers_count', v_answers_count, 'max_score', v_max_score));
  FOR v_q IN SELECT * FROM public.exam_questions WHERE exam_id = v_attempt.exam_id AND question_type::text <> 'section' ORDER BY order_index LOOP
    v_question_type := v_q.question_type::text;
    INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct, auto_graded, ai_feedback)
    VALUES (v_attempt.id, v_q.id, '{}'::uuid[], NULL, 0, false, true, 'لم يجب الطالب على هذا السؤال.') ON CONFLICT (attempt_id, question_id) DO NOTHING;
    SELECT * INTO v_ans FROM public.exam_answers WHERE attempt_id = v_attempt.id AND question_id = v_q.id;
    v_awarded := 0; v_feedback := NULL; v_answer_text := COALESCE(v_ans.answer_text, ''); v_selected_opts := COALESCE(v_ans.selected_option_ids, '{}'::uuid[]);
    IF v_question_type IN ('mcq','true_false','tf') THEN
      SELECT COALESCE(array_agg(id ORDER BY order_index), '{}'::uuid[]) INTO v_correct_opts FROM public.exam_question_options WHERE question_id = v_q.id AND is_correct = true;
      IF cardinality(v_correct_opts) > 0 AND v_selected_opts @> v_correct_opts AND v_correct_opts @> v_selected_opts THEN
        v_awarded := COALESCE(v_q.marks, 0); v_feedback := 'إجابة صحيحة.';
      ELSIF cardinality(v_selected_opts) = 0 THEN
        v_awarded := 0; v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSE
        v_awarded := 0; v_feedback := 'إجابة غير صحيحة. راجع الإجابة الصحيحة.';
      END IF;
      UPDATE public.exam_answers SET marks_awarded = v_awarded, is_correct = v_awarded >= COALESCE(v_q.marks, 0), auto_graded = true, ai_feedback = v_feedback WHERE id = v_ans.id;
    ELSIF v_question_type IN ('short_answer','fill_blank','essay') THEN
      IF public.is_exam_non_answer(v_answer_text) THEN
        v_awarded := 0; v_feedback := CASE WHEN trim(v_answer_text) = '' THEN 'لم يجب الطالب على هذا السؤال.' ELSE 'لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال.' END;
      ELSIF COALESCE(trim(v_q.correct_answer), '') = '' THEN
        v_awarded := 0; v_needs_manual := true; v_feedback := 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.';
      ELSE
        v_awarded := public.smart_exam_text_score(v_answer_text, v_q.correct_answer, COALESCE(v_q.marks, 0));
        v_needs_ai := true;
        v_feedback := CASE WHEN v_awarded >= COALESCE(v_q.marks, 0) THEN 'إجابة صحيحة بالمعنى.' WHEN v_awarded > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.' ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.' END;
      END IF;
      UPDATE public.exam_answers SET marks_awarded = v_awarded, is_correct = v_awarded >= COALESCE(v_q.marks, 0), auto_graded = NOT v_needs_manual, ai_feedback = v_feedback WHERE id = v_ans.id;
      PERFORM public.log_exam_attempt_debug('core.text_question_graded', v_student, v_exam.id, v_attempt.id, jsonb_build_object('question_id', v_q.id, 'answer_id', v_ans.id, 'question_type', v_question_type, 'question_order', v_q.order_index, 'student_answer', left(COALESCE(v_answer_text, ''), 900), 'correct_answer', left(COALESCE(v_q.correct_answer, ''), 900), 'score', v_awarded, 'max_score', COALESCE(v_q.marks, 0), 'feedback', v_feedback));
    END IF;
    v_total_score := v_total_score + COALESCE(v_awarded, 0);
  END LOOP;
  IF v_max_score <= 0 THEN v_max_score := greatest(COALESCE(v_exam.total_marks, 0), v_total_score); END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN round((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);
  UPDATE public.exam_attempts
  SET status = CASE WHEN v_needs_manual THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(), completed_at = now(), total_score = v_total_score, max_score = v_max_score, percentage = v_pct, passed = v_passed,
      is_graded = NOT v_needs_manual, graded_at = CASE WHEN v_needs_manual THEN NULL ELSE now() END,
      time_spent_seconds = CASE WHEN COALESCE(time_spent_seconds, 0) > 0 THEN time_spent_seconds ELSE v_time_spent END,
      tab_switch_count = COALESCE(_tab_switches, 0), fullscreen_exits = COALESCE(_fullscreen_exits, 0), updated_at = now()
  WHERE id = v_attempt.id;
  PERFORM public.refresh_student_exam_stats(v_student);
  PERFORM public.log_exam_attempt_debug('core.completed', v_student, v_exam.id, v_attempt.id, jsonb_build_object('total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'final_status', CASE WHEN v_needs_manual THEN 'submitted' ELSE 'graded' END));
  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_exam.id, 'total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'needs_ai_grading', v_needs_ai, 'needs_manual_grading', v_needs_manual, 'code', 'submitted');
END;
$$;

UPDATE public.exam_answers ea
SET marks_awarded = 0, is_correct = false, auto_graded = true, ai_feedback = 'لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال.'
FROM public.exam_questions q
WHERE q.id = ea.question_id AND q.question_type::text IN ('short_answer','fill_blank','essay') AND public.is_exam_non_answer(ea.answer_text) AND COALESCE(ea.marks_awarded, 0) > 0;

UPDATE public.exam_answers ea
SET marks_awarded = public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks),
    is_correct = public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) >= COALESCE(q.marks, 0),
    auto_graded = true,
    ai_feedback = CASE WHEN public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) >= COALESCE(q.marks, 0) THEN 'إجابة صحيحة بالمعنى.' WHEN public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.' ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.' END
FROM public.exam_questions q
WHERE q.id = ea.question_id AND q.question_type::text IN ('short_answer','fill_blank','essay') AND NOT public.is_exam_non_answer(ea.answer_text) AND COALESCE(trim(q.correct_answer), '') <> '' AND COALESCE(ea.marks_awarded, 0) > COALESCE(public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks), 0);

WITH totals AS (
  SELECT ea.attempt_id, COALESCE(sum(ea.marks_awarded), 0) AS total_score
  FROM public.exam_answers ea
  WHERE ea.attempt_id IN (SELECT DISTINCT ea2.attempt_id FROM public.exam_answers ea2 JOIN public.exam_questions q2 ON q2.id = ea2.question_id WHERE q2.question_type::text IN ('short_answer','fill_blank','essay'))
  GROUP BY ea.attempt_id
)
UPDATE public.exam_attempts at
SET total_score = totals.total_score,
    percentage = CASE WHEN COALESCE(at.max_score, 0) > 0 THEN round((totals.total_score / at.max_score) * 100, 2) ELSE 0 END,
    passed = totals.total_score >= COALESCE((SELECT pass_marks FROM public.exams e WHERE e.id = at.exam_id), 0),
    updated_at = now()
FROM totals
WHERE totals.attempt_id = at.id;

REVOKE ALL ON FUNCTION public.normalize_exam_grading_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_exam_grading_text(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_exam_non_answer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_exam_non_answer(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.smart_exam_text_score(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) TO authenticated, service_role;