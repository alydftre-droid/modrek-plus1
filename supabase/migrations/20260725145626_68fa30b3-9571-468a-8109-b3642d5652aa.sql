CREATE OR REPLACE FUNCTION public.exam_broadcast_group_ids(_group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT
      cg.id,
      cg.teacher_id,
      cg.created_by,
      COALESCE(cg.teacher_id, cg.created_by) AS owner_id,
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
      COALESCE(cg.teacher_id, cg.created_by) = src.owner_id
      OR (src.teacher_id IS NOT NULL AND (cg.teacher_id = src.teacher_id OR cg.created_by = src.teacher_id))
      OR (src.created_by IS NOT NULL AND (cg.teacher_id = src.created_by OR cg.created_by = src.created_by))
    )
    AND cg.term IS NOT DISTINCT FROM src.term
    AND s.stage IS NOT DISTINCT FROM src.stage
    AND s.grade IS NOT DISTINCT FROM src.grade
    AND (
      (src.shared_subject_id IS NOT NULL AND s.shared_subject_id IS NOT DISTINCT FROM src.shared_subject_id)
      OR lower(btrim(s.name)) = lower(btrim(src.subject_name))
      OR public.catalog_subjects_match(src.subject_category, src.subject_name, s.category, s.name)
      OR (
        src.shared_subject_id IS NULL
        AND s.shared_subject_id IS NULL
        AND lower(btrim(COALESCE(s.category, ''))) = lower(btrim(COALESCE(src.subject_category, '')))
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO service_role;

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
STABLE SECURITY DEFINER
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
  IF v_student_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::uuid,
      NULL::text,
      'hidden'::text,
      'not_authenticated'::text,
      'لم يصل رمز تسجيل دخول الطالب إلى طلب التشخيص. السبب في الواجهة: src/integrations/supabase/client.ts أو useAuth/session refresh. أعد تسجيل الدخول ثم انسخ التقرير إذا استمرت المشكلة.'::text,
      'src/hooks/useExams.ts + src/integrations/supabase/client.ts'::text,
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

  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    COALESCE(cg.teacher_id, cg.created_by) AS owner_id,
    cg.term,
    cg.education_type,
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
      'المجموعة غير موجودة أو غير مفعّلة. الملف المسؤول: StudentSubjectView يمرر groupId غير صالح أو المجموعة أصبحت غير نشطة.'::text,
      'src/pages/student/StudentSubjectView.tsx + database:content_groups'::text,
      'debug_student_group_exam_visibility'::text,
      _group_id, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text,
      NULL::text, NULL::text, false, false, false, false, false, NULL::text;
    RETURN;
  END IF;

  v_parent_subject_name := v_group.subject_name;

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
      public.normalize_content_education_type(eg.education_type) AS c_exam_group_edu,
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
          v_group.owner_id IS NOT NULL
          AND (
            COALESCE(eg.teacher_id, eg.created_by) = v_group.owner_id
            OR eg.teacher_id = v_group.owner_id
            OR eg.created_by = v_group.owner_id
          )
        )
      )
      AND eg.term IS NOT DISTINCT FROM v_group.term
      AND es.stage IS NOT DISTINCT FROM v_group.stage
      AND es.grade IS NOT DISTINCT FROM v_group.grade
      AND (
        (v_group.shared_subject_id IS NOT NULL AND es.shared_subject_id IS NOT DISTINCT FROM v_group.shared_subject_id)
        OR trim(lower(es.name)) = v_group.subject_name
        OR public.catalog_subjects_match(v_group.category, v_group.subject_name, es.category, es.name)
        OR (
          v_group.shared_subject_id IS NULL
          AND es.shared_subject_id IS NULL
          AND lower(btrim(COALESCE(es.category, ''))) = lower(btrim(COALESCE(v_group.category, '')))
        )
      )
    ORDER BY e.created_at DESC
    LIMIT 50
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
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_section(c.target_section) IS NULL
        AND public.normalize_content_education_type(c.target_education_type) IS NOT NULL
        AND public.normalize_content_education_type(c.target_education_type) = c.c_exam_group_edu
      THEN 'forced_group_education_type_blocked_broadcast'
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_education_type(c.target_education_type) IS NOT NULL
        AND v_student_education_type IS DISTINCT FROM public.normalize_content_education_type(c.target_education_type)
      THEN 'target_education_type_mismatch'
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_section(c.target_section) IS NOT NULL
        AND v_student_section IS DISTINCT FROM public.normalize_content_section(c.target_section)
      THEN 'target_section_mismatch'
      ELSE 'visible'
    END AS reason_code,
    CASE
      WHEN COALESCE(c.is_published, false) = false OR c.status <> 'published'::public.exam_status THEN 'الامتحان غير منشور أو حالته ليست منشور. الملف المسؤول: PreviewPublishPage أو useUpdateExam.'
      WHEN NOT c.c_term_matches THEN 'ترم الامتحان لا يطابق الترم الحالي لهذه المرحلة والصف. افحص system_terms أو قيمة term داخل exams.'
      WHEN NOT c.c_in_broadcast_scope THEN 'الامتحان ليس داخل المجموعة الحالية ولا داخل مجموعات البث الشقيقة. السبب غالباً اختلاف مالك المجموعة أو subject/shared_subject بين مجموعات علمي وأدبي.'
      WHEN NOT c.c_sub_subject_matches THEN 'فلتر المادة الفرعية الحالي لا يطابق مادة الامتحان. السبب غالباً اختلاف sub_subject_id بين مجموعات علمي وأدبي؛ يجب المطابقة بالاسم أو ترك الامتحان على المادة الرئيسية.'
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_section(c.target_section) IS NULL
        AND public.normalize_content_education_type(c.target_education_type) IS NOT NULL
        AND public.normalize_content_education_type(c.target_education_type) = c.c_exam_group_edu
      THEN 'السبب الحقيقي: كود إنشاء الامتحان نسخ نوع تعليم المجموعة داخل target_education_type رغم أن المعلم اختار الجميع، فحجب الامتحان عن طلاب المجموعة الشقيقة. الملف: src/hooks/useExamMutations.ts.'
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_education_type(c.target_education_type) IS NOT NULL
        AND v_student_education_type IS DISTINCT FROM public.normalize_content_education_type(c.target_education_type)
      THEN 'نوع تعليم الطالب لا يطابق استهداف الامتحان. راجع إعدادات الامتحان: target_education_type.'
      WHEN NOT (v_is_admin OR c.c_target_matches)
        AND public.normalize_content_section(c.target_section) IS NOT NULL
        AND v_student_section IS DISTINCT FROM public.normalize_content_section(c.target_section)
      THEN 'شعبة الطالب لا تطابق استهداف الامتحان. راجع إعدادات الامتحان: target_section.'
      ELSE CASE
        WHEN v_has_group_access THEN 'الامتحان ظاهر حسب قواعد الكتالوج الحالية.'
        ELSE 'الامتحان ظاهر كبيانات داخل المجموعة لكنه مقفول لأن الطالب غير مشترك؛ هذا ليس سبب اختفاء.'
      END
    END AS reason,
    CASE
      WHEN NOT c.c_in_broadcast_scope THEN 'database:function public.exam_broadcast_group_ids + public.get_student_group_exam_catalog'
      WHEN NOT c.c_term_matches THEN 'database:function public.term_item_matches_current_system_term'
      WHEN NOT (v_is_admin OR c.c_target_matches) THEN 'src/hooks/useExamMutations.ts + database:function public.exam_target_matches_student'
      WHEN NOT c.c_sub_subject_matches THEN 'src/components/exams/StudentExamPanel.tsx + database:function public.get_student_group_exam_catalog'
      ELSE 'src/components/exams/StudentExamPanel.tsx + src/hooks/useExams.ts'
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

REVOKE ALL ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.diagnose_student_group_exam_visibility(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH debug_rows AS (
    SELECT *
    FROM public.debug_student_group_exam_visibility(_group_id, _sub_subject_id)
  )
  SELECT * FROM debug_rows
  UNION ALL
  SELECT
    NULL::uuid AS exam_id,
    NULL::text AS title,
    'hidden'::text AS visibility_status,
    'diagnostic_returned_no_candidates'::text AS reason_code,
    'لم يجد التشخيص أي امتحان مرشح لنفس المعلم/المرحلة/الصف/المادة. هذا يعني أن الامتحان محفوظ على مجموعة أو مادة أو معلم مختلف عن المجموعة التي فتحها الطالب، أو أن الامتحان غير مربوط بمجموعة أصلاً.'::text AS reason,
    'src/hooks/useExamMutations.ts:resolveSiblingGroupForExam + database:function public.get_student_group_exam_catalog'::text AS source_file,
    'diagnose_student_group_exam_visibility:no_exam_candidates'::text AS source_function,
    _group_id AS requested_group_id,
    NULL::uuid AS exam_group_id,
    NULL::uuid AS exam_subject_id,
    (
      SELECT cg.subject_id
      FROM public.content_groups cg
      WHERE cg.id = _group_id
      LIMIT 1
    ) AS requested_subject_id,
    NULL::text AS normalized_target_section,
    NULL::text AS normalized_target_education_type,
    (
      SELECT public.normalize_content_section(p.section)
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ) AS student_section,
    (
      SELECT public.normalize_content_education_type(p.education_type)
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ) AS student_education_type,
    false AS term_matches,
    false AS target_matches,
    false AS in_broadcast_scope,
    false AS sub_subject_matches,
    false AS is_published,
    NULL::text AS status
  WHERE NOT EXISTS (SELECT 1 FROM debug_rows);
$function$;

REVOKE ALL ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO service_role;