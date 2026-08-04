-- 1) Extract the EXACT approval-time assignment logic into a reusable function
CREATE OR REPLACE FUNCTION public.apply_teacher_request_assignments(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.teacher_requests%ROWTYPE;
  v_grade text;
  v_grade_stage text;
  v_category text;
  v_categories text[];
  v_is_science_subject boolean;
  v_is_first_secondary boolean;
  v_edu_type text;
  v_created integer := 0;
  v_rows integer := 0;
BEGIN
  SELECT * INTO r FROM public.teacher_requests WHERE user_id = _user_id
  ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_categories := ARRAY(
    SELECT DISTINCT c FROM unnest(
      COALESCE(ARRAY[r.assigned_category], ARRAY[]::text[])
      || COALESCE(r.additional_categories, ARRAY[]::text[])
    ) AS t(c)
    WHERE c IS NOT NULL AND c <> ''
  );

  IF array_length(v_categories, 1) IS NULL OR r.assigned_grades IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_category IN ARRAY v_categories LOOP
    v_is_science_subject := v_category IN ('أحياء', 'فيزياء', 'كيمياء');

    v_edu_type := CASE
      WHEN v_category = 'المواد الشرعية' THEN 'أزهر'
      WHEN v_category = 'المواد العربية' THEN COALESCE(r.education_type, 'عام')
      ELSE r.education_type
    END;

    FOREACH v_grade IN ARRAY r.assigned_grades LOOP
      IF v_grade LIKE '%إعدادي%' THEN
        v_grade_stage := 'preparatory';
      ELSIF v_grade LIKE '%ثانوي%' THEN
        v_grade_stage := 'secondary';
      ELSE
        v_grade_stage := COALESCE(r.assigned_stages[1], 'preparatory');
      END IF;

      v_is_first_secondary := (v_grade_stage = 'secondary' AND v_grade LIKE '%الأول%');

      IF NOT (v_is_science_subject AND v_is_first_secondary) THEN
        INSERT INTO public.teacher_assignments
          (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
        VALUES
          (r.user_id, v_grade_stage, v_grade, v_category,
           CASE WHEN r.assigned_sections IS NOT NULL AND array_length(r.assigned_sections,1) > 0
                THEN r.assigned_sections[1] ELSE NULL END,
           v_edu_type, COALESCE(r.teaches_integrated_science, false))
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
      END IF;

      IF v_is_science_subject AND v_is_first_secondary AND COALESCE(r.teaches_integrated_science, false) THEN
        INSERT INTO public.teacher_assignments
          (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
        VALUES
          (r.user_id, v_grade_stage, v_grade, 'integrated_science',
           CASE WHEN r.assigned_sections IS NOT NULL AND array_length(r.assigned_sections,1) > 0
                THEN r.assigned_sections[1] ELSE NULL END,
           v_edu_type, true)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_teacher_request_assignments(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Approval trigger now delegates to the shared function (identical behaviour)
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    PERFORM public.apply_teacher_request_assignments(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Developer-only sync of a teacher's stages / grades / subjects
CREATE OR REPLACE FUNCTION public.admin_sync_teacher_teaching_scope(
  _teacher_id uuid,
  _stages text[],
  _grades text[],
  _categories text[],
  _education_type text DEFAULT NULL,
  _teaches_integrated_science boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary text;
  v_additional text[];
  v_created integer := 0;
  v_removed integer := 0;
  v_blocked jsonb := '[]'::jsonb;
  a record;
  v_subject_ids uuid[];
  v_has_data boolean;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF _teacher_id IS NULL
     OR _grades IS NULL OR cardinality(_grades) = 0
     OR _categories IS NULL OR cardinality(_categories) = 0
     OR _stages IS NULL OR cardinality(_stages) = 0 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  v_primary := _categories[1];
  v_additional := _categories[2:cardinality(_categories)];

  -- Same source of truth used at registration time
  IF EXISTS (SELECT 1 FROM public.teacher_requests WHERE user_id = _teacher_id) THEN
    UPDATE public.teacher_requests
    SET assigned_stages = _stages,
        assigned_grades = _grades,
        assigned_category = v_primary,
        additional_categories = v_additional,
        education_type = COALESCE(_education_type, education_type),
        teaches_integrated_science = COALESCE(_teaches_integrated_science, false)
    WHERE user_id = _teacher_id;
  ELSE
    INSERT INTO public.teacher_requests
      (user_id, full_name, email, status, assigned_stages, assigned_grades,
       assigned_category, additional_categories, education_type, teaches_integrated_science)
    SELECT _teacher_id, COALESCE(p.full_name, 'معلم'), p.email, 'approved',
           _stages, _grades, v_primary, v_additional, _education_type,
           COALESCE(_teaches_integrated_science, false)
    FROM public.profiles p WHERE p.id = _teacher_id;
  END IF;

  -- Create the assignments with the identical registration logic
  v_created := public.apply_teacher_request_assignments(_teacher_id);

  -- Remove de-selected assignments ONLY when nothing is attached to them
  FOR a IN
    SELECT ta.id, ta.stage, ta.grade, ta.category
    FROM public.teacher_assignments ta
    WHERE ta.teacher_id = _teacher_id
      AND (
        NOT (ta.grade = ANY(_grades))
        OR NOT (
          ta.category = ANY(_categories)
          OR (ta.category = 'integrated_science' AND COALESCE(_teaches_integrated_science, false))
        )
      )
  LOOP
    SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO v_subject_ids
    FROM public.subjects s
    WHERE s.stage = a.stage AND s.grade = a.grade AND s.category = a.category;

    SELECT EXISTS (
      SELECT 1 FROM public.content_groups cg
      WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id AND cg.subject_id = ANY(v_subject_ids)
    ) OR EXISTS (
      SELECT 1 FROM public.content c
      WHERE c.uploaded_by = _teacher_id AND c.subject_id = ANY(v_subject_ids)
    ) OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.teacher_id = _teacher_id AND e.subject_id = ANY(v_subject_ids)
    ) INTO v_has_data;

    IF v_has_data THEN
      v_blocked := v_blocked || jsonb_build_object('grade', a.grade, 'category', a.category);
    ELSE
      DELETE FROM public.teacher_assignments WHERE id = a.id;
      v_removed := v_removed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_assignments', v_created,
    'removed_assignments', v_removed,
    'blocked', v_blocked
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_sync_teacher_teaching_scope(uuid, text[], text[], text[], text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_teacher_teaching_scope(uuid, text[], text[], text[], text, boolean) TO service_role;