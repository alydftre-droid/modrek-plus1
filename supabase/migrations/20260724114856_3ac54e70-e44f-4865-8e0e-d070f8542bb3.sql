-- content_effective_education_type_defaults_hardening
DROP FUNCTION IF EXISTS public.content_effective_education_type(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.exam_effective_education_type(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.content_target_matches_student(text, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.content_target_matches_student(text, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.content_target_matches_student(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.exam_target_matches_student(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.exam_target_matches_student(text, uuid, text, text) CASCADE;

-- Root protection for teacher content targeting (education type + section)

CREATE OR REPLACE FUNCTION public.normalize_content_education_type(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('both', 'all', 'any', 'none', 'null', 'الكل', 'الجميع', 'كلاهما', 'الاثنين') THEN NULL
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('عام', 'general', 'تعليم عام', 'العام', 'regular', 'public') THEN 'عام'
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('أزهر', 'ازهر', 'أزهري', 'ازهري', 'azhar', 'azhari', 'azharite', 'تعليم أزهري', 'تعليم ازهري', 'الأزهر', 'الازهر') THEN 'أزهر'
    ELSE btrim(_value)
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('both', 'all', 'any', 'none', 'null', 'الكل', 'الجميع', 'كلاهما', 'الاثنين') THEN NULL
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات', 'scientific_science', 'scientific_math') THEN 'scientific'
    WHEN lower(regexp_replace(btrim(_value), '\s+', ' ', 'g')) IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي', 'arts') THEN 'literary'
    ELSE lower(btrim(_value))
  END
$$;

CREATE OR REPLACE FUNCTION public.is_valid_target_education_type(_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _value IS NULL
    OR btrim(_value) = ''
    OR public.normalize_content_education_type(_value) IS NULL
    OR public.normalize_content_education_type(_value) IN ('عام', 'أزهر')
$$;

CREATE OR REPLACE FUNCTION public.is_valid_target_section(_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _value IS NULL
    OR btrim(_value) = ''
    OR public.normalize_content_section(_value) IS NULL
    OR public.normalize_content_section(_value) IN ('scientific', 'literary')
$$;

CREATE OR REPLACE FUNCTION public.content_effective_education_type(_content_edu text, _content_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    public.normalize_content_education_type(_content_edu),
    (
      SELECT public.normalize_content_education_type(cg.education_type)
      FROM public.content_groups cg
      WHERE cg.id = _content_group_id
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(
  _content_edu text,
  _content_subject_id uuid,
  _content_group_id uuid,
  _student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH target AS (
    SELECT
      public.content_effective_education_type(_content_edu, _content_group_id) AS edu,
      public.normalize_content_section(s.section) AS section
    FROM (SELECT 1) seed
    LEFT JOIN public.subjects s ON s.id = _content_subject_id
  ), student AS (
    SELECT
      public.normalize_content_education_type(p.education_type) AS edu,
      public.normalize_content_section(p.section) AS section
    FROM public.profiles p
    WHERE p.id = _student_id
  )
  SELECT CASE
    WHEN _student_id IS NULL THEN
      (SELECT edu IS NULL AND section IS NULL FROM target)
    WHEN NOT EXISTS (SELECT 1 FROM student) THEN false
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
$$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _content_subject_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.content_target_matches_student(_content_edu, _content_subject_id, NULL::uuid, _student_id)
$$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.normalize_content_education_type(_content_edu) IS NULL THEN true
    WHEN _student_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _student_id
        AND public.normalize_content_education_type(p.education_type) = public.normalize_content_education_type(_content_edu)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.validate_and_normalize_content_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_edu text;
  v_subject_category text;
  v_subject_stage text;
  v_teacher_edu text;
  v_category_lower text;
BEGIN
  IF COALESCE(NEW.type, '') = 'student_library' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_valid_target_education_type(NEW.education_type) THEN
    RAISE EXCEPTION 'Invalid content education_type target: %', NEW.education_type
      USING ERRCODE = '22023';
  END IF;

  NEW.education_type := public.normalize_content_education_type(NEW.education_type);

  IF NEW.group_id IS NOT NULL THEN
    SELECT public.normalize_content_education_type(cg.education_type)
    INTO v_group_edu
    FROM public.content_groups cg
    WHERE cg.id = NEW.group_id;

    IF v_group_edu IS NOT NULL THEN
      IF NEW.education_type IS NULL THEN
        NEW.education_type := v_group_edu;
      ELSIF NEW.education_type <> v_group_edu THEN
        RAISE EXCEPTION 'Content target education_type (%) conflicts with group target (%)', NEW.education_type, v_group_edu
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.subject_id IS NOT NULL THEN
    SELECT s.category, s.stage
    INTO v_subject_category, v_subject_stage
    FROM public.subjects s
    WHERE s.id = NEW.subject_id;
  END IF;

  v_category_lower := lower(coalesce(v_subject_category, ''));

  IF v_subject_stage = 'secondary'
     AND (v_category_lower IN ('arabic', 'sharia', 'religious') OR v_category_lower LIKE '%عرب%' OR v_category_lower LIKE '%شرع%')
     AND NEW.education_type IS NULL THEN
    SELECT public.normalize_content_education_type(tr.education_type)
    INTO v_teacher_edu
    FROM public.teacher_requests tr
    WHERE tr.user_id = NEW.uploaded_by
      AND public.normalize_content_education_type(tr.education_type) IN ('عام', 'أزهر')
    LIMIT 1;

    IF v_teacher_edu IS NOT NULL THEN
      NEW.education_type := v_teacher_edu;
    ELSE
      RAISE EXCEPTION 'Arabic/Sharia secondary content must have a specific education_type target'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_content_targets ON public.content;
CREATE TRIGGER trg_validate_content_targets
BEFORE INSERT OR UPDATE OF education_type, subject_id, group_id, type, uploaded_by
ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_normalize_content_targets();

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
AS $$
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
    s.section AS subject_section
  FROM public.content c
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND (v_is_admin OR public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id))
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_group_content_target_debug(
  _group_id uuid,
  _student_id uuid,
  _sub_subject_id uuid DEFAULT NULL::uuid
)
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
AS $$
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
      public.normalize_content_section(s.section) AS target_division,
      (SELECT edu FROM student) AS student_edu,
      (SELECT division FROM student) AS student_division
    FROM public.content c
    LEFT JOIN public.subjects s ON s.id = c.subject_id
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
    ((r.effective_edu IS NULL OR (r.student_edu IS NOT NULL AND r.student_edu = r.effective_edu))
      AND (r.target_division IS NULL OR (r.student_division IS NOT NULL AND r.student_division = r.target_division))) AS allowed,
    CASE
      WHEN r.student_edu IS NULL AND r.effective_edu IS NOT NULL THEN 'rejected: student education_type is missing or different'
      WHEN r.effective_edu IS NOT NULL AND r.student_edu <> r.effective_edu THEN 'rejected: education_type mismatch'
      WHEN r.student_division IS NULL AND r.target_division IS NOT NULL THEN 'rejected: student division is missing or different'
      WHEN r.target_division IS NOT NULL AND r.student_division <> r.target_division THEN 'rejected: division mismatch'
      ELSE 'accepted: all active targets match'
    END AS decision_reason
  FROM rows r
  ORDER BY r.title, r.id;
END;
$$;

DROP POLICY IF EXISTS "Public can view accessible current-term content" ON public.content;
CREATE POLICY "Public can view accessible current-term content"
ON public.content
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(is_active, true)
  AND COALESCE(type, ''::text) <> 'student_library'::text
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND public.content_target_matches_student(education_type, subject_id, group_id, auth.uid())
);

-- Teacher exam targeting: inherit group education target and reject invalid values.
CREATE OR REPLACE FUNCTION public.normalize_exam_target_education_type(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.normalize_content_education_type(_value)
$$;

CREATE OR REPLACE FUNCTION public.normalize_exam_target_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.normalize_content_section(_value)
$$;

CREATE OR REPLACE FUNCTION public.exam_effective_education_type(_target_edu text, _group_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    public.normalize_exam_target_education_type(_target_edu),
    (
      SELECT public.normalize_content_education_type(cg.education_type)
      FROM public.content_groups cg
      WHERE cg.id = _group_id
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _student_id uuid,
  _target_section text,
  _target_education_type text,
  _subject_id uuid,
  _group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH target AS (
    SELECT
      public.exam_effective_education_type(_target_education_type, _group_id) AS edu,
      public.normalize_exam_target_section(_target_section) AS section
  ), student AS (
    SELECT
      public.normalize_content_education_type(p.education_type) AS edu,
      public.normalize_content_section(p.section) AS section
    FROM public.profiles p
    WHERE p.id = _student_id
  )
  SELECT CASE
    WHEN _student_id IS NULL THEN false
    WHEN NOT EXISTS (SELECT 1 FROM student) THEN false
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
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(_student_id uuid, _target_section text, _target_education_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.exam_target_matches_student(_student_id, _target_section, _target_education_type, NULL::uuid, NULL::uuid)
$$;

CREATE OR REPLACE FUNCTION public.validate_and_normalize_exam_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_edu text;
  v_subject_category text;
  v_subject_stage text;
  v_teacher_edu text;
  v_category_lower text;
BEGIN
  IF NOT public.is_valid_target_education_type(NEW.target_education_type) THEN
    RAISE EXCEPTION 'Invalid exam target_education_type: %', NEW.target_education_type
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_valid_target_section(NEW.target_section) THEN
    RAISE EXCEPTION 'Invalid exam target_section: %', NEW.target_section
      USING ERRCODE = '22023';
  END IF;

  NEW.target_education_type := public.normalize_exam_target_education_type(NEW.target_education_type);
  NEW.target_section := public.normalize_exam_target_section(NEW.target_section);

  IF NEW.group_id IS NOT NULL THEN
    SELECT public.normalize_content_education_type(cg.education_type)
    INTO v_group_edu
    FROM public.content_groups cg
    WHERE cg.id = NEW.group_id;

    IF v_group_edu IS NOT NULL THEN
      IF NEW.target_education_type IS NULL THEN
        NEW.target_education_type := v_group_edu;
      ELSIF NEW.target_education_type <> v_group_edu THEN
        RAISE EXCEPTION 'Exam target education_type (%) conflicts with group target (%)', NEW.target_education_type, v_group_edu
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF COALESCE(NEW.source, 'teacher') = 'teacher' AND NEW.subject_id IS NOT NULL THEN
    SELECT s.category, s.stage
    INTO v_subject_category, v_subject_stage
    FROM public.subjects s
    WHERE s.id = NEW.subject_id;

    v_category_lower := lower(coalesce(v_subject_category, ''));

    IF v_subject_stage = 'secondary'
       AND (v_category_lower IN ('arabic', 'sharia', 'religious') OR v_category_lower LIKE '%عرب%' OR v_category_lower LIKE '%شرع%')
       AND NEW.target_education_type IS NULL THEN
      SELECT public.normalize_content_education_type(tr.education_type)
      INTO v_teacher_edu
      FROM public.teacher_requests tr
      WHERE tr.user_id = NEW.teacher_id
        AND public.normalize_content_education_type(tr.education_type) IN ('عام', 'أزهر')
      LIMIT 1;

      IF v_teacher_edu IS NOT NULL THEN
        NEW.target_education_type := v_teacher_edu;
      ELSE
        RAISE EXCEPTION 'Arabic/Sharia secondary exam must have a specific education_type target'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_exam_targets ON public.exams;
CREATE TRIGGER trg_validate_exam_targets
BEFORE INSERT OR UPDATE OF target_education_type, target_section, subject_id, group_id, teacher_id, source
ON public.exams
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_normalize_exam_targets();

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
AS $$
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
    e.id,
    e.title,
    e.description,
    e.duration_minutes,
    e.total_marks,
    e.pass_marks,
    e.start_at,
    e.end_at,
    COALESCE(e.is_ai_generated, false) AS is_ai_generated,
    e.group_id,
    e.subject_id,
    e.sub_subject_id,
    e.term,
    e.created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible,
    public.normalize_exam_target_section(e.target_section) AS target_section,
    public.exam_effective_education_type(e.target_education_type, e.group_id) AS target_education_type
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND COALESCE(e.is_published, false) = true
    AND e.status = 'published'::public.exam_status
    AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
    AND (
      v_is_admin
      OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id)
    )
  ORDER BY e.created_at DESC, e.id DESC;
END;
$$;

DROP POLICY IF EXISTS "Students view subscribed current-term exams" ON public.exams;
CREATE POLICY "Students view subscribed current-term exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND status = 'published'::public.exam_status
  AND group_id IS NOT NULL
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id
      AND sgp.student_id = auth.uid()
  )
  AND public.exam_target_matches_student(auth.uid(), target_section, target_education_type, subject_id, group_id)
);

GRANT EXECUTE ON FUNCTION public.normalize_content_education_type(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_effective_education_type(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_exam_target_education_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_exam_target_section(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_effective_education_type(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;