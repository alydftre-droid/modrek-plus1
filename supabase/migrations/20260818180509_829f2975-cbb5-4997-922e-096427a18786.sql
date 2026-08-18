CREATE OR REPLACE FUNCTION public.sync_library_taxonomy_from_subjects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  synced_count integer := 0;
BEGIN
  -- Stages
  WITH used AS (
    SELECT DISTINCT public.library_stage_code_from_subject(stage) AS code
    FROM public.subjects WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_stages st
     SET is_active = EXISTS (SELECT 1 FROM used u WHERE u.code = st.code),
         updated_at = now()
   WHERE st.code IN ('primary', 'preparatory', 'secondary');

  -- Grades
  WITH used AS (
    SELECT DISTINCT
      public.library_stage_code_from_subject(stage) AS stage_code,
      public.library_grade_code_from_subject(stage, grade) AS grade_code
    FROM public.subjects WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_grades gr
     SET is_active = EXISTS (
           SELECT 1 FROM used u
           JOIN public.library_stages st ON st.code = u.stage_code
           WHERE st.id = gr.stage_id AND u.grade_code = gr.code
         ),
         updated_at = now();

  -- Tracks
  WITH used AS (
    SELECT DISTINCT public.library_track_code_from_subject(section) AS track_code
    FROM public.subjects WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_tracks tr
     SET is_active = CASE
           WHEN tr.code = 'literary' THEN EXISTS (SELECT 1 FROM used WHERE track_code = 'literary')
           WHEN tr.code IN ('sci_science', 'sci_math', 'scientific') THEN EXISTS (SELECT 1 FROM used WHERE track_code = 'scientific')
           ELSE tr.is_active
         END,
         updated_at = now();

  UPDATE public.library_sections
     SET is_active = true, updated_at = now()
   WHERE code IN ('general', 'azhar', 'shared');

  -- Subjects: mirror every canonical subject row 1:1 (stage + grade + education section + track)
  WITH mapped AS (
    SELECT
      s.id AS source_subject_id,
      'core_' || replace(s.id::text, '-', '_') AS code,
      btrim(s.name) AS name_ar,
      st.id AS stage_id,
      gr.id AS grade_id,
      sec.id AS section_id,
      public.library_subject_track_code(s.section) AS curriculum_track,
      nullif(btrim(s.category), '') AS source_category
    FROM public.subjects s
    JOIN public.library_stages st
      ON st.code = public.library_stage_code_from_subject(s.stage)
    LEFT JOIN public.library_grades gr
      ON gr.stage_id = st.id
     AND gr.code = public.library_grade_code_from_subject(s.stage, s.grade)
    LEFT JOIN public.library_sections sec
      ON sec.code = CASE
           WHEN lower(coalesce(btrim(s.category), '')) IN ('sharia', 'religious') THEN 'azhar'
           ELSE 'shared'
         END
    WHERE coalesce(s.is_active, true) = true
      AND nullif(btrim(s.name), '') IS NOT NULL
  ), fresh AS (
    INSERT INTO public.library_subjects AS ls (
      code, name_ar, stage_id, grade_id, section_id,
      curriculum_track, source_subject_id, source_category, sort_order, is_active
    )
    SELECT code, name_ar, stage_id, grade_id, section_id,
           curriculum_track, source_subject_id, source_category, 0, true
    FROM mapped
    ON CONFLICT (code, stage_id, section_id) DO UPDATE
      SET name_ar = EXCLUDED.name_ar,
          grade_id = EXCLUDED.grade_id,
          curriculum_track = EXCLUDED.curriculum_track,
          source_subject_id = EXCLUDED.source_subject_id,
          source_category = EXCLUDED.source_category,
          is_active = true,
          updated_at = now()
    RETURNING ls.id
  )
  SELECT count(*) INTO synced_count FROM fresh;

  -- Deactivate anything that no longer maps to an active canonical subject
  UPDATE public.library_subjects ls
     SET is_active = false, updated_at = now()
   WHERE ls.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.subjects s
       WHERE s.id = ls.source_subject_id
         AND coalesce(s.is_active, true) = true
     );

  PERFORM pg_notify('pgrst', 'reload schema');

  RETURN jsonb_build_object('synced_subjects', synced_count);
END;
$fn$;

SELECT public.sync_library_taxonomy_from_subjects();