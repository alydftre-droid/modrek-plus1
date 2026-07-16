CREATE OR REPLACE FUNCTION public.sync_library_taxonomy_from_subjects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  synced_count integer := 0;
  deactivated_count integer := 0;
BEGIN
  WITH used AS (
    SELECT DISTINCT public.library_stage_code_from_subject(stage) AS code
    FROM public.subjects
    WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_stages st
     SET is_active = EXISTS (SELECT 1 FROM used u WHERE u.code = st.code),
         updated_at = now()
   WHERE st.code IN ('primary', 'preparatory', 'secondary');

  WITH used AS (
    SELECT DISTINCT
      public.library_stage_code_from_subject(stage) AS stage_code,
      public.library_grade_code_from_subject(stage, grade) AS grade_code
    FROM public.subjects
    WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_grades gr
     SET is_active = EXISTS (
           SELECT 1
           FROM used u
           JOIN public.library_stages st ON st.code = u.stage_code
           WHERE st.id = gr.stage_id AND u.grade_code = gr.code
         ),
         updated_at = now();

  WITH used AS (
    SELECT DISTINCT public.library_track_code_from_subject(section) AS track_code
    FROM public.subjects
    WHERE coalesce(is_active, true) = true
  )
  UPDATE public.library_tracks tr
     SET is_active = CASE
           WHEN tr.code = 'none' THEN true
           WHEN tr.code = 'literary' THEN EXISTS (SELECT 1 FROM used WHERE track_code = 'literary')
           WHEN tr.code IN ('sci_science', 'sci_math', 'scientific') THEN EXISTS (SELECT 1 FROM used WHERE track_code = 'scientific')
           ELSE tr.is_active
         END,
         updated_at = now();

  UPDATE public.library_sections
     SET is_active = true,
         updated_at = now()
   WHERE code IN ('general', 'azhar', 'shared');

  WITH normalized_subjects AS (
    SELECT
      s.id AS source_subject_id,
      nullif(btrim(s.name), '') AS name_ar,
      s.category AS source_category,
      public.library_stage_code_from_subject(s.stage) AS stage_code,
      coalesce(s.is_active, true) AS is_active
    FROM public.subjects s
    WHERE nullif(btrim(s.name), '') IS NOT NULL
  ), mapped_subjects AS (
    SELECT
      ns.source_subject_id,
      ns.name_ar,
      ns.source_category,
      ns.is_active,
      st.id AS stage_id,
      shared_sec.id AS section_id,
      ROW_NUMBER() OVER (
        PARTITION BY st.id, ns.source_category
        ORDER BY ns.source_category NULLS LAST, ns.name_ar, ns.source_subject_id
      ) AS sort_order
    FROM normalized_subjects ns
    JOIN public.library_stages st ON st.code = ns.stage_code
    LEFT JOIN public.library_sections shared_sec ON shared_sec.code = 'shared'
    WHERE ns.stage_code IS NOT NULL
  ), upserted AS (
    INSERT INTO public.library_subjects (
      code,
      name_ar,
      stage_id,
      section_id,
      source_subject_id,
      source_category,
      sort_order,
      is_active
    )
    SELECT
      'core_' || replace(ms.source_subject_id::text, '-', '_'),
      ms.name_ar,
      ms.stage_id,
      ms.section_id,
      ms.source_subject_id,
      ms.source_category,
      ms.sort_order,
      ms.is_active
    FROM mapped_subjects ms
    ON CONFLICT (source_subject_id) WHERE source_subject_id IS NOT NULL DO UPDATE
    SET name_ar = EXCLUDED.name_ar,
        stage_id = EXCLUDED.stage_id,
        section_id = EXCLUDED.section_id,
        source_category = EXCLUDED.source_category,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO synced_count FROM upserted;

  UPDATE public.library_subjects ls
     SET is_active = false,
         updated_at = now()
   WHERE ls.source_subject_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.subjects s
       WHERE s.id = ls.source_subject_id
         AND coalesce(s.is_active, true) = true
     );
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;

  UPDATE public.library_subjects
     SET is_active = false,
         updated_at = now()
   WHERE source_subject_id IS NULL;

  PERFORM pg_notify('pgrst', 'reload schema');

  RETURN jsonb_build_object(
    'synced_subjects', synced_count,
    'deactivated_subjects', deactivated_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM anon;
REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_library_taxonomy_from_subjects() TO service_role;

NOTIFY pgrst, 'reload schema';