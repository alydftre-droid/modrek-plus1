-- =====================================================
-- DROP OLD SYSTEM
-- =====================================================
DROP TABLE IF EXISTS public.exam_attempts CASCADE;
DROP TABLE IF EXISTS public.exams CASCADE;

-- =====================================================
-- ENUMS
-- =====================================================
DO $$ BEGIN
  CREATE TYPE public.exam_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_question_type AS ENUM ('mcq','true_false','short_answer','essay','fill_blank');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_attempt_status AS ENUM ('in_progress','submitted','graded','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_difficulty AS ENUM ('easy','medium','hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- 1. EXAMS
-- =====================================================
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.content_groups(id) ON DELETE SET NULL,
  sub_subject_id uuid REFERENCES public.sub_subjects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  cover_image_url text,
  instructions text,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  total_marks numeric NOT NULL DEFAULT 0,
  pass_marks numeric NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options boolean NOT NULL DEFAULT false,
  show_results_immediately boolean NOT NULL DEFAULT true,
  show_correct_answers boolean NOT NULL DEFAULT true,
  prevent_tab_switch boolean NOT NULL DEFAULT true,
  require_fullscreen boolean NOT NULL DEFAULT false,
  prevent_copy_paste boolean NOT NULL DEFAULT true,
  status public.exam_status NOT NULL DEFAULT 'draft',
  is_published boolean NOT NULL DEFAULT false,
  difficulty public.exam_difficulty NOT NULL DEFAULT 'medium',
  term text NOT NULL DEFAULT 'term1',
  is_ai_generated boolean NOT NULL DEFAULT false,
  total_attempts_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own exams" ON public.exams
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins manage all exams" ON public.exams
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Students view subscribed exams" ON public.exams
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND status = 'published'
    AND (
      group_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.group_id = exams.group_id AND sgp.student_id = auth.uid()
      )
    )
  );

CREATE INDEX idx_exams_teacher ON public.exams(teacher_id);
CREATE INDEX idx_exams_subject ON public.exams(subject_id);
CREATE INDEX idx_exams_group ON public.exams(group_id);
CREATE INDEX idx_exams_status ON public.exams(status, is_published);

CREATE TRIGGER trg_exams_updated_at BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. EXAM QUESTIONS
-- =====================================================
CREATE TABLE public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  question_type public.exam_question_type NOT NULL DEFAULT 'mcq',
  question_text text NOT NULL,
  image_url text,
  marks numeric NOT NULL DEFAULT 1 CHECK (marks >= 0),
  explanation text,
  difficulty public.exam_difficulty NOT NULL DEFAULT 'medium',
  correct_answer text, -- for short_answer / fill_blank / essay reference
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT ALL ON public.exam_questions TO service_role;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own exam questions" ON public.exam_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid()));

CREATE POLICY "Admins manage all exam questions" ON public.exam_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Students view questions of accessible exams" ON public.exam_questions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_questions.exam_id
      AND e.is_published = true
      AND e.status = 'published'
      AND (e.group_id IS NULL OR EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.group_id = e.group_id AND sgp.student_id = auth.uid()
      ))
  ));

CREATE INDEX idx_eq_exam ON public.exam_questions(exam_id, order_index);
CREATE TRIGGER trg_eq_updated_at BEFORE UPDATE ON public.exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 3. EXAM QUESTION OPTIONS
-- =====================================================
CREATE TABLE public.exam_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  option_text text NOT NULL,
  image_url text,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_question_options TO authenticated;
GRANT ALL ON public.exam_question_options TO service_role;
ALTER TABLE public.exam_question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own question options" ON public.exam_question_options
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id AND e.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id AND e.teacher_id = auth.uid()
  ));

CREATE POLICY "Admins manage all question options" ON public.exam_question_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Students view options of accessible questions" ON public.exam_question_options
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id
      AND e.is_published = true AND e.status = 'published'
      AND (e.group_id IS NULL OR EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.group_id = e.group_id AND sgp.student_id = auth.uid()
      ))
  ));

CREATE INDEX idx_eqo_question ON public.exam_question_options(question_id, order_index);

-- =====================================================
-- 4. EXAM ATTEMPTS
-- =====================================================
CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  status public.exam_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  tab_switch_count integer NOT NULL DEFAULT 0,
  fullscreen_exits integer NOT NULL DEFAULT 0,
  suspicious_activity jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_graded boolean NOT NULL DEFAULT false,
  graded_at timestamptz,
  graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, attempt_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own attempts" ON public.exam_attempts
  FOR SELECT TO authenticated USING (auth.uid() = student_id);

CREATE POLICY "Students insert own attempts" ON public.exam_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own in-progress attempts" ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers view attempts on their exams" ON public.exam_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.teacher_id = auth.uid()));

CREATE POLICY "Teachers grade attempts on their exams" ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.teacher_id = auth.uid()));

CREATE POLICY "Admins manage all attempts" ON public.exam_attempts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX idx_ea_exam ON public.exam_attempts(exam_id);
CREATE INDEX idx_ea_student ON public.exam_attempts(student_id);
CREATE INDEX idx_ea_status ON public.exam_attempts(status);

CREATE TRIGGER trg_ea_updated_at BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 5. EXAM ANSWERS
-- =====================================================
CREATE TABLE public.exam_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  selected_option_ids uuid[] NOT NULL DEFAULT '{}',
  answer_text text,
  is_correct boolean,
  marks_awarded numeric NOT NULL DEFAULT 0,
  ai_feedback text,
  answered_at timestamptz NOT NULL DEFAULT now(),
  time_spent_seconds integer NOT NULL DEFAULT 0,
  flagged_for_review boolean NOT NULL DEFAULT false,
  UNIQUE (attempt_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_answers TO service_role;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own answers" ON public.exam_answers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = exam_answers.attempt_id AND a.student_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = exam_answers.attempt_id AND a.student_id = auth.uid()));

CREATE POLICY "Teachers view answers on their exams" ON public.exam_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id AND e.teacher_id = auth.uid()
  ));

CREATE POLICY "Teachers grade answers on their exams" ON public.exam_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id AND e.teacher_id = auth.uid()
  ));

CREATE POLICY "Admins manage all answers" ON public.exam_answers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX idx_ans_attempt ON public.exam_answers(attempt_id);
CREATE INDEX idx_ans_question ON public.exam_answers(question_id);

-- =====================================================
-- 6. EXAM DRAFTS (offline-safe auto-save backup)
-- =====================================================
CREATE TABLE public.exam_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_question_index integer NOT NULL DEFAULT 0,
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, exam_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_drafts TO authenticated;
GRANT ALL ON public.exam_drafts TO service_role;
ALTER TABLE public.exam_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own drafts" ON public.exam_drafts
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- =====================================================
-- 7. EXAM STATISTICS (per student aggregate)
-- =====================================================
CREATE TABLE public.exam_statistics (
  student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_exams_taken integer NOT NULL DEFAULT 0,
  total_passed integer NOT NULL DEFAULT 0,
  average_percentage numeric NOT NULL DEFAULT 0,
  total_time_spent_seconds bigint NOT NULL DEFAULT 0,
  best_subject text,
  weakest_subject text,
  by_subject jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_statistics TO authenticated;
GRANT ALL ON public.exam_statistics TO service_role;
ALTER TABLE public.exam_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own stats" ON public.exam_statistics
  FOR SELECT TO authenticated USING (auth.uid() = student_id);

CREATE POLICY "Teachers view stats of their students" ON public.exam_statistics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.student_id = exam_statistics.student_id AND e.teacher_id = auth.uid()
  ));

CREATE POLICY "Admins view all stats" ON public.exam_statistics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

-- Start exam attempt
CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_in_progress uuid;
  v_attempt_id uuid;
  v_max_score numeric;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود');
  END IF;

  IF NOT v_exam.is_published OR v_exam.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير منشور');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان لم يبدأ بعد');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت الامتحان');
  END IF;

  -- Subscription check
  IF v_exam.group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.student_group_purchases
      WHERE group_id = v_exam.group_id AND student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'يجب الاشتراك في المجموعة أولاً');
    END IF;
  END IF;

  -- Check existing in-progress
  SELECT id INTO v_in_progress
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  LIMIT 1;

  IF v_in_progress IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_in_progress, 'resumed', true);
  END IF;

  -- Check attempt count
  SELECT COUNT(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded');

  IF v_existing_count >= v_exam.max_attempts THEN
    RETURN jsonb_build_object('success', false, 'error', 'استنفدت عدد المحاولات المسموح بها');
  END IF;

  -- Calc max score
  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions WHERE exam_id = _exam_id;

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score)
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false);
END;
$$;

-- Save answer (auto-save)
CREATE OR REPLACE FUNCTION public.save_exam_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option_ids uuid[] DEFAULT '{}',
  _answer_text text DEFAULT NULL,
  _time_spent integer DEFAULT 0,
  _flagged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة');
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'المحاولة منتهية');
  END IF;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, time_spent_seconds, flagged_for_review, answered_at)
  VALUES (_attempt_id, _question_id, COALESCE(_selected_option_ids,'{}'), _answer_text, COALESCE(_time_spent,0), COALESCE(_flagged,false), now())
  ON CONFLICT (attempt_id, question_id) DO UPDATE
  SET selected_option_ids = EXCLUDED.selected_option_ids,
      answer_text = EXCLUDED.answer_text,
      time_spent_seconds = exam_answers.time_spent_seconds + COALESCE(_time_spent,0),
      flagged_for_review = EXCLUDED.flagged_for_review,
      answered_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Submit & auto-grade
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _attempt_id uuid,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_has_essay boolean := false;
BEGIN
  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة');
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم التسليم مسبقاً');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;

  -- Grade each question
  FOR v_q IN SELECT * FROM public.exam_questions WHERE exam_id = v_attempt.exam_id LOOP
    v_max_score := v_max_score + v_q.marks;

    SELECT * INTO v_ans FROM public.exam_answers
    WHERE attempt_id = _attempt_id AND question_id = v_q.id;

    IF NOT FOUND THEN
      -- no answer: 0 marks, insert blank
      INSERT INTO public.exam_answers (attempt_id, question_id, marks_awarded, is_correct)
      VALUES (_attempt_id, v_q.id, 0, false)
      ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    IF v_q.question_type IN ('mcq','true_false') THEN
      SELECT array_agg(id) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      IF v_correct_opts IS NOT NULL
         AND v_ans.selected_option_ids @> v_correct_opts
         AND v_correct_opts @> v_ans.selected_option_ids THEN
        UPDATE public.exam_answers SET is_correct = true, marks_awarded = v_q.marks
        WHERE id = v_ans.id;
        v_total_score := v_total_score + v_q.marks;
      ELSE
        UPDATE public.exam_answers SET is_correct = false, marks_awarded = 0
        WHERE id = v_ans.id;
      END IF;
    ELSIF v_q.question_type IN ('short_answer','fill_blank') THEN
      IF v_q.correct_answer IS NOT NULL
         AND lower(trim(COALESCE(v_ans.answer_text,''))) = lower(trim(v_q.correct_answer)) THEN
        UPDATE public.exam_answers SET is_correct = true, marks_awarded = v_q.marks
        WHERE id = v_ans.id;
        v_total_score := v_total_score + v_q.marks;
      ELSE
        UPDATE public.exam_answers SET is_correct = false, marks_awarded = 0
        WHERE id = v_ans.id;
      END IF;
    ELSIF v_q.question_type = 'essay' THEN
      v_has_essay := true;
      -- essay: needs manual/AI grading later, leave marks_awarded = 0 for now
    END IF;
  END LOOP;

  v_pct := CASE WHEN v_max_score > 0 THEN ROUND((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_attempt.started_at))::int);

  UPDATE public.exam_attempts
  SET status = CASE WHEN v_has_essay THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(),
      time_spent_seconds = v_time_spent,
      total_score = v_total_score,
      max_score = v_max_score,
      percentage = v_pct,
      passed = v_passed,
      tab_switch_count = COALESCE(_tab_switches, 0),
      fullscreen_exits = COALESCE(_fullscreen_exits, 0),
      is_graded = NOT v_has_essay,
      graded_at = CASE WHEN v_has_essay THEN NULL ELSE now() END
  WHERE id = _attempt_id;

  -- Increment exam counter
  UPDATE public.exams SET total_attempts_count = total_attempts_count + 1
  WHERE id = v_attempt.exam_id;

  -- Clear draft
  DELETE FROM public.exam_drafts WHERE student_id = v_student AND exam_id = v_attempt.exam_id;

  -- Update statistics
  PERFORM public.refresh_student_exam_stats(v_student);

  RETURN jsonb_build_object(
    'success', true,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_manual_grading', v_has_essay
  );
END;
$$;

-- Refresh stats helper
CREATE OR REPLACE FUNCTION public.refresh_student_exam_stats(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_passed int;
  v_avg numeric;
  v_time bigint;
  v_by_subject jsonb;
  v_best text;
  v_weak text;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE passed),
         COALESCE(AVG(percentage),0), COALESCE(SUM(time_spent_seconds),0)
  INTO v_total, v_passed, v_avg, v_time
  FROM public.exam_attempts
  WHERE student_id = _student_id AND status IN ('submitted','graded');

  SELECT jsonb_object_agg(subject_name, info)
  INTO v_by_subject
  FROM (
    SELECT s.name AS subject_name,
           jsonb_build_object(
             'count', COUNT(*),
             'avg', ROUND(AVG(a.percentage)::numeric, 2),
             'best', MAX(a.percentage),
             'worst', MIN(a.percentage)
           ) AS info
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    JOIN public.subjects s ON s.id = e.subject_id
    WHERE a.student_id = _student_id AND a.status IN ('submitted','graded')
    GROUP BY s.name
  ) t;

  SELECT s.name INTO v_best
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  JOIN public.subjects s ON s.id = e.subject_id
  WHERE a.student_id = _student_id AND a.status IN ('submitted','graded')
  GROUP BY s.name
  ORDER BY AVG(a.percentage) DESC NULLS LAST
  LIMIT 1;

  SELECT s.name INTO v_weak
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  JOIN public.subjects s ON s.id = e.subject_id
  WHERE a.student_id = _student_id AND a.status IN ('submitted','graded')
  GROUP BY s.name
  ORDER BY AVG(a.percentage) ASC NULLS LAST
  LIMIT 1;

  INSERT INTO public.exam_statistics
    (student_id, total_exams_taken, total_passed, average_percentage, total_time_spent_seconds, by_subject, best_subject, weakest_subject, updated_at)
  VALUES (_student_id, v_total, v_passed, ROUND(v_avg,2), v_time, COALESCE(v_by_subject,'{}'::jsonb), v_best, v_weak, now())
  ON CONFLICT (student_id) DO UPDATE
  SET total_exams_taken = EXCLUDED.total_exams_taken,
      total_passed = EXCLUDED.total_passed,
      average_percentage = EXCLUDED.average_percentage,
      total_time_spent_seconds = EXCLUDED.total_time_spent_seconds,
      by_subject = EXCLUDED.by_subject,
      best_subject = EXCLUDED.best_subject,
      weakest_subject = EXCLUDED.weakest_subject,
      updated_at = now();
END;
$$;

-- Leaderboard
CREATE OR REPLACE FUNCTION public.get_exam_leaderboard(_exam_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  rank bigint,
  student_id uuid,
  student_name text,
  percentage numeric,
  total_score numeric,
  time_spent_seconds integer,
  submitted_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY a.percentage DESC, a.time_spent_seconds ASC) AS rank,
    a.student_id,
    COALESCE(p.full_name, 'طالب') AS student_name,
    a.percentage,
    a.total_score,
    a.time_spent_seconds,
    a.submitted_at
  FROM public.exam_attempts a
  LEFT JOIN public.profiles p ON p.id = a.student_id
  WHERE a.exam_id = _exam_id
    AND a.status IN ('submitted','graded')
  ORDER BY rank
  LIMIT _limit;
$$;

-- Grant execute on functions to authenticated
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_exam_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) TO authenticated;