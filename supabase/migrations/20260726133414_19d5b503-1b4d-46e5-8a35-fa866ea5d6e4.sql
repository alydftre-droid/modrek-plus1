CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    CASE
      WHEN _user_id IS NULL THEN false
      WHEN _role = 'admin'::public.app_role AND EXISTS (
        SELECT 1
        FROM auth.users au
        WHERE au.id = _user_id
          AND lower(coalesce(au.email, '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
      ) THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.role = _role
      )
    END
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role public.app_role;
  student_code_val text;
  meta jsonb;
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

  INSERT INTO public.profiles (id, full_name, email, phone, student_code, stage, grade, section)
  VALUES (
    NEW.id,
    meta->>'full_name',
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
      NULLIF(COALESCE(meta->>'subject', meta->>'assigned_category'), ''),
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
$$;