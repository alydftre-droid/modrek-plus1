CREATE OR REPLACE FUNCTION public.resolve_teacher_target_group(
  _source_group_id uuid,
  _target_subject_id uuid,
  _teacher_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source public.content_groups%ROWTYPE;
  v_owner uuid;
  v_resolved uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.content_groups
  WHERE id = _source_group_id
    AND COALESCE(is_active, true) = true;

  IF NOT FOUND THEN
    RETURN _source_group_id;
  END IF;

  v_owner := COALESCE(v_source.teacher_id, v_source.created_by, _teacher_id);

  IF v_source.subject_id = _target_subject_id THEN
    RETURN _source_group_id;
  END IF;

  SELECT cg.id INTO v_resolved
  FROM public.content_groups cg
  WHERE cg.subject_id = _target_subject_id
    AND COALESCE(cg.is_active, true) = true
    AND COALESCE(cg.teacher_id, cg.created_by) = v_owner
    AND (v_source.term IS NULL OR cg.term = v_source.term)
  ORDER BY
    CASE WHEN NULLIF(trim(COALESCE(cg.month_label, '')), '') = NULLIF(trim(COALESCE(v_source.month_label, '')), '') THEN 0 ELSE 1 END,
    CASE WHEN NULLIF(trim(COALESCE(cg.title, '')), '') = NULLIF(trim(COALESCE(v_source.title, '')), '') THEN 0 ELSE 1 END,
    cg.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_resolved, _source_group_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_teacher_target_group(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_teacher_target_group(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  file_url text,
  thumbnail_url text,
  description text,
  created_at timestamp with time zone,
  is_paid boolean,
  is_free_preview boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject text,
  sub_subject_id uuid,
  is_accessible boolean,
  education_type text,
  subject_section text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term, cg.education_type
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_student_id IS NOT NULL THEN
    BEGIN
      v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.*
    FROM public.subjects s
    WHERE s.id = v_group.subject_id
  ), target_sub_subject AS (
    SELECT ss.id, ss.name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id
      AND ss.group_id = _group_id
  ), candidate_content AS (
    SELECT
      c.id             AS c_id,
      c.title          AS c_title,
      c.type           AS c_type,
      c.file_url       AS c_file_url,
      c.thumbnail_url  AS c_thumbnail_url,
      c.description    AS c_description,
      c.created_at     AS c_created_at,
      c.is_paid        AS c_is_paid,
      c.is_free_preview AS c_is_free_preview,
      c.group_id       AS c_group_id,
      c.subject_id     AS c_subject_id,
      c.sub_subject    AS c_sub_subject,
      c.sub_subject_id AS c_sub_subject_id,
      c.education_type AS c_education_type,
      c.target_section AS c_target_section,
      CASE WHEN c.group_id = _group_id THEN 0 ELSE 1 END AS source_rank
    FROM public.content c
    JOIN public.content_groups source_group
      ON source_group.id = c.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects content_subject
      ON content_subject.id = c.subject_id
    JOIN target_subject ts ON true
    WHERE COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND c.uploaded_by = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND (
        c.group_id = _group_id
        OR (
          c.group_id IS DISTINCT FROM _group_id
          AND (v_group.term IS NULL OR source_group.term = v_group.term)
          AND (v_group.term IS NULL OR c.term = v_group.term)
          AND ts.stage = content_subject.stage
          AND ts.grade = content_subject.grade
          AND ts.category = content_subject.category
          AND (
            public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
            OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section)
          )
        )
      )
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        _sub_subject_id IS NULL
        OR c.sub_subject_id = _sub_subject_id
        OR c.sub_subject_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM target_sub_subject target_ss
          JOIN public.sub_subjects source_ss
            ON source_ss.id = c.sub_subject_id
           AND source_ss.group_id = c.group_id
           AND COALESCE(source_ss.is_active, true) = true
           AND trim(source_ss.name) = trim(target_ss.name)
        )
      )
      AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject, ''),
      COALESCE(cc.c_education_type, ''),
      COALESCE(cc.c_target_section, '')
    )
      cc.c_id, cc.c_title, cc.c_type, cc.c_file_url, cc.c_thumbnail_url, cc.c_description,
      cc.c_created_at, cc.c_is_paid, cc.c_is_free_preview, cc.c_group_id, cc.c_subject_id,
      cc.c_sub_subject, cc.c_sub_subject_id, cc.c_education_type, cc.c_target_section,
      cc.source_rank
    FROM candidate_content cc
    ORDER BY
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject, ''),
      COALESCE(cc.c_education_type, ''),
      COALESCE(cc.c_target_section, ''),
      cc.source_rank ASC,
      cc.c_created_at DESC,
      cc.c_id DESC
  )
  SELECT
    d.c_id            AS id,
    d.c_title         AS title,
    d.c_type          AS type,
    d.c_file_url      AS file_url,
    d.c_thumbnail_url AS thumbnail_url,
    d.c_description   AS description,
    d.c_created_at    AS created_at,
    COALESCE(d.c_is_paid, false)         AS is_paid,
    COALESCE(d.c_is_free_preview, false) AS is_free_preview,
    _group_id                             AS group_id,
    d.c_subject_id    AS subject_id,
    d.c_sub_subject   AS sub_subject,
    d.c_sub_subject_id AS sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(d.c_is_paid, false) = false OR COALESCE(d.c_is_free_preview, false) = true) AS is_accessible,
    public.content_effective_education_type(d.c_education_type, d.c_group_id)          AS education_type,
    public.content_effective_section(d.c_target_section, d.c_subject_id, d.c_group_id) AS subject_section
  FROM deduped d
  ORDER BY d.c_created_at DESC, d.c_id DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks numeric,
  pass_marks numeric,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  is_ai_generated boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject_id uuid,
  term text,
  created_at timestamp with time zone,
  is_accessible boolean,
  target_section text,
  target_education_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term, cg.education_type
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_student_id IS NOT NULL THEN
    BEGIN
      v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.*
    FROM public.subjects s
    WHERE s.id = v_group.subject_id
  ), target_sub_subject AS (
    SELECT ss.id, ss.name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id
      AND ss.group_id = _group_id
  ), candidate_exams AS (
    SELECT e.*, CASE WHEN e.group_id = _group_id THEN 0 ELSE 1 END AS source_rank
    FROM public.exams e
    JOIN public.content_groups source_group
      ON source_group.id = e.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects exam_subject
      ON exam_subject.id = e.subject_id
    JOIN target_subject ts ON true
    WHERE COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND e.teacher_id = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND (
        e.group_id = _group_id
        OR (
          e.group_id IS DISTINCT FROM _group_id
          AND (v_group.term IS NULL OR source_group.term = v_group.term)
          AND (v_group.term IS NULL OR e.term = v_group.term)
          AND ts.stage = exam_subject.stage
          AND ts.grade = exam_subject.grade
          AND ts.category = exam_subject.category
          AND (
            public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NULL
            OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section)
          )
        )
      )
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
        OR e.sub_subject_id = _sub_subject_id
        OR e.sub_subject_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM target_sub_subject target_ss
          JOIN public.sub_subjects source_ss
            ON source_ss.id = e.sub_subject_id
           AND source_ss.group_id = e.group_id
           AND COALESCE(source_ss.is_active, true) = true
           AND trim(source_ss.name) = trim(target_ss.name)
        )
      )
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(target_section, ''),
      COALESCE(target_education_type, '')
    ) *
    FROM candidate_exams
    ORDER BY
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(target_section, ''),
      COALESCE(target_education_type, ''),
      source_rank ASC,
      created_at DESC,
      id DESC
  )
  SELECT
    d.id,
    d.title,
    d.description,
    d.duration_minutes,
    d.total_marks,
    d.pass_marks,
    d.start_at,
    d.end_at,
    COALESCE(d.is_ai_generated, false) AS is_ai_generated,
    _group_id AS group_id,
    d.subject_id,
    d.sub_subject_id,
    d.term,
    d.created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible,
    public.exam_effective_section(d.target_section, d.subject_id, d.group_id) AS target_section,
    public.exam_effective_education_type(d.target_education_type, d.group_id) AS target_education_type
  FROM deduped d
  ORDER BY d.created_at DESC, d.id DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;

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
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.content_groups exam_group
    JOIN public.subjects exam_subject ON exam_subject.id = v_exam.subject_id
    JOIN public.student_group_purchases purchased ON purchased.student_id = v_student
    JOIN public.content_groups purchased_group ON purchased_group.id = purchased.group_id
    JOIN public.subjects purchased_subject ON purchased_subject.id = purchased_group.subject_id
    WHERE exam_group.id = v_exam.group_id
      AND COALESCE(purchased_group.is_active, true) = true
      AND COALESCE(exam_group.is_active, true) = true
      AND COALESCE(purchased_group.teacher_id, purchased_group.created_by) = COALESCE(exam_group.teacher_id, exam_group.created_by)
      AND (exam_group.term IS NULL OR purchased_group.term = exam_group.term)
      AND purchased_subject.stage = exam_subject.stage
      AND purchased_subject.grade = exam_subject.grade
      AND purchased_subject.category = exam_subject.category
      AND (
        public.exam_effective_section(v_exam.target_section, v_exam.subject_id, v_exam.group_id) IS NULL
        OR public.exam_effective_section(v_exam.target_section, v_exam.subject_id, v_exam.group_id) IS NOT DISTINCT FROM public.normalize_content_section(purchased_subject.section)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين', 'code', 'not_in_group');
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

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;