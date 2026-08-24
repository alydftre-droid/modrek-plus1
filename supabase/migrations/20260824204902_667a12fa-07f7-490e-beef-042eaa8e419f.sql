CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Enforce only for end-user roles coming through the Data API. Internal
  -- SECURITY DEFINER routines and service-role paths keep working.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.pending_commission_rate IS DISTINCT FROM OLD.pending_commission_rate
     OR NEW.pending_effective_date IS DISTINCT FROM OLD.pending_effective_date
     OR NEW.teacher_code IS DISTINCT FROM OLD.teacher_code
     OR NEW.student_code IS DISTINCT FROM OLD.student_code
     OR NEW.is_test_account IS DISTINCT FROM OLD.is_test_account
     OR NEW.test_account_code IS DISTINCT FROM OLD.test_account_code
  THEN
    RAISE EXCEPTION 'غير مصرح بتعديل حقول الصلاحيات أو الحقول المالية في الملف الشخصي';
  END IF;

  RETURN NEW;
END;
$$;

-- Restore the test-student row touched by the security test above.
UPDATE public.profiles
SET role = 'student', commission_rate = NULL, is_banned = false
WHERE is_test_account IS TRUE AND role = 'teacher';