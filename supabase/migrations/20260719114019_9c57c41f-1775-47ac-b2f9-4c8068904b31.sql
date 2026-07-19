
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_caller boolean := false;
BEGIN
  -- Service role / no JWT (system triggers) bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_admin_caller := public.has_role(auth.uid(), 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    is_admin_caller := false;
  END;

  IF is_admin_caller THEN
    RETURN NEW;
  END IF;

  -- Revert any attempt by non-admin users to change privileged/security fields
  NEW.role := OLD.role;
  NEW.is_banned := OLD.is_banned;
  NEW.is_test_account := OLD.is_test_account;
  NEW.teacher_code := OLD.teacher_code;
  NEW.commission_rate := OLD.commission_rate;
  NEW.pending_commission_rate := OLD.pending_commission_rate;
  NEW.pending_effective_date := OLD.pending_effective_date;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_fields();
