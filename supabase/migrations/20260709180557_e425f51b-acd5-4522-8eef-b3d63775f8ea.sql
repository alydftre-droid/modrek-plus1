CREATE OR REPLACE FUNCTION public.normalize_exam_target_education_type(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN (
      'general', 'عام', 'تعليم عام', 'العام', 'عام ', 'regular'
    ) THEN 'عام'
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN (
      'azhar', 'azhari', 'أزهر', 'ازهر', 'أزهري', 'ازهري', 'تعليم أزهري', 'تعليم ازهري', 'الأزهر', 'الازهر', 'azharite'
    ) THEN 'أزهر'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_exam_target_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN (
      'scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات', 'scientific_science', 'scientific_math'
    ) THEN 'scientific'
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN (
      'literary', 'ادبي', 'أدبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي', 'arts'
    ) THEN 'literary'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(_student_id uuid, _target_section text, _target_education_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _student_id
      AND (
        public.normalize_exam_target_education_type(_target_education_type) IS NULL
        OR public.normalize_exam_target_education_type(p.education_type) = public.normalize_exam_target_education_type(_target_education_type)
      )
      AND (
        public.normalize_exam_target_section(_target_section) IS NULL
        OR public.normalize_exam_target_section(p.section) = public.normalize_exam_target_section(_target_section)
      )
  )
$$;

DROP POLICY IF EXISTS "Students view subscribed exams" ON public.exams;
CREATE POLICY "Students view subscribed exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND status = 'published'::exam_status
  AND group_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id
      AND sgp.student_id = auth.uid()
  )
  AND public.exam_target_matches_student(auth.uid(), target_section, target_education_type)
);

GRANT EXECUTE ON FUNCTION public.normalize_exam_target_education_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_exam_target_section(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';