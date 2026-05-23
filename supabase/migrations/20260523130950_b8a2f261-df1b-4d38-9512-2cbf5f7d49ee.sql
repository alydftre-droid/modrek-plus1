-- 1) Fix integrated science subject category (was wrongly stored as 'science')
UPDATE public.subjects
SET category = 'integrated_science'
WHERE name = 'العلوم المتكاملة';

-- 2) Deactivate duplicate math rows accidentally stored under 'science' category
UPDATE public.subjects
SET is_active = false
WHERE name = 'الرياضيات' AND category = 'science';

-- 3) Deduplicate الرياضيات at secondary/first (keep oldest, deactivate the rest)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY name, category, stage, grade ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.subjects
  WHERE name = 'الرياضيات' AND category = 'math'
)
UPDATE public.subjects s
SET is_active = false
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 4) Replace trigger function: science teachers do NOT get 1st-secondary primary assignment
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade text;
  v_grade_stage text;
  v_is_science_subject boolean;
  v_is_first_secondary boolean;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    v_is_science_subject := COALESCE(NEW.assigned_category, '') IN ('أحياء', 'فيزياء', 'كيمياء');

    IF NEW.assigned_grades IS NOT NULL THEN
      FOREACH v_grade IN ARRAY NEW.assigned_grades LOOP
        IF v_grade LIKE '%إعدادي%' THEN
          v_grade_stage := 'preparatory';
        ELSIF v_grade LIKE '%ثانوي%' THEN
          v_grade_stage := 'secondary';
        ELSE
          v_grade_stage := COALESCE(NEW.assigned_stages[1], 'preparatory');
        END IF;

        v_is_first_secondary := (v_grade_stage = 'secondary' AND v_grade LIKE '%الأول%');

        -- Skip primary assignment for science teachers at first secondary
        -- (subject no longer exists at that grade — replaced by integrated science)
        IF NOT (v_is_science_subject AND v_is_first_secondary) THEN
          INSERT INTO public.teacher_assignments
            (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
          VALUES
            (NEW.user_id, v_grade_stage, v_grade, COALESCE(NEW.assigned_category, ''),
             CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                  THEN NEW.assigned_sections[1] ELSE NULL END,
             NEW.education_type, COALESCE(NEW.teaches_integrated_science, false))
          ON CONFLICT DO NOTHING;
        END IF;

        -- If science teacher opted-in: add integrated_science row at 1st secondary
        IF v_is_science_subject AND v_is_first_secondary AND COALESCE(NEW.teaches_integrated_science, false) THEN
          INSERT INTO public.teacher_assignments
            (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
          VALUES
            (NEW.user_id, v_grade_stage, v_grade, 'integrated_science',
             CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                  THEN NEW.assigned_sections[1] ELSE NULL END,
             NEW.education_type, true)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5) Backfill: for existing approved science teachers with teaches_integrated_science,
-- add integrated_science rows at first secondary if missing
INSERT INTO public.teacher_assignments
  (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
SELECT DISTINCT
  ta.teacher_id,
  'secondary',
  'الصف الأول الثانوي',
  'integrated_science',
  ta.section,
  ta.education_type,
  true
FROM public.teacher_assignments ta
WHERE ta.category IN ('أحياء','فيزياء','كيمياء')
  AND ta.stage = 'secondary'
  AND ta.grade LIKE '%الأول%'
  AND COALESCE(ta.teaches_integrated_science, false) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments ta2
    WHERE ta2.teacher_id = ta.teacher_id
      AND ta2.category = 'integrated_science'
      AND ta2.stage = 'secondary'
      AND ta2.grade = ta.grade
  );

-- 6) Delete the now-invalid primary science assignments at 1st secondary
DELETE FROM public.teacher_assignments
WHERE category IN ('أحياء','فيزياء','كيمياء')
  AND stage = 'secondary'
  AND grade LIKE '%الأول%';