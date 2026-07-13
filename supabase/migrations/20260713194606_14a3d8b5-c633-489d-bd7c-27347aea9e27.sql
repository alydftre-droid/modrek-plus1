ALTER TABLE public.library_subjects
  ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.library_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_track text,
  ADD COLUMN IF NOT EXISTS source_subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_category text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_subjects_source_subject_id
  ON public.library_subjects(source_subject_id)
  WHERE source_subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_subjects_grade ON public.library_subjects(grade_id);
CREATE INDEX IF NOT EXISTS idx_library_subjects_curriculum_track ON public.library_subjects(curriculum_track);

UPDATE public.library_subjects
SET is_active = false
WHERE source_subject_id IS NULL;

WITH normalized_subjects AS (
  SELECT
    s.id AS source_subject_id,
    s.name AS name_ar,
    s.category AS source_category,
    CASE
      WHEN s.stage IN ('preparatory', 'الإعدادي', 'اعدادي', 'إعدادي') THEN 'preparatory'
      WHEN s.stage IN ('secondary', 'الثانوي', 'ثانوي') THEN 'secondary'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') THEN 'primary'
      ELSE s.stage
    END AS stage_code,
    CASE
      WHEN s.stage IN ('preparatory', 'الإعدادي', 'اعدادي', 'إعدادي') AND s.grade IN ('first', 'الأول', 'الصف الأول') THEN 'pr1'
      WHEN s.stage IN ('preparatory', 'الإعدادي', 'اعدادي', 'إعدادي') AND s.grade IN ('second', 'الثاني', 'الصف الثاني') THEN 'pr2'
      WHEN s.stage IN ('preparatory', 'الإعدادي', 'اعدادي', 'إعدادي') AND s.grade IN ('third', 'الثالث', 'الصف الثالث') THEN 'pr3'
      WHEN s.stage IN ('secondary', 'الثانوي', 'ثانوي') AND s.grade IN ('first', 'الأول', 'الصف الأول') THEN 'sec1'
      WHEN s.stage IN ('secondary', 'الثانوي', 'ثانوي') AND s.grade IN ('second', 'الثاني', 'الصف الثاني') THEN 'sec2'
      WHEN s.stage IN ('secondary', 'الثانوي', 'ثانوي') AND s.grade IN ('third', 'الثالث', 'الصف الثالث') THEN 'sec3'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('first', 'الأول', 'الصف الأول') THEN 'p1'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('second', 'الثاني', 'الصف الثاني') THEN 'p2'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('third', 'الثالث', 'الصف الثالث') THEN 'p3'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('fourth', 'الرابع', 'الصف الرابع') THEN 'p4'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('fifth', 'الخامس', 'الصف الخامس') THEN 'p5'
      WHEN s.stage IN ('primary', 'الابتدائي', 'ابتدائي') AND s.grade IN ('sixth', 'السادس', 'الصف السادس') THEN 'p6'
      ELSE s.grade
    END AS grade_code,
    CASE
      WHEN s.section IN ('scientific', 'علمي', 'علمى', 'علمي علوم', 'علمى علوم', 'علمي رياضة', 'علمى رياضة') THEN 'scientific'
      WHEN s.section IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى') THEN 'literary'
      ELSE NULL
    END AS curriculum_track,
    COALESCE(s.is_active, true) AS is_active
  FROM public.subjects s
), mapped_subjects AS (
  SELECT
    ns.source_subject_id,
    ns.name_ar,
    ns.source_category,
    ns.curriculum_track,
    ns.is_active,
    st.id AS stage_id,
    gr.id AS grade_id,
    ROW_NUMBER() OVER (
      PARTITION BY st.id, gr.id, ns.curriculum_track
      ORDER BY ns.source_category, ns.name_ar, ns.source_subject_id
    ) AS sort_order
  FROM normalized_subjects ns
  JOIN public.library_stages st ON st.code = ns.stage_code
  JOIN public.library_grades gr ON gr.stage_id = st.id AND gr.code = ns.grade_code
  WHERE st.is_active = true
    AND gr.is_active = true
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
  'core_' || replace(ms.source_subject_id::text, '-', '_'),
  ms.name_ar,
  ms.stage_id,
  ms.grade_id,
  NULL,
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
    curriculum_track = EXCLUDED.curriculum_track,
    source_category = EXCLUDED.source_category,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_subjects TO authenticated;
GRANT ALL ON public.library_subjects TO service_role;
GRANT SELECT ON public.library_subjects TO anon;

NOTIFY pgrst, 'reload schema';