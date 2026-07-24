CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN lower(btrim(_value)) IN ('both', 'all', 'كل', 'الكل', 'الجميع', 'علمي + أدبي', 'علمي+أدبي') THEN NULL
    WHEN lower(regexp_replace(btrim(_value), '[ًٌٍَُِّْـ]', '', 'g')) IN (
      'scientific', 'science', 'sci',
      'علمي', 'علمى', 'علم', 'العلمي', 'العلمى',
      'علمي علوم', 'علمى علوم', 'علوم',
      'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات'
    ) THEN 'scientific'
    WHEN lower(regexp_replace(btrim(_value), '[ًٌٍَُِّْـ]', '', 'g')) IN (
      'literary',
      'ادبي', 'ادبى', 'أدبي', 'أدبى',
      'الأدبي', 'الادبي', 'الأدبى', 'الادبى'
    ) THEN 'literary'
    ELSE lower(btrim(_value))
  END
$function$;

GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO anon, authenticated, service_role;

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
BEGIN
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND COALESCE(cg.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.type,
    c.file_url,
    c.thumbnail_url,
    c.description,
    c.created_at,
    COALESCE(c.is_paid, false) AS is_paid,
    COALESCE(c.is_free_preview, false) AS is_free_preview,
    c.group_id,
    c.subject_id,
    c.sub_subject,
    c.sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(c.is_paid, false) = false OR COALESCE(c.is_free_preview, false) = true) AS is_accessible,
    public.content_effective_education_type(c.education_type, c.group_id) AS education_type,
    public.content_effective_section(c.target_section, c.subject_id, c.group_id) AS subject_section
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ORDER BY c.created_at DESC, c.id DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_group_content_target_debug(_group_id uuid, _student_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  content_id uuid,
  title text,
  group_id uuid,
  saved_education_type text,
  effective_education_type text,
  saved_division text,
  student_education_type text,
  student_division text,
  education_matches boolean,
  division_matches boolean,
  allowed boolean,
  decision_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_can_debug boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  SELECT public.has_role(v_caller, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.content_groups cg
      WHERE cg.id = _group_id
        AND (cg.teacher_id = v_caller OR cg.created_by = v_caller)
    )
  INTO v_can_debug;

  IF NOT COALESCE(v_can_debug, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH student AS (
    SELECT
      public.normalize_content_education_type(p.education_type) AS edu,
      public.normalize_content_section(p.section) AS division
    FROM public.profiles p
    WHERE p.id = _student_id
  ), rows AS (
    SELECT
      c.id,
      c.title,
      c.group_id,
      c.education_type AS saved_edu,
      public.content_effective_education_type(c.education_type, c.group_id) AS effective_edu,
      public.content_effective_section(c.target_section, c.subject_id, c.group_id) AS target_division,
      (SELECT edu FROM student) AS student_edu,
      (SELECT division FROM student) AS student_division
    FROM public.content c
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
  )
  SELECT
    r.id,
    r.title,
    r.group_id,
    r.saved_edu,
    r.effective_edu,
    r.target_division,
    r.student_edu,
    r.student_division,
    (r.effective_edu IS NULL OR (r.student_edu IS NOT NULL AND r.student_edu = r.effective_edu)) AS education_matches,
    (r.target_division IS NULL OR (r.student_division IS NOT NULL AND r.student_division = r.target_division)) AS division_matches,
    public.content_target_matches_student(r.saved_edu, NULL::uuid, r.group_id, _student_id, r.target_division) AS allowed,
    CASE
      WHEN r.effective_edu IS NOT NULL AND (r.student_edu IS NULL OR r.student_edu <> r.effective_edu) THEN 'rejected: education_type mismatch'
      WHEN r.target_division IS NOT NULL AND (r.student_division IS NULL OR r.student_division <> r.target_division) THEN 'rejected: division mismatch'
      ELSE 'accepted: all active targets match'
    END AS decision_reason
  FROM rows r
  ORDER BY r.title, r.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) TO authenticated, service_role;