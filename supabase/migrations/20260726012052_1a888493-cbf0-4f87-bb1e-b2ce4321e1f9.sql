DO $$
BEGIN
  -- The 3-argument overload conflicts with the 5-argument function because
  -- the last two parameters on the 5-argument function have defaults.
  -- Keeping both makes calls like exam_target_matches_student(uuid,text,text)
  -- ambiguous and breaks submit_exam_attempt_resilient.
  IF to_regprocedure('public.exam_target_matches_student(uuid,text,text)') IS NOT NULL THEN
    DROP FUNCTION public.exam_target_matches_student(uuid,text,text);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _student_id uuid,
  _target_section text,
  _target_education_type text,
  _subject_id uuid DEFAULT NULL::uuid,
  _group_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH target AS (
    SELECT
      public.normalize_content_education_type(_target_education_type) AS edu,
      public.normalize_content_section(_target_section) AS section
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

GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid,text,text,uuid,uuid) TO anon, authenticated, service_role;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'exam_target_matches_student';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'exam_target_matches_student must have exactly one overload, found %', v_count;
  END IF;
END $$;