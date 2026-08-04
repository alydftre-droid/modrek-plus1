DO $$
DECLARE
  v_shared_subject_id uuid;
BEGIN
  v_shared_subject_id := public.ensure_shared_subject('science', 'الجيولوجيا');

  INSERT INTO public.subjects (
    name,
    category,
    stage,
    grade,
    section,
    description,
    is_active,
    shared_subject_id
  )
  SELECT
    'الجيولوجيا',
    'science',
    'secondary',
    'third',
    'scientific',
    'مادة الجيولوجيا للصف الثالث الثانوي',
    true,
    v_shared_subject_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subjects
    WHERE stage = 'secondary'
      AND grade = 'third'
      AND category = 'science'
      AND name = 'الجيولوجيا'
  );

  UPDATE public.subjects
  SET is_active = true,
      section = 'scientific',
      shared_subject_id = v_shared_subject_id,
      description = COALESCE(NULLIF(description, ''), 'مادة الجيولوجيا للصف الثالث الثانوي')
  WHERE stage = 'secondary'
    AND grade = 'third'
    AND category = 'science'
    AND name = 'الجيولوجيا';
END
$$;