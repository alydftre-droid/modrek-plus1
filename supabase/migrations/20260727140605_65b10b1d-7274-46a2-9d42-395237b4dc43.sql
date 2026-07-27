-- 1) Add additional_categories column to teacher_requests
ALTER TABLE public.teacher_requests
  ADD COLUMN IF NOT EXISTS additional_categories text[] NOT NULL DEFAULT '{}';

-- 2) Replace approval trigger to loop over primary + additional categories
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade text;
  v_grade_stage text;
  v_category text;
  v_categories text[];
  v_is_science_subject boolean;
  v_is_first_secondary boolean;
  v_edu_type text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    -- Union of primary + additional categories (unique, non-empty)
    v_categories := ARRAY(
      SELECT DISTINCT c FROM unnest(
        COALESCE(ARRAY[NEW.assigned_category], ARRAY[]::text[])
        || COALESCE(NEW.additional_categories, ARRAY[]::text[])
      ) AS t(c)
      WHERE c IS NOT NULL AND c <> ''
    );

    IF array_length(v_categories, 1) IS NULL OR NEW.assigned_grades IS NULL THEN
      RETURN NEW;
    END IF;

    FOREACH v_category IN ARRAY v_categories LOOP
      v_is_science_subject := v_category IN ('أحياء', 'فيزياء', 'كيمياء');

      -- Resolve education_type per category
      v_edu_type := CASE
        WHEN v_category = 'المواد الشرعية' THEN 'أزهر'
        WHEN v_category = 'المواد العربية' THEN COALESCE(NEW.education_type, 'عام')
        ELSE NEW.education_type
      END;

      FOREACH v_grade IN ARRAY NEW.assigned_grades LOOP
        IF v_grade LIKE '%إعدادي%' THEN
          v_grade_stage := 'preparatory';
        ELSIF v_grade LIKE '%ثانوي%' THEN
          v_grade_stage := 'secondary';
        ELSE
          v_grade_stage := COALESCE(NEW.assigned_stages[1], 'preparatory');
        END IF;

        v_is_first_secondary := (v_grade_stage = 'secondary' AND v_grade LIKE '%الأول%');

        -- Skip primary science assignment at first secondary (replaced by integrated science)
        IF NOT (v_is_science_subject AND v_is_first_secondary) THEN
          INSERT INTO public.teacher_assignments
            (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
          VALUES
            (NEW.user_id, v_grade_stage, v_grade, v_category,
             CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                  THEN NEW.assigned_sections[1] ELSE NULL END,
             v_edu_type, COALESCE(NEW.teaches_integrated_science, false))
          ON CONFLICT DO NOTHING;
        END IF;

        IF v_is_science_subject AND v_is_first_secondary AND COALESCE(NEW.teaches_integrated_science, false) THEN
          INSERT INTO public.teacher_assignments
            (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
          VALUES
            (NEW.user_id, v_grade_stage, v_grade, 'integrated_science',
             CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                  THEN NEW.assigned_sections[1] ELSE NULL END,
             v_edu_type, true)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;