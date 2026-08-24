-- Lock the academic identity fields on profiles.
-- These columns drive content targeting (education_type / stage / grade / section),
-- so a student who can freely edit them can unlock content aimed at other groups.
-- Students may still set a field once while it is empty (the post-registration
-- selection flow); after that only admins/service_role may change it.
CREATE OR REPLACE FUNCTION public.lock_profile_academic_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := (auth.uid() IS NULL)
                   OR public.has_role(auth.uid(), 'admin')
                   OR (auth.uid() <> NEW.id);
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.education_type IS DISTINCT FROM OLD.education_type
     AND OLD.education_type IS NOT NULL THEN
    NEW.education_type := OLD.education_type;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage AND OLD.stage IS NOT NULL THEN
    NEW.stage := OLD.stage;
  END IF;

  IF NEW.grade IS DISTINCT FROM OLD.grade AND OLD.grade IS NOT NULL THEN
    NEW.grade := OLD.grade;
  END IF;

  IF NEW.section IS DISTINCT FROM OLD.section AND OLD.section IS NOT NULL THEN
    NEW.section := OLD.section;
  END IF;

  -- role / test-account flags are never self-editable
  NEW.role := OLD.role;
  NEW.is_test_account := OLD.is_test_account;
  NEW.test_account_code := OLD.test_account_code;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lock_profile_academic_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_profile_academic_identity ON public.profiles;
CREATE TRIGGER trg_lock_profile_academic_identity
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.lock_profile_academic_identity();