CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_authorized boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = _exam_id
      AND e.is_published = true
      AND e.status = 'published'::exam_status
      AND (
        public.is_modrek_training_exam_accessible(e.id, v_uid)
        OR (
          e.group_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM public.student_group_purchases sgp
              WHERE sgp.group_id = e.group_id
                AND sgp.student_id = v_uid
            )
            OR (
              public.normalize_content_section(e.target_section) IS NULL
              AND EXISTS (
                SELECT 1
                FROM public.student_group_purchases sgp
                WHERE sgp.student_id = v_uid
                  AND sgp.group_id IN (SELECT public.exam_broadcast_group_ids(e.group_id))
              )
            )
          )
          AND public.exam_target_matches_student(v_uid, e.target_section, e.target_education_type, e.subject_id, e.group_id)
        )
        OR e.teacher_id = v_uid
        OR public.has_role(v_uid, 'admin'::app_role)
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'exam_id', q.exam_id,
      'order_index', q.order_index,
      'question_type', q.question_type,
      'question_text', q.question_text,
      'image_url', q.image_url,
      'marks', q.marks,
      'difficulty', q.difficulty,
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id,
          'question_id', o.question_id,
          'order_index', o.order_index,
          'option_text', o.option_text,
          'image_url', o.image_url
        ) ORDER BY o.order_index)
        FROM public.exam_question_options o
        WHERE o.question_id = q.id
      ), '[]'::jsonb)
    ) ORDER BY q.order_index
  ), '[]'::jsonb)
  INTO v_result
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
  v_existing_attempt public.exam_attempts%ROWTYPE;
  v_has_direct_or_broadcast_access boolean := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND sgp.student_id = v_student
  ) OR (
    public.normalize_content_section(v_exam.target_section) IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student
        AND sgp.group_id IN (SELECT public.exam_broadcast_group_ids(v_exam.group_id))
    )
  ) INTO v_has_direct_or_broadcast_access;

  IF NOT v_has_direct_or_broadcast_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة أو المجموعة الشقيقة عند اختيار الجميع', 'code', 'not_in_group');
  END IF;

  IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type, v_exam.subject_id, v_exam.group_id) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.debug_student_group_exam_visibility(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  exam_id uuid,
  title text,
  visibility_status text,
  reason_code text,
  reason text,
  source_file text,
  source_function text,
  requested_group_id uuid,
  exam_group_id uuid,
  exam_subject_id uuid,
  requested_subject_id uuid,
  normalized_target_section text,
  normalized_target_education_type text,
  student_section text,
  student_education_type text,
  term_matches boolean,
  target_matches boolean,
  in_broadcast_scope boolean,
  sub_subject_matches boolean,
  is_published boolean,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_group record;
  v_student_section text := NULL;
  v_student_education_type text := NULL;
  v_has_group_access boolean := false;
  v_selected_name text := NULL;
  v_parent_subject_name text := NULL;
  v_selected_is_parent_subject boolean := false;
  v_broadcast_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    trim(lower(s.name)) AS subject_name,
    s.category,
    s.stage,
    s.grade,
    s.shared_subject_id
  INTO v_group
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text, 'hidden'::text, 'group_not_found'::text,
      'المجموعة غير موجودة أو غير مفعّلة.'::text,
      'database:function public.get_student_group_exam_catalog'::text,
      'debug_student_group_exam_visibility'::text,
      _group_id, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::text, NULL::text, false, false, false, false, false, NULL::text;
    RETURN;
  END IF;

  v_parent_subject_name := v_group.subject_name;

  IF v_student_id IS NOT NULL THEN
    BEGIN
      v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT
      public.normalize_content_section(p.section),
      public.normalize_content_education_type(p.education_type)
    INTO v_student_section, v_student_education_type
    FROM public.profiles p
    WHERE p.id = v_student_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_has_group_access;
  END IF;

  IF NOT (v_is_admin OR v_has_group_access) THEN
    RETURN QUERY SELECT
      NULL::uuid, NULL::text, 'hidden'::text, 'student_not_subscribed'::text,
      'الطالب غير مشترك في هذه المجموعة؛ لذلك يتم عرض العناصر كمقفولة أو لا تُفتح.'::text,
      'src/components/exams/StudentExamPanel.tsx'::text,
      'useStudentExamCatalog'::text,
      _group_id, NULL::uuid, NULL::uuid, v_group.subject_id, NULL::text, NULL::text,
      v_student_section, v_student_education_type, false, false, false, false, false, NULL::text;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[])
  INTO v_broadcast_ids
  FROM public.exam_broadcast_group_ids(_group_id) AS sid;

  IF _sub_subject_id IS NOT NULL THEN
    SELECT trim(lower(ss.name)) INTO v_selected_name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id;
    v_selected_is_parent_subject := v_selected_name IS NOT NULL AND v_selected_name = v_parent_subject_name;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      e.*,
      public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term) AS c_term_matches,
      public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id) AS c_target_matches,
      (
        e.group_id = _group_id
        OR (
          public.normalize_content_section(e.target_section) IS NULL
          AND e.group_id = ANY(v_broadcast_ids)
        )
      ) AS c_in_broadcast_scope,
      (
        _sub_subject_id IS NULL
        OR v_selected_is_parent_subject
        OR e.sub_subject_id = _sub_subject_id
        OR e.sub_subject_id IS NULL
        OR (
          v_selected_name IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.sub_subjects ss
            WHERE ss.id = e.sub_subject_id
              AND trim(lower(ss.name)) = v_selected_name
              AND COALESCE(ss.is_active, true) = true
          )
        )
      ) AS c_sub_subject_matches
    FROM public.exams e
    JOIN public.content_groups eg ON eg.id = e.group_id
    JOIN public.subjects es ON es.id = e.subject_id
    WHERE e.group_id IS NOT NULL
      AND (
        e.group_id = _group_id
        OR eg.id = ANY(v_broadcast_ids)
        OR (
          (v_group.teacher_id IS NOT NULL AND eg.teacher_id = v_group.teacher_id)
          OR (v_group.created_by IS NOT NULL AND eg.created_by = v_group.created_by)
        )
      )
      AND eg.term IS NOT DISTINCT FROM v_group.term
      AND es.stage IS NOT DISTINCT FROM v_group.stage
      AND es.grade IS NOT DISTINCT FROM v_group.grade
      AND (
        (v_group.shared_subject_id IS NOT NULL AND es.shared_subject_id IS NOT DISTINCT FROM v_group.shared_subject_id)
        OR trim(lower(es.name)) = v_group.subject_name
        OR (
          v_group.shared_subject_id IS NULL
          AND es.shared_subject_id IS NULL
          AND lower(btrim(COALESCE(es.category, ''))) = lower(btrim(COALESCE(v_group.category, '')))
        )
      )
    ORDER BY e.created_at DESC
    LIMIT 20
  )
  SELECT
    c.id,
    c.title,
    CASE
      WHEN COALESCE(c.is_published, false) = true
       AND c.status = 'published'::public.exam_status
       AND c.c_term_matches
       AND c.c_in_broadcast_scope
       AND c.c_sub_subject_matches
       AND (v_is_admin OR c.c_target_matches)
      THEN 'visible'
      ELSE 'hidden'
    END AS visibility_status,
    CASE
      WHEN COALESCE(c.is_published, false) = false OR c.status <> 'published'::public.exam_status THEN 'not_published'
      WHEN NOT c.c_term_matches THEN 'term_mismatch'
      WHEN NOT c.c_in_broadcast_scope THEN 'not_in_group_or_broadcast_scope'
      WHEN NOT c.c_sub_subject_matches THEN 'sub_subject_mismatch'
      WHEN NOT (v_is_admin OR c.c_target_matches) THEN 'target_mismatch'
      ELSE 'visible'
    END AS reason_code,
    CASE
      WHEN COALESCE(c.is_published, false) = false OR c.status <> 'published'::public.exam_status THEN 'الامتحان غير منشور أو حالته ليست منشور.'
      WHEN NOT c.c_term_matches THEN 'ترم الامتحان لا يطابق الترم الحالي لهذه المرحلة والصف.'
      WHEN NOT c.c_in_broadcast_scope THEN 'الامتحان ليس داخل المجموعة الحالية ولا داخل مجموعات البث الشقيقة.'
      WHEN NOT c.c_sub_subject_matches THEN 'فلتر المادة الفرعية الحالي لا يطابق مادة الامتحان.'
      WHEN NOT (v_is_admin OR c.c_target_matches) THEN 'استهداف الامتحان لا يطابق بيانات الطالب: الشعبة أو نوع التعليم.'
      ELSE 'الامتحان ظاهر حسب قواعد الكتالوج الحالية.'
    END AS reason,
    CASE
      WHEN NOT c.c_in_broadcast_scope OR NOT c.c_term_matches OR NOT (v_is_admin OR c.c_target_matches) THEN 'database:function public.get_student_group_exam_catalog + public.exam_target_matches_student'
      WHEN NOT c.c_sub_subject_matches THEN 'src/components/exams/StudentExamPanel.tsx + database:function public.get_student_group_exam_catalog'
      ELSE 'src/components/exams/StudentExamPanel.tsx'
    END AS source_file,
    'debug_student_group_exam_visibility'::text AS source_function,
    _group_id AS requested_group_id,
    c.group_id AS exam_group_id,
    c.subject_id AS exam_subject_id,
    v_group.subject_id AS requested_subject_id,
    public.normalize_content_section(c.target_section) AS normalized_target_section,
    public.normalize_content_education_type(c.target_education_type) AS normalized_target_education_type,
    v_student_section AS student_section,
    v_student_education_type AS student_education_type,
    c.c_term_matches,
    c.c_target_matches,
    c.c_in_broadcast_scope,
    c.c_sub_subject_matches,
    COALESCE(c.is_published, false),
    c.status::text
  FROM candidates c
  ORDER BY c.created_at DESC, c.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.exam_effective_education_type(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_effective_education_type(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.exam_effective_education_type(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_effective_education_type(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_exam_questions_for_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_exam_questions_for_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO service_role;