CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH cleaned AS (
    SELECT lower(
      replace(
        replace(
          replace(
            replace(
              regexp_replace(btrim(COALESCE(_value, '')), '[ًٌٍَُِّْـ]', '', 'g'),
              'أ', 'ا'
            ),
            'إ', 'ا'
          ),
          'آ', 'ا'
        ),
        'ى', 'ي'
      )
    ) AS v
  ), compact AS (
    SELECT v, regexp_replace(v, '\s+', '', 'g') AS c
    FROM cleaned
  )
  SELECT CASE
    WHEN v = '' THEN NULL
    WHEN v IN ('both', 'all', 'كل', 'الكل', 'الجميع', 'كلاهما', 'الاثنين', 'اثنين', 'القسمين', 'كل الشعب', 'كل الشعبتين') THEN NULL
    WHEN c IN (
      'علمي+ادبي', 'ادبي+علمي', 'علمى+ادبى', 'ادبى+علمى',
      'علميوادبي', 'ادبيوعلمي', 'علمىوادبى', 'ادبىوعلمى',
      'علمي/ادبي', 'ادبي/علمي', 'علمى/ادبى', 'ادبى/علمى',
      'scientificliterary', 'literaryscientific', 'sciencearts', 'artsscience'
    ) THEN NULL
    WHEN (v LIKE '%علمي%' OR v LIKE '%علمى%' OR v LIKE '%علوم%' OR v LIKE '%رياض%' OR v LIKE '%scientific%' OR v LIKE '%science%' OR v LIKE '%sci%')
      AND (v LIKE '%ادبي%' OR v LIKE '%ادبى%' OR v LIKE '%literary%' OR v LIKE '%arts%' OR v LIKE '%adab%') THEN NULL
    WHEN v IN (
      'scientific', 'science', 'sci', 'scientific section', 'science section',
      'علمي', 'علمى', 'علم', 'العلمي', 'القسم العلمي', 'الشعبة العلمية', 'الشعبه العلميه',
      'شعبة علمي', 'شعبه علمي', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات'
    ) THEN 'scientific'
    WHEN v IN (
      'literary', 'arts', 'art', 'adabi', 'adaby',
      'ادبي', 'ادبى', 'الادبي', 'القسم الادبي', 'الشعبة الادبية', 'الشعبه الادبيه',
      'شعبة ادبي', 'شعبه ادبي'
    ) THEN 'literary'
    WHEN v LIKE '%علمي%' OR v LIKE '%علمى%' OR v LIKE '%علوم%' OR v LIKE '%رياض%' THEN 'scientific'
    WHEN v LIKE '%ادبي%' OR v LIKE '%ادبى%' OR v LIKE '%literary%' OR v LIKE '%arts%' OR v LIKE '%adab%' THEN 'literary'
    ELSE v
  END
  FROM compact
$function$;

CREATE OR REPLACE FUNCTION public.content_effective_section(
  _content_target_section text,
  _content_subject_id uuid,
  _content_group_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_content_section(_content_target_section)
$function$;

CREATE OR REPLACE FUNCTION public.catalog_subjects_match(
  p_target_category text,
  p_target_name text,
  p_candidate_category text,
  p_candidate_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH n AS (
    SELECT
      lower(regexp_replace(coalesce(p_target_category, ''), '\s+', '', 'g')) AS tc,
      lower(regexp_replace(coalesce(p_candidate_category, ''), '\s+', '', 'g')) AS cc,
      regexp_replace(lower(translate(coalesce(p_target_name, ''), 'أإآىةًٌٍَُِّْـ', 'ااايه')), '\s+', '', 'g') AS tn,
      regexp_replace(lower(translate(coalesce(p_candidate_name, ''), 'أإآىةًٌٍَُِّْـ', 'ااايه')), '\s+', '', 'g') AS cn
  )
  SELECT
    tc = cc
    OR tn = cn
    OR (tn <> '' AND cn <> '' AND (position(tn in cn) > 0 OR position(cn in tn) > 0))
    OR (tn LIKE '%رياض%' AND cn LIKE '%رياض%')
    OR (tn LIKE '%عربي%' AND cn LIKE '%عربي%')
    OR (tn LIKE '%لغهعربيه%' AND cn LIKE '%لغهعربيه%')
    OR (tn LIKE '%انجليزي%' AND cn LIKE '%انجليزي%')
    OR (tn LIKE '%فيزيا%' AND cn LIKE '%فيزيا%')
    OR (tn LIKE '%كيميا%' AND cn LIKE '%كيميا%')
    OR (tn LIKE '%احيا%' AND cn LIKE '%احيا%')
    OR (tn LIKE '%تاريخ%' AND cn LIKE '%تاريخ%')
    OR (tn LIKE '%جغراف%' AND cn LIKE '%جغراف%')
    OR (tn LIKE '%فلسف%' AND cn LIKE '%فلسف%')
    OR (tn LIKE '%منطق%' AND cn LIKE '%منطق%')
  FROM n
$function$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(
  _content_edu text,
  _content_subject_id uuid,
  _content_group_id uuid,
  _student_id uuid,
  _content_target_section text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH target AS (
    SELECT
      public.content_effective_education_type(_content_edu, _content_group_id) AS edu,
      public.content_effective_section(_content_target_section, _content_subject_id, _content_group_id) AS section
  ), student AS (
    SELECT
      public.normalize_content_education_type(p.education_type) AS edu,
      public.normalize_content_section(p.section) AS section
    FROM public.profiles p
    WHERE p.id = _student_id
  )
  SELECT CASE
    WHEN _student_id IS NULL THEN (SELECT edu IS NULL AND section IS NULL FROM target)
    WHEN NOT EXISTS (SELECT 1 FROM student) THEN (SELECT edu IS NULL AND section IS NULL FROM target)
    ELSE
      (
        (SELECT edu FROM target) IS NULL
        OR ((SELECT edu FROM student) IS NOT NULL AND (SELECT edu FROM student) = (SELECT edu FROM target))
      )
      AND
      (
        (SELECT section FROM target) IS NULL
        OR ((SELECT section FROM student) IS NOT NULL AND (SELECT section FROM student) = (SELECT section FROM target))
      )
  END
$function$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _content_subject_id uuid, _content_group_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.content_target_matches_student(_content_edu, _content_subject_id, _content_group_id, _student_id, NULL::text)
$function$;

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
STABLE
SECURITY DEFINER
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
  ), selected_sub_subject AS (
    SELECT ss.id, ss.name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id
      AND ss.group_id = _group_id
      AND COALESCE(ss.is_active, true) = true
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
      COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) AS c_sub_subject,
      CASE
        WHEN _sub_subject_id IS NOT NULL
          AND selected_ss.id IS NOT NULL
          AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
          AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(ts.name)
        THEN selected_ss.id
        ELSE COALESCE(target_match.id, c.sub_subject_id)
      END AS c_sub_subject_id,
      public.content_effective_education_type(c.education_type, c.group_id) AS c_effective_education_type,
      public.content_effective_section(c.target_section, c.subject_id, c.group_id) AS c_effective_target_section,
      CASE WHEN c.group_id = _group_id THEN 0 ELSE 1 END AS source_rank,
      CASE
        WHEN public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL THEN 0
        WHEN c.group_id = _group_id THEN 1
        WHEN public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section) THEN 2
        ELSE 3
      END AS visibility_rank
    FROM public.content c
    JOIN public.content_groups source_group
      ON source_group.id = c.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects content_subject
      ON content_subject.id = c.subject_id
    JOIN target_subject ts ON true
    LEFT JOIN selected_sub_subject selected_ss ON true
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = c.sub_subject_id
     AND source_ss.group_id = c.group_id
     AND COALESCE(source_ss.is_active, true) = true
    LEFT JOIN public.sub_subjects target_match
      ON target_match.group_id = _group_id
     AND COALESCE(target_match.is_active, true) = true
     AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
     AND trim(target_match.name) = trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name))
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
          AND public.catalog_subjects_match(ts.category, ts.name, content_subject.category, content_subject.name)
          AND (
            public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
            OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section)
            OR public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
          )
        )
      )
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        _sub_subject_id IS NULL
        OR c.sub_subject_id = _sub_subject_id
        OR target_match.id = _sub_subject_id
        OR (
          selected_ss.id IS NOT NULL
          AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
          AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(ts.name)
        )
      )
      AND (v_is_admin OR public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section))
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject_id::text, cc.c_sub_subject, '')
    )
      cc.c_id, cc.c_title, cc.c_type, cc.c_file_url, cc.c_thumbnail_url, cc.c_description,
      cc.c_created_at, cc.c_is_paid, cc.c_is_free_preview, cc.c_group_id, cc.c_subject_id,
      cc.c_sub_subject, cc.c_sub_subject_id, cc.c_effective_education_type, cc.c_effective_target_section,
      cc.source_rank, cc.visibility_rank
    FROM candidate_content cc
    ORDER BY
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject_id::text, cc.c_sub_subject, ''),
      cc.visibility_rank ASC,
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
    d.c_effective_education_type          AS education_type,
    d.c_effective_target_section          AS subject_section
  FROM deduped d
  ORDER BY d.c_created_at DESC, d.c_id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_group_content_diagnostics(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  reason text,
  total_teacher_content bigint,
  matching_term_content bigint,
  matching_sub_subject_content bigint,
  visible_to_student_content bigint,
  student_section text,
  student_education_type text,
  group_subject_id uuid,
  group_term text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_group record;
  v_student record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'group_not_found'::text, 0::bigint, 0::bigint, 0::bigint, 0::bigint, NULL::text, NULL::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT public.normalize_content_section(p.section) AS section, public.normalize_content_education_type(p.education_type) AS education_type
  INTO v_student
  FROM public.profiles p
  WHERE p.id = v_student_id;

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.* FROM public.subjects s WHERE s.id = v_group.subject_id
  ), all_teacher_content AS (
    SELECT c.*, source_group.term AS source_term, content_subject.stage, content_subject.grade, content_subject.category, content_subject.name
    FROM public.content c
    JOIN public.content_groups source_group ON source_group.id = c.group_id AND COALESCE(source_group.is_active, true)
    JOIN public.subjects content_subject ON content_subject.id = c.subject_id
    JOIN target_subject ts ON true
    WHERE COALESCE(c.is_active, true)
      AND COALESCE(c.type, '') <> 'student_library'
      AND c.uploaded_by = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND ts.stage = content_subject.stage
      AND ts.grade = content_subject.grade
      AND public.catalog_subjects_match(ts.category, ts.name, content_subject.category, content_subject.name)
  ), term_matches AS (
    SELECT c.* FROM all_teacher_content c
    WHERE (v_group.term IS NULL OR c.source_term = v_group.term)
      AND (v_group.term IS NULL OR c.term = v_group.term)
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
  ), sub_matches AS (
    SELECT c.*
    FROM term_matches c
    LEFT JOIN public.sub_subjects source_ss ON source_ss.id = c.sub_subject_id AND COALESCE(source_ss.is_active, true)
    LEFT JOIN public.sub_subjects selected_ss ON selected_ss.id = _sub_subject_id AND selected_ss.group_id = _group_id AND COALESCE(selected_ss.is_active, true)
    WHERE _sub_subject_id IS NULL
      OR c.sub_subject_id = _sub_subject_id
      OR COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NULL
      OR (
        selected_ss.id IS NOT NULL
        AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(selected_ss.name)
      )
      OR (
        selected_ss.id IS NOT NULL
        AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = (SELECT trim(name) FROM target_subject)
      )
  ), visible_matches AS (
    SELECT c.* FROM sub_matches c
    WHERE public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ), counts AS (
    SELECT
      (SELECT count(*) FROM all_teacher_content) AS total_count,
      (SELECT count(*) FROM term_matches) AS term_count,
      (SELECT count(*) FROM sub_matches) AS sub_count,
      (SELECT count(*) FROM visible_matches) AS visible_count
  )
  SELECT
    CASE
      WHEN v_student_id IS NULL THEN 'student_not_authenticated'
      WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_student_id) THEN 'student_profile_not_found'
      WHEN total_count = 0 THEN 'no_teacher_content_for_subject_scope'
      WHEN term_count = 0 THEN 'blocked_by_term_filter'
      WHEN sub_count = 0 THEN 'blocked_by_sub_subject_filter'
      WHEN visible_count = 0 THEN 'blocked_by_student_target_filter'
      ELSE 'catalog_should_show_content'
    END AS reason,
    total_count,
    term_count,
    sub_count,
    visible_count,
    v_student.section,
    v_student.education_type,
    v_group.subject_id,
    v_group.term
  FROM counts;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_effective_section(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_subjects_match(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_diagnostics(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';