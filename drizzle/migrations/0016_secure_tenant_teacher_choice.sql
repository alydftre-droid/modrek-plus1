ALTER TABLE public.student_teacher_choices
  DROP CONSTRAINT IF EXISTS unique_student_teacher_choice;

ALTER TABLE public.student_teacher_choices
  ADD CONSTRAINT unique_student_teacher_choice
  UNIQUE (tenant_id, student_id, category, stage, grade);

CREATE OR REPLACE FUNCTION public.select_my_teacher(
  _teacher_id uuid,
  _category text,
  _stage text,
  _grade text
)
RETURNS public.student_teacher_choices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid := public.effective_request_tenant_id();
  v_choice public.student_teacher_choices;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF COALESCE(btrim(_category), '') = ''
     OR COALESCE(btrim(_stage), '') = ''
     OR COALESCE(btrim(_grade), '') = '' THEN
    RAISE EXCEPTION 'invalid_choice_scope';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.role = 'student'
  ) THEN
    RAISE EXCEPTION 'student_only';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teacher_profiles tp
    WHERE tp.teacher_id = _teacher_id
      AND tp.tenant_id = v_tenant_id
      AND tp.is_approved = true
  ) THEN
    RAISE EXCEPTION 'teacher_not_available';
  END IF;

  INSERT INTO public.student_teacher_choices (
    tenant_id,
    student_id,
    teacher_id,
    category,
    stage,
    grade
  ) VALUES (
    v_tenant_id,
    v_uid,
    _teacher_id,
    btrim(_category),
    btrim(_stage),
    btrim(_grade)
  )
  ON CONFLICT (tenant_id, student_id, category, stage, grade)
  DO UPDATE SET teacher_id = EXCLUDED.teacher_id
  RETURNING * INTO v_choice;

  RETURN v_choice;
END;
$$;

REVOKE ALL ON FUNCTION public.select_my_teacher(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_my_teacher(uuid, text, text, text) TO authenticated, service_role;