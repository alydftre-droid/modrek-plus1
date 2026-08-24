CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce for direct Data API updates made by end users. Internal
  -- SECURITY DEFINER routines and service-role/admin paths run as other roles
  -- and keep their existing behaviour.
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

REVOKE ALL ON FUNCTION public.guard_profile_privileged_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_privileged_columns();