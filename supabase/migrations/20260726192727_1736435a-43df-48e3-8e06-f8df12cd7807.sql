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
      ORDER BY
        CASE ns.source_category
          WHEN 'arabic' THEN 10
          WHEN 'english' THEN 20
          WHEN 'french' THEN 30
          WHEN 'math' THEN 40
          WHEN 'science' THEN 50
          WHEN 'scientific' THEN 55
          WHEN 'integrated_science' THEN 60
          WHEN 'studies' THEN 70
          WHEN 'literary' THEN 80
          WHEN 'sharia' THEN 90
          WHEN 'religious' THEN 95
          ELSE 200
        END,
        ns.name_ar,
        ns.source_subject_id
    ) AS rn
  FROM normalized_subjects ns
  JOIN public.library_stages st ON st.code = ns.stage_code
  JOIN public.library_grades gr ON gr.stage_id = st.id AND gr.code = ns.grade_code
  LEFT JOIN public.library_sections sec
    ON sec.code = CASE WHEN ns.source_category IN ('sharia','religious') THEN 'azhar' ELSE NULL END
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
WHERE ls.source_subject_id IS NULL
  AND ls.code IN ('arabic','english','french','integrated_science','literary','math','religious','science','scientific','sharia','studies','امتحانات','دروس');

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

CREATE OR REPLACE FUNCTION public.get_modrek_library_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_modrek_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'types', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.name_ar)
      FROM public.knowledge_source_types t
      WHERE t.is_active = true
    ), '[]'::jsonb),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'code', s.code) ORDER BY s.sort_order, s.name_ar)
      FROM public.library_stages s
      WHERE s.is_active = true
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'code', g.code, 'stage_id', g.stage_id) ORDER BY g.sort_order, g.name_ar)
      FROM public.library_grades g
      WHERE g.is_active = true
    ), '[]'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sec.id, 'name_ar', sec.name_ar, 'code', sec.code) ORDER BY sec.sort_order, sec.name_ar)
      FROM public.library_sections sec
      WHERE sec.is_active = true
    ), '[]'::jsonb),
    'tracks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tr.id, 'name_ar', tr.name_ar, 'code', tr.code) ORDER BY tr.sort_order, tr.name_ar)
      FROM public.library_tracks tr
      WHERE tr.is_active = true
    ), '[]'::jsonb),
    'subjects', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'name_ar', sub.name_ar,
          'code', sub.code,
          'stage_id', sub.stage_id,
          'grade_id', sub.grade_id,
          'section_id', sub.section_id,
          'curriculum_track', sub.curriculum_track,
          'source_subject_id', sub.source_subject_id,
          'source_category', sub.source_category
        )
        ORDER BY sub.sort_order, sub.name_ar
      )
      FROM public.library_subjects sub
      WHERE sub.is_active = true
    ), '[]'::jsonb),
    'subSubjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ss.id, 'name_ar', ss.name_ar, 'code', ss.code, 'subject_id', ss.subject_id) ORDER BY ss.sort_order, ss.name_ar)
      FROM public.library_sub_subjects ss
      WHERE ss.is_active = true
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC)
      FROM public.knowledge_sources src
    ), '[]'::jsonb)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';