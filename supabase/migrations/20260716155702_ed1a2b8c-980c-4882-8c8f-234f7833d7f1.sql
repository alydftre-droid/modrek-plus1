CREATE OR REPLACE FUNCTION public.library_stage_code_from_subject(_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(_stage, '')) = 'preparatory' OR coalesce(_stage, '') ILIKE '%اعداد%' OR coalesce(_stage, '') ILIKE '%إعداد%' THEN 'preparatory'
    WHEN lower(coalesce(_stage, '')) = 'secondary' OR coalesce(_stage, '') ILIKE '%ثانو%' THEN 'secondary'
    WHEN lower(coalesce(_stage, '')) = 'primary' OR coalesce(_stage, '') ILIKE '%ابتد%' THEN 'primary'
    ELSE lower(coalesce(_stage, ''))
  END
$$;

CREATE OR REPLACE FUNCTION public.library_grade_code_from_subject(_stage text, _grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' THEN
      CASE
        WHEN lower(coalesce(_grade, '')) IN ('first','1') OR coalesce(_grade, '') IN ('الأول','اول','أول','الصف الأول','الاول') THEN 'pr1'
        WHEN lower(coalesce(_grade, '')) IN ('second','2') OR coalesce(_grade, '') IN ('الثاني','ثاني','الصف الثاني','الثانى') THEN 'pr2'
        WHEN lower(coalesce(_grade, '')) IN ('third','3') OR coalesce(_grade, '') IN ('الثالث','ثالث','الصف الثالث') THEN 'pr3'
        ELSE lower(coalesce(_grade, ''))
      END
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' THEN
      CASE
        WHEN lower(coalesce(_grade, '')) IN ('first','1') OR coalesce(_grade, '') IN ('الأول','اول','أول','الصف الأول','الاول') THEN 'sec1'
        WHEN lower(coalesce(_grade, '')) IN ('second','2') OR coalesce(_grade, '') IN ('الثاني','ثاني','الصف الثاني','الثانى') THEN 'sec2'
        WHEN lower(coalesce(_grade, '')) IN ('third','3') OR coalesce(_grade, '') IN ('الثالث','ثالث','الصف الثالث') THEN 'sec3'
        ELSE lower(coalesce(_grade, ''))
      END
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' THEN
      CASE
        WHEN lower(coalesce(_grade, '')) IN ('first','1') OR coalesce(_grade, '') IN ('الأول','اول','أول','الصف الأول','الاول') THEN 'p1'
        WHEN lower(coalesce(_grade, '')) IN ('second','2') OR coalesce(_grade, '') IN ('الثاني','ثاني','الصف الثاني','الثانى') THEN 'p2'
        WHEN lower(coalesce(_grade, '')) IN ('third','3') OR coalesce(_grade, '') IN ('الثالث','ثالث','الصف الثالث') THEN 'p3'
        WHEN lower(coalesce(_grade, '')) IN ('fourth','4') OR coalesce(_grade, '') IN ('الرابع','رابع','الصف الرابع') THEN 'p4'
        WHEN lower(coalesce(_grade, '')) IN ('fifth','5') OR coalesce(_grade, '') IN ('الخامس','خامس','الصف الخامس') THEN 'p5'
        WHEN lower(coalesce(_grade, '')) IN ('sixth','6') OR coalesce(_grade, '') IN ('السادس','سادس','الصف السادس') THEN 'p6'
        ELSE lower(coalesce(_grade, ''))
      END
    ELSE lower(coalesce(_grade, ''))
  END
$$;

CREATE OR REPLACE FUNCTION public.library_track_code_from_subject(_section text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(_section, '')) IN ('scientific','science','sci') OR coalesce(_section, '') IN ('علمي','علمى','علمي علوم','علمى علوم','علمي رياضة','علمى رياضة') THEN 'scientific'
    WHEN lower(coalesce(_section, '')) IN ('literary') OR coalesce(_section, '') IN ('أدبي','ادبي','أدبى','ادبى') THEN 'literary'
    ELSE NULLIF(lower(coalesce(_section, '')), '')
  END
$$;

WITH normalized_subjects AS (
  SELECT
    s.id AS source_subject_id,
    s.name AS name_ar,
    s.category AS source_category,
    public.library_stage_code_from_subject(s.stage) AS stage_code,
    public.library_grade_code_from_subject(s.stage, s.grade) AS grade_code,
    public.library_track_code_from_subject(s.section) AS curriculum_track
  FROM public.subjects s
  WHERE s.is_active = true
), mapped AS (
  SELECT
    ns.*,
    st.id AS stage_id,
    gr.id AS grade_id,
    COALESCE(sec.id, shared_sec.id) AS section_id,
    row_number() OVER (
      PARTITION BY st.id, gr.id, COALESCE(sec.id, shared_sec.id), ns.curriculum_track
      ORDER BY ns.source_category NULLS LAST, ns.name_ar, ns.source_subject_id
    ) AS rn
  FROM normalized_subjects ns
  JOIN public.library_stages st ON st.code = ns.stage_code
  JOIN public.library_grades gr ON gr.stage_id = st.id AND gr.code = ns.grade_code
  LEFT JOIN public.library_sections sec ON sec.code = CASE WHEN ns.source_category IN ('sharia','religious') THEN 'azhar' ELSE 'shared' END
  LEFT JOIN public.library_sections shared_sec ON shared_sec.code = 'shared'
)
INSERT INTO public.library_subjects (
  code,
  name_ar,
  stage_id,
  grade_id,
  section_id,
  curriculum_track,
  source_subject_id,
  source_category,
  sort_order,
  is_active
)
SELECT
  'core_' || replace(source_subject_id::text, '-', '_'),
  name_ar,
  stage_id,
  grade_id,
  section_id,
  curriculum_track,
  source_subject_id,
  source_category,
  rn,
  true
FROM mapped
ON CONFLICT (source_subject_id) WHERE source_subject_id IS NOT NULL DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    stage_id = EXCLUDED.stage_id,
    grade_id = EXCLUDED.grade_id,
    section_id = EXCLUDED.section_id,
    curriculum_track = EXCLUDED.curriculum_track,
    source_category = EXCLUDED.source_category,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

UPDATE public.library_subjects ls
SET is_active = false,
    updated_at = now()
WHERE ls.source_subject_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.subjects s
    WHERE s.id = ls.source_subject_id
      AND s.is_active = true
  );

CREATE INDEX IF NOT EXISTS idx_library_subjects_stage_grade_section_track
  ON public.library_subjects(stage_id, grade_id, section_id, curriculum_track)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_library_subjects_source_subject
  ON public.library_subjects(source_subject_id)
  WHERE source_subject_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';