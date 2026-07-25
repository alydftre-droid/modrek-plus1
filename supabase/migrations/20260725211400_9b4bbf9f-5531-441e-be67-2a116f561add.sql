-- Align exam target matching with content target matching. The previous
-- implementation nulled out the section filter whenever the exam's target
-- section matched the subject's own section, which caused scientific-targeted
-- exams to leak to literary students on scientific subjects (and vice versa).
--
-- New behaviour (identical to content_target_matches_student):
--   * NULL target section  -> visible to any section
--   * NULL target edu type -> visible to any education type
--   * Otherwise, student's normalized section/edu must equal the target.
CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _student_id uuid,
  _target_section text,
  _target_education_type text,
  _subject_id uuid DEFAULT NULL::uuid,
  _group_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

COMMENT ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid)
IS 'Unified exam targeting rule. Mirrors content_target_matches_student: exam is visible to a student only when the exam''s target section/education type is NULL (all) or exactly equals the student''s normalized section/education type. No implicit cancellation from the subject''s own section.';