CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role public.app_role;
  student_code_val text;
  meta jsonb;
  all_subjects text[];
  primary_subject text;
  additional_subjects text[];
  resolved_full_name text;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  BEGIN
    user_role := COALESCE((meta->>'role')::public.app_role, 'student'::public.app_role);
  EXCEPTION WHEN invalid_text_representation THEN
    user_role := 'student'::public.app_role;
  END;

  IF user_role NOT IN ('student'::public.app_role, 'teacher'::public.app_role) THEN
    user_role := 'student'::public.app_role;
  END IF;

  IF user_role = 'student'::public.app_role THEN
    student_code_val := floor(random() * 100000)::text;
  ELSE
    student_code_val := NULL;
  END IF;

  resolved_full_name := COALESCE(
    NULLIF(btrim(meta->>'full_name'), ''),
    NULLIF(btrim(meta->>'name'), ''),
    NULLIF(btrim(concat_ws(' ', meta->>'given_name', meta->>'family_name')), ''),
    NULLIF(btrim(meta->>'preferred_username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'مستخدم جديد'
  );

  INSERT INTO public.profiles (id, full_name, email, phone, student_code, stage, grade, section)
  VALUES (
    NEW.id,
    resolved_full_name,
    NEW.email,
    meta->>'phone',
    student_code_val,
    meta->>'stage',
    meta->>'grade',
    meta->>'section'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF user_role = 'teacher'::public.app_role THEN
    all_subjects := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(meta->'subjects') WHERE jsonb_typeof(meta->'subjects') = 'array'),
      ARRAY[]::text[]
    );

    primary_subject := NULLIF(COALESCE(meta->>'subject', meta->>'assigned_category'), '');
    IF primary_subject IS NULL AND array_length(all_subjects, 1) IS NOT NULL THEN
      primary_subject := all_subjects[1];
    END IF;

    IF jsonb_typeof(meta->'additional_categories') = 'array' THEN
      additional_subjects := ARRAY(SELECT jsonb_array_elements_text(meta->'additional_categories'));
    ELSIF array_length(all_subjects, 1) IS NOT NULL THEN
      additional_subjects := ARRAY(
        SELECT s FROM unnest(all_subjects) WITH ORDINALITY AS t(s, ord)
        WHERE s IS NOT NULL AND s <> '' AND s IS DISTINCT FROM primary_subject
      );
    ELSE
      additional_subjects := ARRAY[]::text[];
    END IF;

    INSERT INTO public.teacher_requests (
      user_id,
      full_name,
      email,
      phone,
      school_name,
      employee_id,
      status,
      assigned_stages,
      assigned_grades,
      assigned_category,
      additional_categories,
      education_type,
      teaches_integrated_science,
      terms_version,
      terms_accepted_at
    )
    SELECT
      NEW.id,
      COALESCE(NULLIF(meta->>'full_name', ''), NEW.email, 'معلم جديد'),
      COALESCE(NEW.email, meta->>'email', ''),
      NULLIF(meta->>'phone', ''),
      NULLIF(COALESCE(meta->>'school_name', meta->>'school'), ''),
      NULLIF(COALESCE(meta->>'employee_id', meta->>'employeeId'), ''),
      'pending'::public.approval_status,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(meta->'stages')),
        ARRAY[]::text[]
      ),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(meta->'grades')),
        ARRAY[]::text[]
      ),
      primary_subject,
      COALESCE(additional_subjects, ARRAY[]::text[]),
      NULLIF(COALESCE(meta->>'education_type', meta->>'educationType'), ''),
      COALESCE((meta->>'teaches_integrated_science')::boolean, (meta->>'teachesIntegratedScience')::boolean, false),
      NULLIF(meta->>'terms_version', ''),
      COALESCE((NULLIF(meta->>'terms_accepted_at', ''))::timestamptz, now())
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.teacher_requests tr
      WHERE tr.user_id = NEW.id
        AND tr.status = 'pending'::public.approval_status
    );
  END IF;

  PERFORM public.request_external_sync('auth');
  PERFORM public.request_external_sync('tables');

  RETURN NEW;
END;
$function$;