CREATE OR REPLACE FUNCTION public.library_stage_code_from_subject(_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(coalesce(_stage, '')) IN ('preparatory', 'الإعدادي', 'اعدادي', 'إعدادي', 'مرحلة إعدادية', 'المرحلة الإعدادية') THEN 'preparatory'
    WHEN btrim(coalesce(_stage, '')) IN ('secondary', 'الثانوي', 'ثانوي', 'مرحلة ثانوية', 'المرحلة الثانوية') THEN 'secondary'
    WHEN btrim(coalesce(_stage, '')) IN ('primary', 'الابتدائي', 'ابتدائي', 'مرحلة ابتدائية', 'المرحلة الابتدائية') THEN 'primary'
    ELSE nullif(btrim(coalesce(_stage, '')), '')
  END
$$;

CREATE OR REPLACE FUNCTION public.library_grade_code_from_subject(_stage text, _grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'pr1'
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'pr2'
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'pr3'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'sec1'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'sec2'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'sec3'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'p1'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'p2'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'p3'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('fourth', 'الرابع', 'رابع', 'الصف الرابع', '4') THEN 'p4'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('fifth', 'الخامس', 'خامس', 'الصف الخامس', '5') THEN 'p5'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('sixth', 'السادس', 'سادس', 'الصف السادس', '6') THEN 'p6'
    ELSE nullif(btrim(coalesce(_grade, '')), '')
  END
$$;

CREATE OR REPLACE FUNCTION public.library_track_code_from_subject(_section text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(coalesce(_section, '')) IN ('scientific', 'علمي', 'علمى', 'علمي علوم', 'علمى علوم', 'علمي رياضة', 'علمى رياضة') THEN 'scientific'
    WHEN btrim(coalesce(_section, '')) IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى') THEN 'literary'
    ELSE null
  END
$$;

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
  -- Keep taxonomy activity aligned with the real subjects table. Existing rows
  -- stay in the database, but inactive rows are hidden from the wizard.
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
           WHEN tr.code IN ('sci_science', 'sci_math') THEN EXISTS (SELECT 1 FROM used WHERE track_code = 'scientific')
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
      public.library_grade_code_from_subject(s.stage, s.grade) AS grade_code,
      public.library_track_code_from_subject(s.section) AS curriculum_track,
      coalesce(s.is_active, true) AS is_active
    FROM public.subjects s
    WHERE nullif(btrim(s.name), '') IS NOT NULL
  ), mapped_subjects AS (
    SELECT
      ns.source_subject_id,
      ns.name_ar,
      ns.source_category,
      ns.curriculum_track,
      ns.is_active,
      st.id AS stage_id,
      gr.id AS grade_id,
      shared_sec.id AS section_id,
      ROW_NUMBER() OVER (
        PARTITION BY st.id, gr.id, ns.curriculum_track
        ORDER BY ns.source_category NULLS LAST, ns.name_ar, ns.source_subject_id
      ) AS sort_order
    FROM normalized_subjects ns
    JOIN public.library_stages st ON st.code = ns.stage_code
    JOIN public.library_grades gr ON gr.stage_id = st.id AND gr.code = ns.grade_code
    LEFT JOIN public.library_sections shared_sec ON shared_sec.code = 'shared'
    WHERE ns.stage_code IS NOT NULL
      AND ns.grade_code IS NOT NULL
  ), upserted AS (
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
      'core_' || replace(ms.source_subject_id::text, '-', '_'),
      ms.name_ar,
      ms.stage_id,
      ms.grade_id,
      ms.section_id,
      ms.curriculum_track,
      ms.source_subject_id,
      ms.source_category,
      ms.sort_order,
      ms.is_active
    FROM mapped_subjects ms
    ON CONFLICT (source_subject_id) WHERE source_subject_id IS NOT NULL DO UPDATE
    SET name_ar = EXCLUDED.name_ar,
        stage_id = EXCLUDED.stage_id,
        grade_id = EXCLUDED.grade_id,
        section_id = EXCLUDED.section_id,
        curriculum_track = EXCLUDED.curriculum_track,
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

  -- Legacy seed rows that are not tied to real subjects must never feed the wizard.
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

REVOKE ALL ON FUNCTION public.library_stage_code_from_subject(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_grade_code_from_subject(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_track_code_from_subject(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_library_taxonomy_from_subjects() TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_sync_library_taxonomy_from_subjects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_library_taxonomy_from_subjects();
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_sync_library_taxonomy_from_subjects() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sync_library_taxonomy_from_subjects ON public.subjects;
CREATE TRIGGER trg_sync_library_taxonomy_from_subjects
AFTER INSERT OR UPDATE OR DELETE ON public.subjects
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_sync_library_taxonomy_from_subjects();

SELECT public.sync_library_taxonomy_from_subjects();
NOTIFY pgrst, 'reload schema';