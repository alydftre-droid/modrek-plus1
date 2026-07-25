
-- 1) Helper: sibling groups of a content group (same teacher/term/month/title,
--    same subject family name+stage+grade, potentially different section variant).
CREATE OR REPLACE FUNCTION public.content_group_sibling_ids(_group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT cg.id, cg.teacher_id, cg.created_by, cg.term,
           NULLIF(btrim(cg.title), '') AS title,
           NULLIF(btrim(cg.month_label), '') AS month_label,
           s.name AS subj_name, s.stage, s.grade
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
    AND s.name = src.subj_name
    AND s.stage IS NOT DISTINCT FROM src.stage
    AND s.grade IS NOT DISTINCT FROM src.grade
    AND (
      (src.month_label IS NOT NULL AND NULLIF(btrim(cg.month_label), '') = src.month_label)
      OR (src.month_label IS NULL AND src.title IS NOT NULL AND NULLIF(btrim(cg.title), '') = src.title)
      OR (src.month_label IS NULL AND src.title IS NULL)
    );
$$;

GRANT EXECUTE ON FUNCTION public.content_group_sibling_ids(uuid) TO authenticated, anon, service_role;

-- 2) Rewrite the student exam catalog RPC to include sibling-group exams
--    whose target_section is unrestricted (i.e. targeted at everyone).
CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, title text, description text, duration_minutes integer, total_marks numeric, pass_marks numeric, start_at timestamp with time zone, end_at timestamp with time zone, is_ai_generated boolean, group_id uuid, subject_id uuid, sub_subject_id uuid, term text, created_at timestamp with time zone, is_accessible boolean, target_section text, target_education_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_selected_name text := NULL;
  v_parent_subject_name text := NULL;
  v_selected_is_parent_subject boolean := false;
  v_sibling_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term, cg.education_type,
         trim(lower(s.name)) AS subject_name
  INTO v_group
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_parent_subject_name := v_group.subject_name;

  SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[])
  INTO v_sibling_ids
  FROM public.content_group_sibling_ids(_group_id) AS sid;

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
        AND (sgp.group_id = _group_id OR sgp.group_id = ANY(v_sibling_ids))
    ) INTO v_is_purchased;
  END IF;

  IF _sub_subject_id IS NOT NULL THEN
    SELECT trim(lower(ss.name)) INTO v_selected_name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id;

    v_selected_is_parent_subject := v_selected_name IS NOT NULL AND v_selected_name = v_parent_subject_name;
  END IF;

  RETURN QUERY
  WITH candidate_exams AS (
    SELECT
      e.*,
      source_ss.name AS c_source_ss_name
    FROM public.exams e
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = e.sub_subject_id
     AND COALESCE(source_ss.is_active, true) = true
    WHERE (
        e.group_id = _group_id
        OR (
          public.normalize_content_section(e.target_section) IS NULL
          AND e.group_id = ANY(v_sibling_ids)
        )
      )
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
        OR v_selected_is_parent_subject
        OR e.sub_subject_id = _sub_subject_id
        OR e.sub_subject_id IS NULL
        OR (
          v_selected_name IS NOT NULL
          AND trim(lower(COALESCE(source_ss.name, ''))) = v_selected_name
        )
      )
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))
  ), deduped AS (
    SELECT DISTINCT ON (id) *
    FROM candidate_exams
    ORDER BY id, created_at DESC
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

-- 3) Update the RLS policy so students can also read sibling-group exams
--    when target_section is unrestricted.
DROP POLICY IF EXISTS "Students view subscribed current-term exams" ON public.exams;
CREATE POLICY "Students view subscribed current-term exams"
ON public.exams
FOR SELECT
USING (
  is_published = true
  AND status = 'published'::public.exam_status
  AND group_id IS NOT NULL
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND (
    EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = exams.group_id
        AND sgp.student_id = auth.uid()
    )
    OR (
      public.normalize_content_section(target_section) IS NULL
      AND EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.student_id = auth.uid()
          AND sgp.group_id IN (SELECT public.content_group_sibling_ids(exams.group_id))
      )
    )
  )
  AND public.exam_target_matches_student(auth.uid(), target_section, target_education_type, subject_id, group_id)
);
