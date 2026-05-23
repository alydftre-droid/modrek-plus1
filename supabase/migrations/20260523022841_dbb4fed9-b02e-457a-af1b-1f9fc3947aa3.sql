
-- 1) Add teaches_integrated_science flag to teacher_requests & teacher_assignments
ALTER TABLE public.teacher_requests
  ADD COLUMN IF NOT EXISTS teaches_integrated_science boolean NOT NULL DEFAULT false;

ALTER TABLE public.teacher_assignments
  ADD COLUMN IF NOT EXISTS teaches_integrated_science boolean NOT NULL DEFAULT false;

-- 2) Preparatory curriculum fix: add unified "العلوم", deactivate physics/chem/bio, move math to its own category
INSERT INTO public.subjects (name, category, grade, stage, is_active)
SELECT 'العلوم', 'science', g.grade, 'preparatory', true
FROM (VALUES ('first'), ('second'), ('third')) AS g(grade)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.stage = 'preparatory' AND s.grade = g.grade AND s.name = 'العلوم'
);

UPDATE public.subjects
SET is_active = false, updated_at = now()
WHERE stage = 'preparatory'
  AND name IN ('الفيزياء', 'الكيمياء', 'الأحياء');

UPDATE public.subjects
SET category = 'math', updated_at = now()
WHERE stage = 'preparatory'
  AND name = 'الرياضيات'
  AND category = 'science';

-- 3) Update the teacher-approval trigger to honor teaches_integrated_science
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grade text;
  v_grade_stage text;
  v_category text;
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

        -- Science teacher + first secondary
        IF v_is_science_subject AND v_is_first_secondary THEN
          -- If they activated integrated science: create as integrated_science category
          IF COALESCE(NEW.teaches_integrated_science, false) THEN
            INSERT INTO public.teacher_assignments
              (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
            VALUES
              (NEW.user_id, v_grade_stage, v_grade, 'integrated_science',
               CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                    THEN NEW.assigned_sections[1] ELSE NULL END,
               NEW.education_type, true)
            ON CONFLICT DO NOTHING;
          END IF;
          -- Otherwise: skip creating any assignment for first secondary entirely
        ELSE
          -- Normal assignment for all other cases
          INSERT INTO public.teacher_assignments
            (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
          VALUES
            (NEW.user_id, v_grade_stage, v_grade, COALESCE(NEW.assigned_category, ''),
             CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                  THEN NEW.assigned_sections[1] ELSE NULL END,
             NEW.education_type, false)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (NEW.user_id, 'تم قبول طلبك ✓',
            'مبروك! تم قبول طلب انضمامك كمعلم في منصة مدرك Plus.',
            'teacher_approved', '/teacher', false, true);

    UPDATE public.profiles SET role = 'teacher', updated_at = now() WHERE id = NEW.user_id;
  END IF;

  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status <> 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, notification_type, is_read, is_sent)
    VALUES (NEW.user_id, 'تم رفض طلبك',
            COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض طلب انضمامك. تواصل مع الدعم لمزيد من التفاصيل.'),
            'teacher_rejected', false, true);
  END IF;

  RETURN NEW;
END;
$function$;
