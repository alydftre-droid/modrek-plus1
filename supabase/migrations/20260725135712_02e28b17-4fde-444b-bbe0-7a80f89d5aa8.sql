CREATE OR REPLACE FUNCTION public.exam_effective_education_type(_target_edu text, _group_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_content_education_type(_target_edu)
$function$;

GRANT EXECUTE ON FUNCTION public.exam_effective_education_type(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_effective_education_type(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.exam_broadcast_group_ids(_group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT
      cg.id,
      cg.teacher_id,
      cg.created_by,
      cg.term,
      s.name AS subject_name,
      s.category AS subject_category,
      s.stage,
      s.grade,
      s.shared_subject_id
    FROM public.content_groups cg
    JOIN public.subjects s ON s.id = cg.subject_id
    WHERE cg.id = _group_id
  )
  SELECT cg.id
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  JOIN src ON true
  WHERE COALESCE(cg.is_active, true) = true
    AND (
      (src.teacher_id IS NOT NULL AND cg.teacher_id = src.teacher_id)
      OR (src.created_by IS NOT NULL AND cg.created_by = src.created_by)
    )
    AND cg.term IS NOT DISTINCT FROM src.term
    AND s.stage IS NOT DISTINCT FROM src.stage
    AND s.grade IS NOT DISTINCT FROM src.grade
    AND (
      (src.shared_subject_id IS NOT NULL AND s.shared_subject_id IS NOT DISTINCT FROM src.shared_subject_id)
      OR lower(btrim(s.name)) = lower(btrim(src.subject_name))
      OR (
        src.shared_subject_id IS NULL
        AND s.shared_subject_id IS NULL
        AND lower(btrim(COALESCE(s.category, ''))) = lower(btrim(COALESCE(src.subject_category, '')))
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO service_role;

UPDATE public.exams e
SET target_education_type = NULL,
    updated_at = now()
FROM public.content_groups cg
WHERE e.group_id = cg.id
  AND public.normalize_content_section(e.target_section) IS NULL
  AND public.normalize_content_education_type(e.target_education_type) IS NOT NULL
  AND public.normalize_content_education_type(e.target_education_type) = public.normalize_content_education_type(cg.education_type);

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
  v_student record;
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
      NULL::uuid,
      NULL::text,
      'hidden'::text,
      'group_not_found'::text,
      'المجموعة غير موجودة أو غير مفعّلة.'::text,
      'database:function public.get_student_group_exam_catalog'::text,
      'debug_student_group_exam_visibility'::text,
      _group_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      false,
      false,
      false,
      false,
      false,
      NULL::text;
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
      public.normalize_content_section(p.section) AS section,
      public.normalize_content_education_type(p.education_type) AS education_type
    INTO v_student
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
      NULL::uuid,
      NULL::text,
      'hidden'::text,
      'student_not_subscribed'::text,
      'الطالب غير مشترك في هذه المجموعة؛ لذلك يتم عرض العناصر كمقفولة أو لا تُفتح.'::text,
      'src/components/exams/StudentExamPanel.tsx'::text,
      'useStudentExamCatalog'::text,
      _group_id,
      NULL::uuid,
      NULL::uuid,
      v_group.subject_id,
      NULL::text,
      NULL::text,
      COALESCE((v_student).section, NULL)::text,
      COALESCE((v_student).education_type, NULL)::text,
      false,
      false,
      false,
      false,
      false,
      NULL::text;
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
    COALESCE((v_student).section, NULL)::text AS student_section,
    COALESCE((v_student).education_type, NULL)::text AS student_education_type,
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

GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO service_role;