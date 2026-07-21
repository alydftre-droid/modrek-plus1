CREATE OR REPLACE FUNCTION public.replace_exam_questions_atomic(_exam_id uuid, _questions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_question jsonb;
  v_option jsonb;
  v_question_id uuid;
  v_question_order integer := 0;
  v_option_order integer := 0;
  v_question_type text;
  v_marks numeric;
  v_total_marks numeric := 0;
  v_question_count integer := 0;
  v_option_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'يجب تسجيل الدخول');
  END IF;

  IF jsonb_typeof(COALESCE(_questions, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_questions_payload', 'error', 'تنسيق الأسئلة غير صالح');
  END IF;

  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = _exam_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'exam_not_found', 'error', 'الامتحان غير موجود');
  END IF;

  IF v_exam.teacher_id IS DISTINCT FROM v_uid AND NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_authorized', 'error', 'غير مصرح بتعديل هذا الامتحان');
  END IF;

  DELETE FROM public.exam_question_options
  WHERE question_id IN (
    SELECT id FROM public.exam_questions WHERE exam_id = _exam_id
  );

  DELETE FROM public.exam_questions
  WHERE exam_id = _exam_id;

  FOR v_question IN SELECT value FROM jsonb_array_elements(COALESCE(_questions, '[]'::jsonb)) AS value
  LOOP
    v_question_type := COALESCE(NULLIF(v_question->>'type', ''), 'mcq');
    IF v_question_type NOT IN ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'section') THEN
      v_question_type := 'mcq';
    END IF;

    v_marks := CASE
      WHEN v_question_type = 'section' THEN 0
      ELSE GREATEST(0, COALESCE(NULLIF(v_question->>'marks', '')::numeric, 1))
    END;

    INSERT INTO public.exam_questions (
      exam_id,
      order_index,
      question_type,
      question_text,
      marks,
      correct_answer
    ) VALUES (
      _exam_id,
      v_question_order,
      v_question_type::public.exam_question_type,
      COALESCE(v_question->>'text', ''),
      v_marks,
      CASE
        WHEN v_question_type = 'section' THEN jsonb_build_object(
          'section', true,
          'total', COALESCE(NULLIF(v_question->>'sectionTotal', '')::numeric, 0),
          'title', COALESCE(v_question->>'sectionTitle', '')
        )::text
        ELSE NULLIF(v_question->>'modelAnswer', '')
      END
    ) RETURNING id INTO v_question_id;

    v_question_count := v_question_count + 1;
    IF v_question_type <> 'section' THEN
      v_total_marks := v_total_marks + v_marks;
    END IF;

    IF v_question_type IN ('mcq', 'true_false') AND jsonb_typeof(COALESCE(v_question->'options', '[]'::jsonb)) = 'array' THEN
      v_option_order := 0;
      FOR v_option IN SELECT value FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) AS value
      LOOP
        INSERT INTO public.exam_question_options (
          question_id,
          order_index,
          option_text,
          is_correct
        ) VALUES (
          v_question_id,
          v_option_order,
          COALESCE(NULLIF(v_option->>'text', ''), CASE WHEN v_question_type = 'true_false' AND v_option_order = 0 THEN 'صح' WHEN v_question_type = 'true_false' THEN 'خطأ' ELSE 'الخيار ' || (v_option_order + 1)::text END),
          COALESCE((v_option->>'isCorrect')::boolean, false)
        );
        v_option_count := v_option_count + 1;
        v_option_order := v_option_order + 1;
      END LOOP;
    END IF;

    v_question_order := v_question_order + 1;
  END LOOP;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      updated_at = now()
  WHERE id = _exam_id;

  RETURN jsonb_build_object(
    'success', true,
    'exam_id', _exam_id,
    'questions_count', v_question_count,
    'options_count', v_option_count,
    'total_marks', v_total_marks,
    'uses_array_index_for_mapping', false,
    'mapping_strategy', 'nested_question_insert_returning_id'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.replace_exam_questions_atomic(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_exam_questions_atomic(uuid, jsonb) TO service_role;