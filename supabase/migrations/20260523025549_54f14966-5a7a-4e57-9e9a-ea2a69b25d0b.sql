
-- Update trigger: science teachers (Bio/Phys/Chem) who opt-in to integrated_science
-- get BOTH their normal subject assignment AND an additional integrated_science assignment for first secondary.
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

        -- Always create the normal/primary assignment for the teacher's chosen subject
        INSERT INTO public.teacher_assignments
          (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
        VALUES
          (NEW.user_id, v_grade_stage, v_grade, COALESCE(NEW.assigned_category, ''),
           CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                THEN NEW.assigned_sections[1] ELSE NULL END,
           NEW.education_type, COALESCE(NEW.teaches_integrated_science, false))
        ON CONFLICT DO NOTHING;

        -- ADDITIONALLY: if science teacher opted in and grade is first secondary,
        -- create a second assignment under integrated_science category
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
$function$;
