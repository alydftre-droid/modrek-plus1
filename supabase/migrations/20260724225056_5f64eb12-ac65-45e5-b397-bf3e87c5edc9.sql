CREATE OR REPLACE FUNCTION public.validate_and_normalize_content_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_edu text;
  v_group_subject_id uuid;
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

  IF NOT public.is_valid_target_section(NEW.target_section) THEN
    RAISE EXCEPTION 'Invalid content target_section: %', NEW.target_section
      USING ERRCODE = '22023';
  END IF;

  NEW.education_type := public.normalize_content_education_type(NEW.education_type);
  NEW.target_section := public.normalize_content_section(NEW.target_section);

  IF NEW.group_id IS NOT NULL THEN
    SELECT
      cg.subject_id,
      public.normalize_content_education_type(cg.education_type)
    INTO v_group_subject_id, v_group_edu
    FROM public.content_groups cg
    WHERE cg.id = NEW.group_id;

    IF v_group_subject_id IS NOT NULL THEN
      NEW.subject_id := v_group_subject_id;
    END IF;

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

UPDATE public.content c
SET subject_id = cg.subject_id,
    updated_at = now()
FROM public.content_groups cg
WHERE c.group_id = cg.id
  AND c.subject_id IS DISTINCT FROM cg.subject_id
  AND COALESCE(c.type, '') <> 'student_library';

UPDATE public.content c
SET sub_subject_id = ss.id,
    updated_at = now()
FROM public.sub_subjects ss
WHERE c.group_id = ss.group_id
  AND COALESCE(ss.is_active, true) = true
  AND NULLIF(trim(COALESCE(c.sub_subject, '')), '') IS NOT NULL
  AND trim(ss.name) = trim(c.sub_subject)
  AND c.sub_subject_id IS DISTINCT FROM ss.id
  AND COALESCE(c.type, '') <> 'student_library';