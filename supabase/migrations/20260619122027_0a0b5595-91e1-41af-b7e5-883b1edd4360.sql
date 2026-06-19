
-- 1) Allow authenticated users to read teacher_assignments (needed for student teacher discovery)
DROP POLICY IF EXISTS "Authenticated can view teacher assignments" ON public.teacher_assignments;
CREATE POLICY "Authenticated can view teacher assignments"
ON public.teacher_assignments
FOR SELECT
TO authenticated
USING (true);

-- 2) Allow authenticated users to read APPROVED teacher requests (needed for fallback teacher discovery)
DROP POLICY IF EXISTS "Authenticated can view approved teacher requests" ON public.teacher_requests;
CREATE POLICY "Authenticated can view approved teacher requests"
ON public.teacher_requests
FOR SELECT
TO authenticated
USING (status = 'approved');

-- 3) Allow authenticated users to read base profiles of teachers (for full_name/avatar in lists)
DROP POLICY IF EXISTS "Authenticated can view teacher base profiles" ON public.profiles;
CREATE POLICY "Authenticated can view teacher base profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'teacher');

-- 4) Trigger: auto-create teacher_profiles row when a teacher request is approved
CREATE OR REPLACE FUNCTION public.ensure_teacher_profile_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.teacher_profiles (teacher_id, is_approved)
    VALUES (NEW.user_id, true)
    ON CONFLICT (teacher_id) DO UPDATE SET is_approved = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_teacher_profile_on_approval_ins ON public.teacher_requests;
CREATE TRIGGER trg_ensure_teacher_profile_on_approval_ins
AFTER INSERT ON public.teacher_requests
FOR EACH ROW EXECUTE FUNCTION public.ensure_teacher_profile_on_approval();

DROP TRIGGER IF EXISTS trg_ensure_teacher_profile_on_approval_upd ON public.teacher_requests;
CREATE TRIGGER trg_ensure_teacher_profile_on_approval_upd
AFTER UPDATE ON public.teacher_requests
FOR EACH ROW EXECUTE FUNCTION public.ensure_teacher_profile_on_approval();

-- 5) Backfill missing teacher_profiles for already-approved teachers
INSERT INTO public.teacher_profiles (teacher_id, is_approved)
SELECT DISTINCT tr.user_id, true
FROM public.teacher_requests tr
LEFT JOIN public.teacher_profiles tp ON tp.teacher_id = tr.user_id
WHERE tr.status = 'approved' AND tp.teacher_id IS NULL
ON CONFLICT (teacher_id) DO UPDATE SET is_approved = true;
