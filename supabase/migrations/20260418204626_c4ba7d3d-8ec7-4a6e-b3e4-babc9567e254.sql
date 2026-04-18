
-- ============================================================
-- 1) Function: sync education_type from teacher_requests to teacher_assignments
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_teacher_education_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.education_type IS NOT NULL THEN
    UPDATE public.teacher_assignments
    SET education_type = NEW.education_type,
        updated_at = now()
    WHERE teacher_id = NEW.user_id
      AND (education_type IS NULL OR education_type <> NEW.education_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_teacher_education_type ON public.teacher_requests;
CREATE TRIGGER trg_sync_teacher_education_type
AFTER INSERT OR UPDATE OF education_type, status ON public.teacher_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_teacher_education_type();

-- ============================================================
-- 2) Function: when teacher_assignments is inserted with NULL education_type,
--    auto-fill from teacher_requests
-- ============================================================
CREATE OR REPLACE FUNCTION public.fill_assignment_education_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edu text;
BEGIN
  IF NEW.education_type IS NULL THEN
    SELECT education_type INTO v_edu
    FROM public.teacher_requests
    WHERE user_id = NEW.teacher_id
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_edu IS NOT NULL THEN
      NEW.education_type := v_edu;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_assignment_education_type ON public.teacher_assignments;
CREATE TRIGGER trg_fill_assignment_education_type
BEFORE INSERT ON public.teacher_assignments
FOR EACH ROW
EXECUTE FUNCTION public.fill_assignment_education_type();

-- ============================================================
-- 3) Function: notify all admins when a new teacher request is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_admins_new_teacher_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  SELECT
    ur.user_id,
    'طلب تسجيل معلم جديد',
    'المعلم ' || NEW.full_name || ' قدّم طلب انضمام للمنصة. اضغط للمراجعة.',
    'teacher_request',
    '/admin?tab=teachers',
    false,
    true
  FROM public.user_roles ur
  WHERE ur.role = 'admin';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_teacher ON public.teacher_requests;
CREATE TRIGGER trg_notify_admins_new_teacher
AFTER INSERT ON public.teacher_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_new_teacher_request();

-- ============================================================
-- 4) Function: when a teacher request is approved, auto-create teacher_assignments
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_assignments_on_teacher_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage text;
  v_grade text;
  v_grade_stage text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    -- For each grade in assigned_grades, infer stage and create assignment
    IF NEW.assigned_grades IS NOT NULL THEN
      FOREACH v_grade IN ARRAY NEW.assigned_grades LOOP
        IF v_grade LIKE '%إعدادي%' THEN
          v_grade_stage := 'preparatory';
        ELSIF v_grade LIKE '%ثانوي%' THEN
          v_grade_stage := 'secondary';
        ELSE
          v_grade_stage := COALESCE(NEW.assigned_stages[1], 'preparatory');
        END IF;

        INSERT INTO public.teacher_assignments
          (teacher_id, stage, grade, category, section, education_type)
        VALUES
          (NEW.user_id, v_grade_stage, v_grade, COALESCE(NEW.assigned_category, ''),
           CASE WHEN NEW.assigned_sections IS NOT NULL AND array_length(NEW.assigned_sections,1) > 0
                THEN NEW.assigned_sections[1] ELSE NULL END,
           NEW.education_type)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    -- Notify the teacher
    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (NEW.user_id, 'تم قبول طلبك ✓',
            'مبروك! تم قبول طلب انضمامك كمعلم في منصة مدرك Plus.',
            'teacher_approved', '/teacher', false, true);

    -- Set role on profile
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
$$;

DROP TRIGGER IF EXISTS trg_create_assignments_on_teacher_approval ON public.teacher_requests;
CREATE TRIGGER trg_create_assignments_on_teacher_approval
AFTER UPDATE OF status ON public.teacher_requests
FOR EACH ROW
EXECUTE FUNCTION public.create_assignments_on_teacher_approval();

-- ============================================================
-- 5) Backfill: sync any existing teacher_assignments missing education_type
-- ============================================================
UPDATE public.teacher_assignments ta
SET education_type = tr.education_type, updated_at = now()
FROM public.teacher_requests tr
WHERE ta.teacher_id = tr.user_id
  AND ta.education_type IS NULL
  AND tr.education_type IS NOT NULL;

-- ============================================================
-- 6) Backfill: set profiles.role = 'teacher' for approved teachers missing it
-- ============================================================
UPDATE public.profiles p
SET role = 'teacher', updated_at = now()
FROM public.teacher_requests tr
WHERE p.id = tr.user_id
  AND tr.status = 'approved'
  AND (p.role IS NULL OR p.role <> 'teacher');
